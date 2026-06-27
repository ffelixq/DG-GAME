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
  const style = delayMs ? { animationDelay: `${delayMs}ms` } : undefined;
  if (hidden || !card) {
    return (
      <span className={`pcard pcard--back ${className}`} style={style}>
        🂠
      </span>
    );
  }
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span className={`pcard ${red ? 'pcard--red' : ''} ${className}`} style={style}>
      {card.rank}
      {SUIT_SYMBOL[card.suit]}
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
