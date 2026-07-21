import { Type } from "@google/genai";
import { generateContentWithRetry, generateImage, toDataUrl, type ImageResult } from "./gemini";
import {
  resolveSpeaker,
  synthesizeSarvamSpeech,
  VOICE_NAMES,
} from "./sarvam";
import type { Premise } from "./types";
import type {
  DialogueResponse,
  DialogueTurn,
  EdgeOpenness,
  GameBible,
  Hotspot,
  PlannedAction,
  PlannedItem,
  Rect,
  SceneData,
} from "./universe";

/** Appended to every scene render so the world reads as one retro RPG overworld. */
const PIXEL_STYLE =
  "Rendered as a TRUE overhead top-view 2D 16-bit retro RPG map (classic Pokemon overworld, camera pointing straight down at the ground): pure bird's-eye view, chunky clean pixel-art tiles, walkable paths/grass/paving filling most of the frame, buildings seen as ROOFS from above with their entrance door visible on the bottom edge, small props (wells, carts, pots) seen from directly above, bright flat colors, crisp pixel edges, no facades, no horizon, no sky, no perspective, no isometric angle.";

const TEXT_MODEL = process.env.TEXT_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";

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
/* The Game Bible — one planner call authors the whole game upfront    */
/* ------------------------------------------------------------------ */

const plannedItemSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "e.g. 'Rusty temple key', 'Torn ledger page'" },
    significance: {
      type: Type.STRING,
      description: "Why this object matters to the story, one line.",
    },
  },
  required: ["name", "significance"],
};

const plannedActionSchema = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: "Imperative, 2-5 words: 'Ring the temple bell'",
    },
    outcome: {
      type: Type.STRING,
      description: "What happens when performed, max 20 words, vivid.",
    },
    grantsItem: {
      type: Type.STRING,
      description: "Item gained by this action, or empty string.",
    },
    risk: {
      type: Type.STRING,
      description:
        "When suspicion > 0: what goes wrong / who notices, max 15 words. Empty string when harmless.",
    },
    suspicion: {
      type: Type.INTEGER,
      description:
        "Heat this action draws on the danger meter: 0 harmless, 15 risky, 30 reckless. Most actions are 0; make 1-2 per game genuinely costly.",
    },
  },
  required: ["name", "outcome", "grantsItem", "risk", "suspicion"],
};

const npcPlanSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    role: { type: Type.STRING, description: "e.g. 'chaiwala', 'retired archivist'" },
    persona: {
      type: Type.STRING,
      description: "2 sentences: temperament, their stake in the story, what they want.",
    },
    knows: {
      type: Type.STRING,
      description: "The information they hold — their guarded clue, in their own words.",
    },
    wants: {
      type: Type.STRING,
      description: "What softens them / earns their trust, one line.",
    },
    fears: { type: Type.STRING, description: "What they are afraid of, one line." },
    turnsHostileIf: {
      type: Type.STRING,
      description:
        "The ONE player mistake that makes them snap shut — an accusation, naming the wrong person, touching something sacred. Concrete and specific, one line.",
    },
    opening: {
      type: Type.STRING,
      description:
        "First spoken line when the player approaches — a dramatic hook signaling conflict, fear, or a secret in ≤18 words. May include one Hindi/regional word. Never a plain greeting.",
    },
    quirk: {
      type: Type.STRING,
      description:
        "A distinctive verbal habit, e.g. 'ends questions with hain na?', 'quotes his late wife'.",
    },
    voice: {
      type: Type.STRING,
      enum: [...VOICE_NAMES],
      description:
        "Sarvam Bulbul speaker id: aditya/rahul/anand = deep older male; varun/mohit = gravelly, intense; rohan/amit = quick, energetic; priya/neha = warm female; kavya/ishita = bright younger female.",
    },
  },
  required: [
    "name",
    "role",
    "persona",
    "knows",
    "wants",
    "fears",
    "turnsHostileIf",
    "opening",
    "quirk",
    "voice",
  ],
};

const roomPlanSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "e.g. 'Chai Tapri', 'Old Bookshop'" },
    hint: { type: Type.STRING, description: "Near-door hint on the street, max 8 words." },
    description: {
      type: Type.STRING,
      description: "What it looks like inside, 2 sentences — used to paint the room.",
    },
    storyRole: {
      type: Type.STRING,
      description: "What this room contributes to the story spine, one line.",
    },
    hazard: {
      type: Type.STRING,
      description:
        "The room-specific way to get in trouble here, one line. e.g. 'Prying open the shrine box while the priest watches.'",
    },
    items: {
      type: Type.ARRAY,
      items: plannedItemSchema,
      description: "1-2 collectible objects inside, story-flavored.",
    },
    actions: {
      type: Type.ARRAY,
      items: plannedActionSchema,
      description: "1-2 environmental interactions inside. At least one should carry risk.",
    },
  },
  required: ["name", "hint", "description", "storyRole", "hazard", "items", "actions"],
};

const bibleSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "World name, 2-4 words." },
    setting: {
      type: Type.STRING,
      description:
        "Place, era, atmosphere — 3-4 sentences. Faithful to the player's idea; invent the missing pieces.",
    },
    styleBible: {
      type: Type.STRING,
      description:
        "One sentence of PALETTE and MOOD only — rendering style is fixed elsewhere. e.g. 'Warm dusk palette, monsoon-wet stone, lantern glows.'",
    },
    protagonist: {
      type: Type.STRING,
      description:
        "Two second-person sentences: who the player is and what pulls them into this world.",
    },
    story: {
      type: Type.OBJECT,
      description:
        "The ONE hidden story this whole world converges toward. Not a sandbox — a mystery with an answer.",
      properties: {
        goal: {
          type: Type.STRING,
          description: "Player-facing objective, one line, max 12 words.",
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
            "Exactly 3 concrete clues that together expose the secret. Clue i is guarded by NPC i in room i. Each one line.",
        },
      },
      required: ["goal", "secret", "clues"],
    },
    beats: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "3-5 story beats: what must happen, in order, for the mystery to resolve. Each one line.",
    },
    winCondition: {
      type: Type.STRING,
      description:
        "Concretely: what must be true for the player to win, one line. e.g. 'All three clues gathered, then confront the truth.'",
    },
    heatLabel: {
      type: Type.STRING,
      description:
        "One-word name for this world's danger meter, fitting the fiction: 'Suspicion', 'Alarm', 'Curse', 'Scandal'.",
    },
    failStates: {
      type: Type.ARRAY,
      description:
        "2-3 ways the run can sour. Exactly ONE must be kind 'hard' with trigger 'the danger meter reaches 100'; the rest are 'soft' setbacks (an NPC turns hostile, an item is lost).",
      items: {
        type: Type.OBJECT,
        properties: {
          trigger: { type: Type.STRING, description: "What sets it off, one line." },
          kind: { type: Type.STRING, enum: ["soft", "hard"] },
          consequence: { type: Type.STRING, description: "What it costs the player, one line." },
        },
        required: ["trigger", "kind", "consequence"],
      },
    },
    street: {
      type: Type.OBJECT,
      description: "The open street/exterior connecting the three rooms.",
      properties: {
        name: { type: Type.STRING, description: "Name of this street/area, 2-4 words." },
        description: {
          type: Type.STRING,
          description: "What the street looks like, 2 sentences — used to paint it.",
        },
        items: {
          type: Type.ARRAY,
          items: plannedItemSchema,
          description: "1-2 collectible objects lying in the open.",
        },
        actions: {
          type: Type.ARRAY,
          items: plannedActionSchema,
          description: "1-2 environmental interactions in the open.",
        },
      },
      required: ["name", "description", "items", "actions"],
    },
    rooms: {
      type: Type.ARRAY,
      items: roomPlanSchema,
      description:
        "Exactly 3 enterable places. Room 1 houses the keeper of clue 1, room 2 of clue 2, room 3 of clue 3.",
    },
    npcs: {
      type: Type.ARRAY,
      items: npcPlanSchema,
      description:
        "Exactly 3 characters. NPC i lives in room i and guards clue i — their persona must make them a believable keeper of it.",
    },
    musicTheme: {
      type: Type.STRING,
      enum: [
        "noir-rain",
        "mountain-air",
        "bazaar-dusk",
        "backwater-dawn",
        "haunted-hollow",
        "crown-ember",
        "first-light",
        "wandering-heart",
      ],
      description:
        "Background music that best fits this world's MOOD: noir-rain = dark urban mystery/crime/rainy night; mountain-air = vast, sacred, lonely, cold; bazaar-dusk = busy, vibrant, playful, market bustle; backwater-dawn = calm water, pastoral, gentle; haunted-hollow = horror, eerie, supernatural dread; crown-ember = epic, royal, war, heroic; first-light = romance, warmth, hope; wandering-heart = neutral adventure when nothing else fits.",
    },
  },
  required: [
    "musicTheme",
    "title",
    "setting",
    "styleBible",
    "protagonist",
    "story",
    "beats",
    "winCondition",
    "heatLabel",
    "failStates",
    "street",
    "rooms",
    "npcs",
  ],
};

