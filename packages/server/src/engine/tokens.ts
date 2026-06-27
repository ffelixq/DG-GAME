import {
  TOKEN_REMOVAL_ORDER,
  type DrinkToken,
  type RoomState,
  type SeatId,
  type SeatState,
  type TokenKind,
  type TokenMintSpec,
} from '@lcc/shared';
import type { IdGen } from '../runtime/IdGen';
import { addTicker } from './state';

export interface TokenCtx {
  ids: IdGen;
  now: number;
}

const KIND_EMOJI: Record<TokenKind, string> = { alcohol: '🍺', water: '💧', dare: '🎲' };

/**
 * THE token-placement chokepoint. Every token landing on a seat — whether freshly minted by a
 * game/event or transferred via Reverse/Scapegoat/give-away — goes through here, so the safety
 * rules can never be bypassed:
 *   1. consume armed `next-token-onto-self` modifiers (Insurance cancels, Hangover/Designated
 *      Driver convert to water, Reverse redirects to another seat);
 *   2. coerce alcohol -> water for an exempt ("I feel unwell") seat;
 *   3. attach the token + record stats.
 */
export function placeToken(
  state: RoomState,
  spec: { ownerSeatId: SeatId; originSeatId: SeatId | 'system'; kind: TokenKind; source: TokenMintSpec['source']; reason: string; dareText?: string },
  ctx: TokenCtx,
): DrinkToken | null {
  let ownerId = spec.ownerSeatId;
  let kind = spec.kind;

  // (1) armed next-token modifiers on the current owner
  let owner = state.seats[ownerId];
  if (!owner) return null;

  const cancel = owner.modifiers.find((m) => m.trigger === 'next-token-onto-self' && m.kind === 'cancel-token' && m.uses > 0);
  if (cancel) {
    cancel.uses -= 1;
    pruneModifiers(owner);
    addTicker(state, `${owner.name} dodged a token 🛡️`, 'info', ctx.now);
    return null;
  }

  const redirect = owner.modifiers.find((m) => m.trigger === 'next-token-onto-self' && m.kind === 'redirect-token' && m.uses > 0 && m.to);
  if (redirect?.to) {
    redirect.uses -= 1;
    pruneModifiers(owner);
    ownerId = redirect.to;
    owner = state.seats[ownerId];
    if (!owner) return null;
  }

  const convert = owner.modifiers.find((m) => m.trigger === 'next-token-onto-self' && m.kind === 'convert-token-water' && m.uses > 0);
  if (convert && kind === 'alcohol') {
    convert.uses -= 1;
    pruneModifiers(owner);
    kind = 'water';
  }

  // (2) exempt coercion — the hard safety floor
  if (owner.exempt && kind === 'alcohol') kind = 'water';

  // (3) attach
  const id = ctx.ids.token();
  const token: DrinkToken = {
    id,
    ownerSeatId: ownerId,
    originSeatId: spec.originSeatId,
    kind,
    source: spec.source,
    reason: spec.reason,
    mintedFloor: state.currentFloor,
    status: 'pending',
    carries: 0,
  };
  state.tokens[id] = token;
  owner.tokenIds.push(id);
  owner.stats.tokensReceived += 1;
  addTicker(state, `${owner.name} picked up ${KIND_EMOJI[kind]}`, 'token', ctx.now);
  return token;
}

/** Apply a mint spec `count` times through the chokepoint. */
export function mint(state: RoomState, spec: TokenMintSpec, ctx: TokenCtx): void {
  for (let i = 0; i < spec.count; i++) {
    placeToken(
      state,
      {
        ownerSeatId: spec.ownerSeatId,
        originSeatId: spec.originSeatId,
        kind: spec.kind,
        source: spec.source,
        reason: spec.reason,
        dareText: spec.dareText,
      },
      ctx,
    );
  }
}

/** Remove up to `count` tokens from a seat, worst-first (alcohol -> water -> dare). */
export function removeTokens(state: RoomState, seatId: SeatId, count: number): number {
  const seat = state.seats[seatId];
  if (!seat) return 0;
  let removed = 0;
  for (const kind of TOKEN_REMOVAL_ORDER) {
    if (removed >= count) break;
    for (let i = seat.tokenIds.length - 1; i >= 0 && removed < count; i--) {
      const tid = seat.tokenIds[i]!;
      const tok = state.tokens[tid];
      if (tok && tok.kind === kind && tok.status === 'pending') {
        seat.tokenIds.splice(i, 1);
        delete state.tokens[tid];
        removed += 1;
      }
    }
  }
  return removed;
}

/** Move up to `count` tokens from one seat to another (still routed through placeToken). */
export function moveTokens(
  state: RoomState,
  fromId: SeatId,
  toId: SeatId,
  count: number,
  reason: string,
  ctx: TokenCtx,
): number {
  const from = state.seats[fromId];
  if (!from) return 0;
  let moved = 0;
  for (const kind of TOKEN_REMOVAL_ORDER) {
    if (moved >= count) break;
    for (let i = from.tokenIds.length - 1; i >= 0 && moved < count; i--) {
      const tid = from.tokenIds[i]!;
      const tok = state.tokens[tid];
      if (tok && tok.status === 'pending' && tok.kind === kind) {
        from.tokenIds.splice(i, 1);
        delete state.tokens[tid];
        placeToken(state, { ownerSeatId: toId, originSeatId: fromId, kind: tok.kind, source: 'item', reason }, ctx);
        moved += 1;
      }
    }
  }
  return moved;
}

function pruneModifiers(seat: SeatState): void {
  seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
}

export function tokenCountsForSeat(state: RoomState, seat: SeatState): { alcohol: number; water: number; dare: number } {
  const c = { alcohol: 0, water: 0, dare: 0 };
  for (const id of seat.tokenIds) {
    const t = state.tokens[id];
    if (t) c[t.kind] += 1;
  }
  return c;
}
