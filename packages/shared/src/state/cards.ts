// Playing-card primitives shared by blackjack and 3-card poker. Pure, RNG-free.

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** Poker rank value, Ace high (A=14 ... 2=2). */
export function pokerRankValue(rank: Rank): number {
  switch (rank) {
    case 'A':
      return 14;
    case 'K':
      return 13;
    case 'Q':
      return 12;
    case 'J':
      return 11;
    default:
      return Number(rank);
  }
}

/** Blackjack pip value (Ace counted as 11 here; soft/hard handled by the engine). */
export function blackjackCardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10;
  return Number(rank);
}

/** Best blackjack total <= 21 if possible; returns { total, soft }. */
export function evalBlackjackHand(cards: readonly Card[]): { total: number; soft: boolean; bust: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += blackjackCardValue(c.rank);
    if (c.rank === 'A') aces += 1;
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10; // count an ace as 1 instead of 11
    aces -= 1;
  }
  if (aces === 0) soft = false;
  return { total, soft, bust: total > 21 };
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}
