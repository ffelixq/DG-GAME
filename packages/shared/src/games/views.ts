import type { Money, SeatId } from '../ids';
import type { Card } from '../state/cards';
import type { BetSelection, DiceBand, GameAction, HoldemStreet, RouletteColor } from '../state/game';

export interface ResultSummary {
  won: boolean;
  bankDelta: Money;
  text: string;
}

// ---- Board-safe public projections (viewer === null) ----
export type PublicGameView =
  | {
      kind: 'blackjack';
      phase: 'joining' | 'playing' | 'done';
      dealer: Card[]; // hole card hidden until the dealer's turn
      dealerHidden: boolean;
      seats: {
        seatId: SeatId;
        bet: Money;
        cardCount: number;
        total: number | null; // revealed once done
        busted: boolean;
        done: boolean;
        outcome?: 'win' | 'lose' | 'push';
      }[];
    }
  | {
      kind: 'poker3';
      seatIds: SeatId[];
      phase: 'joining' | 'acting' | 'done';
      street: HoldemStreet;
      community: Card[];
      pot: number; // drinks at stake
      toCall: number; // current outstanding bet to call
      turnSeatId: SeatId | null;
      players: { seatId: SeatId; folded: boolean }[];
      result?: {
        winnerSeatId: SeatId | null;
        loserSeatId: SeatId | null;
        pot: number;
        community: Card[];
        reveals: { seatId: SeatId; handLabel: string; cards: Card[]; folded: boolean }[];
      };
    }
  | {
      kind: 'roulette';
      seatId: SeatId;
      bet: Money;
      phase: 'betting' | 'spinning' | 'done';
      result?: { number: number; color: RouletteColor | 'green' };
    }
  | {
      kind: 'diceDuel';
      seatId: SeatId;
      bet: Money;
      phase: 'guessing' | 'rolling' | 'done';
      result?: { dice: [number, number]; band: DiceBand };
    }
  | {
      kind: 'slots';
      seatId: SeatId;
      bet: Money;
      phase: 'ready' | 'spinning' | 'done';
      reels: string[] | null;
    }
  | { kind: 'coinflip'; seatId: SeatId; bet: Money; phase: 'betting' | 'done'; result?: { side: 'heads' | 'tails' } }
  | { kind: 'wheel'; seatId: SeatId; bet: Money; phase: 'betting' | 'done'; result?: { mult: number } }
  | { kind: 'highcard'; seatId: SeatId; bet: Money; phase: 'betting' | 'done'; result?: { player: Card; dealer: Card } };

// ---- Owner-only private projections ----
export type PrivateGameView =
  | {
      kind: 'blackjack';
      bet: Money;
      phase: 'joining' | 'playing' | 'done';
      hole: Card[];
      total: number;
      soft: boolean;
      dealer: Card[]; // upcard during play, full once done
      dealerHidden: boolean;
      legal: GameAction[];
      others: { seatId: SeatId; cardCount: number; done: boolean; busted: boolean }[];
      result?: ResultSummary;
    }
  | {
      kind: 'poker3';
      phase: 'joining' | 'acting' | 'done';
      street: HoldemStreet;
      hole: Card[];
      community: Card[];
      handLabel: string;
      pot: number; // drinks at stake
      toCall: number; // current outstanding bet to call (0 = you can check)
      myTurn: boolean;
      folded: boolean;
      legal: GameAction[];
      others: { seatId: SeatId; folded: boolean }[];
      result?: ResultSummary;
    }
  | {
      kind: 'roulette';
      bet: Money;
      phase: 'betting' | 'spinning' | 'done';
      selection: BetSelection;
      legal: GameAction[];
      result?: ResultSummary & { number: number; color: RouletteColor | 'green' };
    }
  | {
      kind: 'diceDuel';
      bet: Money;
      phase: 'guessing' | 'rolling' | 'done';
      band: DiceBand | null;
      legal: GameAction[];
      result?: ResultSummary & { dice: [number, number]; band: DiceBand };
    }
  | {
      kind: 'slots';
      bet: Money;
      phase: 'ready' | 'spinning' | 'done';
      reels: string[] | null;
      legal: GameAction[];
      result?: ResultSummary;
    }
  | { kind: 'coinflip'; bet: Money; phase: 'betting' | 'done'; side: 'heads' | 'tails'; legal: GameAction[]; result?: ResultSummary & { side: 'heads' | 'tails' } }
  | { kind: 'wheel'; bet: Money; phase: 'betting' | 'done'; legal: GameAction[]; result?: ResultSummary & { mult: number } }
  | { kind: 'highcard'; bet: Money; phase: 'betting' | 'done'; legal: GameAction[]; result?: ResultSummary & { player: Card; dealer: Card } };
