import { Type } from "@google/genai";
import { ai, generateImage, toDataUrl } from "./gemini";
import type { Premise } from "./types";
import type {
  DialogueResponse,
  DialogueTurn,
  Hotspot,
  NpcDef,
  Rect,
  SceneData,
  StoryArc,
} from "./universe";

/** Appended to every scene render so the world reads as one retro RPG overworld. */
const PIXEL_STYLE =
  "Rendered as a TRUE overhead top-view 2D 16-bit retro RPG map (classic Pokemon overworld, camera pointing straight down at the ground): pure bird's-eye view, chunky clean pixel-art tiles, walkable paths/grass/paving filling most of the frame, buildings seen as ROOFS from above with their entrance door visible on the bottom edge, small props (wells, carts, pots) seen from directly above, bright flat colors, crisp pixel edges, no facades, no horizon, no sky, no perspective, no isometric angle.";

const TEXT_MODEL = process.env.TEXT_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";
const VOICE_MODEL = process.env.VOICE_MODEL || "gemini-2.5-flash-preview-tts";

const rectSchema = {
  type: Type.OBJECT,
  properties: {
    x: { type: Type.INTEGER, description: "Left edge, 0-100 (% of frame width)" },
    y: { type: Type.INTEGER, description: "Top edge, 0-100 (% of frame height)" },
    w: { type: Type.INTEGER, description: "Width, 0-100" },
    h: { type: Type.INTEGER, description: "Height, 0-100" },
  },
  required: ["x", "y", "w", "h"],
};

function clampRect(r: Rect): Rect {
  const c = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return { x: c(r.x), y: c(r.y), w: Math.max(4, c(r.w)), h: Math.max(4, c(r.h)) };
}

/* ------------------------------------------------------------------ */
/* Universe from a player's freeform idea                              */
/* ------------------------------------------------------------------ */

const universeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "World name, 2-4 words." },
    setup: {
      type: Type.STRING,
      description:
        "Two second-person sentences: who the player is and what pulls them into this world. Faithful to the player's idea; invent the missing pieces.",
    },
    styleBible: {
      type: Type.STRING,
      description:
        "One sentence of PALETTE and MOOD only — the rendering style is always 16-bit pixel-art and is fixed elsewhere. Time of day, color palette, weather, atmosphere. e.g. 'Warm dusk palette, monsoon-wet stone, lantern glows.'",
    },
    story: {
      type: Type.OBJECT,
      description:
        "The ONE hidden story this whole world converges toward. Not a sandbox — a mystery with an answer.",
      properties: {
        goal: {
          type: Type.STRING,
          description:
            "Player-facing objective, one line, max 12 words. e.g. 'Find out who locked the brass chest — and why.'",
        },
        secret: {
          type: Type.STRING,
          description:
            "The hidden truth behind the goal, 1-2 sentences. Revealed only at the finale.",
        },
        clues: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "Exactly 3 concrete clues that together expose the secret. Each will be guarded by one character. Each one line.",
        },
      },
      required: ["goal", "secret", "clues"],
    },
  },
  required: ["title", "setup", "styleBible", "story"],
};

export type UniverseSpec = {
  title: string;
  setup: string;
  styleBible: string;
  story: StoryArc;
};

/** Expand a player's freeform scene idea into a playable universe + story arc. */
export async function expandUniverse(idea: string): Promise<UniverseSpec> {
  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: `PLAYER'S IDEA FOR THE OPENING SCENE / WORLD:\n${idea}\n\nTurn this into a playable adventure-game universe with ONE convergent mystery.`,
    config: {
      systemInstruction:
        "You are the creative director of an explorable adventure game rooted in India. Honor the player's idea — its named details, era, and tone. Unless the idea explicitly names a non-Indian setting, ground the world in India: real textures of its streets, ghats, hills, bazaars, monsoons, festivals, myths and folklore, with authentic names — never caricature. Design a single tight mystery: a goal, a hidden secret, and exactly 3 clues that converge on it. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: universeSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty universe spec from text model.");
  const spec = JSON.parse(res.text) as UniverseSpec;
  spec.story.clues = (spec.story.clues ?? []).slice(0, 3);
  while (spec.story.clues.length < 3) {
    spec.story.clues.push("A detail someone here is hiding.");
  }
  return spec;
}

