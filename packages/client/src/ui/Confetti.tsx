const COLORS = ['#FF2D95', '#15F4EE', '#9B5CFF', '#FFD23F', '#2DFFB0', '#FF8A3D'];

export function Confetti({ count = 70 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 36.7) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 12) * 0.18}s`,
            animationDuration: `${2.4 + (i % 6) * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}
