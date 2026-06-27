import type { Money } from '../ids';
import type { EndingId } from '../state/room';

export interface EndingDef {
  id: EndingId;
  name: string;
  description: string;
}

/** Good ending requires clearing the final quota with this much profit on top. */
export const GOOD_ENDING_MIN_BANK: Money = 15000;

export const ENDINGS: readonly EndingDef[] = [
  {
    id: 'good',
    name: 'High Rollers',
    description: 'You crushed the debt and walked away loaded. Tokens cleared — the winner calls one last dare.',
  },
  {
    id: 'normal',
    name: 'Paid in Full',
    description: 'You scraped together the quota and survived the night. The biggest mess earns the Worst Gambler title.',
  },
  {
    id: 'bad',
    name: 'In the Red',
    description: "The house won. The debt stands — one last non-alcohol forfeit for the table.",
  },
];

export const ENDING_BY_ID: Record<EndingId, EndingDef> = {
  good: ENDINGS[0]!,
  normal: ENDINGS[1]!,
  bad: ENDINGS[2]!,
};
