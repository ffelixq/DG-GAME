import { useState } from 'react';
import { SAFETY_CONFIG } from '@lcc/shared';
import { useConn } from '../net/connection';

export function SafetyScreen() {
  const { call, pub } = useConn();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    const r = await call('houseRules:accept', {});
    setBusy(false);
    if (r.ok) setAccepted(true);
  }

  return (
    <div className="screen">
      <h2 className="h2">House Rules</h2>
      <div className="card">
        <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {SAFETY_CONFIG.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      {accepted ? (
        <p className="tag">
          Waiting for everyone… {pub?.houseRules.ackedCount}/{pub?.houseRules.total} ready
        </p>
      ) : (
        <button className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={accept}>
          I understand — let's play
        </button>
      )}
    </div>
  );
}
