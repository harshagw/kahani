/**
 * Types shared safely across client and server (no Node/browser APIs).
 * Prefer `client.ts` or `server.ts` when a type is layer-specific.
 */

/** Premise card / world metadata — used in bible, API payloads, and UI. */
export type Premise = {
  id: string;
  title: string;
  tagline: string;
  /** Seed context handed to the game master to open the story. */
  setup: string;
  /** Two-emoji motif shown on the premise card. */
  emoji: string;
  /** Art-direction hint that anchors the visual style for this world. */
  styleBible: string;
  /** The concrete objective the player is travelling toward. */
  goal: string;
  /** Short name for the destination, shown on the journey trail. */
  goalLabel: string;
  /** Pin emoji for the destination. */
  goalEmoji: string;
  /** What the draining clock represents in this world. */
  clockLabel: string;
};
