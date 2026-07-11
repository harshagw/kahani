/** Types for the explorable world. Percent coordinates are 0–100 of the frame. */

export type Rect = { x: number; y: number; w: number; h: number };

export type NpcDef = {
  name: string;
  role: string;
  persona: string;
  /** The line the NPC opens with when the player approaches. */
  opening: string;
  /** Distinctive verbal habit, e.g. "ends sentences with 'hain na?'". */
  quirk?: string;
  /** Gemini TTS prebuilt voice name chosen to fit this character. */
  voice?: string;
};

export type Hotspot = {
  id: string;
  kind: "building" | "npc" | "exit" | "item" | "action";
  name: string;
  /** Short hint shown when the player is near ("A tea stall, lamps lit"). */
  hint: string;
  rect: Rect;
  /** For buildings: the prompt seed used to generate the interior. */
  interiorPrompt?: string;
  /** Which story clue this building's NPC guards. */
  clueIndex?: number;
  /** For items: what goes into the inventory when picked up. */
  itemName?: string;
  /** For actions: what happens when performed (≤20 words, shown + spoken). */
  outcome?: string;
  /** For actions: an item the action yields. */
  grantsItem?: string;
  /** For actions: performing it exits back outside (window, back door…). */
  leadsOutside?: boolean;
};

/** The hidden arc the whole world converges toward. */
export type StoryArc = {
  /** Player-facing objective. */
  goal: string;
  /** The hidden truth, revealed only at the finale. */
  secret: string;
  /** Three clues, each guarded by one NPC. */
  clues: string[];
};

export type SceneData = {
  id: string;
  kind: "street" | "interior";
  title: string;
  /** One ambient line shown when the scene loads. */
  ambient: string;
  /** Data URL of the generated frame. */
  image: string;
  hotspots: Hotspot[];
  npc?: NpcDef;
  /** Interior scenes remember the street they came from. */
  parentId?: string;
  /** Vision-derived: y (%) where walkable ground begins (the horizon). */
  groundTop?: number;
  /** Vision-derived no-walk boxes: water, people, stalls, furniture, vehicles. */
  obstacles?: Rect[];
  /** Vision-derived walk mask: rows of 0/1 cells (1 = blocked), 24 cols × 14 rows. */
  walkGrid?: number[][];
  /** For interiors: which story clue this scene's NPC guards. */
  clueIndex?: number;
};

export type DialogueTurn = {
  speaker: "npc" | "player";
  text: string;
};

export type DialogueResponse = {
  line: string;
  options: string[];
  /** Updated one-line quest objective, when the conversation moves the story. */
  questUpdate?: string;
  /** True on the turn where this NPC's guarded clue is revealed. */
  clueRevealed?: boolean;
  /** Emotional register of the line — drives the voice performance + UI. */
  mood?: string;
  done: boolean;
};
