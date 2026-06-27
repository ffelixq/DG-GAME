import type { PendingChoiceView, SeatId } from '@lcc/shared';
import { useConn } from '../../net/connection';

export function ChoicePanel({ seatId, choice }: { seatId: SeatId; choice: PendingChoiceView }) {
  const { act } = useConn();
  return (
    <div className="card stack">
      <h2 className="h2">{choice.prompt}</h2>
      <div className="stack">
        {choice.options.map((o) => (
          <button
            key={o.id}
            className="btn btn--primary btn--block"
            onClick={() => act('choice:resolve', { seatId, choiceId: choice.id, optionId: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