function clampSuspicion(v: unknown): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(40, n));
}

/**
 * The planner: expand a player's freeform idea into the complete game —
 * universe, story spine, every room, every NPC, every fail state. Made once;
 * every later model call receives this document and referees against it.
 */
export async function generateBible(idea: string): Promise<GameBible> {
  const res = await generateContentWithRetry({
    model: TEXT_MODEL,
    contents: `PLAYER'S IDEA FOR THE OPENING SCENE / WORLD:\n${idea}\n\nAuthor the COMPLETE game bible for this idea: universe, one convergent mystery, story beats, the street, all 3 rooms, all 3 characters, and the failure rules. Everything downstream is generated from this document, so make every field concrete and specific — but keep prose tight: no field longer than its brief asks for.`,
    config: {
      systemInstruction:
        "You are the creative director authoring the complete design bible of an explorable adventure game rooted in India. Honor the player's idea — its named details, era, and tone. Unless the idea explicitly names a non-Indian setting, ground the world in India: real textures of its streets, ghats, hills, bazaars, monsoons, festivals, myths and folklore, with authentic names — never caricature. Design ONE tight mystery: a goal, a hidden secret, and exactly 3 clues that converge on it, each guarded by one character in one room. Design danger too: each character has a hostility tripwire, some actions draw heat, and one hard fail state ends the run at 100 heat. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: bibleSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty game bible from text model.");
  const bible = JSON.parse(res.text) as GameBible;

  // Normalize: the world engine hard-depends on 3 rooms / 3 NPCs / 3 clues.
  bible.story.clues = (bible.story.clues ?? []).slice(0, 3);
  while (bible.story.clues.length < 3) {
    bible.story.clues.push("A detail someone here is hiding.");
  }
  bible.rooms = (bible.rooms ?? []).slice(0, 3);
  bible.npcs = (bible.npcs ?? []).slice(0, 3);
  if (bible.rooms.length < 3 || bible.npcs.length < 3) {
    throw new Error("Planner returned an incomplete bible (rooms/npcs).");
  }
  bible.beats = (bible.beats ?? []).slice(0, 5);
  bible.heatLabel = bible.heatLabel?.trim() || "Suspicion";
  bible.failStates = (bible.failStates ?? []).slice(0, 3);
  for (const room of bible.rooms) {
    room.items = (room.items ?? []).slice(0, 2);
    room.actions = (room.actions ?? []).slice(0, 2);
    room.actions.forEach((a) => (a.suspicion = clampSuspicion(a.suspicion)));
  }
  bible.street.items = (bible.street.items ?? []).slice(0, 2);
  bible.street.actions = (bible.street.actions ?? []).slice(0, 2);
  bible.street.actions.forEach((a) => (a.suspicion = clampSuspicion(a.suspicion)));
  for (const npc of bible.npcs) {
    npc.voice = resolveSpeaker(npc.voice);
  }
  return bible;
}

/**
 * The bible as one canonical text block, prepended to EVERY downstream model
 * call. Byte-identical across calls, so the provider's implicit prompt cache
 * absorbs it; downstream models referee against this document instead of
 * inventing the world.
 */
export function bibleBrief(b: GameBible): string {
  const lines: string[] = [
    `=== GAME BIBLE: ${b.title} ===`,
    `SETTING: ${b.setting}`,
    `PROTAGONIST: ${b.protagonist}`,
    `GOAL: ${b.story.goal}`,
    `THE HIDDEN SECRET (spoiler — see rules below): ${b.story.secret}`,
    `STORY BEATS: ${b.beats.map((x, i) => `(${i + 1}) ${x}`).join(" ")}`,
    `WIN CONDITION: ${b.winCondition}`,
    `DANGER METER — "${b.heatLabel}" (0-100): careless play raises it; at 100 the run ends in defeat.`,
    `FAIL STATES: ${b.failStates
      .map((f) => `[${f.kind}] ${f.trigger} → ${f.consequence}`)
      .join(" | ")}`,
    `THE STREET — ${b.street.name}: ${b.street.description}`,
  ];
  b.rooms.forEach((r, i) => {
    const npc = b.npcs[i];
    lines.push(
      `ROOM ${i + 1} — ${r.name}: ${r.description} Story role: ${r.storyRole} Hazard: ${r.hazard}`,
      `  NPC ${i + 1}: ${npc.name}, ${npc.role}. ${npc.persona} Knows: ${npc.knows} Wants: ${npc.wants} Fears: ${npc.fears} TURNS HOSTILE IF: ${npc.turnsHostileIf}`,
      `  CLUE ${i + 1} (guarded by ${npc.name}): ${b.story.clues[i]}`
    );
  });
  lines.push(
    `RULES: never reveal or foreshadow the hidden secret before the finale; never hand a clue to the player outside its keeper; stay consistent with every fact above.`
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* The infinite loop: paint a frame → trace borders over it → read     */
/* both images into structured hotspots → repeat one screen over.      */
/* ------------------------------------------------------------------ */

export type Direction = "n" | "e" | "s" | "w";

const DIR_META: Record<Direction, { label: string; opposite: Direction }> = {
  n: { label: "NORTH", opposite: "s" },
  e: { label: "EAST", opposite: "w" },
  s: { label: "SOUTH", opposite: "n" },
  w: { label: "WEST", opposite: "e" },
};

/**
 * Pass 2 of the loop: hand the painted frame back to the image model and have
 * it trace bright magenta borders around everything it can identify. The
 * traced frame is the engine's "eyes" — pass 3 reads both frames together.
 */
async function traceFrame(b64: string, mimeType: string): Promise<ImageResult> {
  const prompt =
    "Reproduce this EXACT image unchanged, then draw crisp solid 4-pixel MAGENTA (#FF00FF) outlines around every distinct thing in it: each building or hut, each boat, cart, well, shrine, statue, bridge, large tree or tree cluster, each water body, and each path or clearing. Every outline must tightly hug the thing it marks. Do NOT recolor, move, add, or remove anything else — the only change is the magenta borders.";
  try {
    const res = await generateContentWithRetry({
      model: IMAGE_MODEL,
      contents: [
        { inlineData: { data: b64, mimeType } },
        { text: prompt },
      ],
      config: { responseModalities: ["Image"] },
    });
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          b64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
          fallback: false,
        };
      }
    }
    throw new Error("No traced image returned.");
  } catch (err) {
    console.error("[traceFrame] falling back to untraced frame:", err);
    return { b64, mimeType, fallback: true };
  }
}

const screenVisionSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Name of this area, 2-4 words." },
    ambient: {
      type: Type.STRING,
      description: "One atmospheric line shown on arrival, max 14 words.",
    },
    edges: {
      type: Type.OBJECT,
      description:
        "For each side of the frame: true if the terrain visibly continues (path, grass, open ground) so the player can walk off that side into the next screen; false if it is sealed by water, cliffs, or dense forest.",
      properties: {
        n: { type: Type.BOOLEAN },
        e: { type: Type.BOOLEAN },
        s: { type: Type.BOOLEAN },
        w: { type: Type.BOOLEAN },
      },
      required: ["n", "e", "s", "w"],
    },
    buildings: {
      type: Type.ARRAY,
      description:
        "Every enterable-looking building visible in the frame, each with the box where its doorway area sits. If one matches an UNPLACED bible room you were told about, set roomIndex to that room's number (0-2); otherwise roomIndex -1. At most ONE building per screen may claim a roomIndex.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "What this building is, 2-4 words." },
          hint: { type: Type.STRING, description: "Near-door hint, max 8 words." },
          roomIndex: {
            type: Type.INTEGER,
            description: "0-2 when this IS that bible room, else -1.",
          },
          rect: rectSchema,
        },
        required: ["name", "hint", "roomIndex", "rect"],
      },
    },
    items: {
      type: Type.ARRAY,
      description:
        "0-2 small collectible objects actually VISIBLE in the frame (pots, tools, papers, offerings), story-flavored for this world, each boxed where it sits.",
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
        "1-2 environmental interactions using props actually VISIBLE in the frame (ring, search, peek, light, draw water…). Give suspicion 15-30 to at most one genuinely rash action, 0 to the rest.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Imperative, 2-5 words." },
          hint: { type: Type.STRING, description: "Near hint, max 8 words." },
          outcome: { type: Type.STRING, description: "What happens, max 20 words, vivid." },
          grantsItem: { type: Type.STRING, description: "Item gained, or empty string." },
          risk: {
            type: Type.STRING,
            description: "When suspicion > 0: what goes wrong, max 15 words. Else empty.",
          },
          suspicion: {
            type: Type.INTEGER,
            description: "Heat drawn: 0 harmless, 15 risky, 30 reckless.",
          },
          rect: rectSchema,
        },
        required: ["name", "hint", "outcome", "grantsItem", "risk", "suspicion", "rect"],
      },
    },
  },
  required: ["title", "ambient", "edges", "buildings", "items", "actions"],
};

