/**
 * Shared constants safe to import from both client and server.
 */

/** Max worlds a free-tier user may create (`0` = gallery-only, no new worlds). */
export const FREE_GAME_LIMIT = Number(process.env.FREE_GAME_LIMIT ?? "1");

/** Beats before the story is steered to a close. Tune for demo pacing. */
export const MAX_TURNS = 8;

/** Starting value of the time budget (drains toward 0 = out of time). */
export const INITIAL_CLOCK = 100;
