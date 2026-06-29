import { useEffect, useState } from 'react';
import type { DrinkCheckResolveState, SeatId, TokenId } from '@lcc/shared';
import { useConn } from '../../net/connection';

export function DrinkCheckPanel({ seatId, dc }: { seatId: SeatId; dc: DrinkCheckResolveState }) {
  const { act } = useConn();
  const budget = dc.budgetAlcohol;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(dc.tokens.slice(0, budget).map((t) => t.id)));

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([60, 40, 60]);
  }, [dc.index]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < budget) next.add(id);
      return next;
    });
  }

  function done() {
    const resolutions = [...selected].map((id) => ({ tokenId: id as TokenId, as: 'alcohol' as const }));
    act('drinkCheck:resolve', { seatId, resolutions });
  }

  const carrying = dc.tokens.length - selected.size;
  const total = dc.tokens.length;

  return (
    <div className="card stack reveal">
      <h2 className="h2" style={{ textAlign: 'center' }}>🍺 Drink Check</h2>

      {total === 0 ? (
        <p className="tag" style={{ textAlign: 'center' }}>You're clear — nothing to drink! 🎉</p>
      ) : (
        <>
          <p className="muted" style={{ textAlign: 'center' }}>
            You picked up <b>{total}</b> drink{total === 1 ? '' : 's'}. Drink up to <b>{budget}</b> <b>now</b> — tap to drink. Anything you don't drink is cleared (no carry-over).
          </p>
          <div className="drink-tokens">
            {dc.tokens.map((t) => {
              const on = selected.has(t.id);
              const disabled = !on && selected.size >= budget;
              return (
                <button key={t.id} className={`drink-token ${on ? 'on' : ''}`} disabled={disabled} onClick={() => toggle(t.id)}>
                  <span className="dt-emoji">🍺</span>
                  <span className="dt-label">{on ? 'Drink now' : 'Cleared'}</span>
                </button>
              );
            })}
          </div>
          <div className="drink-summary">
            Drinking <b>{selected.size}</b> now{carrying > 0 ? <> · <b>{carrying}</b> cleared</> : null}
          </div>
        </>
      )}

      <button className="btn btn--primary btn--lg btn--block" onClick={done}>
        {total === 0 ? 'Done' : selected.size > 0 ? 'Cheers — done 🍻' : 'Carry them all — done'}
      </button>
    </div>
  );
}