/**
 * One turn of the infinite loop: paint the screen at (x,y), trace it, then
 * read both frames into hotspots + open edges. Neighboring screens use the
 * previous frame as a reference so the terrain continues seamlessly.
 */
export async function generateScreen(
  bible: GameBible,
  x: number,
  y: number,
  /** Direction the player walked to get here (from the previous screen). */
  arriveFrom: Direction | null,
  /** Previous screen's frame (base64, no data-url prefix) for continuity. */
  prevImage: string | null,
  /** Bible rooms (0-2) not yet placed anywhere in the world. */
  unplacedRooms: number[]
): Promise<SceneData> {
  const id = `s${x}_${y}`;
  const isOrigin = x === 0 && y === 0;
  // Guarantee story progress: the next unplaced room is painted INTO the
  // frame, so the vision pass can anchor it to a real building.
  const roomToPlace = unplacedRooms.length > 0 ? unplacedRooms[0] : null;
  const roomLine =
    roomToPlace !== null
      ? `Prominently include a building that is clearly "${bible.rooms[roomToPlace].name}" (${bible.rooms[roomToPlace].hint}), its entrance door visible.`
      : "Include at most one or two modest flavor buildings, or none.";

  // --- Pass 1: paint the frame ---
  const imagePrompt = [
    isOrigin
      ? `${bible.street.name}: ${bible.street.description}`
      : `An adjoining stretch of the same world, immediately ${
          arriveFrom ? DIR_META[arriveFrom].label : "beyond"
        } of the reference frame. The terrain along the shared edge must continue seamlessly from the reference image. Introduce one or two fresh landmarks true to the setting.`,
    `World: ${bible.setting}`,
    roomLine,
    "MOST of the frame is open walkable tile ground with NO people. Small props (pots, carts, wells, boats) visible from above.",
  ].join(" ");
  const frame = await generateImage(
    `${imagePrompt} ${PIXEL_STYLE}`,
    bible.styleBible,
    prevImage
  );

  // --- Pass 2: the model traces borders over its own painting ---
  const traced = await traceFrame(frame.b64, frame.mimeType);

  // --- Pass 3: read both frames into structured hotspots ---
  const res = await generateContentWithRetry({
    model: TEXT_MODEL,
    contents: [
      { inlineData: { data: frame.b64, mimeType: frame.mimeType } },
      { inlineData: { data: traced.b64, mimeType: traced.mimeType } },
      {
        text: [
          bibleBrief(bible),
          "",
          "IMAGE 1 is a screen of this world. IMAGE 2 is the same frame with magenta borders traced around every distinct thing.",
          `UNPLACED BIBLE ROOMS: ${
            unplacedRooms.length
              ? unplacedRooms
                  .map((i) => `room ${i} = "${bible.rooms[i].name}"`)
                  .join(", ")
              : "(none — all rooms already exist elsewhere in the world)"
          }`,
          roomToPlace !== null
            ? `The frame was painted to contain "${bible.rooms[roomToPlace].name}" — find it and give that building roomIndex ${roomToPlace}.`
            : "",
          "TASK: catalog what is actually IN these frames. Use the magenta borders in IMAGE 2 to locate each thing precisely; every rect must tightly match the bordered area in percent coordinates (0-100 of frame width/height). Judge each frame edge: open ground continuing = true, water/cliff/dense forest = false. Invent nothing that is not visible.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    config: {
      systemInstruction:
        "You are the vision system of a game engine looking at frames of its own generated world. You turn pictures into precise interactive data, faithful to the game bible's tone. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: screenVisionSchema,
      temperature: 0.6,
    },
  });
  if (!res.text) throw new Error("Empty screen vision from text model.");
  const spec = JSON.parse(res.text) as {
    title: string;
    ambient: string;
    edges: EdgeOpenness;
    buildings: { name: string; hint: string; roomIndex: number; rect: Rect }[];
    items: { name: string; hint: string; rect: Rect }[];
    actions: {
      name: string;
      hint: string;
      outcome: string;
      grantsItem: string;
      risk: string;
      suspicion: number;
      rect: Rect;
    }[];
  };

  const hotspots: Hotspot[] = [];
  let roomClaimed = false;
  (spec.buildings ?? []).slice(0, 4).forEach((b, i) => {
    const wantsRoom =
      b.roomIndex >= 0 &&
      b.roomIndex <= 2 &&
      unplacedRooms.includes(b.roomIndex) &&
      !roomClaimed;
    if (wantsRoom) roomClaimed = true;
    hotspots.push({
      id: `${id}-b${i}`,
      kind: "building",
      name: wantsRoom ? bible.rooms[b.roomIndex].name : b.name,
      hint: wantsRoom ? bible.rooms[b.roomIndex].hint : b.hint,
      rect: clampRect(b.rect),
      clueIndex: wantsRoom ? b.roomIndex : undefined,
    });
  });
  (spec.items ?? []).slice(0, 2).forEach((it, i) =>
    hotspots.push({
      id: `${id}-item${i}`,
      kind: "item",
      name: it.name,
      hint: it.hint,
      rect: clampRect(it.rect),
      itemName: it.name,
    })
  );
  (spec.actions ?? []).slice(0, 2).forEach((a, i) =>
    hotspots.push({
      id: `${id}-act${i}`,
      kind: "action",
      name: a.name,
      hint: a.hint,
      rect: clampRect(a.rect),
      outcome: a.outcome,
      grantsItem: a.grantsItem?.trim() || undefined,
      suspicion: clampSuspicion(a.suspicion) || undefined,
      risk: a.risk?.trim() || undefined,
    })
  );

  const edges: EdgeOpenness = {
    n: Boolean(spec.edges?.n),
    e: Boolean(spec.edges?.e),
    s: Boolean(spec.edges?.s),
    w: Boolean(spec.edges?.w),
  };
  // Never strand the player: the way back stays open (walking east in means
  // the WEST edge leads back), and at least one edge must lead onward.
  if (arriveFrom) edges[DIR_META[arriveFrom].opposite] = true;
  if (!edges.n && !edges.e && !edges.s && !edges.w) edges.e = true;

  return {
    id,
    kind: "street",
    title: spec.title,
    ambient: spec.ambient,
    image: toDataUrl(frame.b64, frame.mimeType),
    annotated: traced.fallback ? undefined : toDataUrl(traced.b64, traced.mimeType),
    hotspots,
    coord: { x, y },
    edges,
  };
}

/** Interior hotspot builders: content comes from the bible, rects from layout. */
function itemHotspots(
  prefix: string,
  planned: PlannedItem[],
  rects: Rect[]
): Hotspot[] {
  return planned.map((it, i) => ({
    id: `${prefix}-item${i}`,
    kind: "item" as const,
    name: it.name,
    hint: it.significance.length <= 40 ? it.significance : "Something worth taking",
    rect: clampRect(rects[i] ?? { x: 40 + i * 15, y: 60, w: 8, h: 8 }),
    itemName: it.name,
  }));
}

function actionHotspots(
  prefix: string,
  planned: PlannedAction[],
  rects: Rect[]
): Hotspot[] {
  return planned.map((a, i) => ({
    id: `${prefix}-act${i}`,
    kind: "action" as const,
    name: a.name,
    hint: a.suspicion > 0 ? "Risky — but tempting" : "Worth a try",
    rect: clampRect(rects[i] ?? { x: 20 + i * 40, y: 55, w: 10, h: 10 }),
    outcome: a.outcome,
    grantsItem: a.grantsItem?.trim() || undefined,
    suspicion: a.suspicion > 0 ? a.suspicion : undefined,
    risk: a.risk?.trim() || undefined,
  }));
}

const interiorLayoutSchema = {
  type: Type.OBJECT,
  properties: {
    ambient: { type: Type.STRING, description: "One line on entering, max 14 words." },
    imagePrompt: {
      type: Type.STRING,
      description:
        "Rich prompt for a retro RPG interior of THIS room as described in the bible (classic Pokemon house-interior style, near-top-down), with ONE character — the room's NPC — visible and matching their described role. Most of the frame is open walkable tiled floor; furniture hugs the walls. Authentic, era- and place-faithful detail. No text in image.",
    },
    npcZone: {
      ...rectSchema,
      description: "Where the NPC stands in the image (approach to talk).",
    },
    exitZone: {
      ...rectSchema,
      description: "Where the exit door is (walk there to leave).",
    },
    itemRects: {
      type: Type.ARRAY,
      items: rectSchema,
      description:
        "One box per listed room item, same order, on floors/tables where it appears in your image.",
    },
    actionRects: {
      type: Type.ARRAY,
      items: rectSchema,
      description:
        "One box per listed room action, same order, at the prop it uses in your image.",
    },
  },
  required: ["ambient", "imagePrompt", "npcZone", "exitZone", "itemRects", "actionRects"],
};

export async function generateInteriorScene(
  bible: GameBible,
  roomIndex: number,
  /** The overworld screen this room's building stands on. */
  parentId = "s0_0"
): Promise<SceneData> {
  const room = bible.rooms[roomIndex];
  const npc = bible.npcs[roomIndex];
  if (!room || !npc) throw new Error(`No room ${roomIndex} in the bible.`);
  const id = `b${roomIndex}`;

  const res = await generateContentWithRetry({
    model: TEXT_MODEL,
    contents: [
      bibleBrief(bible),
      "",
      `TASK: lay out ROOM ${roomIndex + 1} — "${room.name}" — exactly as the bible describes it, with ${npc.name} (${npc.role}) visible inside. You are placing, not inventing.`,
      `Room items to place, in order: ${room.items
        .map((it, i) => `${i + 1}. ${it.name}`)
        .join("  ") || "(none)"}`,
      `Room actions to place, in order: ${room.actions
        .map((a, i) => `${i + 1}. ${a.name}`)
        .join("  ") || "(none)"}`,
      "Write the imagePrompt for this exact room and return the boxes: npcZone, exitZone, and one box per listed item and action.",
    ].join("\n"),
    config: {
      systemInstruction:
        "You are the level-layout artist of an explorable adventure game. The game bible has already authored all content; your job is composition: paint the described room and return accurate percent-coordinate boxes matching your image. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: interiorLayoutSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty interior layout from text model.");
  const spec = JSON.parse(res.text) as {
    ambient: string;
    imagePrompt: string;
    npcZone: Rect;
    exitZone: Rect;
    itemRects: Rect[];
    actionRects: Rect[];
  };

  const img = await generateImage(
    `${spec.imagePrompt} ${PIXEL_STYLE}`,
    bible.styleBible,
    null
  );

  const hotspots: Hotspot[] = [
    {
      id: `${id}-npc`,
      kind: "npc",
      name: npc.name,
      hint: `${npc.role} — press E to talk`,
      rect: clampRect(spec.npcZone),
    },
    {
      id: `${id}-exit`,
      kind: "exit",
      name: "Back to the street",
      hint: "press E to leave",
      rect: clampRect(spec.exitZone),
    },
    ...itemHotspots(id, room.items, spec.itemRects ?? []),
    ...actionHotspots(id, room.actions, spec.actionRects ?? []),
  ];

  return {
    id,
    kind: "interior",
    title: room.name,
    ambient: spec.ambient,
    image: toDataUrl(img.b64, img.mimeType),
    hotspots,
    npc: {
      name: npc.name,
      role: npc.role,
      persona: npc.persona,
      opening: npc.opening,
      quirk: npc.quirk,
      voice: npc.voice,
    },
    parentId,
    clueIndex: roomIndex,
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
    offense: {
      type: Type.STRING,
      enum: ["none", "minor", "grave"],
      description:
        "Referee the player's LAST line against this character. 'grave' ONLY if it trips the character's TURNS HOSTILE IF wire from the bible. 'minor' for rudeness, threats, or careless pressure that stings. Otherwise 'none' — most lines are 'none'.",
    },
    done: {
      type: Type.BOOLEAN,
      description: "True when the NPC closes the conversation.",
    },
  },
  required: ["line", "mood", "options", "clueRevealed", "offense", "done"],
};

export async function generateDialogue(
  bible: GameBible,
  npcIndex: number,
  history: DialogueTurn[],
  playerLine: string | null,
  storyCtx?: {
    clueFound: boolean;
    exchanges: number;
    inventory?: string[];
    /** Current danger-meter value 0..100. */
    heat?: number;
  }
): Promise<DialogueResponse> {
  const npc = bible.npcs[npcIndex];
  const room = bible.rooms[npcIndex];
  if (!npc || !room) throw new Error(`No NPC ${npcIndex} in the bible.`);
  const clue = bible.story.clues[npcIndex];

  const lines: string[] = [
    bibleBrief(bible),
    "",
    `YOU ARE NPC ${npcIndex + 1}: ${npc.name}, in ${room.name}. Play them exactly as the bible defines: persona, wants, fears, quirk.`,
    `YOUR VERBAL QUIRK (use it): ${npc.quirk}`,
  ];
  if (storyCtx?.inventory?.length) {
    lines.push(
      `THE PLAYER VISIBLY CARRIES: ${storyCtx.inventory.join(", ")} — react to these when it makes sense.`
    );
  }
  const heat = storyCtx?.heat ?? 0;
  if (heat >= 60) {
    lines.push(
      `The ${bible.heatLabel} meter is at ${heat}/100 — word of the player's blundering has reached you. Open wary; make them feel it.`
    );
  }
  lines.push(
    "",
    "CONVERSATION SO FAR:",
    ...history.map((t) => `${t.speaker === "npc" ? npc.name : "Player"}: ${t.text}`)
  );
  if (playerLine) lines.push(`Player: ${playerLine}`);

  const exchanges = storyCtx?.exchanges ?? history.filter((t) => t.speaker === "player").length;
  lines.push(
    "",
    "Reply in character, brief and specific.",
    `REFEREE the player's last line: if it trips your TURNS HOSTILE IF wire (${npc.turnsHostileIf}), set offense='grave', refuse the clue, and slam the conversation shut (done=true, options=[]). Rudeness or careless pressure that merely stings is offense='minor'. Otherwise offense='none'.`
  );
  if (!storyCtx?.clueFound) {
    if (exchanges >= 2) {
      lines.push(
        "Unless the offense is grave: the player has earned it — reveal your guarded clue THIS turn, woven naturally into your line, and set clueRevealed=true."
      );
    } else {
      lines.push(
        "Move fast: you may tease, but reveal the guarded clue by the second exchange at the latest (never on a grave offense). When you reveal it, set clueRevealed=true."
      );
    }
  }
  if (exchanges >= 3 || storyCtx?.clueFound) {
    lines.push(
      "This conversation has served its purpose. Close it warmly THIS turn: point the player onward (other doors hold the rest), set done=true, options=[]."
    );
  }

  const res = await generateContentWithRetry({
    model: TEXT_MODEL,
    contents: lines.join("\n"),
    config: {
      systemInstruction:
        "You are an NPC in a cinematic adventure game with ONE convergent mystery, AND the referee of the game bible you are given. You are a PERSON, not an information kiosk: you have fears, debts, grudges, and a stake in this story. Rules: (1) every line raises tension or reveals character — never neutral exposition; (2) react to WHAT the player says and HOW; (3) pepper speech naturally with Hindi/regional words matching the world's region (arre, beta, sahib, theek hai, bas) while staying clear in English; (4) use your verbal quirk; (5) conversations are short — a few charged exchanges, never small talk; (6) NEVER reveal or hint at the bible's hidden secret, and never speak the other NPCs' clues — only your own; (7) judge offenses honestly: the player must be able to get this wrong. These lines are voiced aloud, so write for the ear. Never break character, never mention being an AI. Return ONLY the structured object.",
      responseMimeType: "application/json",
      responseSchema: dialogueSchema,
      temperature: 1.0,
    },
  });
  if (!res.text) throw new Error("Empty dialogue from text model.");
  const out = JSON.parse(res.text) as DialogueResponse;
  if (out.offense !== "minor" && out.offense !== "grave") out.offense = "none";
  // A grave offense always slams the conversation shut and keeps the clue.
  if (out.offense === "grave") {
    out.done = true;
    out.clueRevealed = false;
  }
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
        "The closing narration, max 70 words, second person. Victory: how the three clues fit together and the secret they expose. Defeat: how the player's carelessness caught up with them — the fail state's consequence made vivid, the secret left buried.",
    },
    imagePrompt: {
      type: Type.STRING,
      description:
        "Prompt for the closing frame: the moment of revelation (or downfall), 2D top-down retro RPG view, consistent with the world. No text in image.",
    },
  },
  required: ["title", "resolution", "imagePrompt"],
};

export type FinaleOutcome = "victory" | "defeat";

export async function generateFinale(
  bible: GameBible,
  outcome: FinaleOutcome = "victory",
  reason?: string
): Promise<{ title: string; resolution: string; image: string; outcome: FinaleOutcome }> {
  const res = await generateContentWithRetry({
    model: TEXT_MODEL,
    contents: [
      bibleBrief(bible),
      "",
      outcome === "victory"
        ? "Write the VICTORY finale: the moment the three clues converge and the hidden secret finally comes out, plainly stated."
        : `Write the DEFEAT finale: the run has ended because ${
            reason || `the ${bible.heatLabel} meter reached 100`
          }. Show the consequence landing; the secret stays buried — do NOT reveal it.`,
    ].join("\n"),
    config: {
      systemInstruction:
        "You are the narrative director closing an adventure game. Land the ending cleanly, faithful to the game bible. Return ONLY the structured object.",
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
    bible.styleBible,
    null
  );
  return {
    title: spec.title,
    resolution: spec.resolution,
    image: toDataUrl(img.b64, img.mimeType),
    outcome,
  };
}

/* ------------------------------------------------------------------ */
/* Voice (TTS) — Sarvam Bulbul v3                                      */
/* ------------------------------------------------------------------ */

/**
 * Synthesize a spoken NPC line. Pace and temperature shape delivery.
 * Returns a data-URL WAV, or null when TTS is unavailable.
 */
export async function synthesizeVoice(
  text: string,
  voiceName?: string,
  opts?: { pace?: number; temperature?: number }
): Promise<string | null> {
  return synthesizeSarvamSpeech(text, voiceName, opts);
}
