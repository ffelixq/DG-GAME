// Per-device animation speed preference. Higher = faster; durations are divided by this, and the
// `--anim-speed` CSS variable scales the keyframe animations. Default 1x.
const KEY = 'lcc.animSpeed';
export const SPEED_OPTIONS = [0.5, 1, 2] as const;

export function getAnimSpeed(): number {
  const v = Number(localStorage.getItem(KEY));
  return v === 0.5 || v === 1 || v === 2 ? v : 1;
}

export function applyAnimSpeed(speed = getAnimSpeed()): void {
  document.documentElement.style.setProperty('--anim-speed', String(speed));
}

export function setAnimSpeed(speed: number): void {
  localStorage.setItem(KEY, String(speed));
  applyAnimSpeed(speed);
}

export const speedLabel = (s: number): string => (s === 0.5 ? '🐢 0.5×' : s === 2 ? '⚡ 2×' : '1×');
