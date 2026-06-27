import { QRCodeSVG } from 'qrcode.react';
import { GAME_NAMES, SUIT_SYMBOL, type ActiveGamePublic, type PublicRoomView } from '@lcc/shared';
import { useConn } from '../../net/connection';
import { useServerNow, formatClock } from '../../net/useClock';
import { Roster } from '../../ui/Roster';
import { Hand } from '../../ui/PlayingCard';
import { Confetti } from '../../ui/Confetti';

export function BoardApp() {
  const { pub } = useConn();
  if (!pub) return null;
  switch (pub.phase) {
    case 'lobby':
      return <BoardLobby pub={pub} />;
    case 'floorIntro':
      return <BoardFloorIntro pub={pub} />;
    case 'roundResults':
      return <BoardResults pub={pub} />;
    case 'ending':
      return <BoardEnding pub={pub} />;
    default:
      return <BoardPlay pub={pub} />;
  }
}

function seatName(pub: PublicRoomView, id: string | null | undefined): string {
  if (!id) return '—';
  return pub.seats.find((s) => s.seatId === id)?.name ?? '—';
}

function BoardResults({ pub }: { pub: PublicRoomView }) {
  const { act, deviceId } = useConn();
  const r = pub.lastResult;
  const isHost = pub.hostDeviceId === deviceId;
  if (!r) return null;
  return (
    <div className="board">
      <div className="center-hero">
        <p className="tag">Floor {r.floor} results</p>
        <h1 className="code-hero" style={{ color: r.passed ? 'var(--lcc-good)' : 'var(--lcc-danger)' }}>
          {r.passed ? 'QUOTA MET' : 'QUOTA MISSED'}
        </h1>
        <p className="h2">
          Bank ${r.finalBank.toLocaleString()} / Quota ${r.quota.toLocaleString()}
        </p>
        <p className="muted">
          Top winner: {seatName(pub, r.topWinnerSeatId)} · Biggest loser: {seatName(pub, r.topLoserSeatId)}
        </p>
        {isHost && (
          <button className="btn btn--primary btn--lg" onClick={() => act('control:advance', {})}>
            {r.passed ? 'Next floor →' : 'Take the punishment →'}
          </button>
        )}
        {!isHost && <p className="muted">Waiting for the host…</p>}
      </div>
    </div>
  );
}

function BoardEnding({ pub }: { pub: PublicRoomView }) {
  const { act, deviceId } = useConn();
  const e = pub.ending;
  const isHost = pub.hostDeviceId === deviceId;
  if (!e) return null;
  const titles: Record<string, string> = { good: '🏆 HIGH ROLLERS', normal: '💵 PAID IN FULL', bad: '🦈 IN THE RED' };
  return (
    <div className="board">
      {e.endingId !== 'bad' && <Confetti />}
      <div className="center-hero">
        <h1 className="code-hero" style={{ fontSize: 'clamp(2rem,9vw,5rem)' }}>
          {titles[e.endingId]}
        </h1>
        {e.worstGamblerSeatId && <p className="tag">Worst Gambler: {seatName(pub, e.worstGamblerSeatId)}</p>}
        {e.finalDareSeatId && <p className="h2">{seatName(pub, e.finalDareSeatId)} picks the final dare! 🎉</p>}
        {e.finalForfeitText && <p className="h2">{e.finalForfeitText}</p>}
        <div className="roster" style={{ justifyContent: 'center', maxWidth: 900 }}>
          {e.awards
            .filter((a) => a.seatId)
            .map((a) => (
              <div key={a.awardId} className="active-game-card">
                <strong>{a.name}</strong>
                <div className="muted">{seatName(pub, a.seatId)}</div>
              </div>
            ))}
        </div>
        {isHost && (
          <button className="btn btn--primary btn--lg" onClick={() => act('control:playAgain', {})}>
            Play again (same crew)
          </button>
        )}
      </div>
    </div>
  );
}

