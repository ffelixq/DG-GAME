import { useEffect, useRef, useState } from 'react';
import type { BetSelection, PrivateGameView, ResultSummary, SeatId } from '@lcc/shared';
import { useConn } from '../../../net/connection';
import { Deck, PlayingCard } from '../../../ui/PlayingCard';
import { getAnimSpeed } from '../../../ui/anim';

type Spinnable = Extract<PrivateGameView, { kind: 'roulette' | 'diceDuel' | 'slots' | 'coinflip' | 'wheel' | 'highcard' }>;
const SPIN_BASE_MS = 1900;
const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const REEL_SYMS = ['🍒', '🍋', '🔔', '💎', '7️⃣'];

const TURNS = 5;
/** Rotation that lands the result's colour segment under the top pointer (so the wheel really lands). */
function landRotation(prev: number, color?: string, num?: number): number {
  let center = 0; // green / generic -> top
  if (color === 'red') center = 9 + 36 * ((num ?? 0) % 10);
  else if (color === 'black') center = 27 + 36 * ((num ?? 0) % 10);
  const base = Math.ceil((prev + 1) / 360) * 360;
  return base + TURNS * 360 + ((360 - (center % 360)) % 360);
}

function Wheel({ spinning, result }: { spinning: boolean; result?: { number: number; color: string } }) {
  const [rot, setRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  useEffect(() => {
    if (spinning) {
      setRot((prev) => landRotation(prev, result?.color, result?.number));
      setBallRot((prev) => prev - (TURNS + 3) * 360); // counter-clockwise, decelerating to rest at the top pocket
    }
  }, [spinning, result?.number, result?.color]);
  const tone = result?.color === 'red' ? '#ff6b6b' : result?.color === 'green' ? 'var(--lcc-good)' : '#fff';
  const dur = SPIN_BASE_MS / getAnimSpeed();
  return (
    <div className="wheel-wrap">
      <div className="wheel" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? `transform ${dur}ms cubic-bezier(0.15, 0.62, 0.18, 1)` : 'none' }} />
      <div className="wheel-ball" style={{ transform: `rotate(${ballRot}deg)`, transition: spinning ? `transform ${dur}ms cubic-bezier(0.12, 0.7, 0.2, 1)` : 'none' }} />
      {!spinning && result && (
        <div className="wheel-center">
          <span className="num" style={{ color: tone }}>
            {result.number}
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
  const { act, call, freezeBank } = useConn();
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  function spin() {
    // hold the bank meter steady until ~just after the wheel/reels reveal (scaled to anim speed)
    freezeBank(SPIN_BASE_MS / getAnimSpeed() + 400);
    setSpinning(true);
    void act('game:action', { seatId, action: { kind: 'spin' } });
    timer.current = setTimeout(() => setSpinning(false), SPIN_BASE_MS / getAnimSpeed());
  }

  const stage: 'bet' | 'spin' | 'result' = spinning ? 'spin' : view.phase === 'done' ? 'result' : 'bet';
  const again = () => act('game:action', { seatId, action: { kind: 'replay' } });
  const back = () => act('game:dismiss', { seatId });

  if (view.kind === 'roulette') {
    const betting =
      view.selection.kind === 'rb'
        ? `Betting ${view.selection.color.toUpperCase()} (2×)`
        : view.selection.kind === 'straightUp'
          ? `Betting #${view.selection.number} (10×)`
          : '';
    // change selection and immediately spin again (no trip back to the menu)
    async function respinWith(selection: BetSelection) {
      await call('game:dismiss', { seatId });
      await call('game:start', { seatId, kind: 'roulette', bet: view.bet, selection });
    }
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <Wheel spinning={stage === 'spin'} result={view.result} />
        {stage === 'bet' && (
          <>
            <p className="muted">{betting}</p>
            <button className="btn btn--primary btn--lg btn--block" onClick={spin}>
              Spin the wheel
            </button>
          </>
        )}
        {stage === 'spin' && <p className="muted">No more bets…</p>}
        {stage === 'result' && (
          <>
            {result && <div className={`result-banner reveal ${result.won ? 'win' : 'loss'}`}>{result.text}</div>}
            <p className="muted">Spin again — pick your bet:</p>
            <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="chip" onClick={() => respinWith({ kind: 'rb', color: 'red' })}>
                🔴 Red
              </button>
              <button className="chip" onClick={() => respinWith({ kind: 'rb', color: 'black' })}>
                ⚫ Black
              </button>
              <button className="chip sel" onClick={again}>
                🔄 Same bet
              </button>
            </div>
            <button className="btn btn--ghost btn--block" onClick={back}>
              ← Back to games
            </button>
          </>
        )}
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
              <span className="die" style={{ animationDelay: `${100 / getAnimSpeed()}ms` }}>
                {DICE[dice[1]]}
              </span>
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
            <ResultBanner result={result} onAgain={again} onBack={back} />
          </>
        )}
      </div>
    );
  }

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
        <Wheel spinning={stage === 'spin'} />
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
          <span className="hand" style={{ alignItems: 'flex-start' }}>
            <Deck />
            <PlayingCard card={stage === 'result' && res ? res.player : undefined} hidden={!(stage === 'result' && res)} deckOffset={0} />
            <span style={{ alignSelf: 'center', fontWeight: 800 }}>vs</span>
            <PlayingCard card={stage === 'result' && res ? res.dealer : undefined} hidden={!(stage === 'result' && res)} deckOffset={1} delayMs={95 / getAnimSpeed()} />
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
      {stage === 'result' && <ResultBanner result={result} onAgain={again} onBack={back} />}
    </div>
  );
}
