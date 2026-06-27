import { useConn } from './net/connection';
import { Landing } from './screens/Landing';
import { Onboarding } from './screens/Onboarding';
import { BoardApp } from './surfaces/board/BoardApp';
import { PhoneApp } from './surfaces/phone/PhoneApp';
import { Toasts } from './ui/Toasts';

function Body() {
  const { joined, pub, priv, deviceId } = useConn();

  if (!joined || !pub) {
    return joined ? (
      <div className="screen">
        <p className="tag" style={{ textAlign: 'center' }}>
          Joining the room…
        </p>
      </div>
    ) : (
      <Landing />
    );
  }

  const amBigScreen = pub.bigScreenDeviceId === deviceId;
  if (amBigScreen) return <BoardApp />;

  const mySeats = priv?.seats ?? [];
  if (mySeats.length > 0) return <PhoneApp />;

  return <Onboarding />;
}

function LeaveButton() {
  const { reset } = useConn();
  return (
    <button
      className="leave-btn"
      onClick={() => {
        if (window.confirm('Leave this room and go back to the start?')) reset();
      }}
    >
      ← Leave
    </button>
  );
}

export function App() {
  const { connected, joined } = useConn();
  return (
    <div className="app-shell">
      {!connected && <div className="conn-banner">Reconnecting…</div>}
      {joined && <LeaveButton />}
      <Body />
      <Toasts />
    </div>
  );
}
