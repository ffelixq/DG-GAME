import type { HoldemStreet, PrivateGameView, ResultSummary, SeatId } from '@lcc/shared';
import { useConn } from '../../../net/connection';
import { Hand } from '../../../ui/PlayingCard';

type Poker = Extract<PrivateGameView, { kind: 'poker3' }>;
const STREET: Record<HoldemStreet, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

export function PokerControls({ seatId, view, result }: { seatId: SeatId; view: Poker; result: ResultSummary | null }) {
  const { act: send } = useConn();
  const act = (kind: 'play' | 'fold') => send('game:action', { seatId, action: { kind } });
  const canAct = view.legal.length > 0;
  const done = view.phase === 'done';

  return (
    <div className={`game-area ${done ? 'reveal' : ''}`}>
      {view.community.length > 0 && (
        <div className="hand-row">
          <span className="label">Board · {STREET[view.street]}</span>
          <Hand cards={view.community} />
        </div>
      )}
      <div className="hand-row">
        <span className="label">
          You — <span className="total-badge">{view.handLabel}</span>
        </span>
        <Hand cards={view.hole} />
      </div>

      {view.phase === 'joining' && <p className="muted">Waiting for players to join…</p>}
      {canAct && (
        <div className="row">
          <button className="btn btn--primary" onClick={() => act('play')}>
            Stay
          </button>
          <button className="btn btn--ghost" onClick={() => act('fold')}>
            Fold
          </button>
        </div>
      )}
      {!canAct && view.phase === 'acting' && <p className="tag">Locked in — waiting for the table…</p>}

      {done && result && (
        <>
          <div className={`result-banner ${result.won ? 'win' : 'loss'}`}>{result.text}</div>
          <p className="muted">Showdown on the big screen 👀</p>
          <button className="btn btn--cyan btn--block" onClick={() => send('game:dismiss', { seatId })}>
            ← Go back
          </button>
        </>
      )}
    </div>
  );
}
