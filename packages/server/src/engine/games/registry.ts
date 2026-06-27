import type { GameEngine, GameKind } from '@lcc/shared';
import { RouletteEngine } from './roulette/RouletteEngine';
import { DiceDuelEngine } from './dice/DiceDuelEngine';
import { SlotsEngine } from './slots/SlotsEngine';
import { CoinFlipEngine } from './coinflip/CoinFlipEngine';
import { WheelEngine } from './wheel/WheelEngine';
import { HighCardEngine } from './highcard/HighCardEngine';

// Solo games use the GameEngine interface. The multi-seat tables — poker3 (engine/poker.ts) and
// blackjack (engine/blackjack-table.ts) — are handled separately and are NOT in this registry.
export const GAME_ENGINES: Partial<Record<GameKind, GameEngine>> = {
  roulette: RouletteEngine,
  diceDuel: DiceDuelEngine,
  slots: SlotsEngine,
  coinflip: CoinFlipEngine,
  wheel: WheelEngine,
  highcard: HighCardEngine,
};

export function getEngine(kind: GameKind): GameEngine | undefined {
  return GAME_ENGINES[kind];
}

export function gameAvailable(kind: GameKind): boolean {
  return kind === 'poker3' || kind === 'blackjack' || GAME_ENGINES[kind] !== undefined;
}
