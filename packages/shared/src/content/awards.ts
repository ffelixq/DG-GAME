import type { StatField } from '../domain/stats';

export type AwardMetric = StatField | 'winRate';

export interface AwardDef {
  id: string;
  name: string;
  description: string;
  metric: AwardMetric;
  selector: 'max' | 'min';
  /** Minimum plays required to qualify (for rate-based awards). */
  minPlays?: number;
  /** Field used to break ties (higher wins). */
  tiebreak?: StatField;
}

export const AWARDS: readonly AwardDef[] = [
  { id: 'biggest-winner', name: 'Biggest Winner', description: 'Most money made for the bank.', metric: 'netBank', selector: 'max' },
  { id: 'biggest-loser', name: 'Biggest Loser', description: 'Bled the most into the bank.', metric: 'netBank', selector: 'min' },
  { id: 'most-drink-tokens', name: 'Most Drink Tokens', description: 'Collected the most tokens.', metric: 'tokensReceived', selector: 'max' },
  { id: 'most-all-ins', name: 'Most Reckless', description: 'Went all-in the most times.', metric: 'allIns', selector: 'max' },
  { id: 'most-betrayals', name: 'Biggest Snake', description: 'Betrayed the team the most.', metric: 'betrayals', selector: 'max' },
  { id: 'luckiest', name: 'Luckiest', description: 'Best win rate at the tables.', metric: 'winRate', selector: 'max', minPlays: 3, tiebreak: 'netBank' },
  { id: 'unluckiest', name: 'Unluckiest', description: 'Worst win rate at the tables.', metric: 'winRate', selector: 'min', minPlays: 3, tiebreak: 'netBank' },
  { id: 'best-teammate', name: 'Best Teammate', description: 'Did the most for the group.', metric: 'teammateScore', selector: 'max' },
  {
    id: 'worst-financial-decision',
    name: 'Worst Financial Decision',
    description: 'Lost the most on a single bet.',
    metric: 'biggestSingleLoss',
    selector: 'max',
  },
];
