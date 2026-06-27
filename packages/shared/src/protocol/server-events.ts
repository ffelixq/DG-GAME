import type { ChoiceId, EventId, SeatId } from '../ids';
import type { EndingResult, RoundResult, TickerTone } from '../state/room';
import type { PublicRoomView } from '../views/public';
import type { PrivateDeviceView } from '../views/private';

export interface ToastPayload {
  tone: TickerTone;
  text: string;
}

export interface DrinkCheckOpenPayload {
  index: number;
}
export interface DrinkCheckClosePayload {
  index: number;
}

export interface EventFiredPayload {
  eventId: EventId;
  name: string;
  description: string;
}

export interface ChoicePromptPayload {
  choiceId: ChoiceId;
  seatId: SeatId;
  prompt: string;
}

// Socket.io server->client map. State is PUSHED, not polled.
export interface ServerToClientEvents {
  'state:public': (view: PublicRoomView) => void;
  'state:private': (view: PrivateDeviceView) => void;
  toast: (p: ToastPayload) => void;
  'drinkCheck:open': (p: DrinkCheckOpenPayload) => void;
  'drinkCheck:close': (p: DrinkCheckClosePayload) => void;
  'event:fired': (p: EventFiredPayload) => void;
  'choice:prompt': (p: ChoicePromptPayload) => void;
  'round:result': (p: RoundResult) => void;
  'game:ending': (p: EndingResult) => void;
}