function BoardLobby({ pub }: { pub: PublicRoomView }) {
  const { act, deviceId } = useConn();
  const joinUrl = `${location.origin}/?room=${pub.code}`;
  const isHost = pub.hostDeviceId === deviceId;
  return (
    <div className="board">
      <div className="center-hero">
        <p className="tag">Join the game</p>
        <h1 className="code-hero">{pub.code}</h1>
        <div className="qr-wrap">
          <QRCodeSVG value={joinUrl} size={170} />
        </div>
        <p className="muted">Scan, or open the site and enter the code.</p>
        <Roster seats={pub.seats} onKick={isHost ? (id) => act('seat:remove', { seatId: id }) : undefined} />
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn--ghost" onClick={() => act('seat:addBot', {})}>
            🤖 Add a bot
          </button>
        </div>
        {isHost ? (
          <button className="btn btn--primary btn--lg" disabled={pub.seats.length < 2} onClick={() => act('control:advance', {})}>
            {pub.seats.length < 2 ? 'Need 2+ players' : 'Start the night'}
          </button>
        ) : (
          <p className="tag">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}

function BoardFloorIntro({ pub }: { pub: PublicRoomView }) {
  return (
    <div className="board">
      <div className="center-hero">
        <p className="tag">Floor {pub.floor}</p>
        <h1 className="code-hero" style={{ fontSize: 'clamp(2rem,9vw,5rem)' }}>
          {pub.floorName}
        </h1>
        <p className="h2">Quota: ${pub.quota.toLocaleString()}</p>
        <p className="muted">Get ready…</p>
      </div>
    </div>
  );
}

function ActiveGameLine({ pub, game }: { pub: PublicRoomView; game: ActiveGamePublic }) {
  const v = game.view;
  const seatName = (id: string) => pub.seats.find((s) => s.seatId === id)?.name ?? '??';

  if (v.kind === 'poker3') {
    const STREET: Record<string, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };
    if (!v.result) {
      return (
        <div className="active-game-card">
          <div className="spread">
            <strong>🃏 Poker</strong>
            <span className="muted">
              {v.phase === 'joining' ? 'players joining…' : STREET[v.street]} · pot {'🍺'.repeat(Math.min(v.pot, 5))} {v.pot}
            </span>
          </div>
          {v.community.length > 0 && (
            <div style={{ margin: '0.4rem 0' }}>
              <Hand cards={v.community} />
            </div>
          )}
          <div className="showdown">
            {v.players.map((p) => (
              <div key={p.seatId} className={`showdown-row ${p.seatId === v.turnSeatId ? 'winner' : ''} ${p.folded ? 'muted' : ''} seat-pop`}>
                <span>
                  {p.seatId === v.turnSeatId ? '▶ ' : ''}
                  {seatName(p.seatId)}
                </span>
                <span className="muted">{p.folded ? 'folded' : p.seatId === v.turnSeatId ? 'to act…' : 'in'}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="active-game-card">
        <div className="spread">
          <strong>🃏 Poker — Showdown</strong>
          <span className="muted">pot {'🍺'.repeat(Math.min(v.result.pot, 5))} {v.result.pot}</span>
        </div>
        <div style={{ margin: '0.4rem 0' }}>
          <Hand cards={v.result.community} />
        </div>
        <div className="showdown">
          {v.result.reveals.map((r) => (
            <div
              key={r.seatId}
              className={`showdown-row reveal ${r.seatId === v.result!.winnerSeatId ? 'winner' : ''} ${r.seatId === v.result!.loserSeatId ? 'loser' : ''}`}
            >
              <span>
                {r.seatId === v.result!.winnerSeatId ? '🏆 ' : r.seatId === v.result!.loserSeatId ? '🍺 ' : ''}
                {seatName(r.seatId)} {r.folded && <span className="muted">(folded)</span>}
              </span>
              <Hand cards={r.cards} />
              <span className="muted">{r.handLabel}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (v.kind === 'blackjack') {
    const up = v.dealer[0];
    return (
      <div className="active-game-card">
        <div className="spread">
          <strong>🃏 Blackjack</strong>
          <span className="muted">
            Dealer:{' '}
            {v.dealer.length ? v.dealer.map((c) => `${c.rank}${SUIT_SYMBOL[c.suit]}`).join(' ') : '—'}
            {v.dealerHidden && up ? ' 🂠' : ''}
          </span>
        </div>
        <div className="showdown">
          {v.seats.map((s) => (
            <div key={s.seatId} className={`showdown-row ${s.outcome === 'win' ? 'winner' : ''}`}>
              <span>{seatName(s.seatId)}</span>
              <span className="muted">
                {s.total !== null ? `${s.total}${s.busted ? ' bust' : ''}` : `${s.cardCount} cards${s.done ? ' · done' : ''}`}
              </span>
              <span className="muted">{s.outcome ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  let who = '';
  let detail = '';
  if (v.kind === 'roulette') {
    who = seatName(v.seatId);
    detail = v.result ? `${v.result.number} ${v.result.color}` : `$${v.bet}`;
  } else if (v.kind === 'diceDuel') {
    who = seatName(v.seatId);
    detail = v.result ? `rolled ${v.result.dice[0] + v.result.dice[1]}` : `$${v.bet}`;
  } else if (v.kind === 'slots') {
    who = seatName(v.seatId);
    detail = v.reels ? v.reels.join('') : `$${v.bet}`;
  } else if (v.kind === 'coinflip') {
    who = seatName(v.seatId);
    detail = v.result ? v.result.side : `$${v.bet}`;
  } else if (v.kind === 'wheel') {
    who = seatName(v.seatId);
    detail = v.result ? `${v.result.mult}×` : `$${v.bet}`;
  } else if (v.kind === 'highcard') {
    who = seatName(v.seatId);
    detail = v.result ? `${v.result.player.rank} vs ${v.result.dealer.rank}` : `$${v.bet}`;
  }
  return (
    <div className="active-game-card spread">
      <span>
        🎲 <strong>{who}</strong> · {GAME_NAMES[v.kind]}
      </span>
      <span className="muted">{detail}</span>
    </div>
  );
}

function BoardDrinkCheck({ pub }: { pub: PublicRoomView }) {
  const dc = pub.drinkCheck!;
  const name = (id: string) => pub.seats.find((s) => s.seatId === id)?.name ?? '??';
  return (
    <div className="stack" style={{ width: '100%', textAlign: 'center' }}>
      <h1 className="code-hero pulse" style={{ fontSize: 'clamp(2rem,9vw,5rem)' }}>
        🍻 DRINK CHECK #{dc.index}
      </h1>
      {dc.waterOnly && <p className="tag">💧 Water round!</p>}
      <p className="muted">Resolve your tokens on your phone</p>
      <div className="roster" style={{ justifyContent: 'center' }}>
        {dc.seats.map((s) => (
          <div key={s.seatId} className={`seat-chip ${s.done ? '' : 'off'}`}>
            {s.done ? '✅' : '⏳'} {name(s.seatId)} {s.pending > 0 ? `(${s.pending})` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardPlay({ pub }: { pub: PublicRoomView }) {
  const { serverOffset } = useConn();
  const now = useServerNow(serverOffset);
  const remaining = pub.timer.running ? pub.timer.endsAt - now : pub.timer.remainingMs;
  const pct = Math.min(100, Math.max(0, (pub.bank / pub.quota) * 100));
  return (
    <div className="board">
      <div className="board-header">
        <div>
          <h1 className="board-floor">
            Floor {pub.floor} · {pub.floorName}
          </h1>
        </div>
        <div className={`timer ${remaining < 30000 ? 'low' : ''}`}>{formatClock(remaining)}</div>
      </div>

      <div>
        <div className="bank-line">
          <span>Bank: ${pub.bank.toLocaleString()}</span>
          <span className="quota">Quota: ${pub.quota.toLocaleString()}</span>
        </div>
        <div className="bank-meter">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Roster seats={pub.seats} showTokens />

      <div className="center-hero">
        {pub.paused ? (
          <h2 className="h2">⏸ Paused</h2>
        ) : pub.drinkCheck ? (
          <BoardDrinkCheck pub={pub} />
        ) : pub.activeEvent ? (
          <div className="stack" style={{ textAlign: 'center' }}>
            <h1 className="code-hero" style={{ fontSize: 'clamp(2rem,8vw,4.5rem)', color: 'var(--lcc-gold)' }}>
              {pub.activeEvent.name}
            </h1>
            <p className="h2">{pub.activeEvent.description}</p>
            {pub.pendingChoices.length > 0 && <p className="muted">waiting on a decision…</p>}
          </div>
        ) : pub.activeGames.length === 0 ? (
          <p className="muted">The tables are open — play on your phones.</p>
        ) : (
          <div className="stack" style={{ width: '100%' }}>
            {pub.activeGames.map((g) => (
              <ActiveGameLine key={g.sessionId} pub={pub} game={g} />
            ))}
          </div>
        )}
      </div>

      <div className="ticker" role="log" aria-live="polite" aria-label="Game activity">
        {[...pub.ticker].reverse().map((t) => (
          <div key={t.id} className="ticker-item">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
