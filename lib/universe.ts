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
  /** For actions: heat this draws on the world's danger meter (0/15/30). */
  suspicion?: number;
  /** For actions: what goes wrong when it draws heat, shown to the player. */
  risk?: string;
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

/* ------------------------------------------------------------------ */
/* The Game Bible — the whole game, authored upfront by one planner    */
/* call and sent along with every subsequent model call.               */
/* ------------------------------------------------------------------ */

export type PlannedItem = {
  name: string;
  /** Why this object matters to the story. */
  significance: string;
};

export type PlannedAction = {
  /** Imperative, 2-5 words: "Ring the temple bell". */
  name: string;
  /** What happens when performed. */
  outcome: string;
  /** Item the action yields, if any. */
  grantsItem?: string;
  /** What goes wrong / who notices, when the action draws heat. */
  risk?: string;
  /** Heat drawn on the danger meter: 0 harmless, ~15 risky, ~30 reckless. */
  suspicion: number;
};

export type NpcPlan = {
  name: string;
  role: string;
  /** Temperament and stake in the story. */
  persona: string;
  /** The information they hold (the clue, in their words). */
  knows: string;
  /** What softens them / earns their trust. */
  wants: string;
  fears: string;
  /** The player mistake that makes them snap shut for good. */
  turnsHostileIf: string;
  /** First spoken line when approached. */
  opening: string;
  /** Distinctive verbal habit. */
  quirk: string;
  /** Gemini TTS prebuilt voice name. */
  voice: string;
};

export type RoomPlan = {
  /** e.g. "Chai Tapri", "Old Bookshop" — the enterable place. */
  name: string;
  /** Near-door hint on the street, max 8 words. */
  hint: string;
  /** What it looks like inside — doubles as the image seed. */
  description: string;
  /** What this room contributes to the story spine. */
  storyRole: string;
  /** The room-specific way to get in trouble here. */
  hazard: string;
  items: PlannedItem[];
  actions: PlannedAction[];
};

export type FailState = {
  /** e.g. "The suspicion meter reaches 100". */
  trigger: string;
  /** soft = setback, hard = run over. */
  kind: "soft" | "hard";
  consequence: string;
};

export type GameBible = {
  title: string;
  /** Place, era, atmosphere — 3-4 sentences. */
  setting: string;
  /** Palette/mood line for image generation. */
  styleBible: string;
  /** Who you are, why you're here, what you carry. */
  protagonist: string;
  story: StoryArc;
  /** 3-5 acts: what must happen, in order, for the story to resolve. */
  beats: string[];
  winCondition: string;
  /** What the danger meter is called in this world, e.g. "Suspicion". */
  heatLabel: string;
  failStates: FailState[];
  street: {
    name: string;
    description: string;
    items: PlannedItem[];
    actions: PlannedAction[];
  };
  /** Exactly 3 — room i is guarded by npcs[i] and holds story.clues[i]. */
  rooms: RoomPlan[];
  npcs: NpcPlan[];
  /**
   * Soundtrack id from the fixed music library (`lib/music.ts`), chosen by
   * the model during bible generation to fit the world's mood. Optional:
   * older saved games predate it; the client falls back to keyword
   * matching over the bible text.
   */
  musicTheme?: string;
};

/** Which sides of an overworld screen the player can walk off (true = open). */
export type EdgeOpenness = { n: boolean; e: boolean; s: boolean; w: boolean };

/**
 * Coarse walkability mask over a screen's frame, sampled at the player's foot
 * to keep travel on open ground (roads, paths, floors) and off obstacles.
 * `cells` is row-major (`cells[row * cols + col]`); `true` = walkable.
 */
export type WalkGrid = {
  cols: number;
  rows: number;
  cells: boolean[];
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
  /** Interior scenes remember the screen they came from. */
  parentId?: string;
  /** For interiors: which story clue this scene's NPC guards. */
  clueIndex?: number;
  /** Overworld screens: grid coordinate in the infinite world. */
  coord?: { x: number; y: number };
  /** Overworld screens: which edges continue into a neighboring screen. */
  edges?: EdgeOpenness;
  /** The engine's eyes: the frame with model-traced borders (data URL). */
  annotated?: string;
  /** Overworld screens: walkability mask so obstacles block movement. */
  walk?: WalkGrid;
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
  /**
   * Referee's verdict on the player's last line: "minor" stings (+heat),
   * "grave" means the player tripped this NPC's hostility wire (+more heat,
   * conversation slams shut).
   */
  offense?: "none" | "minor" | "grave";
  done: boolean;
};