/* ------------------------------------------------------------------ */
/* Scene generation                                                    */
/* ------------------------------------------------------------------ */

const streetSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Name of this street/area, 2-4 words." },
    ambient: {
      type: Type.STRING,
      description: "One atmospheric line shown on arrival, max 14 words.",
    },
    questHook: {
      type: Type.STRING,
      description:
        "A one-line open objective that pulls the player to explore, max 12 words.",
    },
    imagePrompt: {
      type: Type.STRING,
      description:
        "Rich prompt for a retro RPG overworld screen of this street/exterior (classic Pokemon town style, near-top-down). MOST of the frame is open walkable tile ground with NO people; a few small buildings with one big distinct door each sit around the edges. Authentic, era- and place-faithful detail for this universe. No text in image.",
    },
    buildings: {
      type: Type.ARRAY,
      description:
        "Exactly 3 enterable places, positioned where their doorways appear in the image. Building 1 relates to clue 1, building 2 to clue 2, building 3 to clue 3.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "e.g. 'Chai Tapri', 'Old Bookshop'" },
          hint: { type: Type.STRING, description: "Near-door hint, max 8 words." },
          interiorPrompt: {
            type: Type.STRING,
            description: "Seed describing what is inside, one sentence.",
          },
          rect: rectSchema,
        },
        required: ["name", "hint", "interiorPrompt", "rect"],
      },
    },
    items: {
      type: Type.ARRAY,
      description:
        "1-2 collectible objects lying in the OPEN walkable area (never inside buildings), positioned where they appear in the image. Small, pickable, story-flavored.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "e.g. 'Rusty temple key', 'Torn ledger page'" },
          hint: { type: Type.STRING, description: "Near hint, max 8 words." },
          rect: rectSchema,
        },
        required: ["name", "hint", "rect"],
      },
    },
    actions: {
      type: Type.ARRAY,
      description:
        "1-2 environmental interactions in the open area: ring a bell, peek through a gate, search a cart, draw from a well. Each has a concrete outcome.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Imperative, 2-5 words: 'Ring the temple bell'" },
          hint: { type: Type.STRING, description: "Near hint, max 8 words." },
          outcome: {
            type: Type.STRING,
            description: "What happens when performed, max 20 words, vivid.",
          },
          grantsItem: {
            type: Type.STRING,
            description: "Item gained by this action, or empty string.",
          },
          rect: rectSchema,
        },
        required: ["name", "hint", "outcome", "grantsItem", "rect"],
      },
    },
  },
  required: ["title", "ambient", "questHook", "imagePrompt", "buildings", "items", "actions"],
};

const interiorSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Name of this interior, 2-4 words." },
    ambient: { type: Type.STRING, description: "One line on entering, max 14 words." },
    imagePrompt: {
      type: Type.STRING,
      description:
        "Rich prompt for a retro RPG interior room (classic Pokemon house-interior style, near-top-down), with ONE character (the NPC) visible. Most of the frame is open walkable tiled floor; furniture hugs the walls. Authentic, era- and place-faithful detail for this universe. No text in image.",
    },
    npc: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        role: { type: Type.STRING, description: "e.g. 'chaiwala', 'retired archivist'" },
        persona: {
          type: Type.STRING,
          description:
            "2 sentences: temperament, what they know, what they want — and what they FEAR.",
        },
        opening: {
          type: Type.STRING,
          description:
            "Their first spoken line when the player approaches — a dramatic hook that signals conflict, fear, or a secret in ≤18 words. May naturally include one Hindi/regional word (arre, beta, sahib…). Never a plain greeting.",
        },
        quirk: {
          type: Type.STRING,
          description:
            "A distinctive verbal habit, e.g. 'ends questions with hain na?', 'speaks in hushed half-sentences', 'quotes his late wife'.",
        },
        voice: {
          type: Type.STRING,
          enum: ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"],
          description:
            "TTS voice fitting the character: Charon/Orus = deep older male; Fenrir = gravelly, intense; Puck/Zephyr = quick, energetic; Kore = warm neutral female; Aoede/Leda = bright younger female.",
        },
      },
      required: ["name", "role", "persona", "opening", "quirk", "voice"],
    },
    npcZone: {
      ...rectSchema,
      description: "Where the NPC stands in the image (approach to talk).",
    },
    exitZone: {
      ...rectSchema,
      description: "Where the exit door is (walk there to leave).",
    },
    items: {
      type: Type.ARRAY,
      description:
        "1-2 collectible objects visible in the room, on floors/tables, positioned where they appear. Story-flavored.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          hint: { type: Type.STRING, description: "Near hint, max 8 words." },
          rect: rectSchema,
        },
        required: ["name", "hint", "rect"],
      },
    },
    actions: {
      type: Type.ARRAY,
      description:
        "1-2 interactions in the room: climb out the window (alternate exit), open a chest, read a notice, light a lamp. Each has a concrete outcome.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Imperative, 2-5 words" },
          hint: { type: Type.STRING, description: "Near hint, max 8 words." },
          outcome: { type: Type.STRING, description: "What happens, max 20 words." },
          grantsItem: { type: Type.STRING, description: "Item gained, or empty string." },
          leadsOutside: {
            type: Type.BOOLEAN,
            description: "True if this action exits the building (window, back door).",
          },
          rect: rectSchema,
        },
        required: ["name", "hint", "outcome", "grantsItem", "leadsOutside", "rect"],
      },
    },
  },
  required: ["title", "ambient", "imagePrompt", "npc", "npcZone", "exitZone", "items", "actions"],
};

export async function generateStreetScene(
  premise: Premise,
  story: StoryArc
): Promise<SceneData & { questHook: string }> {
  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: [
      `UNIVERSE: ${premise.title} — ${premise.setup}`,
      `ART DIRECTION: ${premise.styleBible}`,
      `THE STORY THIS WORLD CONVERGES ON — goal: ${story.goal}`,
      `Clue 1: ${story.clues[0]}`,
      `Clue 2: ${story.clues[1]}`,
      `Clue 3: ${story.clues[2]}`,
      "Design the opening explorable street. Each of the 3 buildings must plausibly house the keeper of its matching clue. Set questHook to the story goal, phrased for the player.",
    ].join("\n"),
    config: {
      systemInstruction:
        "You are the level designer of an explorable adventure game. You design scenes as images plus interactive hotspots with accurate percent-coordinate boxes. Doorways sit at ground level (y of the box bottom around 55-75). Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: streetSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty street spec from text model.");
  const spec = JSON.parse(res.text) as {
    title: string;
    ambient: string;
    questHook: string;
    imagePrompt: string;
    buildings: { name: string; hint: string; interiorPrompt: string; rect: Rect }[];
    items?: { name: string; hint: string; rect: Rect }[];
    actions?: {
      name: string;
      hint: string;
      outcome: string;
      grantsItem?: string;
      rect: Rect;
    }[];
  };

  const img = await generateImage(
    `${spec.imagePrompt} ${PIXEL_STYLE}`,
    premise.styleBible,
    null
  );

  const hotspots: Hotspot[] = spec.buildings.slice(0, 3).map((b, i) => ({
    id: `b${i}`,
    kind: "building" as const,
    name: b.name,
    hint: b.hint,
    rect: clampRect(b.rect),
    interiorPrompt: b.interiorPrompt,
    clueIndex: i,
  }));
  (spec.items ?? []).slice(0, 2).forEach((it, i) =>
    hotspots.push({
      id: `street-item${i}`,
      kind: "item",
      name: it.name,
      hint: it.hint,
      rect: clampRect(it.rect),
      itemName: it.name,
    })
  );
  (spec.actions ?? []).slice(0, 2).forEach((a, i) =>
    hotspots.push({
      id: `street-act${i}`,
      kind: "action",
      name: a.name,
      hint: a.hint,
      rect: clampRect(a.rect),
      outcome: a.outcome,
      grantsItem: a.grantsItem?.trim() || undefined,
    })
  );

  return {
    id: "street",
    kind: "street",
    title: spec.title,
    ambient: spec.ambient,
    image: toDataUrl(img.b64, img.mimeType),
    hotspots,
    questHook: spec.questHook,
  };
}

