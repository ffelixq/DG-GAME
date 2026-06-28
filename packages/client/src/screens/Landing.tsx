import { useEffect, useState } from 'react';
import { useConn } from '../net/connection';
import { HowToPlay } from '../ui/HowToPlay';

export function Landing() {
  const { create, join, connected } = useConn();
  const [mode, setMode] = useState<'main' | 'join'>('main');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('room');
    if (fromUrl) {
      setCode(fromUrl.toUpperCase());
      setMode('join');
    }
  }, []);

  async function onCreate() {
    setBusy(true);
    setError(null);
    const r = await create();
    setBusy(false);
    if (!r.ok) setError(r.message);
  }

  async function onJoin() {
    if (code.trim().length < 4) {
      setError('Enter the 4-letter room code.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await join(code.trim());
    setBusy(false);
    if (!r.ok) setError(r.message);
  }

  return (
    <div className="screen">
      <div className="stack" style={{ textAlign: 'center', gap: '0.2rem' }}>
        <h1 className="h1">ONE MORE SHOT</h1>
        <p className="wordmark-sub">🥃 C A S I N O 🥃</p>
        <p className="tag" style={{ marginTop: '0.5rem' }}>One more shot. One more round.</p>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          A party casino drinking game for 2–8 friends. Share one bank, beat the quota, lose and you drink.
        </p>
      </div>

      {mode === 'main' ? (
        <div className="stack">
          <button className="btn btn--primary btn--lg btn--block" disabled={!connected || busy} onClick={onCreate}>
            📺 Create Room <span className="btn-sub">— on a TV / laptop</span>
          </button>
          <button className="btn btn--cyan btn--lg btn--block" disabled={!connected || busy} onClick={() => setMode('join')}>
            📱 Join Room <span className="btn-sub">— on your phone</span>
          </button>
          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            <HowToPlay />
          </div>
          {!connected && <p className="muted" style={{ textAlign: 'center' }}>Connecting to the casino…</p>}
        </div>
      ) : (
        <div className="stack">
          <input
            className="input input--code"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn btn--primary btn--lg btn--block" disabled={!connected || busy} onClick={onJoin}>
            Join
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => setMode('main')}>
            Back
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
