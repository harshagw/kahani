"use client";

/**
 * Explorable world orchestrator: generation, persistence, load/resume, and play.
 *
 * - **Create mode** (`/play/new`): bible → game row → boot → incremental saves.
 * - **Load mode** (`/play/[id]`): hydrate from Storage; owners may still generate.
 * - **Visitors**: finite world — edges without saved neighbors act as walls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  DoorOpen,
  Eye,
  Flame,
  Package,
  Search,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import type {
  CreateGameResponse,
  FinaleData,
  FinaleOutcome,
  FullGameResponse,
  Premise,
  WorldDialogueState,
  WorldPhase,
  WorldProps,
} from "@/lib/types/client";
import type {
  DialogueResponse,
  DialogueTurn,
  GameBible,
  Hotspot,
  SceneData,
} from "@/lib/universe";
import { GEN_CALL_COST } from "@/lib/constants";
import {
  getCachedImage,
  preloadSceneImages,
  warmSceneImages,
} from "@/lib/image-cache";
import { GameCanvas, type ExitDirection } from "./GameCanvas";
import { DialogueBox } from "./DialogueBox";

export type { WorldProps };

/** Heat drawn by a dialogue misstep, judged by the NPC referee. */
const OFFENSE_HEAT = { none: 0, minor: 12, grave: 35 } as const;

/** Walking off an edge: neighbor delta, spawn point on arrival, word shown. */
const EDGE_META: Record<
  ExitDirection,
  { dx: number; dy: number; spawn: { x: number; y: number }; word: string }
> = {
  n: { dx: 0, dy: -1, spawn: { x: 50, y: 92 }, word: "north" },
  e: { dx: 1, dy: 0, spawn: { x: 5, y: 70 }, word: "east" },
  s: { dx: 0, dy: 1, spawn: { x: 50, y: 8 }, word: "south" },
  w: { dx: -1, dy: 0, spawn: { x: 95, y: 70 }, word: "west" },
};

const ORIGIN_ID = "s0_0";

/** Default opening dialogue options when approaching an NPC. */
const OPENING_OPTIONS = [
  "Who are you, really?",
  "Something's wrong here. Talk.",
  "I need your help.",
];

/** TTS performance hint derived from NPC role and mood. */
function voiceStyle(npc: { role?: string } | null, mood?: string): string {
  const m = mood ? `in a ${mood} tone` : "with dramatic feeling";
  return `As a ${npc?.role ?? "character"} in an Indian adventure story, say this ${m}`;
}

/** True when the value is an inline `data:` URL from live generation. */
function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

/** True when the value is a remote URL (e.g. Supabase Storage). */
function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Turn a white-background sprite into a transparent canvas for the game loop.
 * Sets `crossOrigin` for Storage URLs so pixel data can be read.
 */
