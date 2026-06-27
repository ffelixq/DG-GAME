import { useEffect, useState } from 'react';
import type { PrivateSeatView, PublicRoomView, SeatId } from '@lcc/shared';
import { useConn } from '../../net/connection';
import { useServerNow, formatClock } from '../../net/useClock';
import { TokenPills } from '../../ui/TokenPills';
import { GamePicker } from './GamePicker';
import { DrinkCheckPanel } from './DrinkCheckPanel';
import { ChoicePanel } from './ChoicePanel';
import { ItemsBar } from './ItemsBar';
import { BlackjackControls } from './games/BlackjackControls';
import { SpinControls } from './games/SpinControls';
import { PokerControls } from './games/PokerControls';

function PhoneTopBar({ pub, onPause }: { pub: PublicRoomView; onPause: () => void }) {
  const { serverOffset } = useConn();
  const now = useServerNow(serverOffset);
  const remaining = pub.timer.running ? pub.timer.endsAt - now : pub.timer.remainingMs;
  const pct = Math.min(100, Math.max(0, (pub.bank / pub.quota) * 100));
  return (
    <div className="topbar">
      <div className="spread">
        <span className="muted">
          {pub.floorName} · <span className={remaining < 30000 ? 'timer-low' : ''}>{formatClock(remaining)}</span>
        </span>
        <button className="btn btn--ghost btn--sm" onClick={onPause}>
          {pub.paused ? '▶' : '⏸'}
        </button>
      </div>
      <div className="bank-line" style={{ fontSize: '0.85rem' }}>
        <span>${pub.bank.toLocaleString()}</span>
        <span className="quota">quota ${pub.quota.toLocaleString()}</span>
      </div>
      <div className="bank-meter" style={{ height: 14 }}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PhonePlay({ pub }: { pub: PublicRoomView }) {
  const { priv, act } = useConn();
  const mySeats = priv?.seats ?? [];
  const [activeId, setActiveId] = useState<SeatId | null>(mySeats[0]?.seatId ?? null);
  const [revealedId, setRevealedId] = useState<SeatId | null>(mySeats.length === 1 ? (mySeats[0]?.seatId ?? null) : null);

  useEffect(() => {
    if (!activeId || !mySeats.some((s) => s.seatId === activeId)) {
      setActiveId(mySeats[0]?.seatId ?? null);
    }
  }, [mySeats, activeId]);

  const active = mySeats.find((s) => s.seatId === activeId) ?? mySeats[0];
  if (!active) return null;

  const multi = mySeats.length > 1;
  const needHandoff = multi && revealedId !== active.seatId;

  function switchSeat(id: SeatId) {
    setActiveId(id);
    setRevealedId(multi ? null : id);
  }

  return (
    <div className="screen">
      <PhoneTopBar pub={pub} onPause={() => act('control:pause', { value: !pub.paused })} />

      {multi && (
        <div className="seat-tabs">
          {mySeats.map((s) => (
            <button key={s.seatId} className={`seat-tab ${s.seatId === active.seatId ? 'active' : ''}`} onClick={() => switchSeat(s.seatId)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {pub.paused ? (
        <div className="center-hero">
          <h2 className="h2">⏸ Paused</h2>
        </div>
      ) : needHandoff ? (
        <div className="handoff">
          <p className="muted">Hand the phone to</p>
          <p className="big">{active.name}</p>
          <button className="btn btn--primary btn--lg" onClick={() => setRevealedId(active.seatId)}>
            I'm {active.name} — ready
          </button>
        </div>
      ) : (
        <SeatTable seat={active} pub={pub} />
      )}
    </div>
  );
}

function SeatTable({ seat, pub }: { seat: PrivateSeatView; pub: PublicRoomView }) {
  return (
    <div className="stack">
      <div className="spread">
        <h2 className="h2">{seat.name}</h2>
        <TokenPills counts={seat.tokenCounts} />
      </div>

      {seat.lastResult && !seat.activeGame && !seat.drinkCheck && (
        <div className={`result-banner ${seat.lastResult.won ? 'win' : 'loss'}`}>{seat.lastResult.text}</div>
      )}

      {seat.pendingChoice ? (
        <ChoicePanel seatId={seat.seatId} choice={seat.pendingChoice} />
      ) : seat.drinkCheck && !seat.drinkCheck.done ? (
        <DrinkCheckPanel seatId={seat.seatId} dc={seat.drinkCheck} />
      ) : seat.drinkCheck?.done ? (
        <p className="tag" style={{ textAlign: 'center' }}>
          ✅ Sorted — waiting for everyone else…
        </p>
      ) : seat.activeGame ? (
        seat.activeGame.kind === 'blackjack' ? (
          <BlackjackControls seatId={seat.seatId} view={seat.activeGame} result={seat.lastResult} pub={pub} />
        ) : seat.activeGame.kind === 'poker3' ? (
          <PokerControls seatId={seat.seatId} view={seat.activeGame} result={seat.lastResult} pub={pub} />
        ) : (
          <SpinControls seatId={seat.seatId} view={seat.activeGame} result={seat.lastResult} />
        )
      ) : pub.phase === 'playing' ? (
        <GamePicker seatId={seat.seatId} pub={pub} />
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>Hold tight…</p>
      )}

      {!seat.pendingChoice && !seat.activeGame && <ItemsBar seatId={seat.seatId} items={seat.items} pub={pub} />}
    </div>
  );
}
