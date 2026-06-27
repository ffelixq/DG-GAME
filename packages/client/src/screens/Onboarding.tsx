import { useState } from 'react';
import { useConn } from '../net/connection';

export function Onboarding() {
  const { call, lastAction, pub } = useConn();
  const [step, setStep] = useState<'choose' | 'seats'>(lastAction === 'create' ? 'choose' : 'seats');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function makeBigScreen() {
    setBusy(true);
    const r = await call('device:setBigScreen', { value: true });
    setBusy(false);
    if (!r.ok) setError(r.message);
  }

  async function addSeat() {
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await call<{ seatId: string }>('seat:add', { name: name.trim() });
    setBusy(false);
    if (!r.ok) setError(r.message);
    else setName('');
  }

  if (step === 'choose') {
    return (
      <div className="screen">
        <div className="stack" style={{ textAlign: 'center' }}>
          <p className="muted">Room {pub?.code}</p>
          <h2 className="h2">Is everyone looking at this screen?</h2>
        </div>
        <div className="stack">
          <button className="btn btn--cyan btn--lg btn--block" disabled={busy} onClick={makeBigScreen}>
            📺 Yes — make it the big screen
          </button>
          <button className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={() => setStep('seats')}>
            📱 No — I'm a player
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="stack" style={{ textAlign: 'center' }}>
        <p className="muted">Room {pub?.code}</p>
        <h2 className="h2">Who's playing on this phone?</h2>
      </div>
      <div className="stack">
        <input
          className="input"
          value={name}
          maxLength={16}
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSeat()}
        />
        <button className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={addSeat}>
          Add player
        </button>
        {lastAction === 'join' && (
          <button className="linkbtn" onClick={makeBigScreen}>
            Use this device as the big screen instead
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