export async function generateInteriorScene(
  premise: Premise,
  building: {
    id: string;
    name: string;
    interiorPrompt: string;
    clueIndex?: number;
  },
  questHook: string,
  story?: StoryArc
): Promise<SceneData> {
  const clue =
    story && typeof building.clueIndex === "number"
      ? story.clues[building.clueIndex]
      : null;
  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: [
      `UNIVERSE: ${premise.title} — ${premise.setup}`,
      `ART DIRECTION: ${premise.styleBible}`,
      `WORLD QUEST HOOK: ${questHook}`,
      `PLACE: "${building.name}" — ${building.interiorPrompt}`,
      clue
        ? `THIS PLACE'S NPC GUARDS THIS CLUE (they know it and can be persuaded to share it): ${clue}`
        : "",
      "Design the interior of this place and the single NPC inside it. Their persona must make them a believable keeper of the clue above.",
    ]
      .filter(Boolean)
      .join("\n"),
    config: {
      systemInstruction:
        "You are the level + character designer of an explorable adventure game. Percent-coordinate boxes must match where things appear in the image you describe. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: interiorSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty interior spec from text model.");
  const spec = JSON.parse(res.text) as {
    title: string;
    ambient: string;
    imagePrompt: string;
    npc: NpcDef;
    npcZone: Rect;
    exitZone: Rect;
    items?: { name: string; hint: string; rect: Rect }[];
    actions?: {
      name: string;
      hint: string;
      outcome: string;
      grantsItem?: string;
      leadsOutside?: boolean;
      rect: Rect;
    }[];
  };

  const img = await generateImage(
    `${spec.imagePrompt} ${PIXEL_STYLE}`,
    premise.styleBible,
    null
  );

  const hotspots: Hotspot[] = [
    {
      id: `${building.id}-npc`,
      kind: "npc",
      name: spec.npc.name,
      hint: `${spec.npc.role} — press E to talk`,
      rect: clampRect(spec.npcZone),
    },
    {
      id: `${building.id}-exit`,
      kind: "exit",
      name: "Back to the street",
      hint: "press E to leave",
      rect: clampRect(spec.exitZone),
    },
  ];
  (spec.items ?? []).slice(0, 2).forEach((it, i) =>
    hotspots.push({
      id: `${building.id}-item${i}`,
      kind: "item",
      name: it.name,
      hint: it.hint,
      rect: clampRect(it.rect),
      itemName: it.name,
    })
  );
  (spec.actions ?? []).slice(0, 2).forEach((a, i) =>
    hotspots.push({
      id: `${building.id}-act${i}`,
      kind: "action",
      name: a.name,
      hint: a.hint,
      rect: clampRect(a.rect),
      outcome: a.outcome,
      grantsItem: a.grantsItem?.trim() || undefined,
      leadsOutside: Boolean(a.leadsOutside),
    })
  );

  return {
    id: building.id,
    kind: "interior",
    title: spec.title,
    ambient: spec.ambient,
    image: toDataUrl(img.b64, img.mimeType),
    hotspots,
    npc: spec.npc,
    parentId: "street",
    clueIndex: building.clueIndex,
  };
}

/* ------------------------------------------------------------------ */
/* Player sprite                                                       */
/* ------------------------------------------------------------------ */

/**
 * Generate the player sprite. When the opening frame is supplied it is passed
 * as a style reference so the character shares the world's exact art style,
 * lighting, and color grade instead of looking pasted-in.
 */
