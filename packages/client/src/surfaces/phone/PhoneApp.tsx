import { useState } from 'react';
import type { PublicRoomView } from '@lcc/shared';
import { useConn } from '../../net/connection';
import { Roster } from '../../ui/Roster';
import { Confetti } from '../../ui/Confetti';
import { PhonePlay } from './PhonePlay';

export function PhoneApp() {
  const { pub, priv, deviceId, act } = useConn();
  if (!pub || !priv) return null;
  const isHost = pub.hostDeviceId === deviceId;
  switch (pub.phase) {
    case 'lobby':
      return <PhoneLobby pub={pub} />;
    case 'floorIntro':
      return (
        <div className="screen">
          <div className="center-hero">
            <p className="tag">Floor {pub.floor}</p>
            <h2 className="h2">{pub.floorName}</h2>
            <p className="muted">Quota ${pub.quota.toLocaleString()} — get ready…</p>
          </div>
        </div>
      );
    case 'roundResults': {
      const r = pub.lastResult;
      return (
        <div className="screen">
          <div className="center-hero">
            <h2 className="h2" style={{ color: r?.passed ? 'var(--lcc-good)' : 'var(--lcc-danger)' }}>
              {r?.passed ? 'Quota met! 🎉' : 'Quota missed 💀'}
            </h2>
            <p className="muted">
              ${r?.finalBank.toLocaleString()} / ${r?.quota.toLocaleString()}
            </p>
            {isHost ? (
              <button className="btn btn--primary btn--lg" onClick={() => act('control:advance', {})}>
                {r?.passed ? 'Next floor →' : 'Take the punishment →'}
              </button>
            ) : (
              <p className="tag">Waiting for the host…</p>
            )}
          </div>
        </div>
      );
    }
    case 'ending': {
      const e = pub.ending;
      const iPickDare = (priv.seats ?? []).some((s) => s.seatId === e?.finalDareSeatId);
      return (
        <div className="screen">
          {e && e.endingId !== 'bad' && <Confetti />}
          <div className="center-hero">
            <h2 className="h2">{e?.endingId === 'bad' ? 'The house won 🦈' : 'You cleared the debt! 🥂'}</h2>
            {iPickDare && <p className="tag">You won — pick the final dare! 🎉</p>}
            {e?.finalForfeitText && <p className="muted">{e.finalForfeitText}</p>}
            {isHost && (
              <button className="btn btn--primary btn--lg" onClick={() => act('control:playAgain', {})}>
                Play again
              </button>
            )}
          </div>
        </div>
      );
    }
    default:
      return <PhonePlay pub={pub} />;
  }
}

function PhoneLobby({ pub }: { pub: PublicRoomView }) {
  const { priv, call, act, deviceId } = useConn();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mySeats = priv?.seats ?? [];
  const isHost = pub.hostDeviceId === deviceId;
  const enoughPlayers = pub.seats.length >= 2;

  async function addSeat() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await call<{ seatId: string }>('seat:add', { name: name.trim() });
    setBusy(false);
    if (!r.ok) setError(r.message);
    else setName('');
  }

  return (
    <div className="screen">
      <div className="lobby-head">
        <span className="muted">ROOM</span>
        <span className="lobby-code">{pub.code}</span>
      </div>

      <div className="card stack">
        <div className="spread">
          <h2 className="h2">At the table</h2>
          <span className="muted">{pub.seats.length} playing</span>
        </div>
        <Roster
          seats={pub.seats}
          youSeatIds={mySeats.map((s) => s.seatId)}
          onKick={isHost ? (id) => act('seat:remove', { seatId: id }) : undefined}
        />
      </div>

      <div className="card stack">
        <h2 className="h2">On this phone</h2>
        {mySeats.length > 0 && (
          <div className="roster">
            {mySeats.map((s) => (
              <div key={s.seatId} className="seat-chip">
                <span className="dot" />
                {s.name}
                <button className="linkbtn" onClick={() => act('seat:remove', { seatId: s.seatId })}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <input
            className="input"
            value={name}
            maxLength={16}
            placeholder="Add a player on this phone"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSeat()}
          />
          <button className="btn btn--cyan" disabled={busy} onClick={addSeat}>
            Add
          </button>
        </div>
        <button className="btn btn--ghost btn--block" onClick={() => act('seat:addBot', {})}>
          🤖 Add a bot
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      {isHost ? (
        <button
          className="btn btn--primary btn--lg btn--block"
          disabled={!enoughPlayers}
          onClick={() => act('control:advance', {})}
        >
          {enoughPlayers ? 'Start the night' : 'Need 2+ players'}
        </button>
      ) : (
        <p className="tag" style={{ textAlign: 'center' }}>
          Waiting for the host to start…
        </p>
      )}
    </div>
  );
}

