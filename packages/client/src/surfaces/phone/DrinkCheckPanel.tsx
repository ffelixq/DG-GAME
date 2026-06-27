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

  return (
    <div className="card stack reveal">
      <div className="spread">
        <h2 className="h2">🍺 Drink Check #{dc.index}</h2>
        <span className="muted">up to {budget}</span>
      </div>

      {dc.tokens.length === 0 ? (
        <p className="muted">Nothing to resolve 🎉</p>
      ) : (
        dc.tokens.map((t, i) => {
          const on = selected.has(t.id);
          const disabled = !on && selected.size >= budget;
          return (
            <button key={t.id} className={`chip ${on ? 'sel' : ''}`} disabled={disabled} onClick={() => toggle(t.id)} style={{ width: '100%', minHeight: 56 }}>
              {on ? '🍺 Drink' : `Token ${i + 1}`}
            </button>
          );
        })
      )}

      {carrying > 0 && <p className="muted">{carrying} carries over to the next check.</p>}

      <button className="btn btn--primary btn--lg btn--block" onClick={done}>
        Done
      </button>
    </div>
  );
}
