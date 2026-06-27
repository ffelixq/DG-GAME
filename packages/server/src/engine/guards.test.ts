import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AWARDS, ENDINGS, ITEM_CARDS, RANDOM_EVENTS } from '@lcc/shared';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('RNG discipline', () => {
  it('no Math.random anywhere in shared or the server engine (RNG must be the seedable ServerRng)', () => {
    const roots = ['packages/shared/src', 'packages/server/src/engine'];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (readFileSync(file, 'utf8').includes('Math.random')) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('IP safety guardrail', () => {
  const allText = [
    ...ITEM_CARDS.flatMap((i) => [i.name, i.description]),
    ...RANDOM_EVENTS.flatMap((e) => [e.name, e.description]),
    ...AWARDS.flatMap((a) => [a.name, a.description]),
    ...ENDINGS.flatMap((e) => [e.name, e.description]),
  ]
    .join(' \n ')
    .toLowerCase();

  // Names/wording that would copy the source game's specific identity. Generic casino
  // terms (blackjack, roulette, jackpot, etc.) are fine and intentionally allowed.
  const denylist = ['gamble with your friends', 'gwyf'];

  it('content does not copy the source game’s name or specific identity', () => {
    for (const term of denylist) {
      expect(allText.includes(term), `content must not contain "${term}"`).toBe(false);
    }
  });
});
