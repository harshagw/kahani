/**
 * Shared constants safe to import from both client and server.
 */

/** Max worlds a free-tier user may create (`0` = gallery-only, no new worlds). */
export const FREE_GAME_LIMIT = Number(process.env.FREE_GAME_LIMIT ?? "1");

/** Beats before the story is steered to a close. Tune for demo pacing. */
export const MAX_TURNS = 8;

/** Starting value of the time budget (drains toward 0 = out of time). */
export const INITIAL_CLOCK = 100;

/** sessionStorage key for the create flow idea (Home → `/play/new`). */
export const CREATE_IDEA_STORAGE_KEY = "kahani:create-idea";

/** Max characters for a create-flow idea (matches `/api/universe` and POST `/api/games`). */
export const MAX_CREATE_IDEA_LENGTH = 1200;

/** API-call budget per generated asset kind (server derivation + client live meter). */
export const GEN_CALL_COST = {
  universe: 1,
  screen: 3,
  interior: 2,
  sprite: 1,
  finale: 2,
} as const;
