import type { EventId, FloorId, ItemId, Money } from '../ids';
import type { GameKind } from '../state/game';
import { ITEM_IDS } from './items';
import { EVENT_IDS } from './events';

export interface FloorConfig {
  index: FloorId;
  name: string;
  quota: Money;
  roundMs: number;
  drinkCheckIntervalMs: number;
  eventsEnabled: boolean;
  eventFrequencyMs: number;
  minBet: Money;
  maxBet: Money;
  pokerAnte: Money;
  allowAllIn: boolean;
  gamePool: GameKind[];
  itemPool: ItemId[];
  eventPool: EventId[];
}

const SEC = 1000;
const ALL_GAMES: GameKind[] = ['blackjack', 'poker3', 'roulette', 'diceDuel', 'slots', 'coinflip', 'wheel', 'highcard'];

export const FLOORS: readonly FloorConfig[] = [
  {
    index: 1,
    name: 'Lobby Casino',
    quota: 1500,
    roundMs: 150 * SEC,
    drinkCheckIntervalMs: 45 * SEC,
    eventsEnabled: false,
    eventFrequencyMs: 0,
    minBet: 50,
    maxBet: 300,
    pokerAnte: 25,
    allowAllIn: false,
    gamePool: ALL_GAMES,
    itemPool: [ITEM_IDS.luckyChip, ITEM_IDS.insurance, ITEM_IDS.waterBreak, ITEM_IDS.hangoverShield, ITEM_IDS.fakeLuckCharm],
    eventPool: [],
  },
  {
    index: 2,
    name: 'Neon Bar',
    quota: 3000,
    roundMs: 180 * SEC,
    drinkCheckIntervalMs: 45 * SEC,
    eventsEnabled: true,
    eventFrequencyMs: 30 * 1000,
    minBet: 50,
    maxBet: 600,
    pokerAnte: 50,
    allowAllIn: true,
    gamePool: ALL_GAMES,
    itemPool: [
      ITEM_IDS.luckyChip,
      ITEM_IDS.insurance,
      ITEM_IDS.waterBreak,
      ITEM_IDS.hangoverShield,
      ITEM_IDS.fakeLuckCharm,
      ITEM_IDS.doubleDown,
      ITEM_IDS.reverse,
      ITEM_IDS.loadedDice,
      ITEM_IDS.fakeAce,
      ITEM_IDS.designatedDriver,
    ],
    eventPool: [
      EVENT_IDS.loanSharkCalls,
      EVENT_IDS.securitySweep,
      EVENT_IDS.happyHour,
      EVENT_IDS.badLuckBell,
      EVENT_IDS.lastCall,
    ],
  },
  {
    index: 3,
    name: 'VIP Lounge',
    quota: 6000,
    roundMs: 180 * SEC,
    drinkCheckIntervalMs: 40 * SEC,
    eventsEnabled: true,
    eventFrequencyMs: 25 * 1000,
    minBet: 100,
    maxBet: 1500,
    pokerAnte: 100,
    allowAllIn: true,
    gamePool: ALL_GAMES,
    itemPool: [
      ITEM_IDS.luckyChip,
      ITEM_IDS.insurance,
      ITEM_IDS.waterBreak,
      ITEM_IDS.hangoverShield,
      ITEM_IDS.fakeLuckCharm,
      ITEM_IDS.doubleDown,
      ITEM_IDS.reverse,
      ITEM_IDS.loadedDice,
      ITEM_IDS.fakeAce,
      ITEM_IDS.designatedDriver,
      ITEM_IDS.tableFlip,
      ITEM_IDS.scapegoat,
    ],
    eventPool: [
      EVENT_IDS.loanSharkCalls,
      EVENT_IDS.securitySweep,
      EVENT_IDS.happyHour,
      EVENT_IDS.badLuckBell,
      EVENT_IDS.lastCall,
      EVENT_IDS.vipTax,
      EVENT_IDS.badDecisionBonus,
      EVENT_IDS.bankIsCrying,
      EVENT_IDS.groupBlame,
      EVENT_IDS.riskyRescue,
    ],
  },
  {
    index: 4,
    name: 'Loan Shark Penthouse',
    quota: 10000,
    roundMs: 210 * SEC,
    drinkCheckIntervalMs: 40 * SEC,
    eventsEnabled: true,
    eventFrequencyMs: 20 * 1000,
    minBet: 200,
    maxBet: 3000,
    pokerAnte: 200,
    allowAllIn: true,
    gamePool: ALL_GAMES,
    itemPool: [
      ITEM_IDS.luckyChip,
      ITEM_IDS.insurance,
      ITEM_IDS.waterBreak,
      ITEM_IDS.hangoverShield,
      ITEM_IDS.fakeLuckCharm,
      ITEM_IDS.doubleDown,
      ITEM_IDS.reverse,
      ITEM_IDS.loadedDice,
      ITEM_IDS.fakeAce,
      ITEM_IDS.designatedDriver,
      ITEM_IDS.tableFlip,
      ITEM_IDS.scapegoat,
      ITEM_IDS.groupBetrayal,
      ITEM_IDS.loanSharkDeal,
    ],
    eventPool: [
      EVENT_IDS.loanSharkCalls,
      EVENT_IDS.securitySweep,
      EVENT_IDS.happyHour,
      EVENT_IDS.badLuckBell,
      EVENT_IDS.lastCall,
      EVENT_IDS.vipTax,
      EVENT_IDS.badDecisionBonus,
      EVENT_IDS.bankIsCrying,
      EVENT_IDS.groupBlame,
      EVENT_IDS.riskyRescue,
      EVENT_IDS.loanSharkPicks,
      EVENT_IDS.waterRound,
    ],
  },
];

export const FLOOR_BY_INDEX: Record<FloorId, FloorConfig> = {
  1: FLOORS[0]!,
  2: FLOORS[1]!,
  3: FLOORS[2]!,
  4: FLOORS[3]!,
};

export const FINAL_FLOOR: FloorId = 4;
