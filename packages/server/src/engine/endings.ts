import {
  AWARDS,
  GOOD_ENDING_MIN_BANK,
  type AwardResult,
  type EndingId,
  type RoomState,
  type SeatId,
  type SeatState,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { activeSeats, addTicker } from './state';
import { placeToken } from './tokens';

const COUNT_FIELDS = new Set(['allIns', 'betrayals', 'tokensReceived', 'teammateScore', 'biggestSingleLoss']);

export function computeAwards(state: RoomState): AwardResult[] {
  const seats = activeSeats(state);
  return AWARDS.map((def) => {
    const metric = (s: SeatState): number =>
      def.metric === 'winRate' ? (s.stats.plays > 0 ? s.stats.gamesWon / s.stats.plays : 0) : s.stats[def.metric];
    const pool = def.minPlays ? seats.filter((s) => s.stats.plays >= def.minPlays!) : seats;
    if (pool.length === 0) return { awardId: def.id, name: def.name, description: def.description, seatId: null, value: 0 };

    let best = pool[0]!;
    let bestV = metric(best);
    for (const s of pool) {
      const v = metric(s);
      const better = def.selector === 'max' ? v > bestV : v < bestV;
      const tie = v === bestV && def.tiebreak !== undefined && s.stats[def.tiebreak] > best.stats[def.tiebreak];
      if (better || tie) {
        best = s;
        bestV = v;
      }
    }
    // a "max count" award with nobody scoring is awarded to no one
    const degenerate = def.selector === 'max' && bestV === 0 && COUNT_FIELDS.has(def.metric);
    return { awardId: def.id, name: def.name, description: def.description, seatId: degenerate ? null : best.seatId, value: bestV };
  });
}

export function applyPunishment(state: RoomState, rctx: ReduceCtx): void {
  let dodged = 0;
  for (const sid of state.seatOrder) {
    const seat = state.seats[sid];
    if (!seat) continue;
    const immune = seat.modifiers.find((m) => m.kind === 'immune-punishment' && m.uses > 0);
    if (immune) {
      immune.uses = 0;
      seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
      dodged += 1;
      continue;
    }
    placeToken(state, { ownerSeatId: sid, originSeatId: 'system', kind: 'alcohol', source: 'punishment', reason: 'quota.fail' }, { ids: rctx.ids, now: rctx.now });
  }
  addTicker(state, dodged > 0 ? `Quota missed — the table drinks (${dodged} dodged it)` : 'Quota missed — the table drinks', 'loss', rctx.now);
}

export function reachEnding(state: RoomState, passed: boolean, rctx: ReduceCtx): void {
  const finalBank = state.bank.balance;
  const endingId: EndingId = !passed ? 'bad' : finalBank >= GOOD_ENDING_MIN_BANK ? 'good' : 'normal';
  const awards = computeAwards(state);

  let worst: SeatId | null = null;
  let maxTok = 0;
  for (const s of activeSeats(state)) {
    if (s.stats.tokensReceived > maxTok) {
      maxTok = s.stats.tokensReceived;
      worst = s.seatId;
    }
  }

  state.ending = {
    endingId,
    finalBank,
    awards,
    worstGamblerSeatId: worst,
    ...(endingId === 'good' ? { finalDareSeatId: awards.find((a) => a.awardId === 'biggest-winner')?.seatId ?? undefined } : {}),
    ...(endingId === 'bad' ? { finalForfeitText: 'House wins. One last group forfeit — loser’s choice (no alcohol).' } : {}),
  };
  state.phase = 'ending';
  addTicker(state, endingId === 'bad' ? 'The house won the night.' : 'You cleared the debt!', endingId === 'bad' ? 'loss' : 'win', rctx.now);
}
