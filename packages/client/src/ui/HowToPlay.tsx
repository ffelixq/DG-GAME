import { useState } from 'react';

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: '🎯', title: 'Beat the quota', body: 'Your whole crew shares ONE bank. Gamble it up to the floor’s target before the round timer runs out — clear all the floors to win the night.' },
  { icon: '🃏', title: 'Play the games', body: 'Pick a game and bet from the shared bank. Blackjack & Poker are multiplayer — one person starts a table and everyone else taps “Join”.' },
  { icon: '🍺', title: 'Mistakes = drinks', body: 'Lose a bet and you pick up drink tokens. At each Drink Check, resolve them — but never more than 2 alcohol at once.' },
  { icon: '💧', title: 'Always optional', body: 'Swap any drink for water or a dare, tap “I feel unwell” to sit the drinks out, or pause anytime. The rules are enforced by the app.' },
  { icon: '💸', title: 'Bank dry?', body: 'If the bank can’t cover a bet, take a drink to top it up and keep the night going.' },
];

export function HowToPlay({ className = 'linkbtn' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        ❓ How to play
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal reveal" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2" style={{ textAlign: 'center', marginBottom: '0.25rem' }}>How to play</h2>
            <div className="howto-list">
              {STEPS.map((s) => (
                <div key={s.title} className="howto-step">
                  <span className="howto-ico">{s.icon}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p className="muted" style={{ margin: '0.15rem 0 0' }}>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn--primary btn--block" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
