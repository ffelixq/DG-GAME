import type { Rng } from '@lcc/shared';

/** Snapshot of a SeededRng's full internal state — enough to resume mid-stream. */
export interface RngSnapshot {
  seed: number;
  cursor: number;
  state: number;
}

// Deterministic, seedable RNG (mulberry32). The ONLY source of randomness in the engine —
// never Math.random — so its snapshot replays any room (survives Durable Object hibernation).
export class SeededRng implements Rng {
  private state: number;
  cursor = 0;

  constructor(public readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** Capture the full mutable state so the RNG can be restored after eviction/hibernation. */
  snapshot(): RngSnapshot {
    return { seed: this.seed, cursor: this.cursor, state: this.state };
  }

  static restore(snap: RngSnapshot): SeededRng {
    const rng = new SeededRng(snap.seed);
    rng.cursor = snap.cursor;
    rng.state = snap.state;
    return rng;
  }

  next(): number {
    this.cursor += 1;
    let a = (this.state + 0x6d2b79f5) | 0;
    this.state = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() on empty array');
    return items[this.int(items.length)]!;
  }

  weighted<T>(items: readonly { value: T; weight: number }[]): T {
    if (items.length === 0) throw new Error('weighted() on empty array');
    const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
    if (total <= 0) return items[0]!.value;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, it.weight);
      if (r < 0) return it.value;
    }
    return items[items.length - 1]!.value;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  chance(p: number): boolean {
    const clamped = Math.max(0, Math.min(1, p));
    return this.next() < clamped;
  }
}

// Web Crypto is a global in both Node 20+ and Cloudflare Workers, but the two lib type-sets expose
// it differently; reference it through a narrow cast so it type-checks under both.
const webCrypto = (globalThis as unknown as { crypto: { getRandomValues<T extends ArrayBufferView>(a: T): T } }).crypto;

/** A fresh crypto-seeded RNG for a new room. */
export function createServerRng(): SeededRng {
  const buf = webCrypto.getRandomValues(new Uint32Array(1));
  return new SeededRng((buf[0]! % (2 ** 31 - 1)) + 1);
}
