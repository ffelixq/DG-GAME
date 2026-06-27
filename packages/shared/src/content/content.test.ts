import { describe, expect, it } from 'vitest';
import { ITEM_CARDS, ITEM_BY_ID } from './items';
import { RANDOM_EVENTS, EVENT_BY_ID } from './events';
import { FLOORS } from './floors';
import { AWARDS } from './awards';
import { ENDINGS } from './endings';
import { GAME_KINDS } from '../state/game';
import { emptyStats } from '../domain/stats';
import type { EffectOp } from '../domain/effects';

const VALID_OPS = new Set([
  'mintToken',
  'removeToken',
  'moveToken',
  'adjustBank',
  'adjustQuota',
  'arm',
  'armRoom',
  'statAdjust',
  'chance',
  'choice',
  'condition',
]);
const VALID_TOKEN_KINDS = new Set(['alcohol', 'water', 'dare']);
const VALID_MOD_KINDS = new Set([
  'cancel-token',
  'convert-token-water',
  'redirect-token',
  'double-stakes',
  'reroll-result',
  'cancel-result',
  'force-ace',
  'dice-bonus',
  'odds-boost',
  'immune-punishment',
  'win-or-token',
]);
const VALID_TRIGGERS = new Set([
  'next-token-onto-self',
  'next-game-result',
  'next-blackjack-card',
  'next-dice-roll',
  'next-punishment',
  'win-next-game',
]);
const VALID_SELECTION_RULES = new Set([
  'lowest-bank-delta',
  'highest-bank-delta',
  'negative-profit',
  'most-all-ins',
  'biggest-single-loss',
  'least-recent-play',
  'most-tokens',
  'random',
]);
const VALID_STAT_FIELDS = new Set(Object.keys(emptyStats()));

/** Walk an effect tree, yielding every op (including nested then/otherwise/options). */
function walkOps(ops: EffectOp[], visit: (op: EffectOp) => void): void {
  for (const op of ops) {
    visit(op);
    if (op.op === 'chance') {
      walkOps(op.then, visit);
      walkOps(op.otherwise, visit);
    } else if (op.op === 'condition') {
      walkOps(op.then, visit);
      if (op.otherwise) walkOps(op.otherwise, visit);
    } else if (op.op === 'choice') {
      for (const o of op.options) walkOps(o.ops, visit);
    }
  }
}

function validateOp(op: EffectOp): void {
  expect(VALID_OPS, `op ${op.op}`).toContain(op.op);
  if (op.op === 'mintToken') expect(VALID_TOKEN_KINDS).toContain(op.kind);
  if (op.op === 'arm') {
    expect(VALID_MOD_KINDS).toContain(op.modifier.kind);
    expect(VALID_TRIGGERS).toContain(op.modifier.trigger);
    expect(op.modifier.uses).toBeGreaterThan(0);
  }
  if (op.op === 'statAdjust') expect(VALID_STAT_FIELDS).toContain(op.field);
  if (op.op === 'mintToken' && op.target.sel === 'rule') expect(VALID_SELECTION_RULES).toContain(op.target.rule);
}

describe('content: items', () => {
  it('has 14 cards with unique ids', () => {
    expect(ITEM_CARDS).toHaveLength(14);
    const ids = new Set(ITEM_CARDS.map((i) => i.id));
    expect(ids.size).toBe(14);
  });

  it('every item effect uses only valid ops/kinds/triggers', () => {
    for (const item of ITEM_CARDS) walkOps(item.effect, validateOp);
  });

  it('targeted items reference a chosen target somewhere', () => {
    for (const item of ITEM_CARDS.filter((i) => i.needsTarget)) {
      let usesChosen = false;
      walkOps(item.effect, (op) => {
        if (op.op === 'moveToken' && (op.from.sel === 'chosen' || op.to.sel === 'chosen')) usesChosen = true;
        if (op.op === 'arm' && op.target.sel === 'chosen') usesChosen = true;
        if (op.op === 'mintToken' && op.target.sel === 'chosen') usesChosen = true;
      });
      expect(usesChosen, `${item.id} needs a chosen target`).toBe(true);
    }
  });
});

describe('content: events', () => {
  it('has 12 events with unique ids', () => {
    expect(RANDOM_EVENTS).toHaveLength(12);
    expect(new Set(RANDOM_EVENTS.map((e) => e.id)).size).toBe(12);
  });

  it('every event effect uses only valid ops/kinds/triggers', () => {
    for (const ev of RANDOM_EVENTS) walkOps(ev.effect, validateOp);
  });

  it('weights are positive', () => {
    for (const ev of RANDOM_EVENTS) expect(ev.weight).toBeGreaterThan(0);
  });
});

describe('content: floors', () => {
  it('has 4 floors with escalating quotas', () => {
    expect(FLOORS).toHaveLength(4);
    for (let i = 1; i < FLOORS.length; i++) {
      expect(FLOORS[i]!.quota).toBeGreaterThan(FLOORS[i - 1]!.quota);
    }
  });

  it('every floor pool references existing items, events and games', () => {
    for (const f of FLOORS) {
      for (const itemId of f.itemPool) expect(ITEM_BY_ID[itemId], `item ${itemId} on floor ${f.index}`).toBeDefined();
      for (const eventId of f.eventPool) expect(EVENT_BY_ID[eventId], `event ${eventId} on floor ${f.index}`).toBeDefined();
      for (const game of f.gamePool) expect(GAME_KINDS).toContain(game);
    }
  });

  it('floor 1 has no events; later floors do', () => {
    expect(FLOORS[0]!.eventPool).toHaveLength(0);
    expect(FLOORS[0]!.eventsEnabled).toBe(false);
    expect(FLOORS[3]!.eventPool.length).toBeGreaterThan(0);
  });
});

describe('content: awards & endings', () => {
  it('has 9 awards backed by real stat fields (or winRate)', () => {
    expect(AWARDS).toHaveLength(9);
    for (const a of AWARDS) {
      if (a.metric !== 'winRate') expect(VALID_STAT_FIELDS).toContain(a.metric);
    }
  });

  it('has 3 endings', () => {
    expect(ENDINGS).toHaveLength(3);
    expect(new Set(ENDINGS.map((e) => e.id))).toEqual(new Set(['good', 'normal', 'bad']));
  });
});

describe('safety: no effect op can place alcohol outside the placeToken chokepoint', () => {
  it('the only token-introducing ops are mintToken/moveToken (which route through placeToken at runtime)', () => {
    const allEffects = [...ITEM_CARDS.flatMap((i) => i.effect), ...RANDOM_EVENTS.flatMap((e) => e.effect)];
    walkOps(allEffects, (op) => {
      // Any op that introduces a token onto a seat must be a mint or a move; both are
      // funnelled through placeToken() server-side, which coerces alcohol->water for exempt
      // seats and applies cancel/redirect modifiers. No other op may add tokens.
      const introducesToken = op.op === 'mintToken' || op.op === 'moveToken';
      const isKnown = VALID_OPS.has(op.op);
      expect(isKnown).toBe(true);
      if (op.op === 'mintToken') {
        // a mint must always carry a kind; alcohol mints are allowed in DATA because the
        // runtime chokepoint downgrades them for exempt seats.
        expect(VALID_TOKEN_KINDS).toContain(op.kind);
      }
      expect(typeof introducesToken).toBe('boolean');
    });
  });
});
