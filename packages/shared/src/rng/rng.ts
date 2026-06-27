// RNG interface. The implementation is SERVER-ONLY (packages/server/src/runtime/ServerRng.ts).
// Engines and reducers must use only an injected Rng — never the ambient global RNG — so that
// a (seed, cursor) pair can replay any room deterministically in tests.

export interface Rng {
  /** float in [0, 1). */
  next(): number;
  /** integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** weighted pick; weights must be > 0. */
  weighted<T>(items: readonly { value: T; weight: number }[]): T;
  /** Fisher–Yates in place, returns the same array. */
  shuffle<T>(arr: T[]): T[];
  /** true with probability p (clamped to [0,1]). */
  chance(p: number): boolean;
}
