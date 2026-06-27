import { useState } from 'react';
import { BANK_TOPUP_AMOUNT, GAME_NAMES, type BetSelection, type GameKind, type PublicRoomView, type SeatId } from '@lcc/shared';
import { useConn } from '../../net/connection';
import { GAME_ICON } from '../../ui/gameMeta';

export function GamePicker({ seatId, pub }: { seatId: SeatId; pub: PublicRoomView }) {
  const { call, act } = useConn();
  const available = pub.bank - pub.reserved;
  const [kind, setKind] = useState<GameKind>(pub.games[0] ?? 'blackjack');
  const [bet, setBet] = useState<number>(Math.min(pub.bets.min, available));
  const [rbColor, setRbColor] = useState<'red' | 'black'>('red');
  const [useNumber, setUseNumber] = useState(false);
  const [num, setNum] = useState(7);
  const [band, setBand] = useState<'low' | 'mid' | 'high'>('low');
  const [coin, setCoin] = useState<'heads' | 'tails'>('heads');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPoker = kind === 'poker3';
  if (available < pub.bets.min) {
    // Bank's dry — the only way on is to drink to top it up.
    return (
      <div className="card stack" style={{ textAlign: 'center', borderColor: 'var(--lcc-gold)' }}>
        <h2 className="h2">🍺 The bank's dry!</h2>
        <p className="muted">Only ${available.toLocaleString()} left — not enough to bet. Take a drink to put ${BANK_TOPUP_AMOUNT.toLocaleString()} back in the bank and keep the night going.</p>
        <button className="btn btn--primary btn--lg btn--block" onClick={() => act('bank:topUp', { seatId })}>
          🍺 Drink to top up — +${BANK_TOPUP_AMOUNT.toLocaleString()}
        </button>
        <p className="muted" style={{ fontSize: '0.75rem' }}>(You'll pick up a drink token — swap it for water or sit out at the next Drink Check if you need to.)</p>
      </div>
    );
  }

  const chips = Array.from(
    new Set([pub.bets.min, Math.round((pub.bets.min + pub.bets.max) / 2), pub.bets.max].filter((b) => b <= available)),
  );
  if (pub.bets.allowAllIn && available > pub.bets.max) chips.push(available);

  // open multiplayer tables anyone can hop into
  const openTables: { kind: GameKind; opener?: SeatId }[] = [];
  for (const g of pub.activeGames) {
    if (g.view.kind === 'poker3' && g.view.phase === 'joining') openTables.push({ kind: 'poker3', opener: g.view.seatIds[0] });
    else if (g.view.kind === 'blackjack' && g.view.phase === 'joining') openTables.push({ kind: 'blackjack', opener: g.view.seats[0]?.seatId });
  }
  const openerName = (id?: SeatId) => pub.seats.find((s) => s.seatId === id)?.name ?? 'Someone';

  function joinTable(k: GameKind) {
    void call('game:start', { seatId, kind: k, bet: k === 'blackjack' ? pub.bets.min : 0, selection: undefined });
  }

  function selection(): BetSelection | undefined {
    if (kind === 'roulette') return useNumber ? { kind: 'straightUp', number: num } : { kind: 'rb', color: rbColor };
    if (kind === 'diceDuel') return { kind: 'band', band };
    if (kind === 'coinflip') return { kind: 'coin', side: coin };
    return undefined;
  }

  async function start() {
    setBusy(true);
    setError(null);
    const wager = isPoker ? 0 : bet; // poker is drink-stakes — no money
    const r = await call<{ sessionId: string }>('game:start', { seatId, kind, bet: wager, selection: selection() });
    setBusy(false);
    if (!r.ok) setError(r.message);
  }

  return (
    <div className="stack">
      {openTables.length > 0 && (
        <div className="join-tables">
          {openTables.map((t, i) => (
            <button key={i} className="btn btn--cyan btn--block join-table-btn seat-pop" onClick={() => joinTable(t.kind)}>
              {GAME_ICON[t.kind]} Join {openerName(t.opener)}'s {GAME_NAMES[t.kind]} table →
            </button>
          ))}
        </div>
      )}

      <div className="game-grid">
        {pub.games.map((g) => (
          <button key={g} className={`game-tile ${g === kind ? 'active' : ''}`} onClick={() => setKind(g)}>
            <span className="game-ico">{GAME_ICON[g]}</span>
            <span>{GAME_NAMES[g]}</span>
          </button>
        ))}
      </div>

      {kind === 'roulette' && (
        <div className="stack">
          <div className="row">
            <button className={`chip ${!useNumber && rbColor === 'red' ? 'sel' : ''}`} onClick={() => { setUseNumber(false); setRbColor('red'); }}>
              Red 2×
            </button>
            <button className={`chip ${!useNumber && rbColor === 'black' ? 'sel' : ''}`} onClick={() => { setUseNumber(false); setRbColor('black'); }}>
              Black 2×
            </button>
            <button className={`chip ${useNumber ? 'sel' : ''}`} onClick={() => setUseNumber(true)}>
              Number 10×
            </button>
          </div>
          {useNumber && (
            <input className="input" type="number" min={0} max={36} value={num} onChange={(e) => setNum(Math.max(0, Math.min(36, Number(e.target.value))))} />
          )}
        </div>
      )}

      {kind === 'diceDuel' && (
        <div className="row">
          <button className={`chip ${band === 'low' ? 'sel' : ''}`} onClick={() => setBand('low')}>
            Low 2–6
          </button>
          <button className={`chip ${band === 'mid' ? 'sel' : ''}`} onClick={() => setBand('mid')}>
            Lucky 7 (5×)
          </button>
          <button className={`chip ${band === 'high' ? 'sel' : ''}`} onClick={() => setBand('high')}>
            High 8–12
          </button>
        </div>
      )}

      {kind === 'coinflip' && (
        <div className="row">
          <button className={`chip ${coin === 'heads' ? 'sel' : ''}`} onClick={() => setCoin('heads')}>
            👑 Heads
          </button>
          <button className={`chip ${coin === 'tails' ? 'sel' : ''}`} onClick={() => setCoin('tails')}>
            ⭐ Tails
          </button>
        </div>
      )}

      {isPoker ? (
        <p className="muted">🃏 Multiplayer poker — others can join your table. No money: bet & raise in <b>drinks</b>, worst hand at showdown drinks the pot.</p>
      ) : (
        <>
          <p className="muted">Bet from the shared bank (${available.toLocaleString()} available)</p>
          <div className="bet-chips">
            {chips.map((b) => (
              <button key={b} className={`chip ${b === bet ? 'sel' : ''}`} onClick={() => setBet(b)}>
                {b === available && pub.bets.allowAllIn ? 'ALL IN' : `$${b}`}
              </button>
            ))}
          </div>
        </>
      )}

      <button className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={start}>
        {isPoker ? '🃏 Join the poker table' : `${GAME_ICON[kind]} Deal ${GAME_NAMES[kind]} — $${bet}`}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
