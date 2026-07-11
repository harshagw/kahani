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

/** Appended to every scene render so the world reads as one cozy game town. */
const ISO_STYLE =
  "Rendered as a cute miniature isometric video-game town diorama (Pokemon / HD-2D style): high-angle top-down 3/4 camera at ~60 degrees elevation, small charming buildings with large clearly-readable doorways, wide open walkable ground filling most of the frame, crisp clean game-art with soft shadows, no depth-of-field blur.";

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
        "One sentence of concrete art direction that every frame of this world will share: rendering style, lighting, palette, mood. e.g. 'Painterly dusk light, warm ochre palette, soft game-art rendering.'",
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
/* Walkability — a vision pass over the ACTUAL generated frame         */
/* ------------------------------------------------------------------ */

const walkabilitySchema = {
  type: Type.OBJECT,
  properties: {
    groundTop: {
      type: Type.INTEGER,
      description:
        "The y percent (0-100 from the top) where walkable ground begins in this image. The player may only walk below this line.",
    },
    obstacles: {
      type: Type.ARRAY,
      description:
        "Up to 8 boxes over DISCRETE solid objects the player clearly cannot stand on: a water body, a parked vehicle, a market stall, a counter, a fire. Each box tight around one object. NEVER box open street, floor, path, or ground — most of the walkable area must remain open. Ignore small clutter and background buildings above the ground plane.",
      items: rectSchema,
    },
    depthGrid: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description:
        "Exactly 160 integers: a 16-wide × 10-tall row-major grid over the image (top-left first). Each is the scene depth at that cell: 0 = nearest to the camera, 100 = farthest (sky/horizon). Estimate from perspective cues.",
    },
  },
  required: ["groundTop", "obstacles", "depthGrid"],
};

async function analyzeWalkability(
  b64: string,
  mimeType: string,
  keepClearNote: string
): Promise<{ groundTop: number; obstacles: Rect[]; depthGrid?: number[] }> {
  try {
    const res = await ai().models.generateContent({
      model: TEXT_MODEL,
      contents: [
        { inlineData: { data: b64, mimeType } },
        {
          text: `This is an isometric frame from an adventure game. The player character walks on the visible ground plane (streets, floors, boardwalks). Map its walkability. ${keepClearNote} Return ONLY the structured object.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: walkabilitySchema,
        temperature: 0.2,
      },
    });
    if (!res.text) throw new Error("empty walkability");
    const parsed = JSON.parse(res.text) as {
      groundTop: number;
      obstacles: Rect[];
      depthGrid?: number[];
    };
    const groundTop = Math.max(28, Math.min(80, Math.round(parsed.groundTop)));
    const depthGrid = Array.isArray(parsed.depthGrid)
      ? parsed.depthGrid
          .slice(0, 160)
          .map((v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0))))
      : undefined;
    let obstacles = (parsed.obstacles ?? []).slice(0, 8).map(clampRect);

    // Safety cap: the walk band must stay mostly open. An over-eager vision
    // pass that boxes the whole street would freeze the player in place —
    // drop the largest boxes until coverage is sane.
    const coverage = (boxes: Rect[]): number => {
      let blocked = 0;
      let total = 0;
      for (let x = 2; x <= 98; x += 4) {
        for (let y = groundTop; y <= 92; y += 4) {
          total++;
          if (boxes.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)) {
            blocked++;
          }
        }
      }
      return total ? blocked / total : 0;
    };
    while (obstacles.length > 0 && coverage(obstacles) > 0.5) {
      obstacles = [...obstacles]
        .sort((a, b) => b.w * b.h - a.w * a.h)
        .slice(1);
    }

    return { groundTop, obstacles, depthGrid };
  } catch (err) {
    console.error("[analyzeWalkability] falling back to open ground:", err);
    return { groundTop: 58, obstacles: [], depthGrid: undefined };
  }
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
        "Rich prompt for a miniature isometric game-town shot of this street/exterior, seen from high above like a tiny diorama. MOST of the frame is open walkable ground with NO people; small buildings with big distinct doorways sit around the edges. Authentic, era- and place-faithful detail for this universe. No text in image.",
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
  },
  required: ["title", "ambient", "questHook", "imagePrompt", "buildings"],
};

const interiorSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Name of this interior, 2-4 words." },
    ambient: { type: Type.STRING, description: "One line on entering, max 14 words." },
    imagePrompt: {
      type: Type.STRING,
      description:
        "Rich prompt for a miniature isometric game-room shot of this interior seen from high above, with ONE character (the NPC) visible. Most of the frame is open walkable floor; furniture hugs the walls. Authentic, era- and place-faithful detail for this universe. No text in image.",
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
  },
  required: ["title", "ambient", "imagePrompt", "npc", "npcZone", "exitZone"],
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
  };

  const img = await generateImage(
    `${spec.imagePrompt} ${ISO_STYLE}`,
    premise.styleBible,
    null
  );

  // Ground the collision map in the ACTUAL pixels that came back.
  const walk = await analyzeWalkability(
    img.b64,
    img.mimeType,
    "Do include boxes over any water, crowds, vehicles, and stalls."
  );

  const hotspots: Hotspot[] = spec.buildings.slice(0, 3).map((b, i) => ({
    id: `b${i}`,
    kind: "building",
    name: b.name,
    hint: b.hint,
    rect: clampRect(b.rect),
    interiorPrompt: b.interiorPrompt,
    clueIndex: i,
  }));

  return {
    id: "street",
    kind: "street",
    title: spec.title,
    ambient: spec.ambient,
    image: toDataUrl(img.b64, img.mimeType),
    hotspots,
    groundTop: walk.groundTop,
    obstacles: walk.obstacles,
    depthGrid: walk.depthGrid,
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
  };

  const img = await generateImage(
    `${spec.imagePrompt} ${ISO_STYLE}`,
    premise.styleBible,
    null
  );

  const walk = await analyzeWalkability(
    img.b64,
    img.mimeType,
    "Do NOT box the single main character (the shopkeeper/NPC) — the player must be able to approach them. Do box counters, furniture, and any water or fire."
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

  return {
    id: building.id,
    kind: "interior",
    title: spec.title,
    ambient: spec.ambient,
    image: toDataUrl(img.b64, img.mimeType),
    hotspots,
    npc: spec.npc,
    parentId: "street",
    groundTop: walk.groundTop,
    obstacles: walk.obstacles,
    depthGrid: walk.depthGrid,
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
    "Single small chibi-proportioned game character (about 3 heads tall, cute but not childish), standing relaxed, facing right, full body head to feet, seen from a high-angle top-down 3/4 game camera to match the scene.",
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
  storyCtx?: { clue: string | null; clueFound: boolean; exchanges: number }
): Promise<DialogueResponse> {
  const lines: string[] = [
    `UNIVERSE: ${premise.title} — ${premise.setup}`,
    `SCENE: ${sceneTitle}`,
    `QUEST THREAD: ${questHook}`,
    `YOU ARE: ${npc.name}, ${npc.role}. ${npc.persona}`,
  ];
  if (npc.quirk) lines.push(`YOUR VERBAL QUIRK (use it): ${npc.quirk}`);
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
        "Prompt for the closing frame: the moment of revelation, isometric 3/4 game-diorama view, consistent with the world. No text in image.",
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
    `${spec.imagePrompt} ${ISO_STYLE}`,
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
