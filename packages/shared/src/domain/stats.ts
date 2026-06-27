import type { Money } from '../ids';

// Per-seat statistics accumulated across the whole run. Every award is backed by a concrete
// field here (audit fix #2: this schema exists from M1 so engines can emit against it).
export interface SeatStats {
  /** Net change to the shared bank attributable to this seat's plays. → Biggest Winner/Loser. */
  netBank: Money;
  /** Total drink tokens received (any kind). → Most Drink Tokens. */
  tokensReceived: number;
  /** Number of all-in bets placed. → Most All-ins. */
  allIns: number;
  /** Betrayal actions (Group Betrayal, Reverse Card sent, item steals). → Most Betrayals. */
  betrayals: number;
  /** Games played to completion. */
  plays: number;
  gamesWon: number;
  gamesLost: number;
  /** Magnitude (positive) of the single largest losing bet. → Worst Financial Decision. */
  biggestSingleLoss: Money;
  /** Pro-social actions (Designated Driver, Risky Rescue, tokens absorbed for others). → Best Teammate. */
  teammateScore: number;
}

export function emptyStats(): SeatStats {
  return {
    netBank: 0,
    tokensReceived: 0,
    allIns: 0,
    betrayals: 0,
    plays: 0,
    gamesWon: 0,
    gamesLost: 0,
    biggestSingleLoss: 0,
    teammateScore: 0,
  };
}

/** Numeric stat fields (all of them, since every field is a number). */
export type StatField = keyof SeatStats;

/** A stat mutation emitted by an engine/effect. `max` keeps the larger value (for biggestSingleLoss). */
export interface StatEvent {
  field: StatField;
  value: number;
  mode?: 'add' | 'max';
}

export function applyStatEvent(stats: SeatStats, ev: StatEvent): void {
  if (ev.mode === 'max') {
    stats[ev.field] = Math.max(stats[ev.field], ev.value);
  } else {
    stats[ev.field] += ev.value;
  }
}
