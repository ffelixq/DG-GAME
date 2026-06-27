import { describe, expect, it } from 'vitest';
import { EVENT_BY_ID, EVENT_IDS, FLOOR_INTRO_MS, LAST_CALL_WINDOW_MS, asDeviceId, type ChoiceId, type SeatId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { SeededRng } from '../runtime/ServerRng';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { fireEvent, markLastCallBet, tickLastCall } from './event';
import { openDrinkCheck } from './drink';
import { resolveEffect } from './effects-runtime';
import { mint } from './tokens';
import type { ReduceCtx } from './reducer';

class NullTransport implements Transport {
  private e: Emitter = { emit: () => {} };
  room(): Emitter {
    return this.e;
  }
  device(): Emitter {
    return this.e;
  }
}

const seatIdOf = (r: unknown): SeatId => (r as { data: { seatId: SeatId } }).data.seatId;

function playingRoom() {
  const clock = new FakeClock(1000);
  const manager = new RoomManager({ clock, transport: new NullTransport(), makeIds: () => new SeqIdGen() });
  const host = asDeviceId('h');
  const pa = asDeviceId('pa');
  const room = manager.create(host);
  room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's' });
  room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
  room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'sp' });
  const a = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }));
  const b = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Sam' }));
  room.dispatch({ t: 'advance', deviceId: host });
  room.dispatch({ t: 'ackHouseRules', deviceId: pa });
  clock.advance(FLOOR_INTRO_MS + 10);
  room.tick();
  const rctx = (): ReduceCtx => ({ now: clock.now(), rng: new SeededRng(99), ids: new SeqIdGen() });
  return { room, pa, a, b, clock, rctx };
}

const tokensOf = (room: ReturnType<typeof playingRoom>['room'], seat: SeatId) => room.state.seats[seat]!.tokenIds.length;

describe('random events', () => {
  it('Loan Shark Calls tokens only those in the red', () => {
    const { room, a, b, rctx } = playingRoom();
    room.state.seats[a]!.stats.netBank = -100;
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.loanSharkCalls]!, rctx());
    expect(tokensOf(room, a)).toBe(1);
    expect(tokensOf(room, b)).toBe(0);
  });

  it('Happy Hour cancels the next token for everyone', () => {
    const { room, a, rctx } = playingRoom();
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.happyHour]!, rctx());
    // a now has a cancel-token modifier; the next event token bounces off
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.loanSharkCalls]!, { ...rctx() });
    room.state.seats[a]!.stats.netBank = -100;
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.loanSharkCalls]!, rctx());
    expect(tokensOf(room, a)).toBe(0);
  });

  it('Group Blame tokens everyone when below half the quota', () => {
    const { room, a, b, rctx } = playingRoom();
    room.state.bank.balance = 100; // quota 1500 -> below 50%
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.groupBlame]!, rctx());
    expect(tokensOf(room, a)).toBe(1);
    expect(tokensOf(room, b)).toBe(1);
  });

  it('VIP Tax prompts the richest player; paying drains the bank', () => {
    const { room, pa, a, rctx } = playingRoom();
    room.state.seats[a]!.stats.netBank = 500; // richest
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.vipTax]!, rctx());
    expect(room.state.pendingChoices).toHaveLength(1);
    const choice = room.state.pendingChoices[0]!;
    expect(choice.seatId).toBe(a);
    const bankBefore = room.state.bank.balance;
    const res = room.dispatch({ t: 'resolveChoice', deviceId: pa, seatId: a, choiceId: choice.id as ChoiceId, optionId: 'pay' });
    expect(res.ok).toBe(true);
    expect(room.state.bank.balance).toBe(bankBefore - 100);
    expect(room.state.pendingChoices).toHaveLength(0);
  });

  it('Last Call tokens anyone who did not place a bet', () => {
    const { room, a, b, clock, rctx } = playingRoom();
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.lastCall]!, rctx());
    markLastCallBet(room.state, a); // Alex placed a bet
    clock.advance(LAST_CALL_WINDOW_MS + 100);
    tickLastCall(room.state, rctx());
    expect(tokensOf(room, a)).toBe(0);
    expect(tokensOf(room, b)).toBe(1);
    expect(room.state.pendingEvent).toBeNull();
  });

  it('Water Round makes the next Drink Check water-only', () => {
    const { room, a, rctx } = playingRoom();
    mint(room.state, { ownerSeatId: a, originSeatId: 'system', count: 2, kind: 'alcohol', source: 'game', reason: 'test' }, { ids: new SeqIdGen(), now: 0 });
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.waterRound]!, rctx());
    openDrinkCheck(room.state, rctx());
    expect(room.state.pendingCheck?.waterOnly).toBe(true);
  });

  it('bank underflow tokens everyone and clamps the bank at 0', () => {
    const { room, a, b, rctx } = playingRoom();
    room.state.bank.balance = 50;
    resolveEffect(room.state, [{ op: 'adjustBank', amount: -500, reason: 'test' }], null, null, 'test', rctx());
    expect(room.state.bank.balance).toBe(0);
    expect(tokensOf(room, a)).toBe(1);
    expect(tokensOf(room, b)).toBe(1);
  });
});
