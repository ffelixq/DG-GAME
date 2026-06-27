import type { GameAction, PrivateGameView, PublicRoomView, ResultSummary, SeatId } from '@lcc/shared';
import { useConn } from '../../../net/connection';
import { PlayingCard } from '../../../ui/PlayingCard';

type BJ = Extract<PrivateGameView, { kind: 'blackjack' }>;

export function BlackjackControls({ seatId, view, result, pub }: { seatId: SeatId; view: BJ; result: ResultSummary | null; pub: PublicRoomView }) {
  const { act: send } = useConn();
  const act = (action: GameAction) => send('game:action', { seatId, action });
  const can = (k: GameAction['kind']) => view.legal.some((l) => l.kind === k);
  const done = view.phase === 'done';
  const name = (id: SeatId) => pub.seats.find((s) => s.seatId === id)?.name ?? '??';

  return (
    <div className={`game-area ${done ? 'reveal' : ''}`}>
      {/* dealer */}
      <div className="hand-row">
        <span className="label">Dealer{done ? '' : view.dealer.length ? ' shows' : ''}</span>
        <span className="hand">
          {view.dealer.map((c, i) => (
            <PlayingCard key={i} card={c} className={done && i >= 1 ? 'flip' : ''} delayMs={Math.min(i, 4) * 95} />
          ))}
          {view.dealerHidden && <PlayingCard key="hole" hidden delayMs={95} />}
        </span>
      </div>

      {/* your hand */}
      <div className="hand-row">
        <span className="label">
          You — <span className="total-badge">{view.total}{view.soft ? ' (soft)' : ''}</span>
        </span>
        <span className="hand">
          {view.hole.map((c, i) => (
            <PlayingCard key={i} card={c} delayMs={Math.min(i, 4) * 95} />
          ))}
        </span>
      </div>

      {view.phase === 'joining' && (
        <>
          <p className="muted">Others can still join…</p>
          <button className="btn btn--cyan btn--block" onClick={() => act({ kind: 'deal' })}>
            Deal now
          </button>
        </>
      )}

      {view.phase === 'playing' && view.legal.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {can('hit') && (
            <button className="btn btn--primary" onClick={() => act({ kind: 'hit' })}>
              Hit
            </button>
          )}
          {can('stand') && (
            <button className="btn btn--cyan" onClick={() => act({ kind: 'stand' })}>
              Stand
            </button>
          )}
          {can('double') && (
            <button className="btn" onClick={() => act({ kind: 'double' })}>
              Double
            </button>
          )}
        </div>
      )}
      {view.phase === 'playing' && view.legal.length === 0 && <p className="tag">Waiting for the table…</p>}

      {view.others.length > 0 && (
        <div className="muted" style={{ fontSize: '0.8rem' }}>
          {view.others.map((o) => `${name(o.seatId)}: ${o.busted ? 'bust' : o.done ? 'done' : `${o.cardCount} cards`}`).join(' · ')}
        </div>
      )}

      {done && result && (
        <>
          <div className={`result-banner result-big reveal ${result.won ? 'win' : 'loss'}`}>{result.text}</div>
          <button className="btn btn--cyan btn--block" onClick={() => send('game:dismiss', { seatId })}>
            ← Go back
          </button>
        </>
      )}
    </div>
  );
}
