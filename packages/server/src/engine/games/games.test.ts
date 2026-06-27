import { describe, expect, it } from 'vitest';
import { emptyGameMemory, type GameContext, type PublicGameView, asSeatId } from '@lcc/shared';
import { SeededRng } from '../../runtime/ServerRng';
import { RouletteEngine } from './roulette/RouletteEngine';
import { DiceDuelEngine } from './dice/DiceDuelEngine';
import { SlotsEngine } from './slots/SlotsEngine';
import { CoinFlipEngine } from './coinflip/CoinFlipEngine';
import { WheelEngine } from './wheel/WheelEngine';
import { HighCardEngine } from './highcard/HighCardEngine';

const seat = asSeatId('s1');
function ctx(seed: number): GameContext {
  return {
    floor: 1,
    betPolicy: { minBet: 50, maxBet: 600, allowAllIn: true, pokerAnte: 50 },
    availableBank: 5000,
    rng: new SeededRng(seed),
    memory: emptyGameMemory(),
    seatId: seat,
    modifiers: [],
  };
}

describe('RouletteEngine', () => {
  it('win pays out with no token; loss mints exactly one alcohol token (200 seeds)', () => {
    const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    for (let seed = 1; seed <= 200; seed++) {
      const c = ctx(seed);
      const s0 = RouletteEngine.createSession({ seatId: seat, bet: 100, selection: { kind: 'rb', color: 'red' } }, c);
      const s = RouletteEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const pubView = RouletteEngine.view(s, null) as Extract<PublicGameView, { kind: 'roulette' }>;
      const n = pubView.result!.number;
      const expectedWin = RED.has(n);
      const o = RouletteEngine.resolve(s, c);
      if (expectedWin) {
        expect(o.bankDeltas[0]!.delta).toBeGreaterThan(0);
        expect(o.mints).toHaveLength(0);
      } else {
        expect(o.bankDeltas[0]!.delta).toBeLessThan(0);
        expect(o.mints).toHaveLength(1);
        expect(o.mints[0]!.kind).toBe('alcohol');
      }
    }
  });

  it('straight-up win pays 9x profit', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = ctx(seed);
      const s0 = RouletteEngine.createSession({ seatId: seat, bet: 100, selection: { kind: 'straightUp', number: 7 } }, c);
      const s = RouletteEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const o = RouletteEngine.resolve(s, c);
      if (o.bankDeltas[0]!.delta > 0) {
        expect(o.bankDeltas[0]!.delta).toBe(900);
        return;
      }
    }
  });
});

describe('DiceDuelEngine', () => {
  it('mid (lucky 7) pays 4x profit and bands map correctly (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const c = ctx(seed);
      const s0 = DiceDuelEngine.createSession({ seatId: seat, bet: 100, selection: { kind: 'band', band: 'mid' } }, c);
      const s = DiceDuelEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const pub = DiceDuelEngine.view(s, null) as Extract<PublicGameView, { kind: 'diceDuel' }>;
      const sum = pub.result!.dice[0] + pub.result!.dice[1];
      const o = DiceDuelEngine.resolve(s, c);
      if (sum === 7) {
        expect(o.bankDeltas[0]!.delta).toBe(400);
        expect(o.mints).toHaveLength(0);
      } else {
        expect(o.bankDeltas[0]!.delta).toBeLessThan(0);
        expect(o.mints).toHaveLength(1);
      }
    }
  });
});

describe('SlotsEngine', () => {
  it('jackpot offers a remove-or-give choice; a no-match is a loss', () => {
    let sawJackpot = false;
    let sawLoss = false;
    for (let seed = 1; seed <= 400; seed++) {
      const c = ctx(seed);
      const s0 = SlotsEngine.createSession({ seatId: seat, bet: 100 }, c);
      const s = SlotsEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const pub = SlotsEngine.view(s, null) as Extract<PublicGameView, { kind: 'slots' }>;
      const reels = pub.reels!;
      const allSame = reels[0] === reels[1] && reels[1] === reels[2];
      const o = SlotsEngine.resolve(s, c);
      if (allSame) {
        sawJackpot = true;
        expect(o.bankDeltas[0]!.delta).toBeGreaterThan(0);
        expect(o.pendingChoices.some((p) => p.kind === 'remove-or-give')).toBe(true);
      }
      const noMatch = !allSame && reels[0] !== reels[1] && reels[1] !== reels[2] && reels[0] !== reels[2];
      if (noMatch) {
        sawLoss = true;
        expect(o.bankDeltas[0]!.delta).toBeLessThan(0);
      }
    }
    expect(sawJackpot).toBe(true);
    expect(sawLoss).toBe(true);
  });
});

describe('CoinFlipEngine', () => {
  it('win pays 2x with no token; loss mints a token (heads pick, 100 seeds)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const c = ctx(seed);
      const s0 = CoinFlipEngine.createSession({ seatId: seat, bet: 100, selection: { kind: 'coin', side: 'heads' } }, c);
      const s = CoinFlipEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const pub = CoinFlipEngine.view(s, null) as Extract<PublicGameView, { kind: 'coinflip' }>;
      const won = pub.result!.side === 'heads';
      const o = CoinFlipEngine.resolve(s, c);
      if (won) {
        expect(o.bankDeltas[0]!.delta).toBe(100);
        expect(o.mints).toHaveLength(0);
      } else {
        expect(o.bankDeltas[0]!.delta).toBe(-100);
        expect(o.mints).toHaveLength(1);
      }
    }
  });
});

describe('WheelEngine', () => {
  it('0× loses + tokens; a multiplier wins (150 seeds, all outcomes seen)', () => {
    let sawZero = false;
    let sawWin = false;
    for (let seed = 1; seed <= 150; seed++) {
      const c = ctx(seed);
      const s0 = WheelEngine.createSession({ seatId: seat, bet: 100 }, c);
      const s = WheelEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const pub = WheelEngine.view(s, null) as Extract<PublicGameView, { kind: 'wheel' }>;
      const mult = pub.result!.mult;
      const o = WheelEngine.resolve(s, c);
      if (mult === 0) {
        sawZero = true;
        expect(o.bankDeltas[0]!.delta).toBe(-100);
        expect(o.mints).toHaveLength(1);
      } else {
        sawWin = true;
        expect(o.bankDeltas[0]!.delta).toBe(Math.round(100 * mult) - 100);
        expect(o.mints).toHaveLength(0);
      }
    }
    expect(sawZero && sawWin).toBe(true);
  });
});

describe('HighCardEngine', () => {
  it('higher card wins 2x, lower loses + token, tie pushes (120 seeds)', () => {
    const rv = (r: string) => ({ A: 14, K: 13, Q: 12, J: 11 })[r] ?? Number(r);
    for (let seed = 1; seed <= 120; seed++) {
      const c = ctx(seed);
      const s0 = HighCardEngine.createSession({ seatId: seat, bet: 100 }, c);
      const s = HighCardEngine.applyAction(s0, { kind: 'spin' }, c).session;
      const pub = HighCardEngine.view(s, null) as Extract<PublicGameView, { kind: 'highcard' }>;
      const p = rv(pub.result!.player.rank);
      const d = rv(pub.result!.dealer.rank);
      const o = HighCardEngine.resolve(s, c);
      if (p > d) expect(o.bankDeltas[0]!.delta).toBe(100);
      else if (p < d) {
        expect(o.bankDeltas[0]!.delta).toBe(-100);
        expect(o.mints).toHaveLength(1);
      } else expect(o.bankDeltas[0]!.delta).toBe(0);
    }
  });
});
