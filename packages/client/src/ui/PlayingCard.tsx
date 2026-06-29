import { SUIT_SYMBOL, type Card } from '@lcc/shared';

export function PlayingCard({
  card,
  hidden,
  className = '',
  delayMs = 0,
}: {
  card?: Card;
  hidden?: boolean;
  className?: string;
  delayMs?: number;
}) {
  const faceUp = !hidden && !!card;
  const red = card ? card.suit === 'H' || card.suit === 'D' : false;
  const sym = card ? SUIT_SYMBOL[card.suit] : '';
  return (
    <span className={`pcard ${className}`} style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}>
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

/** Renders a hand with a one-by-one "dealing" stagger (capped so late hits don't lag). */
export function Hand({ cards, hideFrom }: { cards: Card[]; hideFrom?: number }) {
  return (
    <span className="hand">
      {cards.map((c, i) => (
        <PlayingCard key={i} card={c} hidden={hideFrom !== undefined && i >= hideFrom} delayMs={Math.min(i, 4) * 95} />
      ))}
    </span>
  );
}