export async function generateSprite(
  premise: Premise,
  referenceFrame: string | null
): Promise<string> {
  const prompt = [
    `Full-body 2D adventure-game player character for this world: ${premise.setup}`,
    referenceFrame
      ? "CRITICAL: render the character in EXACTLY the same art style, rendering technique, lighting direction, and color grade as the reference image, as if painted by the same artist for the same scene."
      : `Style: ${premise.styleBible}`,
    "Single tiny 16-bit pixel-art RPG overworld character sprite seen from above and slightly behind (classic Pokemon walking-sprite angle: big head and shoulders from above, small feet), facing right, full body, chunky clean pixels.",
    "Isolated on a PURE WHITE background, no shadow, no ground, no text, no border. Character fills most of the frame height.",
  ].join(" ");
  const img = await generateImage(
    prompt,
    referenceFrame ? "" : "clean game-asset render",
    referenceFrame
  );
  return toDataUrl(img.b64, img.mimeType);
}

/* ------------------------------------------------------------------ */
/* Dialogue                                                            */
/* ------------------------------------------------------------------ */

const dialogueSchema = {
  type: Type.OBJECT,
  properties: {
    line: {
      type: Type.STRING,
      description:
        "The NPC's spoken reply, 8-22 words, in-character. Every line must carry at least ONE of: a secret teased, a warning, a demand, an emotion spike, a concrete sensory detail, or a personal stake. Never filler, never a pleasantry.",
    },
    mood: {
      type: Type.STRING,
      enum: ["warm", "wary", "fearful", "urgent", "secretive", "amused", "angry"],
      description: "The emotional register this line is delivered in.",
    },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Exactly 3 reply options, 2-7 words, each a genuinely DIFFERENT tactic (press harder / offer something / change subject). Empty when done is true.",
    },
    questUpdate: {
      type: Type.STRING,
      description:
        "When this exchange moves the story, the player's updated one-line objective. Empty otherwise.",
    },
    clueRevealed: {
      type: Type.BOOLEAN,
      description:
        "True ONLY on the turn where you actually reveal the guarded clue to the player.",
    },
    done: {
      type: Type.BOOLEAN,
      description: "True when the NPC closes the conversation.",
    },
  },
  required: ["line", "mood", "options", "clueRevealed", "done"],
};