async function chromaKeySprite(src: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  if (isRemoteUrl(src)) img.crossOrigin = "anonymous";
  img.src = src;
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("sprite load failed"));
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (r > 232 && g > 232 && b > 232) {
      px[i + 3] = 0;
    } else if (r > 215 && g > 215 && b > 215) {
      px[i + 3] = Math.round(px[i + 3] * 0.4);
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

async function request<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

/** JSON fetch helper for generation APIs (`POST`). */
async function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** JSON fetch helper for persistence APIs (`PUT`). */
async function put<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Strip the `data:…;base64,` prefix for Gemini continuity payloads. */
function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Build `/api/screen` continuity fields from inline or Storage neighbor images. */
function prevScreenPayload(prevScene: SceneData | null) {
  if (!prevScene) return { prevImage: null as string | null, prevImageUrl: null as string | null };
  if (isDataUrl(prevScene.image)) {
    return { prevImage: stripDataUrl(prevScene.image), prevImageUrl: null };
  }
  return { prevImage: null, prevImageUrl: prevScene.image };
}

/** Build `/api/sprite` reference frame fields from inline or Storage origin image. */
function spriteReferencePayload(reference: string | null) {
  if (!reference) return { referenceFrame: null as string | null, referenceFrameUrl: null as string | null };
  if (isDataUrl(reference)) {
    return { referenceFrame: stripDataUrl(reference), referenceFrameUrl: null };
  }
  return { referenceFrame: null, referenceFrameUrl: reference };
}

/** Scan saved street scenes to learn which bible rooms are already placed. */
function rebuildPlacedRooms(scenes: Iterable<SceneData>): Set<number> {
  const placed = new Set<number>();
  for (const s of scenes) {
    if (s.kind !== "street") continue;
    for (const h of s.hotspots) {
      if (h.kind === "building" && typeof h.clueIndex === "number") {
        placed.add(h.clueIndex);
      }
    }
  }
  return placed;
}

/**
 * Main explorable world component.
 * @param props.mode - `"create"` starts fresh; `"load"` hydrates a saved game.
 * @param props.gameId - Required for load mode (`/play/[gameId]`).
 * @param props.initialIdea - Required for create mode (from `/play/new` via sessionStorage).
 */
export function World({ mode, gameId: routeGameId, initialIdea }: WorldProps) {
  const router = useRouter();
  /** Persisted game id — set after `POST /api/games` or on load. */
  const gameIdRef = useRef<string | null>(routeGameId ?? null);
  /** Owners may generate new scenes; visitors replay the finite saved world. */
  const canGenerateRef = useRef(mode === "create");
  /** Pre-saved finales from Storage (used on replay without regeneration). */
  const savedFinalesRef = useRef<Partial<Record<FinaleOutcome, FinaleData>>>({});
  const bootStartedRef = useRef(false);
  const createStartedRef = useRef(false);

  const [phase, setPhase] = useState<WorldPhase>("booting");
  const [premise, setPremise] = useState<Premise | null>(null);
  const [scene, setScene] = useState<SceneData | null>(null);
  const [questHook, setQuestHook] = useState("");
  const [bible, setBible] = useState<GameBible | null>(null);
  const [cluesFound, setCluesFound] = useState<boolean[]>([false, false, false]);
  const [heat, setHeat] = useState(0);
  const [finale, setFinale] = useState<FinaleData | null>(null);
  const [finaleLoading, setFinaleLoading] = useState(false);
  const [inventory, setInventory] = useState<string[]>([]);
  const [genCalls, setGenCalls] = useState(0);
  const [interiorsReady, setInteriorsReady] = useState(0);
  const addCalls = useCallback((n: number) => setGenCalls((c) => c + n), []);
  const [sprite, setSprite] = useState<HTMLCanvasElement | null>(null);
  const [bootStatus, setBootStatus] = useState("Loading your world…");
  const [entering, setEntering] = useState<string | null>(null);
  const [wandering, setWandering] = useState<string | null>(null);
  /** Brief overlay while a cached scene's Storage image finishes decoding. */
  const [assetLoading, setAssetLoading] = useState<string | null>(null);
  const [spawn, setSpawn] = useState<{ x: number; y: number } | null>(null);
  const [showVision, setShowVision] = useState(false);
  const [screensDreamed, setScreensDreamed] = useState(0);
  const [ambient, setAmbient] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [dialogue, setDialogue] = useState<WorldDialogueState | null>(null);

  const scenesRef = useRef<Map<string, SceneData>>(new Map());
  const interiorPromises = useRef<Map<string, Promise<SceneData>>>(new Map());
  const screenPromises = useRef<Map<string, Promise<SceneData>>>(new Map());
  const placedRoomsRef = useRef<Set<number>>(new Set());
  const voiceCache = useRef<Map<string, Promise<string | null>>>(new Map());
  const dialogueCache = useRef<Map<string, Promise<DialogueResponse>>>(new Map());
  const finalePromise = useRef<Promise<FinaleData | null> | null>(null);
  const defeatFinalePromise = useRef<Promise<FinaleData | null> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  /** Fire-and-forget persist of a generated scene to Storage + Postgres. */
  const saveScene = useCallback((s: SceneData) => {
    const id = gameIdRef.current;
    if (!id || !canGenerateRef.current) return;
    put(`/api/games/${id}/scenes/${s.id}`, s).catch(() => {});
  }, []);

  /** Fire-and-forget persist of the raw sprite render (before chroma-key). */
  const saveSprite = useCallback((dataUrl: string) => {
    const id = gameIdRef.current;
    if (!id || !canGenerateRef.current) return;
    put(`/api/games/${id}/sprite`, { sprite: dataUrl }).catch(() => {});
  }, []);

  /** Fire-and-forget persist of a generated finale image + copy. */
  const saveFinale = useCallback((outcome: FinaleOutcome, f: FinaleData) => {
    const id = gameIdRef.current;
    if (!id || !canGenerateRef.current) return;
    put(`/api/games/${id}/finales/${outcome}`, f).catch(() => {});
  }, []);

  const fetchVoice = useCallback(
    (text: string, voice?: string, style?: string): Promise<string | null> => {
      const key = `${voice ?? ""}|${style ?? ""}|${text}`;
      const hit = voiceCache.current.get(key);
      if (hit) return hit;
      const p = post<{ audio: string | null }>("/api/voice", { text, voice, style })
        .then(({ audio }) => {
          if (!audio) voiceCache.current.delete(key);
          return audio;
        })
        .catch(() => {
          voiceCache.current.delete(key);
          return null;
        });
      voiceCache.current.set(key, p);
      return p;
    },
    []
  );

  const speak = useCallback(
    async (text: string, voice?: string, style?: string) => {
      if (!voiceOnRef.current || !text.trim()) return;
      const audio = await fetchVoice(text, voice, style);
      if (!audio || !voiceOnRef.current) return;
      audioRef.current?.pause();
      const el = new Audio(audio);
      audioRef.current = el;
      setSpeaking(true);
      el.onended = () => setSpeaking(false);
      el.onerror = () => setSpeaking(false);
      await el.play().catch(() => setSpeaking(false));
    },
    [fetchVoice]
  );

  const stopVoice = useCallback(() => {
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  const showScene = useCallback((s: SceneData) => {
    scenesRef.current.set(s.id, s);
    setScene(s);
    setAmbient(s.ambient);
    setTimeout(() => setAmbient((a) => (a === s.ambient ? null : a)), 5000);
    warmSceneImages(s);
  }, []);

  /** Hold the current scene until backdrop images are decoded; optional overlay for cache hits. */
  const ensureSceneReady = useCallback(
    async (s: SceneData, loadingLabel?: string) => {
      const needsOverlay = loadingLabel && !getCachedImage(s.image);
      if (needsOverlay) setAssetLoading(loadingLabel);
      try {
        await preloadSceneImages(s);
      } finally {
        if (needsOverlay) setAssetLoading(null);
      }
    },
    []
  );

  const prefetchConversation = useCallback(
    (theBible: GameBible, s: SceneData) => {
      if (!canGenerateRef.current) return;
      const npc = s.npc;
      if (!npc || typeof s.clueIndex !== "number") return;
      fetchVoice(npc.opening, npc.voice, voiceStyle(npc, "wary"));
      for (const option of OPENING_OPTIONS) {
        const key = `${s.id}|${option}`;
        if (dialogueCache.current.has(key)) continue;
        const p = post<DialogueResponse>("/api/dialogue", {
          bible: theBible,
          npcIndex: s.clueIndex,
          history: [{ speaker: "npc", text: npc.opening }],
          playerLine: option,
          clueFound: false,
          exchanges: 1,
          heat: 0,
        }).then((reply) => {
          fetchVoice(reply.line, npc.voice, voiceStyle(npc, reply.mood));
          return reply;
        });
        p.catch(() => dialogueCache.current.delete(key));
        dialogueCache.current.set(key, p);
      }
    },
    [fetchVoice]
  );

  const prefetchInterior = useCallback(
    (theBible: GameBible, h: Hotspot, parentId: string) => {
      if (typeof h.clueIndex !== "number") return;
      const roomKey = `room${h.clueIndex}`;
      const interiorId = `b${h.clueIndex}`;
      const cached = scenesRef.current.get(interiorId);
      if (cached) return;
      if (!canGenerateRef.current) return;
      if (interiorPromises.current.has(roomKey)) return;
      const p = post<{ scene: SceneData }>("/api/scene", {
        bible: theBible,
        roomIndex: h.clueIndex,
        parentId,
      }).then(({ scene: s }) => {
        scenesRef.current.set(s.id, s);
        addCalls(GEN_CALL_COST.interior);
        setInteriorsReady((r) => r + 1);
        saveScene(s);
        warmSceneImages(s);
        prefetchConversation(theBible, s);
        return s;
      });
      p.catch(() => interiorPromises.current.delete(roomKey));
      interiorPromises.current.set(roomKey, p);
    },
    [addCalls, prefetchConversation, saveScene]
  );

  /**
   * Get-or-dream the screen at (x,y). Non-owners only receive cached scenes.
   * Saves to Storage after each successful generation.
   */
  const ensureScreen = useCallback(
    (
      theBible: GameBible,
      x: number,
      y: number,
      arriveFrom: ExitDirection | null,
      prevScene: SceneData | null
    ): Promise<SceneData> => {
      const id = `s${x}_${y}`;
      const cached = scenesRef.current.get(id);
      if (cached) return Promise.resolve(cached);
      if (!canGenerateRef.current) {
        return Promise.reject(new Error("The path ends here."));
      }
      const pending = screenPromises.current.get(id);
      if (pending) return pending;

      const unplacedRooms = [0, 1, 2].filter((i) => !placedRoomsRef.current.has(i));
      const p = post<{ scene: SceneData }>("/api/screen", {
        bible: theBible,
        x,
        y,
        arriveFrom,
        ...prevScreenPayload(prevScene),
        unplacedRooms,
      }).then(({ scene: s }) => {
        scenesRef.current.set(s.id, s);
        addCalls(GEN_CALL_COST.screen);
        setScreensDreamed((n) => n + 1);
        saveScene(s);
        warmSceneImages(s);
        for (const h of s.hotspots) {
          if (h.kind === "building" && typeof h.clueIndex === "number") {
            placedRoomsRef.current.add(h.clueIndex);
            prefetchInterior(theBible, h, s.id);
          }
        }
        return s;
      });
      p.catch(() => screenPromises.current.delete(id));
      screenPromises.current.set(id, p);
      return p;
    },
    [addCalls, prefetchInterior, saveScene]
  );

  const prefetchNeighbors = useCallback(
    (theBible: GameBible, s: SceneData) => {
      if (!canGenerateRef.current || !s.coord || !s.edges) return;
      (Object.keys(EDGE_META) as ExitDirection[]).forEach((dir) => {
        if (!s.edges![dir]) return;
        const { dx, dy } = EDGE_META[dir];
        ensureScreen(theBible, s.coord!.x + dx, s.coord!.y + dy, dir, s).catch(() => {});
      });
    },
    [ensureScreen]
  );

  const resetRunState = useCallback(() => {
    scenesRef.current = new Map();
    interiorPromises.current = new Map();
    screenPromises.current = new Map();
    placedRoomsRef.current = new Set();
    voiceCache.current = new Map();
    dialogueCache.current = new Map();
    finalePromise.current = null;
    defeatFinalePromise.current = null;
    savedFinalesRef.current = {};
    setScene(null);
    setSprite(null);
    setDialogue(null);
    setPremise(null);
    setBible(null);
    setCluesFound([false, false, false]);
    setHeat(0);
    setFinale(null);
    setFinaleLoading(false);
    setGenCalls(0);
    setInteriorsReady(0);
    setInventory([]);
    setWandering(null);
    setAssetLoading(null);
    setSpawn(null);
    setShowVision(false);
    setScreensDreamed(0);
  }, []);

  /** Populate refs and state from `GET /api/games/[id]`. */
  const hydrateLoadedGame = useCallback((game: FullGameResponse) => {
    gameIdRef.current = game.id;
    canGenerateRef.current = game.isOwner;
    savedFinalesRef.current = game.finales;
    setPremise(game.premise);
    setBible(game.bible);
    setQuestHook(game.bible.story.goal);

    const map = new Map<string, SceneData>();
    for (const s of game.scenes) {
      map.set(s.id, s);
      warmSceneImages(s);
    }
    scenesRef.current = map;
    placedRoomsRef.current = rebuildPlacedRooms(game.scenes);

    const streetCount = game.scenes.filter((s) => s.kind === "street").length;
    const interiorCount = game.scenes.filter((s) => s.kind === "interior").length;
    setScreensDreamed(streetCount);
    setInteriorsReady(interiorCount);
    setGenCalls(game.genCalls);

    if (game.finales.victory) {
      finalePromise.current = Promise.resolve(game.finales.victory);
    }
    if (game.finales.defeat) {
      defeatFinalePromise.current = Promise.resolve(game.finales.defeat);
    }
  }, []);

  const startSprite = useCallback(
    (chosen: Premise, origin: SceneData, existingUrl: string | null) => {
      if (existingUrl) {
        chromaKeySprite(existingUrl).then(setSprite).catch(() => {});
        return;
      }
      if (!canGenerateRef.current) return;
      post<{ sprite: string }>("/api/sprite", {
        premise: chosen,
        ...spriteReferencePayload(origin.image),
      })
        .then(({ sprite: raw }) => {
          addCalls(GEN_CALL_COST.sprite);
          saveSprite(raw);
          return chromaKeySprite(raw);
        })
        .then(setSprite)
        .catch(() => {});
    },
    [addCalls, saveSprite]
  );

  const startFinales = useCallback(
    (theBible: GameBible) => {
      if (!canGenerateRef.current) return;
      if (!savedFinalesRef.current.victory) {
        finalePromise.current = post<{ finale: FinaleData }>("/api/finale", {
          bible: theBible,
          outcome: "victory",
        })
          .then(({ finale: f }) => {
            addCalls(GEN_CALL_COST.finale);
            saveFinale("victory", f);
            fetchVoice(f.resolution, "Charon", "As a storyteller closing a mystery, say this with slow gravity");
            return f;
          })
          .catch(() => null);
      }
      if (!savedFinalesRef.current.defeat) {
        defeatFinalePromise.current = post<{ finale: FinaleData }>("/api/finale", {
          bible: theBible,
          outcome: "defeat",
        })
          .then(({ finale: f }) => {
            addCalls(GEN_CALL_COST.finale);
            saveFinale("defeat", f);
            return f;
          })
          .catch(() => null);
      }
    },
    [addCalls, fetchVoice, saveFinale]
  );

  /** Paint origin, sprite, neighbors, and finales for a newly created game row. */
  const bootWorld = useCallback(
    async (theBible: GameBible, chosen: Premise, spriteUrl: string | null) => {
      setBootStatus("Painting the first screen… then teaching the engine to see it…");
      const origin =
        scenesRef.current.get(ORIGIN_ID) ??
        (await ensureScreen(theBible, 0, 0, null, null));
      setSpawn(null);
      await ensureSceneReady(origin);
      showScene(origin);
      setPhase("playing");
      startSprite(chosen, origin, spriteUrl);
      prefetchNeighbors(theBible, origin);
      startFinales(theBible);
    },
    [ensureSceneReady, ensureScreen, prefetchNeighbors, showScene, startFinales, startSprite]
  );

  /** Fetch a saved game and enter play (or resume boot for incomplete owner games). */
  const loadGame = useCallback(
    async (id: string) => {
      resetRunState();
      setPhase("booting");
      setError(null);
      setBootStatus("Loading your world…");
      try {
        const game = await request<FullGameResponse>(`/api/games/${id}`);
        hydrateLoadedGame(game);

        const origin = scenesRef.current.get(ORIGIN_ID);
        if (origin) {
          await ensureSceneReady(origin);
          showScene(origin);
          setPhase("playing");
          startSprite(game.premise, origin, game.spriteUrl);
          if (game.isOwner) {
            prefetchNeighbors(game.bible, origin);
            startFinales(game.bible);
          }
          return;
        }

        if (game.isOwner) {
          await bootWorld(game.bible, game.premise, game.spriteUrl);
          return;
        }

        throw new Error("This world has not been built yet.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load world.");
        router.push("/");
      }
    },
    [bootWorld, ensureSceneReady, hydrateLoadedGame, prefetchNeighbors, resetRunState, router, showScene, startFinales, startSprite]
  );

  /** Create flow step 1: bible + game row, then redirect to `/play/[id]` for boot. */
  const beginCreate = useCallback(
    async (idea: string) => {
      resetRunState();
      setPhase("booting");
      setError(null);
      setBootStatus("Writing your game's bible…");
      canGenerateRef.current = true;

      try {
        const { bible: theBible } = await post<{ bible: GameBible }>("/api/universe", { idea });
        const chosen: Premise = {
          id: "custom",
          title: theBible.title,
          tagline: "",
          setup: theBible.protagonist,
          emoji: "✦",
          styleBible: theBible.styleBible,
          goal: theBible.story.goal,
          goalLabel: "",
          goalEmoji: "",
          clockLabel: "",
        };
        addCalls(GEN_CALL_COST.universe);

        const created = await post<CreateGameResponse>("/api/games", {
          idea,
          bible: theBible,
          premise: chosen,
        });
        gameIdRef.current = created.id;
        router.replace(`/play/${created.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "World generation failed.");
        router.push("/");
      }
    },
    [addCalls, resetRunState, router]
  );

  useEffect(() => {
    if (mode === "load" && routeGameId && !bootStartedRef.current) {
      bootStartedRef.current = true;
      loadGame(routeGameId);
    }
  }, [mode, routeGameId, loadGame]);

  useEffect(() => {
    if (mode === "create" && initialIdea && !createStartedRef.current) {
      createStartedRef.current = true;
      beginCreate(initialIdea);
    }
  }, [mode, initialIdea, beginCreate]);

  const onInteract = useCallback(
    async (h: Hotspot) => {
      if (!premise || !scene) return;

      if (h.kind === "exit") {
        stopVoice();
        setDialogue(null);
        const parent = scenesRef.current.get(scene.parentId ?? ORIGIN_ID);
        if (parent) {
          setSpawn(null);
          await ensureSceneReady(parent, parent.title);
          showScene(parent);
        }
        return;
      }

      if (h.kind === "item" && h.itemName) {
        setInventory((inv) => (inv.includes(h.itemName!) ? inv : [...inv, h.itemName!]));
        const updated = {
          ...scene,
          hotspots: scene.hotspots.filter((x) => x.id !== h.id),
        };
        scenesRef.current.set(updated.id, updated);
        setScene(updated);
        setAmbient(`Picked up: ${h.itemName}`);
        setTimeout(() => setAmbient(null), 3500);
        return;
      }

      if (h.kind === "action") {
        if (h.grantsItem) {
          const item = h.grantsItem;
          setInventory((inv) => (inv.includes(item) ? inv : [...inv, item]));
        }
        const drawn = h.suspicion ?? 0;
        if (drawn > 0) setHeat((v) => Math.min(100, v + drawn));
        const outcomeLine = h.outcome
          ? h.grantsItem
            ? `${h.outcome} (+ ${h.grantsItem})`
            : h.outcome
          : `${h.name} — done.`;
        setAmbient(drawn > 0 && h.risk ? `${outcomeLine} — ${h.risk}` : outcomeLine);
        setTimeout(() => setAmbient(null), 4500);
        const updated = {
          ...scene,
          hotspots: scene.hotspots.filter((x) => x.id !== h.id),
        };
        scenesRef.current.set(updated.id, updated);
        if (h.leadsOutside) {
          const parent = scenesRef.current.get(scene.parentId ?? ORIGIN_ID);
          if (parent) {
            setSpawn(null);
            await ensureSceneReady(parent, parent.title);
            showScene(parent);
            return;
          }
        }
        setScene(updated);
        return;
      }

      if (h.kind === "npc" && scene.npc) {
        const opening = scene.npc.opening;
        setDialogue({
          npc: scene.npc,
          history: [{ speaker: "npc", text: opening }],
          options: OPENING_OPTIONS,
          thinking: false,
        });
        speak(opening, scene.npc.voice, voiceStyle(scene.npc, "wary"));
        return;
      }

      if (h.kind === "building" && bible) {
        if (typeof h.clueIndex !== "number") {
          setAmbient(`${h.name} — the door is bolted shut.`);
          setTimeout(() => setAmbient(null), 3000);
          return;
        }
        setEntering(h.name);
        try {
          let interior = scenesRef.current.get(`b${h.clueIndex}`);
          if (!interior) {
            if (!canGenerateRef.current) {
              setAmbient(`${h.name} — the door won't budge.`);
              setTimeout(() => setAmbient(null), 3000);
              return;
            }
            prefetchInterior(bible, h, scene.id);
            interior = await interiorPromises.current.get(`room${h.clueIndex}`);
          }
          if (interior) {
            setSpawn(null);
            await ensureSceneReady(interior);
            showScene(interior);
          }
        } catch {
          setError(`Couldn't step into ${h.name}. Try again.`);
          setTimeout(() => setError(null), 4000);
        } finally {
          setEntering(null);
        }
      }
    },
    [bible, ensureSceneReady, prefetchInterior, premise, scene, showScene, speak, stopVoice]
  );

  /** Walking off an open edge — generates for owners, walls for visitors without a neighbor. */
  const onExitEdge = useCallback(
    async (dir: ExitDirection) => {
      if (!bible || !scene?.coord) return;
      const { dx, dy, spawn: arriveAt, word } = EDGE_META[dir];
      const nx = scene.coord.x + dx;
      const ny = scene.coord.y + dy;
      const neighborId = `s${nx}_${ny}`;
      let next = scenesRef.current.get(neighborId) ?? null;
      const fromCache = Boolean(next);
      if (!next) {
        if (!canGenerateRef.current) return;
        setWandering(word);
        try {
          next = await ensureScreen(bible, nx, ny, dir, scene);
        } catch {
          setError("The path ahead dissolved into mist. Try again.");
          setTimeout(() => setError(null), 4000);
          return;
        } finally {
          setWandering(null);
        }
      }
      setSpawn(arriveAt);
      await ensureSceneReady(next, fromCache ? `Heading ${word}` : undefined);
      showScene(next);
      prefetchNeighbors(bible, next);
    },
    [bible, ensureSceneReady, ensureScreen, prefetchNeighbors, scene, showScene]
  );

  const onSay = useCallback(
    async (line: string) => {
      if (!bible || !scene?.npc || !dialogue) return;
      const history: DialogueTurn[] = [...dialogue.history, { speaker: "player", text: line }];
      setDialogue({ ...dialogue, history, options: [], thinking: true });
      const clueIndex = scene.clueIndex;
      const hasClue = typeof clueIndex === "number";
      if (!hasClue) return;
      try {
        const isFirstTurn = history.filter((t) => t.speaker === "player").length === 1;
        const cached =
          isFirstTurn && heat < 60
            ? dialogueCache.current.get(`${scene.id}|${line}`)
            : undefined;
        let reply: DialogueResponse;
        if (cached) {
          reply = await cached;
        } else {
          reply = await post<DialogueResponse>("/api/dialogue", {
            bible,
            npcIndex: clueIndex,
            history: dialogue.history,
            playerLine: line,
            clueFound: cluesFound[clueIndex],
            exchanges: history.filter((t) => t.speaker === "player").length,
            inventory,
            heat,
          });
        }
        const offense = reply.offense ?? "none";
        if (offense !== "none") {
          setHeat((v) => Math.min(100, v + OFFENSE_HEAT[offense]));
          setAmbient(
            offense === "grave"
              ? `${dialogue.npc.name} turns cold. ${bible.heatLabel} spreads through the street.`
              : `That stung. ${bible.heatLabel} rises.`
          );
          setTimeout(() => setAmbient(null), 4500);
        }
        if (reply.questUpdate?.trim()) setQuestHook(reply.questUpdate.trim());
        if (reply.clueRevealed && hasClue && !cluesFound[clueIndex]) {
          setCluesFound((prev) => {
            const next = [...prev];
            next[clueIndex] = true;
            const n = next.filter(Boolean).length;
            setAmbient(
              n >= next.length
                ? "Final clue uncovered — the truth is within reach."
                : `Clue uncovered (${n}/${next.length}).`
            );
            return next;
          });
        }
        setDialogue({
          npc: dialogue.npc,
          history: [...history, { speaker: "npc", text: reply.line }],
          options: reply.done ? [] : reply.options,
          thinking: false,
          mood: reply.mood,
        });
        speak(reply.line, dialogue.npc.voice, voiceStyle(dialogue.npc, reply.mood));
      } catch {
        setDialogue({
          ...dialogue,
          history,
          options: OPENING_OPTIONS,
          thinking: false,
        });
      }
    },
    [bible, scene, dialogue, heat, cluesFound, speak, addCalls, inventory]
  );

  const allCluesFound = bible ? cluesFound.every(Boolean) : false;

  const runFinale = useCallback(
    async (outcome: "victory" | "defeat" = "victory", reason?: string) => {
      if (!bible || finaleLoading || finale) return;
      stopVoice();
      setDialogue(null);
      setFinaleLoading(true);
      try {
        let f: FinaleData | null = savedFinalesRef.current[outcome] ?? null;
        if (!f && outcome === "victory" && finalePromise.current) {
          f = await finalePromise.current;
        }
        if (!f && outcome === "defeat" && defeatFinalePromise.current) {
          f = await defeatFinalePromise.current;
        }
        if (!f && canGenerateRef.current) {
          const res = await post<{ finale: FinaleData }>("/api/finale", {
            bible,
            outcome,
            reason,
          });
          f = res.finale;
          addCalls(GEN_CALL_COST.finale);
          saveFinale(outcome, f);
        }
        if (!f) throw new Error("Finale unavailable.");
        setFinale({ ...f, outcome: f.outcome ?? outcome });
        speak(
          f.resolution,
          "Charon",
          outcome === "victory"
            ? "As a storyteller closing a mystery, say this with slow gravity"
            : "As a storyteller mourning a downfall, say this with slow gravity"
        );
      } catch {
        setError("The ending slipped away. Try again.");
        setTimeout(() => setError(null), 4000);
      } finally {
        setFinaleLoading(false);
      }
    },
    [bible, finale, finaleLoading, speak, stopVoice, addCalls, saveFinale]
  );

  useEffect(() => {
    if (heat >= 100 && bible && !finale && !finaleLoading) {
      const hard = bible.failStates.find((f) => f.kind === "hard");
      runFinale("defeat", hard?.trigger ?? `the ${bible.heatLabel} meter reached 100`);
    }
  }, [heat, bible, finale, finaleLoading, runFinale]);

  const closeDialogue = useCallback(() => {
    stopVoice();
    setDialogue(null);
  }, [stopVoice]);

  const leaveWorld = useCallback(() => {
    stopVoice();
    router.push("/");
  }, [stopVoice, router]);

  useEffect(() => stopVoice, [stopVoice]);

  if (phase === "booting" || !scene || !premise) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-extrabold text-ink">
            {premise?.title ?? bible?.title ?? "Building your world"}
          </h2>
          <div className="mt-5 border-t border-ink/15 pt-4">
            <p className="text-sm font-semibold text-ink">{bootStatus}</p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-inksoft">
              universe · story · scene · character · interiors · voices — all
              generated live{genCalls > 0 ? ` (${genCalls} calls so far)` : ""}
            </p>
            {error && (
              <p className="mt-3 text-sm font-semibold text-health">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-ink">
      <GameCanvas
        scene={scene}
        sprite={sprite}
        paused={dialogue !== null || entering !== null || wandering !== null || assetLoading !== null}
        onInteract={onInteract}
        spawn={spawn}
        onExitEdge={onExitEdge}
        showVision={showVision}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        <div className="flex max-w-sm flex-col gap-2">
          <div className="panel rounded-2xl px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-inksoft">
              {premise.title} · {scene.title}
            </p>
            {questHook && (
              <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">
                {questHook}
              </p>
            )}
          </div>
          {inventory.length > 0 && (
            <div className="panel flex w-fit max-w-xs flex-wrap items-center gap-1.5 rounded-2xl px-3 py-1.5">
              <Package size={12} strokeWidth={2.5} className="text-primary" />
              {inventory.map((it) => (
                <span
                  key={it}
                  className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                >
                  {it}
                </span>
              ))}
            </div>
          )}
          {bible && (
            <div className="panel flex w-fit items-center gap-2 rounded-full px-3 py-1.5">
              <Search size={12} strokeWidth={2.5} className="text-primary" />
              <span className="flex gap-1">
                {cluesFound.map((found, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-4 rounded-full ${
                      found ? "bg-primary" : "bg-ink/15"
                    }`}
                  />
                ))}
              </span>
              <span className="text-[11px] font-bold tabular-nums text-ink">
                {cluesFound.filter(Boolean).length}/{cluesFound.length} clues
              </span>
              {allCluesFound && !finale && (
                <button
                  onClick={() => runFinale("victory")}
                  disabled={finaleLoading}
                  className="pointer-events-auto ml-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white transition enabled:hover:brightness-105 enabled:active:scale-95 disabled:opacity-60"
                >
                  {finaleLoading ? "Unraveling…" : "Unravel the truth"}
                </button>
              )}
            </div>
          )}
          {bible && heat > 0 && (
            <div className="panel flex w-fit items-center gap-2 rounded-full px-3 py-1.5">
              <Flame
                size={12}
                strokeWidth={2.5}
                className={heat >= 60 ? "text-health" : "text-inksoft"}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-inksoft">
                {bible.heatLabel}
              </span>
              <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-ink/15">
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${heat}%`,
                    background: heat >= 60 ? "#b34a44" : "#b3862f",
                  }}
                />
              </span>
              <span className="text-[11px] font-bold tabular-nums text-ink">
                {heat}
              </span>
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {scene.annotated && (
            <button
              onClick={() => setShowVision((v) => !v)}
              className={`panel flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${
                showVision ? "text-primary" : "text-inksoft"
              }`}
              title={
                showVision
                  ? "Engine vision: the borders the model traced over its own frame"
                  : "Show what the engine sees"
              }
            >
              <Eye size={15} />
            </button>
          )}
          <button
            onClick={() => setVoiceOn((v) => !v)}
            className={`panel flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${
              voiceOn ? "text-primary" : "text-inksoft"
            }`}
            title={voiceOn ? "Voice on" : "Voice off"}
          >
            {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button
            onClick={leaveWorld}
            className="panel rounded-full px-3.5 py-2 text-xs font-bold text-ink transition active:scale-95"
          >
            Leave world
          </button>
        </div>
      </div>

      <AnimatePresence>
        {ambient && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-x-0 top-24 z-10 mx-auto w-fit max-w-[80%] rounded-full bg-black/55 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur-sm"
          >
            {ambient}
          </motion.p>
        )}
      </AnimatePresence>

      {!dialogue && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm">
          WASD / arrows — move · E — enter / talk
        </div>
      )}

      {!dialogue && !finale && (
        <div
          className="panel pointer-events-none absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-lg px-3 py-2"
          title="Every screen is painted, then the model traces borders over its own frame and reads both images back into the game; neighbors pre-dream while you walk"
        >
          <Zap size={11} strokeWidth={2.5} className="text-primary" />
          <span className="text-[11px] font-semibold tabular-nums text-ink">
            {genCalls} generations
          </span>
          <span className="h-3 w-px bg-ink/15" />
          <Compass size={11} strokeWidth={2.5} className="text-primary" />
          <span className="text-[11px] font-semibold tabular-nums text-ink">
            {screensDreamed} screens
          </span>
          <span className="h-3 w-px bg-ink/15" />
          <DoorOpen size={11} strokeWidth={2.5} className="text-primary" />
          <span className="text-[11px] font-semibold tabular-nums text-ink">
            rooms {interiorsReady}/3
          </span>
        </div>
      )}

      <AnimatePresence>
        {assetLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          >
            <div className="panel rounded-2xl px-6 py-4 text-center">
              <p className="font-display text-xl font-bold text-ink">{assetLoading}</p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium text-inksoft">
                <span className="animate-breathe inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                stepping through…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {wandering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          >
            <div className="panel rounded-2xl px-6 py-4 text-center">
              <p className="font-display text-xl font-bold text-ink">
                Wandering {wandering}…
              </p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium text-inksoft">
                <span className="animate-breathe inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                painting the next screen · tracing it · reading it
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {entering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          >
            <div className="panel rounded-2xl px-6 py-4 text-center">
              <p className="font-display text-xl font-bold text-ink">{entering}</p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium text-inksoft">
                <span className="animate-breathe inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                stepping inside…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {finale && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-40 overflow-y-auto bg-ink"
          >
            <img
              src={finale.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
            <div className="relative flex min-h-full flex-col items-center justify-end px-6 pb-14 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="max-w-xl"
              >
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary2">
                  {finale.outcome === "defeat" ? "The fall" : "The truth"}
                </p>
                <h2 className="mt-2 font-display text-4xl font-extrabold text-white">
                  {finale.title}
                </h2>
                <p className="mt-4 text-base font-medium leading-relaxed text-white/90">
                  {finale.resolution}
                </p>
                <button
                  onClick={leaveWorld}
                  className="mt-8 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-white shadow-soft transition hover:brightness-105 active:scale-95"
                >
                  Back to gallery
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center sm:p-4">
        <AnimatePresence>
          {dialogue && scene.npc && (
            <DialogueBox
              npc={dialogue.npc}
              history={dialogue.history}
              options={dialogue.options}
              thinking={dialogue.thinking}
              mood={dialogue.mood}
              speaking={speaking}
              voiceOn={voiceOn}
              onToggleVoice={() => setVoiceOn((v) => !v)}
              onSay={onSay}
              onClose={closeDialogue}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {error && phase === "playing" && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold text-health"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
