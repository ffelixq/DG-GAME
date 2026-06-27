import { RANKS, SUITS, type Card, type Rng } from '@lcc/shared';

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffledDeck(rng: Rng): Card[] {
  return rng.shuffle(buildDeck());
}

/** Draw the top card, mutating the deck. Reshuffles a fresh deck if somehow empty. */
export function draw(deck: Card[], rng: Rng): Card {
  if (deck.length === 0) deck.push(...shuffledDeck(rng));
  return deck.pop()!;
}
