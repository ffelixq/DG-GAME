import { MAX_ALCOHOL_PER_CHECK } from '../constants';

export interface SafetyConfig {
  maxAlcoholPerCheck: number;
  rules: string[];
}

// Shown on the house-rules screen before the night starts AND enforced in the engine.
export const SAFETY_CONFIG: SafetyConfig = {
  maxAlcoholPerCheck: MAX_ALCOHOL_PER_CHECK,
  rules: [
    'No real money — every dollar here is fake.',
    'Drinking is always optional.',
    'Any token can be swapped for water, a soft drink, or a dare.',
    `Never more than ${MAX_ALCOHOL_PER_CHECK} sips at a single Drink Check.`,
    'No shots, no downing — small sips only.',
    'Anyone can pause or skip at any time.',
    'Feeling unwell? Tap "I feel unwell" — your tokens become water, no penalties.',
  ],
};
