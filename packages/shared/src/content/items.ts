import { asItemId, type FloorId, type ItemId } from '../ids';
import type { EffectOp } from '../domain/effects';

export type ItemUsableWhen = 'anytime' | 'before-game' | 'on-result' | 'during-drink-check';

export interface ItemCard {
  id: ItemId;
  name: string;
  description: string;
  usableWhen: ItemUsableWhen;
  needsTarget: boolean;
  floorMin: FloorId;
  effect: EffectOp[];
}

export const ITEM_IDS = {
  luckyChip: asItemId('lucky-chip'),
  insurance: asItemId('insurance'),
  waterBreak: asItemId('water-break'),
  doubleDown: asItemId('double-down'),
  reverse: asItemId('reverse-card'),
  loanSharkDeal: asItemId('loan-shark-deal'),
  fakeAce: asItemId('fake-ace'),
  loadedDice: asItemId('loaded-dice'),
  tableFlip: asItemId('table-flip'),
  groupBetrayal: asItemId('group-betrayal'),
  designatedDriver: asItemId('designated-driver'),
  hangoverShield: asItemId('hangover-shield'),
  scapegoat: asItemId('scapegoat'),
  fakeLuckCharm: asItemId('fake-luck-charm'),
} as const;

export const ITEM_CARDS: readonly ItemCard[] = [
  {
    id: ITEM_IDS.luckyChip,
    name: 'Lucky Chip',
    description: 'Reroll the result of your next game.',
    usableWhen: 'before-game',
    needsTarget: false,
    floorMin: 1,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'reroll-result', trigger: 'next-game-result', uses: 1 } }],
  },
  {
    id: ITEM_IDS.insurance,
    name: 'Insurance Card',
    description: 'Cancel your next drink token before it lands.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 1,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'cancel-token', trigger: 'next-token-onto-self', uses: 1 } }],
  },
  {
    id: ITEM_IDS.waterBreak,
    name: 'Water Break',
    description: 'Drink some water — remove 2 of your tokens.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 1,
    effect: [{ op: 'removeToken', target: { sel: 'self' }, count: 2 }],
  },
  {
    id: ITEM_IDS.doubleDown,
    name: 'Double or Nothing',
    description: 'Next game: a win pays double, a loss costs you 2 tokens.',
    usableWhen: 'before-game',
    needsTarget: false,
    floorMin: 2,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'double-stakes', trigger: 'next-game-result', uses: 1 } }],
  },
  {
    id: ITEM_IDS.reverse,
    name: 'Reverse Card',
    description: 'Send one of your tokens to another player.',
    usableWhen: 'anytime',
    needsTarget: true,
    floorMin: 2,
    effect: [
      { op: 'moveToken', from: { sel: 'self' }, to: { sel: 'chosen' }, count: 1, reason: 'item.reverse' },
      { op: 'statAdjust', target: { sel: 'self' }, field: 'betrayals', delta: 1 },
    ],
  },
  {
    id: ITEM_IDS.loanSharkDeal,
    name: 'Loan Shark Deal',
    description: 'Cut the quota by 10% — but everyone takes a token.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 2,
    effect: [
      { op: 'adjustQuota', mode: 'percent', amount: -10 },
      { op: 'mintToken', target: { sel: 'all' }, count: 1, kind: 'alcohol', reason: 'item.loanSharkDeal' },
    ],
  },
  {
    id: ITEM_IDS.fakeAce,
    name: 'Fake Ace',
    description: 'Blackjack: turn your next card into an Ace.',
    usableWhen: 'before-game',
    needsTarget: false,
    floorMin: 2,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'force-ace', trigger: 'next-blackjack-card', uses: 1 } }],
  },
  {
    id: ITEM_IDS.loadedDice,
    name: 'Loaded Dice',
    description: 'Dice Duel: add +1 to your next roll.',
    usableWhen: 'before-game',
    needsTarget: false,
    floorMin: 2,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'dice-bonus', trigger: 'next-dice-roll', uses: 1, amount: 1 } }],
  },
  {
    id: ITEM_IDS.tableFlip,
    name: 'Table Flip',
    description: 'Cancel your next game result — but take a token for the chaos.',
    usableWhen: 'before-game',
    needsTarget: false,
    floorMin: 3,
    effect: [
      { op: 'arm', target: { sel: 'self' }, modifier: { kind: 'cancel-result', trigger: 'next-game-result', uses: 1 } },
      { op: 'mintToken', target: { sel: 'self' }, count: 1, kind: 'alcohol', reason: 'item.tableFlip' },
    ],
  },
  {
    id: ITEM_IDS.groupBetrayal,
    name: 'Skim the Till',
    description: 'Sabotage the team — drain $200 from the shared bank.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 4,
    effect: [
      { op: 'adjustBank', amount: -200, reason: 'item.groupBetrayal' },
      { op: 'statAdjust', target: { sel: 'self' }, field: 'betrayals', delta: 1 },
    ],
  },
  {
    id: ITEM_IDS.designatedDriver,
    name: 'Designated Driver',
    description: "Protect a friend — turn their next token into water.",
    usableWhen: 'anytime',
    needsTarget: true,
    floorMin: 2,
    effect: [
      { op: 'arm', target: { sel: 'chosen' }, modifier: { kind: 'convert-token-water', trigger: 'next-token-onto-self', uses: 1 } },
      { op: 'statAdjust', target: { sel: 'self' }, field: 'teammateScore', delta: 2 },
    ],
  },
  {
    id: ITEM_IDS.hangoverShield,
    name: 'Hangover Shield',
    description: 'Your next 2 tokens become water.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 1,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'convert-token-water', trigger: 'next-token-onto-self', uses: 2 } }],
  },
  {
    id: ITEM_IDS.scapegoat,
    name: 'Scapegoat',
    description: 'If the team fails the quota, you dodge the group penalty.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 3,
    effect: [{ op: 'arm', target: { sel: 'self' }, modifier: { kind: 'immune-punishment', trigger: 'next-punishment', uses: 1 } }],
  },
  {
    id: ITEM_IDS.fakeLuckCharm,
    name: 'Fake Luck Charm',
    description: '60% chance to lose a token — 40% chance to gain one.',
    usableWhen: 'anytime',
    needsTarget: false,
    floorMin: 1,
    effect: [
      {
        op: 'chance',
        p: 0.6,
        then: [{ op: 'removeToken', target: { sel: 'self' }, count: 1 }],
        otherwise: [{ op: 'mintToken', target: { sel: 'self' }, count: 1, kind: 'alcohol', reason: 'item.fakeLuckCharm' }],
      },
    ],
  },
];

export const ITEM_BY_ID: Record<string, ItemCard> = Object.fromEntries(ITEM_CARDS.map((i) => [i.id, i]));
