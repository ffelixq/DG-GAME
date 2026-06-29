import type { RoomState, SeatId } from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { floorDelta } from './bank';
import { activeSeats, addTicker } from './state';

/** End the current round: record a RoundResult and move to the results screen.
 *  Floor advancement / punishment / endings are layered on in M9/M10. */
export function endRound(state: RoomState, rctx: ReduceCtx): void {
  const passed = state.bank.balance >= state.bank.quota;
  const seats = activeSeats(state);

  let topWinner: SeatId | null = null;
  let topLoser: SeatId | null = null;
  let maxN = -Infinity;
  let minN = Infinity;
  for (const s of seats) {
    if (s.stats.netBank > maxN) {
      maxN = s.stats.netBank;
      topWinner = s.seatId;
    }
    if (s.stats.netBank < minN) {
      minN = s.stats.netBank;
      topLoser = s.seatId;
    }
  }

  state.lastResult = {
    floor: state.currentFloor,
    quota: state.bank.quota,
    finalBank: state.bank.balance,
    bankDelta: floorDelta(state.bank),
    passed,
    topWinnerSeatId: topWinner,
    topLoserSeatId: topLoser,
  };
  // any games still in progress are cut off: refund their reserved stakes and clear the tables
  state.bank.reserved = 0;
  state.sessions = {};
  for (const s of seats) s.activeSessionId = null;

  state.phase = 'roundResults';
  addTicker(state, passed ? '✅ Quota met!' : '❌ Quota missed', passed ? 'win' : 'loss', rctx.now);
}
