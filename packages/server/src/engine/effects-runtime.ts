import {
  applyStatEvent,
  err,
  ok,
  type ChoiceId,
  type DeviceId,
  type EffectChoiceOption,
  type EffectContext,
  type EffectOp,
  type EffectTarget,
  type ModifierSpec,
  type Result,
  type RoomModifierSpec,
  type RoomState,
  type SeatId,
  type SelectionRule,
  type StatField,
  type TokenKind,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { adjust } from './bank';
import { addTicker } from './state';
import { moveTokens, placeToken, removeTokens, type TokenCtx } from './tokens';

class EffectRunner implements EffectContext {
  private readonly tokenCtx: TokenCtx;
  constructor(
    private readonly state: RoomState,
    private readonly rctx: ReduceCtx,
    readonly selfSeatId: SeatId | null,
    private readonly chosenSeatId: SeatId | null,
  ) {
    this.tokenCtx = { ids: rctx.ids, now: rctx.now };
  }

  resolveBySelectionRule(rule: SelectionRule): SeatId[] {
    const seats = this.state.seatOrder.map((id) => this.state.seats[id]).filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (seats.length === 0) return [];

    const metric = (sid: SeatId): number => {
      const s = this.state.seats[sid]!;
      switch (rule) {
        case 'lowest-bank-delta':
        case 'highest-bank-delta':
          return s.stats.netBank;
        case 'most-all-ins':
          return s.stats.allIns;
        case 'biggest-single-loss':
          return s.stats.biggestSingleLoss;
        case 'least-recent-play':
          return s.stats.plays;
        case 'most-tokens':
          return s.tokenIds.length;
        default:
          return 0;
      }
    };
    const extreme = (max: boolean): SeatId[] => {
      let best = seats[0]!.seatId;
      let bestScore = max ? -Infinity : Infinity;
      for (const s of seats) {
        const v = metric(s.seatId);
        if (max ? v > bestScore : v < bestScore) {
          bestScore = v;
          best = s.seatId;
        }
      }
      return [best];
    };

    switch (rule) {
      case 'negative-profit':
        return seats.filter((s) => s.stats.netBank < 0).map((s) => s.seatId);
      case 'random':
        return [this.rctx.rng.pick(this.state.seatOrder)];
      case 'lowest-bank-delta':
      case 'least-recent-play':
        return extreme(false);
      default:
        return extreme(true);
    }
  }

  resolveTargets(target: EffectTarget): SeatId[] {
    switch (target.sel) {
      case 'self':
        return this.selfSeatId ? [this.selfSeatId] : [];
      case 'all':
        return [...this.state.seatOrder];
      case 'allInRound':
        return this.state.seatOrder.filter((id) => (this.state.seats[id]?.stats.plays ?? 0) > 0);
      case 'chosen':
        return this.chosenSeatId ? [this.chosenSeatId] : [];
      case 'rule':
        return this.resolveBySelectionRule(target.rule);
    }
  }

  mintToken(seatId: SeatId, count: number, kind: TokenKind, reason: string, dareText?: string): void {
    for (let i = 0; i < count; i++) {
      placeToken(this.state, { ownerSeatId: seatId, originSeatId: this.selfSeatId ?? 'system', kind, source: 'event', reason, dareText }, this.tokenCtx);
    }
  }

  removeToken(seatId: SeatId, count: number): void {
    removeTokens(this.state, seatId, count);
  }

  moveToken(from: SeatId, to: SeatId, count: number, reason: string): void {
    moveTokens(this.state, from, to, count, reason, this.tokenCtx);
  }

  adjustBank(amount: number, reason: string): void {
    const { shortfall } = adjust(this.state.bank, amount, 'EVENT', this.selfSeatId, this.rctx.now, reason);
    if (shortfall > 0) {
      // bank-underflow policy: the table couldn't cover the loss -> everyone takes a token
      addTicker(this.state, 'The bank ran dry — everyone drinks!', 'loss', this.rctx.now);
      for (const sid of this.state.seatOrder) {
        placeToken(this.state, { ownerSeatId: sid, originSeatId: 'system', kind: 'alcohol', source: 'event', reason: 'event.bankUnderflow' }, this.tokenCtx);
      }
    }
  }

  adjustQuota(mode: 'percent' | 'absolute', amount: number): void {
    if (mode === 'percent') this.state.bank.quota = Math.max(0, Math.round(this.state.bank.quota * (1 + amount / 100)));
    else this.state.bank.quota = Math.max(0, this.state.bank.quota + amount);
  }

  armSeat(seatId: SeatId, modifier: ModifierSpec, source: string): void {
    const seat = this.state.seats[seatId];
    if (!seat) return;
    seat.modifiers.push({ ...modifier, id: this.rctx.ids.modifier(), source });
  }

  armRoom(modifier: RoomModifierSpec, source: string): void {
    this.state.roomModifiers.push({ ...modifier, id: this.rctx.ids.modifier(), source });
  }

  statAdjust(seatId: SeatId, field: StatField, delta: number): void {
    const seat = this.state.seats[seatId];
    if (seat) applyStatEvent(seat.stats, { field, value: delta });
  }

  chance(p: number): boolean {
    return this.rctx.rng.chance(p);
  }

  bankBelowQuotaFraction(fraction: number): boolean {
    return this.state.bank.balance < this.state.bank.quota * fraction;
  }

  promptChoice(seatId: SeatId, prompt: string, options: EffectChoiceOption[], source: string): void {
    this.state.pendingChoices.push({ id: this.rctx.ids.choice(), seatId, prompt, options, source });
  }
}

function runOps(ops: EffectOp[], ctx: EffectRunner, source: string): void {
  for (const op of ops) {
    switch (op.op) {
      case 'mintToken':
        for (const t of ctx.resolveTargets(op.target)) ctx.mintToken(t, op.count, op.kind, op.reason, op.dareText);
        break;
      case 'removeToken':
        for (const t of ctx.resolveTargets(op.target)) ctx.removeToken(t, op.count);
        break;
      case 'moveToken': {
        const from = ctx.resolveTargets(op.from)[0];
        const to = ctx.resolveTargets(op.to)[0];
        if (from && to) ctx.moveToken(from, to, op.count, op.reason);
        break;
      }
      case 'adjustBank':
        ctx.adjustBank(op.amount, op.reason);
        break;
      case 'adjustQuota':
        ctx.adjustQuota(op.mode, op.amount);
        break;
      case 'arm':
        for (const t of ctx.resolveTargets(op.target)) ctx.armSeat(t, op.modifier, source);
        break;
      case 'armRoom':
        ctx.armRoom(op.modifier, source);
        break;
      case 'statAdjust':
        for (const t of ctx.resolveTargets(op.target)) ctx.statAdjust(t, op.field, op.delta);
        break;
      case 'chance':
        runOps(ctx.chance(op.p) ? op.then : op.otherwise, ctx, source);
        break;
      case 'condition':
        if (op.when.kind === 'bank-below-quota-fraction' && ctx.bankBelowQuotaFraction(op.when.fraction)) runOps(op.then, ctx, source);
        else if (op.otherwise) runOps(op.otherwise, ctx, source);
        break;
      case 'choice': {
        const target = ctx.resolveTargets(op.target)[0];
        if (target) ctx.promptChoice(target, op.prompt, op.options, source);
        break;
      }
    }
  }
}

export function resolveEffect(
  state: RoomState,
  ops: EffectOp[],
  selfSeatId: SeatId | null,
  chosenSeatId: SeatId | null,
  source: string,
  rctx: ReduceCtx,
): void {
  const ctx = new EffectRunner(state, rctx, selfSeatId, chosenSeatId);
  runOps(ops, ctx, source);
}

export function resolveChoice(
  state: RoomState,
  deviceId: DeviceId,
  seatId: SeatId,
  choiceId: ChoiceId,
  optionId: string,
  targetSeatId: SeatId | undefined,
  rctx: ReduceCtx,
): Result<Record<string, never>> {
  const idx = state.pendingChoices.findIndex((c) => c.id === choiceId);
  if (idx < 0) return err('NOT_FOUND', 'No such choice.');
  const choice = state.pendingChoices[idx]!;
  if (choice.seatId !== seatId) return err('NOT_SEAT_OWNER', 'Not your choice.');
  if (!(state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const option = choice.options.find((o) => o.id === optionId);
  if (!option) return err('BAD_REQUEST', 'Unknown option.');
  resolveEffect(state, option.ops, seatId, targetSeatId ?? null, choice.source, rctx);
  state.pendingChoices.splice(idx, 1);
  return ok({});
}
