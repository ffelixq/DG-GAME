// Seat accent colours cycled by accentIndex (SEAT_ACCENT_COUNT = 8).
export const ACCENTS = [
  '#FF2D95', // hot pink
  '#15F4EE', // cyan
  '#9B5CFF', // purple
  '#FFD23F', // gold
  '#2DFFB0', // mint
  '#FF8A3D', // orange
  '#4D9BFF', // blue
  '#FF5C7A', // coral
];

export function accent(index: number): string {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]!;
}
