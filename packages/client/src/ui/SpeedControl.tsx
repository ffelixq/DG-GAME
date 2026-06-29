import { useState } from 'react';
import { SPEED_OPTIONS, getAnimSpeed, setAnimSpeed, speedLabel } from './anim';

/** Cycles animation speed 0.5× → 1× → 2× (per device, remembered). */
export function SpeedControl({ className = 'linkbtn' }: { className?: string }) {
  const [speed, setSpeed] = useState(getAnimSpeed());
  function cycle() {
    const next = SPEED_OPTIONS[(SPEED_OPTIONS.indexOf(speed as (typeof SPEED_OPTIONS)[number]) + 1) % SPEED_OPTIONS.length]!;
    setAnimSpeed(next);
    setSpeed(next);
  }
  return (
    <button className={className} onClick={cycle} title="Animation speed">
      🎚️ Animations: {speedLabel(speed)}
    </button>
  );
}
