/**
 * Shared constants safe to import from both client and server.
 */

/** Max worlds a free-tier user may create (`0` = gallery-only, no new worlds). */
export const FREE_GAME_LIMIT = Number(process.env.FREE_GAME_LIMIT ?? "0");

/** Beats before the story is steered to a close. Tune for demo pacing. */
export const MAX_TURNS = 8;

/** Starting value of the time budget (drains toward 0 = out of time). */
export const INITIAL_CLOCK = 100;

/** Max characters for a create-flow idea (matches `/api/universe` and POST `/api/games`). */
export const MAX_CREATE_IDEA_LENGTH = 1200;

/** Max characters for a saved/display game title (first line of user idea). */
export const MAX_GAME_TITLE_LENGTH = 80;

/** Wall-clock seconds allowed per World play session (client-readable). */
export const SESSION_TIME_LIMIT_SEC = Number(
  process.env.NEXT_PUBLIC_SESSION_TIME_LIMIT_SEC ?? "300"
);

/** Max retry attempts after the initial call (e.g. 3 → 500ms, 1s, 2s backoff). */
export const RETRY_MAX = 3;

/** Base delay in ms for exponential backoff (doubled each retry). */
export const RETRY_BASE_MS = 500;

/** API-call budget per generated asset kind (server derivation + client live meter). */
export const GEN_CALL_COST = {
  universe: 1,
  screen: 3,
  interior: 2,
  sprite: 1,
  finale: 2,
} as const;
