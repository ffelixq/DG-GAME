import { useEffect, useState } from 'react';

/** Estimated server time, ticking ~4Hz for smooth countdowns. */
export function useServerNow(offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs), 250);
    return () => clearInterval(id);
  }, [offsetMs]);
  return now;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
