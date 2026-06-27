import type { CSSProperties } from 'react';
import type { PublicSeatView, SeatId } from '@lcc/shared';
import { accent } from './accents';
import { TokenPills } from './TokenPills';

export function Roster({
  seats,
  showTokens = false,
  youSeatIds = [],
}: {
  seats: PublicSeatView[];
  showTokens?: boolean;
  youSeatIds?: SeatId[];
}) {
  if (seats.length === 0) return <p className="muted">No players yet…</p>;
  return (
    <div className="roster">
      {seats.map((s) => (
        <div
          key={s.seatId}
          className={`seat-chip ${s.connected ? '' : 'off'}`}
          style={{ ['--accent']: accent(s.accentIndex) } as CSSProperties}
        >
          <span className="dot" />
          <span>{s.isBot ? '🤖 ' : ''}{s.name}</span>
          {s.isHost && <span className="badge" title="host">★</span>}
          {youSeatIds.includes(s.seatId) && <span className="badge">you</span>}
          {showTokens && <TokenPills counts={s.tokenCounts} />}
        </div>
      ))}
    </div>
  );
}
