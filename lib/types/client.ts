/**
 * Client-side types for Kahani.
 *
 * All types consumed by React components, client pages, and fetch calls belong
 * here. Do not define duplicate shapes in component files.
 */

import type { Choice, Effects, EndingKind, Stats } from "../stats";
import type { DialogueTurn, GameBible, SceneData } from "../universe";
import type { Premise } from "./shared";

/** Premise card / world metadata shown in the UI. */
export type { Premise } from "./shared";

/** One completed story beat for legacy linear mode context. */
export type HistoryEntry = {
  caption: string;
  choice: string;
};

/** Legacy linear-mode turn request (client → `/api/turn`). */
export type TurnRequest = {
  premise: Premise;
  history: HistoryEntry[];
  /** The option the player just picked. null on the opening turn. */
  choice: string | null;
  /** Previous frame (base64, no data-url prefix) for visual continuity. */
  prevImage: string | null;
  stats: Stats;
  /** Current time budget 0..100. */
  clock: number;
  /** Current journey progress 0..100. */
  progress: number;
};

/** Legacy linear-mode turn response. */
export type TurnResponse = {
  caption: string;
  outcomeFlash: string;
  choices: Choice[];
  /** Fully-formed data URL for the scene image. */
  image: string;
  effects: Effects;
  timeCost: number;
  location: string;
  progress: number;
  isEnding: boolean;
  endingKind?: EndingKind;
  endingTitle?: string;
};

/** Client-side record of a single legacy story frame. */
export type Scene = {
  turn: number;
  image: string;
  caption: string;
  outcomeFlash: string;
  choices: Choice[];
  effects: Effects;
  timeCost: number;
  location: string;
  progress: number;
  isEnding: boolean;
  endingKind?: EndingKind;
  endingTitle?: string;
  /** The choice the player made to leave this scene. */
  chosen?: string;
};

/* ------------------------------------------------------------------ */
/* Game persistence API (client ↔ `/api/games`, `/api/profile`)       */
/* ------------------------------------------------------------------ */

/** Victory or defeat ending variant. */
export type FinaleOutcome = "victory" | "defeat";

/** Generated ending narration + image (inline data URL or Storage URL). */
export type FinaleData = {
  title: string;
  resolution: string;
  image: string;
  outcome?: FinaleOutcome;
};

/** Summary row returned by `GET /api/games`. */
export type GameListItem = {
  id: string;
  owner: string;
  title: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

/** Free-tier world creation limits for the signed-in user. */
export type GenerationQuota = {
  used: number;
  limit: number;
  unlimited: boolean;
  canCreate: boolean;
};

/** Response from `GET /api/profile`. */
export type ProfileResponse = {
  generation: GenerationQuota;
};

/** Full saved game returned by `GET /api/games/[id]`. */
export type FullGameResponse = {
  id: string;
  owner: string;
  /** True when the current user owns this game and may generate new scenes. */
  isOwner: boolean;
  title: string;
  idea: string;
  bible: GameBible;
  premise: Premise;
  spriteUrl: string | null;
  finales: Partial<Record<FinaleOutcome, FinaleData>>;
  scenes: SceneData[];
  /** Total AI generation calls derived from persisted assets (same for owner and visitors). */
  genCalls: number;
  createdAt: string;
};

/** Body sent by the client when creating a new game row. */
export type CreateGameRequest = {
  idea: string;
  bible: GameBible;
  premise: Premise;
};

/** Response from `POST /api/games`. */
export type CreateGameResponse = GameListItem;

/** Response from `PUT /api/games/[id]/sprite`. */
export type PutSpriteResponse = {
  spriteUrl: string;
};

/* ------------------------------------------------------------------ */
/* World component                                                      */
/* ------------------------------------------------------------------ */

/** Whether the world is being created fresh or loaded from storage. */
export type WorldMode = "create" | "load";

/** Boot vs in-game phase for the explorable world UI. */
export type WorldPhase = "booting" | "playing";

/** Props for the main game orchestrator component. */
export type WorldProps = {
  mode: WorldMode;
  /** Required when `mode` is `"load"`. */
  gameId?: string;
  /** Required when `mode` is `"create"` (from `/play/new` via sessionStorage). */
  initialIdea?: string;
};

/** Active NPC dialogue panel state. */
export type WorldDialogueState = {
  npc: NonNullable<SceneData["npc"]> & object;
  history: DialogueTurn[];
  options: string[];
  thinking: boolean;
  mood?: string;
};
