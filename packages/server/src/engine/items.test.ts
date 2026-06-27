import { describe, expect, it } from 'vitest';
import {
  FLOOR_INTRO_MS,
  ITEM_IDS,
  asDeviceId,
  type ItemId,
  type ItemInstanceId,
  type PrivateGameView,
  type RoomState,
  type SeatId,
} from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { mint } from './tokens';
import { projectPrivateForDevice } from './project';

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
let instSeq = 0;
const inst = () => `inst${instSeq++}` as unknown as ItemInstanceId;
const mintIds = new SeqIdGen();

function give(state: RoomState, seat: SeatId, itemId: ItemId): ItemInstanceId {
  const instanceId = inst();
  state.seats[seat]!.items.push({ instanceId, itemId });
  return instanceId;
}
function giveAlcohol(state: RoomState, seat: SeatId, n: number) {
  mint(state, { ownerSeatId: seat, originSeatId: 'system', count: n, kind: 'alcohol', source: 'event', reason: 't' }, { ids: mintIds, now: 0 });
}
const tokens = (state: RoomState, seat: SeatId) => state.seats[seat]!.tokenIds.map((id) => state.tokens[id]!);

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
  return { room, pa, a, b };
}

describe('item cards', () => {
  it('grants floor items at floor start', () => {
    const { room, a } = playingRoom();
    expect(room.state.seats[a]!.items.length).toBeGreaterThan(0);
  });

  it('Insurance cancels the next token', () => {
    const { room, pa, a } = playingRoom();
    const id = give(room.state, a, ITEM_IDS.insurance);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id });
    giveAlcohol(room.state, a, 1);
    expect(tokens(room.state, a)).toHaveLength(0);
  });

  it('Water Break removes 2 tokens', () => {
    const { room, pa, a } = playingRoom();
    giveAlcohol(room.state, a, 3);
    const id = give(room.state, a, ITEM_IDS.waterBreak);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id });
    expect(tokens(room.state, a)).toHaveLength(1);
  });

  it('Reverse moves a token to a target and counts as a betrayal', () => {
    const { room, pa, a, b } = playingRoom();
    room.state.currentFloor = 2;
    giveAlcohol(room.state, a, 1);
    const id = give(room.state, a, ITEM_IDS.reverse);
    const res = room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id, targetSeatId: b });
    expect(res.ok).toBe(true);
    expect(tokens(room.state, a)).toHaveLength(0);
    expect(tokens(room.state, b)).toHaveLength(1);
    expect(room.state.seats[a]!.stats.betrayals).toBe(1);
  });

  it('SAFETY: a token reversed onto an exempt player becomes water, never alcohol', () => {
    const { room, pa, a, b } = playingRoom();
    room.dispatch({ t: 'setExempt', deviceId: pa, seatId: b, value: true });
    giveAlcohol(room.state, a, 1);
    const id = give(room.state, a, ITEM_IDS.reverse);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id, targetSeatId: b });
    expect(tokens(room.state, b).every((t) => t.kind === 'water')).toBe(true);
  });

  it('Designated Driver converts the target’s next token to water (non-forcing) and scores a teammate point', () => {
    const { room, pa, a, b } = playingRoom();
    room.state.currentFloor = 2;
    const id = give(room.state, a, ITEM_IDS.designatedDriver);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id, targetSeatId: b });
    giveAlcohol(room.state, b, 1);
    expect(tokens(room.state, b).every((t) => t.kind === 'water')).toBe(true);
    expect(room.state.seats[a]!.stats.teammateScore).toBe(2);
  });

  it('Hangover Shield converts the next 2 tokens to water', () => {
    const { room, pa, a } = playingRoom();
    const id = give(room.state, a, ITEM_IDS.hangoverShield);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id });
    giveAlcohol(room.state, a, 3);
    const t = tokens(room.state, a);
    expect(t.filter((x) => x.kind === 'water')).toHaveLength(2);
    expect(t.filter((x) => x.kind === 'alcohol')).toHaveLength(1);
  });

  it('Loan Shark Deal cuts the quota 10% and tokens everyone', () => {
    const { room, pa, a, b } = playingRoom();
    room.state.currentFloor = 2;
    const before = room.state.bank.quota;
    const id = give(room.state, a, ITEM_IDS.loanSharkDeal);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id });
    expect(room.state.bank.quota).toBe(Math.round(before * 0.9));
    expect(tokens(room.state, a).length).toBeGreaterThanOrEqual(1);
    expect(tokens(room.state, b).length).toBeGreaterThanOrEqual(1);
  });

  it('Skim the Till drains the bank and marks a betrayal', () => {
    const { room, pa, a } = playingRoom();
    room.state.currentFloor = 4;
    const before = room.state.bank.balance;
    const id = give(room.state, a, ITEM_IDS.groupBetrayal);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id });
    expect(room.state.bank.balance).toBe(before - 200);
    expect(room.state.seats[a]!.stats.betrayals).toBe(1);
  });

  it('Fake Ace forces the next blackjack card to an Ace', () => {
    const { room, pa, a } = playingRoom();
    room.state.currentFloor = 2;
    const id = give(room.state, a, ITEM_IDS.fakeAce);
    room.dispatch({ t: 'useItem', deviceId: pa, seatId: a, instanceId: id });
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
    const view = projectPrivateForDevice(room.state, pa, 0)!.seats.find((s) => s.seatId === a)!.activeGame as Extract<
      PrivateGameView,
      { kind: 'blackjack' }
    > | null;
    // the blackjack table deals hole cards on join; the forced first card is an Ace
    expect(view?.hole[0]!.rank).toBe('A');
  });
});
