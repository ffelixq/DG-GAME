import type { CSSProperties } from 'react';
import { SUIT_SYMBOL, type Card } from '@lcc/shared';
import { getAnimSpeed } from './anim';

export function PlayingCard({
  card,
  hidden,
  className = '',
  delayMs = 0,
  deckOffset,
}: {
  card?: Card;
  hidden?: boolean;
  className?: string;
  delayMs?: number;
  /** Position of this card relative to the draw pile on its left — makes the deal slide out OF the deck. */
  deckOffset?: number;
}) {
  const faceUp = !hidden && !!card;
  const red = card ? card.suit === 'H' || card.suit === 'D' : false;
  const sym = card ? SUIT_SYMBOL[card.suit] : '';
  const style: Record<string, string | number> = {};
  if (delayMs) style.animationDelay = `${delayMs}ms`;
  if (deckOffset !== undefined) {
    // slide out of the deck (to the left): card 0 hops one card-width, later cards travel farther
    style['--deal-x'] = `${-(deckOffset + 1) * 52}px`;
    style['--deal-y'] = '-6px';
    style['--deal-rot'] = '-4deg';
  }
  return (
    <span className={`pcard ${className}`} style={style as CSSProperties}>
      <span className={`pcard-inner ${faceUp ? 'up' : ''}`}>
        <span className="pcard-face pcard-back" aria-hidden="true" />
        <span className={`pcard-face pcard-front ${red ? 'red' : ''}`}>
          {card && (
            <>
              <span className="pc-idx pc-tl">
                {card.rank}
                <i>{sym}</i>
              </span>
              <span className="pc-pip">{sym}</span>
              <span className="pc-idx pc-br">
                {card.rank}
                <i>{sym}</i>
              </span>
            </>
          )}
        </span>
      </span>
    </span>
  );
}

/** A visible draw pile the cards are dealt from; it thins out and peels a card off the top as cards leave. */
export function Deck({ label = 'DECK', dealt = 0 }: { label?: string; dealt?: number }) {
  const remaining = Math.max(2, 5 - dealt);
  return (
    <span className="deck" aria-hidden="true" title="Draw pile">
      <span className="deck-stack">
        {Array.from({ length: remaining }, (_, i) => (
          <span key={i} className="deck-card" style={{ transform: `translate(${i * 1.5}px, ${-i * 1.5}px)` }} />
        ))}
        {/* keyed by `dealt` so a fresh card peels off the top on every deal */}
        {dealt > 0 && <span key={`peel-${dealt}`} className="deck-card deck-peel" />}
      </span>
      <span className="deck-label">{label}</span>
    </span>
  );
}

/**
 * Renders a hand with a one-by-one "dealing" stagger.
 * - `fromDeck`: cards slide out of a draw pile sitting to their left.
 * - `dealtFrom`: index where the newest batch starts, so an incremental single deal (a hit / the
 *   turn / the river) starts its stagger at 0 instead of inheriting the whole row's offset.
 */
export function Hand({ cards, hideFrom, fromDeck, dealtFrom = 0 }: { cards: Card[]; hideFrom?: number; fromDeck?: boolean; dealtFrom?: number }) {
  const speed = getAnimSpeed();
  return (
    <span className="hand">
      {cards.map((c, i) => (
        <PlayingCard
          key={i}
          card={c}
          hidden={hideFrom !== undefined && i >= hideFrom}
          delayMs={(Math.min(Math.max(i - dealtFrom, 0), 4) * 95) / speed}
          deckOffset={fromDeck ? i : undefined}
        />
      ))}
    </span>
  );
}
