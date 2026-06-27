import type { Bank, BankReason, Money, SeatId } from '@lcc/shared';

export function makeBank(quota: Money, starting: Money): Bank {
  return {
    balance: starting,
    reserved: 0,
    quota,
    floorStartBalance: starting,
    deficitCarry: 0,
    ledger: [],
  };
}

export function available(bank: Bank): Money {
  return bank.balance - bank.reserved;
}

function appendLedger(bank: Bank, seatId: SeatId | null, delta: Money, reason: BankReason, at: number, ref?: string): void {
  bank.ledger.push({
    id: `${reason}-${bank.ledger.length}`,
    at,
    seatId,
    delta,
    reason,
    ref,
    balanceAfter: bank.balance,
  });
}

/** Lock funds for an in-flight bet. Returns false if insufficient available funds. */
export function reserve(bank: Bank, amount: Money): boolean {
  if (amount < 0) return false;
  if (amount > available(bank)) return false;
  bank.reserved += amount;
  return true;
}

export function releaseReserve(bank: Bank, amount: Money): void {
  bank.reserved = Math.max(0, bank.reserved - amount);
}

/** Settle a resolved bet: free the reserved stake, apply the net delta to the balance. */
export function settle(
  bank: Bank,
  seatId: SeatId | null,
  reservedStake: Money,
  netDelta: Money,
  at: number,
  ref?: string,
): void {
  releaseReserve(bank, reservedStake);
  bank.balance += netDelta;
  appendLedger(bank, seatId, netDelta, netDelta >= 0 ? 'PAYOUT' : 'BET', at, ref);
}

/** Direct bank adjustment (events/items/punishment). Clamps at 0; returns the shortfall that
 *  could not be paid (used by the bank-underflow policy). */
export function adjust(
  bank: Bank,
  delta: Money,
  reason: BankReason,
  seatId: SeatId | null,
  at: number,
  ref?: string,
): { applied: Money; shortfall: Money } {
  let applied = delta;
  let shortfall = 0;
  if (bank.balance + delta < 0) {
    shortfall = -(bank.balance + delta);
    applied = -bank.balance;
  }
  bank.balance += applied;
  appendLedger(bank, seatId, applied, reason, at, ref);
  return { applied, shortfall };
}

/** Net change to the bank since this floor began (excludes reserved). */
export function floorDelta(bank: Bank): Money {
  return bank.balance - bank.floorStartBalance;
}
