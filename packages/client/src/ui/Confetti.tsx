import type { CSSProperties } from 'react';

const COLORS = ['#FF2D95', '#15F4EE', '#9B5CFF', '#FFD23F', '#2DFFB0', '#FF8A3D'];

export function Confetti({ count = 70 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        // scatter the columns and vary the flutter so it reads as confetti, not vertical rain
        const left = (i * 47.3 + (i % 5) * 9) % 100;
        const sway = 0.7 + (i % 5) * 0.16; // s
        const swayShift = 8 + (i % 4) * 5; // px
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{ left: `${left}%`, animationDelay: `${(i % 12) * 0.16}s`, animationDuration: `${2.4 + (i % 6) * 0.5}s` }}
          >
            <span
              className="confetti-bit"
              style={
                {
                  background: COLORS[i % COLORS.length],
                  animationDuration: `${sway}s`,
                  '--sway': `${swayShift}px`,
                } as CSSProperties
              }
            />
          </span>
        );
      })}
    </div>
  );
}
