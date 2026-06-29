import type { ClientToServerEvents, DeviceId } from '@lcc/shared';
import type { Command } from '../engine/commands';

/**
 * Map an in-room client event (+ payload + authenticated device) to an engine Command.
 * Connection-level events (session/create/join/sync) are handled directly in the DO and return null.
 */
export function commandForEvent(ev: keyof ClientToServerEvents, p: any, deviceId: DeviceId): Command | null {
  switch (ev) {
    case 'device:setBigScreen':
      return { t: 'setBigScreen', deviceId, value: p.value };
    case 'seat:add':
      return { t: 'addSeat', deviceId, name: p.name };
    case 'seat:addBot':
      return { t: 'addBot', deviceId };
    case 'seat:remove':
      return { t: 'removeSeat', deviceId, seatId: p.seatId };
    case 'seat:setExempt':
      return { t: 'setExempt', deviceId, seatId: p.seatId, value: p.value };
    case 'houseRules:accept':
      return { t: 'ackHouseRules', deviceId };
    case 'control:advance':
      return { t: 'advance', deviceId };
    case 'control:pause':
      return { t: 'pause', deviceId, value: p.value };
    case 'control:skip':
      return { t: 'skip', deviceId };
    case 'control:endRound':
      return { t: 'endRoundNow', deviceId };
    case 'control:playAgain':
      return { t: 'playAgain', deviceId };
    case 'game:start':
      return { t: 'startGame', deviceId, seatId: p.seatId, kind: p.kind, bet: p.bet, selection: p.selection };
    case 'game:action':
      return { t: 'gameAction', deviceId, seatId: p.seatId, action: p.action };
    case 'game:dismiss':
      return { t: 'dismissReveal', deviceId, seatId: p.seatId };
    case 'bank:topUp':
      return { t: 'topUpBank', deviceId, seatId: p.seatId };
    case 'item:use':
      return { t: 'useItem', deviceId, seatId: p.seatId, instanceId: p.instanceId, targetSeatId: p.targetSeatId };
    case 'drinkCheck:resolve':
      return { t: 'resolveDrinkCheck', deviceId, seatId: p.seatId, resolutions: p.resolutions };
    case 'drinkCheck:skip':
      return { t: 'skipDrinkCheck', deviceId, seatId: p.seatId };
    case 'choice:resolve':
      return { t: 'resolveChoice', deviceId, seatId: p.seatId, choiceId: p.choiceId, optionId: p.optionId, targetSeatId: p.targetSeatId };
    default:
      return null;
  }
}
