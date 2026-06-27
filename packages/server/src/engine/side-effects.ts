import type { ChoiceId, DeviceId, EndingResult, EventId, RoundResult, SeatId, TickerTone } from '@lcc/shared';

// Outbound notifications produced by the reducer, beyond the always-broadcast state snapshots.
// emit.ts translates these into socket sends. State:public/state:private are pushed after every
// dispatch and are NOT modelled as side effects.
export type SideEffect =
  | { t: 'toast'; deviceId?: DeviceId; tone: TickerTone; text: string }
  | { t: 'drinkCheckOpen'; index: number }
  | { t: 'drinkCheckClose'; index: number }
  | { t: 'eventFired'; eventId: EventId; name: string; description: string }
  | { t: 'choicePrompt'; choiceId: ChoiceId; seatId: SeatId; prompt: string }
  | { t: 'roundResult'; result: RoundResult }
  | { t: 'ending'; ending: EndingResult };
