import { useEffect, useRef, useState } from 'react';
import type { PrivateGameView, ResultSummary, SeatId } from '@lcc/shared';
import { useConn } from '../../../net/connection';
import { PlayingCard } from '../../../ui/PlayingCard';

type Spinnable = Extract<PrivateGameView, { kind: 'roulette' | 'diceDuel' | 'slots' | 'coinflip' | 'wheel' | 'highcard' }>;
const SPIN_MS = 1900;
const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const REEL_SYMS = ['🍒', '🍋', '🔔', '💎', '7️⃣'];

function Wheel({ spinning, num, color }: { spinning: boolean; num: number | null; color: string | null }) {
  const tone = color === 'red' ? '#ff6b6b' : color === 'green' ? 'var(--lcc-good)' : 'var(--lcc-ink)';
  return (
    <div className="wheel-wrap">
      <div className={`wheel ${spinning ? 'spinning' : ''}`} />
      <div className="wheel-ball" />
      {!spinning && num !== null && (
        <div className="wheel-center">
          <span className="num" style={{ color: tone }}>
            {num}
          </span>
        </div>
      )}
    </div>
  );
}

function Reel({ spinning, symbol }: { spinning: boolean; symbol: string }) {
  if (spinning) {
    return (
      <div className="reel spinning">
        <div className="reel-strip">
          {[...REEL_SYMS, ...REEL_SYMS].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="reel">
      <span className="final">{symbol}</span>
    </div>
  );
}

function ResultBanner({ result, onAgain, onBack }: { result: ResultSummary | null; onAgain: () => void; onBack: () => void }) {
  if (!result) return null;
  return (
    <>
      <div className={`result-banner reveal ${result.won ? 'win' : 'loss'}`}>{result.text}</div>
      <button className="btn btn--primary btn--lg btn--block" onClick={onAgain}>
        🔄 Play again
      </button>
      <button className="btn btn--ghost btn--block" onClick={onBack}>
        ← Back to games
      </button>
    </>
  );
}

export function SpinControls({ seatId, view, result }: { seatId: SeatId; view: Spinnable; result: ResultSummary | null }) {
  const { act } = useConn();
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  function spin() {
    setSpinning(true);
    void act('game:action', { seatId, action: { kind: 'spin' } });
    timer.current = setTimeout(() => setSpinning(false), SPIN_MS);
  }

  const stage: 'bet' | 'spin' | 'result' = spinning ? 'spin' : view.phase === 'done' ? 'result' : 'bet';

  if (view.kind === 'roulette') {
    const betting =
      view.selection.kind === 'rb'
        ? `Betting ${view.selection.color.toUpperCase()} (2×)`
        : view.selection.kind === 'straightUp'
          ? `Betting #${view.selection.number} (10×)`
          : '';
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <Wheel spinning={stage === 'spin'} num={stage === 'result' ? (view.result?.number ?? 0) : null} color={view.result?.color ?? null} />
        {stage === 'bet' && (
          <>
            <p className="muted">{betting}</p>
            <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
              Spin the wheel
            </button>
          </>
        )}
        {stage === 'spin' && <p className="muted">No more bets…</p>}
        {stage === 'result' && <ResultBanner result={result} onAgain={() => act('game:action', { seatId, action: { kind: 'replay' } })} onBack={() => act('game:dismiss', { seatId })} />}
      </div>
    );
  }

  if (view.kind === 'diceDuel') {
    const dice = view.result?.dice;
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <div className="dice-row">
          {stage === 'spin' ? (
            <>
              <span className="die rolling">⚄</span>
              <span className="die rolling">⚁</span>
            </>
          ) : stage === 'result' && dice ? (
            <>
              <span className="die">{DICE[dice[0]]}</span>
              <span className="die">{DICE[dice[1]]}</span>
            </>
          ) : (
            <>
              <span className="die">🎲</span>
              <span className="die">🎲</span>
            </>
          )}
        </div>
        {stage === 'bet' && (
          <>
            <p className="muted">Betting {view.band === 'mid' ? 'Lucky 7' : view.band} for ${view.bet}</p>
            <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
              Roll the dice
            </button>
          </>
        )}
        {stage === 'spin' && <p className="muted">Rolling…</p>}
        {stage === 'result' && dice && (
          <>
            <p className="total-badge">= {dice[0] + dice[1]}</p>
            <ResultBanner result={result} onAgain={() => act('game:action', { seatId, action: { kind: 'replay' } })} onBack={() => act('game:dismiss', { seatId })} />
          </>
        )}
      </div>
    );
  }

  const again = () => act('game:action', { seatId, action: { kind: 'replay' } });
  const back = () => act('game:dismiss', { seatId });

  if (view.kind === 'coinflip') {
    const flipped = view.result?.side;
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <div className={`coin ${stage === 'spin' ? 'flipping' : ''}`}>{stage === 'result' && flipped ? (flipped === 'heads' ? '👑' : '⭐') : '🪙'}</div>
        {stage !== 'result' && <p className="muted">You called {view.side.toUpperCase()}</p>}
        {stage === 'bet' && (
          <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
            Flip the coin
          </button>
        )}
        {stage === 'spin' && <p className="muted">Flipping…</p>}
        {stage === 'result' && (
          <>
            <p className="total-badge">{flipped?.toUpperCase()}</p>
            <ResultBanner result={result} onAgain={again} onBack={back} />
          </>
        )}
      </div>
    );
  }

  if (view.kind === 'wheel') {
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <Wheel spinning={stage === 'spin'} num={null} color={null} />
        {stage === 'bet' && (
          <>
            <p className="muted">Spin for up to 20×! (${view.bet})</p>
            <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
              Spin the wheel
            </button>
          </>
        )}
        {stage === 'spin' && <p className="muted">Round and round…</p>}
        {stage === 'result' && view.result && (
          <>
            <div className="result-big" style={{ color: view.result.mult > 0 ? 'var(--lcc-good)' : 'var(--lcc-danger)' }}>{view.result.mult}×</div>
            <ResultBanner result={result} onAgain={again} onBack={back} />
          </>
        )}
      </div>
    );
  }

  if (view.kind === 'highcard') {
    const res = view.result;
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <div className="hand-row">
          <span className="label">You vs Dealer</span>
          <span className="hand">
            {stage === 'result' && res ? <PlayingCard card={res.player} /> : <PlayingCard hidden />}
            <span style={{ alignSelf: 'center', fontWeight: 800 }}>vs</span>
            {stage === 'result' && res ? <PlayingCard card={res.dealer} /> : <PlayingCard hidden />}
          </span>
        </div>
        {stage === 'bet' && (
          <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
            Draw a card (${view.bet})
          </button>
        )}
        {stage === 'spin' && <p className="muted">Drawing…</p>}
        {stage === 'result' && <ResultBanner result={result} onAgain={again} onBack={back} />}
      </div>
    );
  }

  // slots
  const reels = view.kind === 'slots' ? (view.reels ?? ['🍒', '🍋', '🔔']) : ['🍒', '🍋', '🔔'];
  return (
    <div className="game-area" style={{ textAlign: 'center' }}>
      <div className="reels">
        {[0, 1, 2].map((i) => (
          <Reel key={i} spinning={stage === 'spin'} symbol={reels[i] ?? '🍒'} />
        ))}
      </div>
      {stage === 'bet' && (
        <>
          <p className="muted">Slots — ${view.bet}</p>
          <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
            Pull!
          </button>
        </>
      )}
      {stage === 'spin' && <p className="muted">🎰 spinning…</p>}
      {stage === 'result' && <ResultBanner result={result} onAgain={() => act('game:action', { seatId, action: { kind: 'replay' } })} onBack={() => act('game:dismiss', { seatId })} />}
    </div>
  );
}