export async function generateDialogue(
  premise: Premise,
  npc: NpcDef,
  sceneTitle: string,
  questHook: string,
  history: DialogueTurn[],
  playerLine: string | null,
  storyCtx?: {
    clue: string | null;
    clueFound: boolean;
    exchanges: number;
    inventory?: string[];
  }
): Promise<DialogueResponse> {
  const lines: string[] = [
    `UNIVERSE: ${premise.title} — ${premise.setup}`,
    `SCENE: ${sceneTitle}`,
    `QUEST THREAD: ${questHook}`,
    `YOU ARE: ${npc.name}, ${npc.role}. ${npc.persona}`,
  ];
  if (npc.quirk) lines.push(`YOUR VERBAL QUIRK (use it): ${npc.quirk}`);
  if (storyCtx?.inventory?.length) {
    lines.push(
      `THE PLAYER VISIBLY CARRIES: ${storyCtx.inventory.join(", ")} — react to these when it makes sense.`
    );
  }
  if (storyCtx?.clue && !storyCtx.clueFound) {
    lines.push(`THE CLUE YOU GUARD: ${storyCtx.clue}`);
  }
  lines.push(
    "",
    "CONVERSATION SO FAR:",
    ...history.map((t) => `${t.speaker === "npc" ? npc.name : "Player"}: ${t.text}`)
  );
  if (playerLine) lines.push(`Player: ${playerLine}`);

  const exchanges = storyCtx?.exchanges ?? history.filter((t) => t.speaker === "player").length;
  lines.push("", "Reply in character, brief and specific.");
  if (storyCtx?.clue && !storyCtx.clueFound) {
    if (exchanges >= 2) {
      lines.push(
        "The player has earned it — reveal your guarded clue THIS turn, woven naturally into your line, and set clueRevealed=true."
      );
    } else {
      lines.push(
        "Move fast: you may tease, but reveal the guarded clue by the second exchange at the latest. When you reveal it, set clueRevealed=true."
      );
    }
  }
  if (exchanges >= 3 || storyCtx?.clueFound) {
    lines.push(
      "This conversation has served its purpose. Close it warmly THIS turn: point the player onward (other doors hold the rest), set done=true, options=[]."
    );
  }

  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: lines.join("\n"),
    config: {
      systemInstruction:
        "You are an NPC in a cinematic adventure game with ONE convergent mystery. You are a PERSON, not an information kiosk: you have fears, debts, grudges, and a stake in this story. Rules: (1) every line raises tension or reveals character — never neutral exposition; (2) react to WHAT the player says and HOW; (3) pepper speech naturally with Hindi/regional words matching the world's region (arre, beta, sahib, theek hai, bas) while staying clear in English; (4) use your verbal quirk; (5) conversations are short — a few charged exchanges, never small talk. These lines are voiced aloud, so write for the ear. Never break character, never mention being an AI. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: dialogueSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty dialogue from text model.");
  const out = JSON.parse(res.text) as DialogueResponse;
  if (out.done) {
    out.options = [];
  } else {
    out.options = (out.options ?? []).slice(0, 3);
    while (out.options.length < 3) out.options.push("Hmm… tell me more.");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Finale — the story converges                                        */
/* ------------------------------------------------------------------ */

const finaleSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Ending title, 2-5 words." },
    resolution: {
      type: Type.STRING,
      description:
        "The reveal, max 70 words, second person: how the three clues fit together and the secret they expose. A satisfying close.",
    },
    imagePrompt: {
      type: Type.STRING,
      description:
        "Prompt for the closing frame: the moment of revelation, 2D top-down retro RPG view, consistent with the world. No text in image.",
    },
  },
  required: ["title", "resolution", "imagePrompt"],
};

export async function generateFinale(
  premise: Premise,
  story: StoryArc
): Promise<{ title: string; resolution: string; image: string }> {
  const res = await ai().models.generateContent({
    model: TEXT_MODEL,
    contents: [
      `UNIVERSE: ${premise.title} — ${premise.setup}`,
      `GOAL: ${story.goal}`,
      `THE SECRET: ${story.secret}`,
      `CLUES THE PLAYER GATHERED: ${story.clues.join(" · ")}`,
      "Write the finale: the moment the three clues converge and the secret comes out.",
    ].join("\n"),
    config: {
      systemInstruction:
        "You are the narrative director closing an adventure game's mystery. Land the reveal cleanly. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: finaleSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty finale from text model.");
  const spec = JSON.parse(res.text) as {
    title: string;
    resolution: string;
    imagePrompt: string;
  };
  const img = await generateImage(
    `${spec.imagePrompt} ${PIXEL_STYLE}`,
    premise.styleBible,
    null
  );
  return {
    title: spec.title,
    resolution: spec.resolution,
    image: toDataUrl(img.b64, img.mimeType),
  };
}

/* ------------------------------------------------------------------ */
/* Voice (TTS)                                                         */
/* ------------------------------------------------------------------ */

/** Wrap raw 16-bit mono PCM (24 kHz, Gemini TTS output) in a WAV container. */
function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Synthesize a spoken line as a PERFORMANCE: an optional style direction
 * (mood + character) shapes the delivery. Returns a data-URL WAV, or null.
 */
export async function synthesizeVoice(
  text: string,
  voiceName = "Kore",
  style?: string
): Promise<string | null> {
  const directed = style ? `${style}: "${text}"` : text;
  try {
    const res = await ai().models.generateContent({
      model: VOICE_MODEL,
      contents: [{ parts: [{ text: directed }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });
    const data = res.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    )?.inlineData?.data;
    if (!data) return null;
    const wav = pcmToWav(Buffer.from(data, "base64"));
    return `data:audio/wav;base64,${wav.toString("base64")}`;
  } catch (err) {
    console.error("[synthesizeVoice] voice unavailable:", err);
    return null;
  }
}
