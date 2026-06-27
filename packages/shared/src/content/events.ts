import { asEventId, type EventId } from '../ids';
import type { EffectOp } from '../domain/effects';

export interface RandomEvent {
  id: EventId;
  name: string;
  description: string;
  /** 'lastCall' is driven by a timed runtime; others resolve instantly via `effect`. */
  kind: 'instant' | 'lastCall';
  weight: number;
  effect: EffectOp[];
}

export const EVENT_IDS = {
  loanSharkCalls: asEventId('loan-shark-calls'),
  securitySweep: asEventId('security-sweep'),
  happyHour: asEventId('happy-hour'),
  badLuckBell: asEventId('bad-luck-bell'),
  vipTax: asEventId('vip-tax'),
  lastCall: asEventId('last-call'),
  badDecisionBonus: asEventId('bad-decision-bonus'),
  bankIsCrying: asEventId('bank-is-crying'),
  groupBlame: asEventId('group-blame'),
  riskyRescue: asEventId('risky-rescue'),
  loanSharkPicks: asEventId('loan-shark-picks'),
  waterRound: asEventId('water-round'),
} as const;

export const RANDOM_EVENTS: readonly RandomEvent[] = [
  {
    id: EVENT_IDS.loanSharkCalls,
    name: 'Loan Shark Calls',
    description: 'Everyone in the red takes a token.',
    kind: 'instant',
    weight: 10,
    effect: [{ op: 'mintToken', target: { sel: 'rule', rule: 'negative-profit' }, count: 1, kind: 'alcohol', reason: 'event.loanSharkCalls' }],
  },
  {
    id: EVENT_IDS.securitySweep,
    name: 'Security Sweep',
    description: 'The slowest gambler gets pulled aside — take a token.',
    kind: 'instant',
    weight: 8,
    effect: [{ op: 'mintToken', target: { sel: 'rule', rule: 'least-recent-play' }, count: 1, kind: 'alcohol', reason: 'event.securitySweep' }],
  },
  {
    id: EVENT_IDS.happyHour,
    name: 'Happy Hour',
    description: "Everyone's next token is on the house — cancelled.",
    kind: 'instant',
    weight: 6,
    effect: [{ op: 'arm', target: { sel: 'all' }, modifier: { kind: 'cancel-token', trigger: 'next-token-onto-self', uses: 1 } }],
  },
  {
    id: EVENT_IDS.badLuckBell,
    name: 'Bad Luck Bell',
    description: 'The player with the lowest balance takes a token.',
    kind: 'instant',
    weight: 9,
    effect: [{ op: 'mintToken', target: { sel: 'rule', rule: 'lowest-bank-delta' }, count: 1, kind: 'alcohol', reason: 'event.badLuckBell' }],
  },
  {
    id: EVENT_IDS.vipTax,
    name: 'VIP Tax',
    description: 'The richest player must pay the house or take a token.',
    kind: 'instant',
    weight: 7,
    effect: [
      {
        op: 'choice',
        target: { sel: 'rule', rule: 'highest-bank-delta' },
        prompt: 'VIP Tax: pay $100 to the bank, or take a token.',
        options: [
          { id: 'pay', label: 'Pay $100 to the bank', ops: [{ op: 'adjustBank', amount: -100, reason: 'event.vipTax' }] },
          { id: 'token', label: 'Take a token', ops: [{ op: 'mintToken', target: { sel: 'self' }, count: 1, kind: 'alcohol', reason: 'event.vipTax' }] },
        ],
      },
    ],
  },
  {
    id: EVENT_IDS.lastCall,
    name: 'Last Call',
    description: 'Place a bet in the next 10 seconds — or take a token.',
    kind: 'lastCall',
    weight: 7,
    effect: [], // resolved by the lastCall runtime at its deadline
  },
  {
    id: EVENT_IDS.badDecisionBonus,
    name: 'Bad Decision Bonus',
    description: 'The boldest all-in gambler clears 2 tokens.',
    kind: 'instant',
    weight: 6,
    effect: [{ op: 'removeToken', target: { sel: 'rule', rule: 'most-all-ins' }, count: 2 }],
  },
  {
    id: EVENT_IDS.bankIsCrying,
    name: 'The Bank Is Crying',
    description: 'Whoever made the worst single bet takes a token.',
    kind: 'instant',
    weight: 8,
    effect: [{ op: 'mintToken', target: { sel: 'rule', rule: 'biggest-single-loss' }, count: 1, kind: 'alcohol', reason: 'event.bankIsCrying' }],
  },
  {
    id: EVENT_IDS.groupBlame,
    name: 'Group Blame',
    description: 'If the team is under half the quota, everyone takes a token.',
    kind: 'instant',
    weight: 7,
    effect: [
      {
        op: 'condition',
        when: { kind: 'bank-below-quota-fraction', fraction: 0.5 },
        then: [{ op: 'mintToken', target: { sel: 'all' }, count: 1, kind: 'alcohol', reason: 'event.groupBlame' }],
      },
    ],
  },
  {
    id: EVENT_IDS.riskyRescue,
    name: 'Risky Rescue',
    description: 'One player may take 2 tokens to add $500 to the bank.',
    kind: 'instant',
    weight: 6,
    effect: [
      {
        op: 'choice',
        target: { sel: 'rule', rule: 'random' },
        prompt: 'Risky Rescue: take 2 tokens to add $500 to the bank?',
        options: [
          {
            id: 'accept',
            label: 'Take 2 tokens, +$500 to the bank',
            ops: [
              { op: 'mintToken', target: { sel: 'self' }, count: 2, kind: 'alcohol', reason: 'event.riskyRescue' },
              { op: 'adjustBank', amount: 500, reason: 'event.riskyRescue' },
              { op: 'statAdjust', target: { sel: 'self' }, field: 'teammateScore', delta: 3 },
            ],
          },
          { id: 'decline', label: 'No thanks', ops: [] },
        ],
      },
    ],
  },
  {
    id: EVENT_IDS.loanSharkPicks,
    name: 'Loan Shark Picks',
    description: 'A random player must win their next game — or take a token.',
    kind: 'instant',
    weight: 7,
    effect: [{ op: 'arm', target: { sel: 'rule', rule: 'random' }, modifier: { kind: 'win-or-token', trigger: 'win-next-game', uses: 1 } }],
  },
  {
    id: EVENT_IDS.waterRound,
    name: 'Water Round',
    description: 'The next Drink Check is water only — and clears an extra token.',
    kind: 'instant',
    weight: 5,
    effect: [{ op: 'armRoom', modifier: { kind: 'next-check-water-only', uses: 1, bonusRemove: 1 } }],
  },
];

export const EVENT_BY_ID: Record<string, RandomEvent> = Object.fromEntries(RANDOM_EVENTS.map((e) => [e.id, e]));
