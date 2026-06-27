import type { Money } from '../ids';

export type GameKind = 'blackjack' | 'poker3' | 'roulette' | 'diceDuel' | 'slots' | 'coinflip' | 'wheel' | 'highcard';

export const GAME_KINDS: readonly GameKind[] = ['blackjack', 'poker3', 'roulette', 'diceDuel', 'slots', 'coinflip', 'wheel', 'highcard'];

export const GAME_NAMES: Record<GameKind, string> = {
  blackjack: 'Blackjack',
  poker3: "Texas Hold'em",
  roulette: 'Roulette',
  diceDuel: 'Dice Duel',
  slots: 'Slots',
  coinflip: 'Coin Flip',
  wheel: 'Lucky Wheel',
  highcard: 'High Card',
};

/** Texas Hold'em streets. */
export type HoldemStreet = 'preflop' | 'flop' | 'turn' | 'river';

export type DiceBand = 'low' | 'mid' | 'high';
export type RouletteColor = 'red' | 'black';

/** A bet placement choice (game-specific). */
export type CoinSide = 'heads' | 'tails';

export type BetSelection =
  | { kind: 'rb'; color: RouletteColor } // roulette red/black
  | { kind: 'straightUp'; number: number } // roulette single number 0..36
  | { kind: 'band'; band: DiceBand } // dice duel
  | { kind: 'coin'; side: CoinSide } // coin flip
  | { kind: 'none' }; // blackjack / poker3 / slots / wheel / high card use plain stake

/** An in-game action a seat can take. */
export type GameAction =
  | { kind: 'hit' }
  | { kind: 'stand' }
  | { kind: 'double' }
  | { kind: 'deal' } // blackjack table: start the deal early (skip the join window)
  | { kind: 'replay' } // solo games: play another round with the same bet
  | { kind: 'play' } // poker3: keep hand
  | { kind: 'fold' } // poker3: fold
  | { kind: 'spin' } // roulette / slots / dice resolve
  | { kind: 'guess'; band: DiceBand };

/** Per-seat memory that persists across game sessions (streak-based token rules). */
export interface SeatGameMemory {
  blackjackWinStreak: number;
  slotsNoMatchStreak: number;
}

export function emptyGameMemory(): SeatGameMemory {
  return { blackjackWinStreak: 0, slotsNoMatchStreak: 0 };
}

export interface BetPolicy {
  minBet: Money;
  maxBet: Money;
  allowAllIn: boolean;
  pokerAnte: Money;
}
