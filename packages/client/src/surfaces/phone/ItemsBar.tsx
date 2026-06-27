import { useState } from 'react';
import type { ItemView, PublicRoomView, SeatId } from '@lcc/shared';
import { useConn } from '../../net/connection';

export function ItemsBar({ seatId, items, pub }: { seatId: SeatId; items: ItemView[]; pub: PublicRoomView }) {
  const { act } = useConn();
  const [targeting, setTargeting] = useState<string | null>(null);
  if (items.length === 0) return null;

  const others = pub.seats.filter((s) => s.seatId !== seatId);

  function use(instanceId: string, needsTarget: boolean, targetSeatId?: SeatId) {
    if (needsTarget && !targetSeatId) {
      setTargeting(instanceId);
      return;
    }
    setTargeting(null);
    act('item:use', { seatId, instanceId, targetSeatId });
  }

  return (
    <div className="card stack">
      <h2 className="h2">Your cards</h2>
      {items.map((it) => (
        <div key={it.instanceId} className="stack" style={{ gap: '0.35rem' }}>
          <div className="spread">
            <div>
              <strong>{it.name}</strong>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {it.description}
              </div>
            </div>
            <button className="btn btn--cyan" disabled={!it.usableNow} onClick={() => use(it.instanceId, it.needsTarget)}>
              Use
            </button>
          </div>
          {targeting === it.instanceId && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="muted">on:</span>
              {others.map((o) => (
                <button key={o.seatId} className="chip" onClick={() => use(it.instanceId, true, o.seatId)}>
                  {o.name}
                </button>
              ))}
              <button className="linkbtn" onClick={() => setTargeting(null)}>
                cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
