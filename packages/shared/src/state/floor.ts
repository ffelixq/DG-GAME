import type { FloorId, Money } from '../ids';

// Live runtime for the floor currently in play. Cadences are measured in ELAPSED GAME TIME
// (audit fix #5): drink checks and events fire by elapsedGameMs, which only advances while
// phase === 'playing'. endsAt/startedAt are wall-clock, used purely for the live countdown.
export interface FloorRuntime {
  index: FloorId;
  quota: Money;
  roundMs: number; // total active-play budget
  elapsedGameMs: number; // accumulates only while playing

  startedAt: number; // wall-clock start of the floor's first playing segment
  endsAt: number; // wall-clock end of the current playing segment (= now + remaining)
  lastTickAt: number; // wall-clock anchor for incremental elapsedGameMs accrual

  drinkCheckIntervalMs: number;
  nextDrinkCheckAtGameMs: number;
  drinkChecksFired: number;

  eventsEnabled: boolean;
  eventFrequencyMs: number;
  nextEventRollAtGameMs: number;
}
