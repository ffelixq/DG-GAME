import type { GameAction, HoldemStreet, PrivateGameView, PublicRoomView, ResultSummary, SeatId } from '@lcc/shared';
import { useConn } from '../../../net/connection';
import { Hand } from '../../../ui/PlayingCard';

type Poker = Extract<PrivateGameView, { kind: 'poker3' }>;
const STREET: Record<HoldemStreet, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

export function PokerControls({ seatId, view, result, pub }: { seatId: SeatId; view: Poker; result: ResultSummary | null; pub: PublicRoomView }) {
  const { act: send } = useConn();
  const act = (kind: GameAction['kind']) => send('game:action', { seatId, action: { kind } });
  const can = (k: GameAction['kind']) => view.legal.some((l) => l.kind === k);
  const done = view.phase === 'done';
  const name = (id: SeatId) => pub.seats.find((s) => s.seatId === id)?.name ?? '??';

  return (
    <div className={`game-area ${done ? 'reveal' : ''}`}>
      {/* pot of drinks */}
      <div className="poker-pot">
        <span className="pot-label">POT</span>
        <span className="pot-drinks">{'🍺'.repeat(Math.min(view.pot, 5))}</span>
        <span className="pot-count">{view.pot} drink{view.pot === 1 ? '' : 's'} on the line</span>
      </div>

      {/* community */}
      <div className="hand-row">
        <span className="label">Board · {STREET[view.street]}</span>
        {view.community.length > 0 ? <Hand cards={view.community} /> : <span className="muted">— no cards yet —</span>}
      </div>

      {/* your hand */}
      <div className="hand-row">
        <span className="label">
          You — <span className="total-badge">{view.handLabel}</span>
        </span>
        <Hand cards={view.hole} />
      </div>

      {view.phase === 'joining' && <p className="tag" style={{ textAlign: 'center' }}>Waiting for players to join the table…</p>}

      {view.folded && view.phase === 'acting' && <p className="tag" style={{ textAlign: 'center' }}>You folded — sit back 😅</p>}

      {view.phase === 'acting' && !view.folded && view.myTurn && (
        <>
          <div className="turn-banner">YOUR TURN{view.toCall > 0 ? ` · ${view.toCall} to call` : ''}</div>
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {can('check') && (
              <button className="btn btn--cyan" onClick={() => act('check')}>
                Check
              </button>
            )}
            {can('call') && (
              <button className="btn btn--cyan" onClick={() => act('call')}>
                Call
              </button>
            )}
            {can('bet') && (
              <button className="btn btn--primary" onClick={() => act('bet')}>
                Bet 🍺
              </button>
            )}
            {can('raise') && (
              <button className="btn btn--primary" onClick={() => act('raise')}>
                Raise 🍺
              </button>
            )}
            {can('fold') && (
              <button className="btn btn--ghost" onClick={() => act('fold')}>
                Fold
              </button>
            )}
          </div>
        </>
      )}

      {view.phase === 'acting' && !view.folded && !view.myTurn && (
        <p className="tag" style={{ textAlign: 'center' }}>Waiting for the others…</p>
      )}

      {view.others.length > 0 && (
        <div className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
          {view.others.map((o) => `${name(o.seatId)}${o.folded ? ' (folded)' : ''}`).join(' · ')}
        </div>
      )}

      {done && result && (
        <>
          <div className={`result-banner result-big reveal ${result.won ? 'win' : 'loss'}`}>{result.text}</div>
          <button className="btn btn--cyan btn--block" onClick={() => send('game:dismiss', { seatId })}>
            ← Back to games
          </button>
        </>
      )}
    </div>
  );
}
