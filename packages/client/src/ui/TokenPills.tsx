export function TokenPills({ counts }: { counts: { alcohol: number; water: number; dare: number } }) {
  const { alcohol, water, dare } = counts;
  if (alcohol + water + dare === 0) return <span className="muted">no tokens</span>;
  return (
    <span className="token-pills">
      {alcohol > 0 && <span className="pill pill--alcohol">🍺 {alcohol}</span>}
      {water > 0 && <span className="pill pill--water">💧 {water}</span>}
      {dare > 0 && <span className="pill pill--dare">🎲 {dare}</span>}
    </span>
  );
}
