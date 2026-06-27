// Tunable game-wide constants. Safety caps live here so they are single-sourced and testable.

/** Hard cap of alcohol tokens a seat may resolve in one Drink Check. SAFETY. */
export const MAX_ALCOHOL_PER_CHECK = 2;

/** A token that survives this many Drink Checks unresolved converts to water. */
export const MAX_CARRY = 2;

/** Server scheduler tick. */
export const TICK_MS = 250;

/** Lobby limits. */
export const MIN_SEATS_TO_START = 2;
export const MAX_SEATS = 8;

/** Shared bank the table starts the night with (fake dollars). */
export const STARTING_BANK = 1000;

/** Number of distinct seat accent colours the UI cycles through. */
export const SEAT_ACCENT_COUNT = 8;

/** Room code generation. Ambiguity-free alphabet (no 0/O/1/I). */
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Connection lifecycle. */
export const DEVICE_TTL_MS = 5 * 60 * 1000;
export const ROOM_TTL_MS = 30 * 60 * 1000;

/** Floor-intro display grace before play begins. */
export const FLOOR_INTRO_MS = 4000;

/** Soft sub-deadline for resolving a Drink Check. On timeout the check finalizes
 *  as carry/water — NEVER auto-alcohol. Purely advisory pressure-relief, not a penalty. */
export const DRINK_CHECK_SOFT_MS = 45 * 1000;

/** Window for the "Last Call" event: seats must place a bet within this window. */
export const LAST_CALL_WINDOW_MS = 10 * 1000;

/** How long an instant event banner holds the screen before play resumes. */
export const EVENT_DISPLAY_MS = 4500;

/** How long a finished game's result stays on the player's screen before returning to the menu. */
export const GAME_REVEAL_MS = 4500;

/** Poker table: join window + per-turn slow-player timeout (auto-fold/stand; never auto-drink). */
export const POKER_JOIN_WINDOW_MS = 8 * 1000;
export const TURN_TIMEOUT_MS = 20 * 1000;

/** Blackjack table: shorter join window (can be skipped with "Deal now"). */
export const BLACKJACK_JOIN_WINDOW_MS = 6 * 1000;

/** How long a bot "thinks" before acting, so it doesn't feel instant. */
export const BOT_THINK_MS = 1400;

/** Funny bot names, cycled as bots are added. */
export const BOT_NAMES = ['Robo-Ray', 'Chip Bot', 'All-In Al', 'Bluff-o-Tron', 'Lucky 8000', 'Card Shark.exe'];

/** Ticker memory on the board. */
export const MAX_TICKER_ENTRIES = 14;
