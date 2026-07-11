"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DoorOpen, Flame, Package, Search, Volume2, VolumeX, Zap } from "lucide-react";
import type { Premise } from "@/lib/types";
import type {
  DialogueResponse,
  DialogueTurn,
  GameBible,
  Hotspot,
  SceneData,
} from "@/lib/universe";
import { Landing } from "./Landing";
import { GameCanvas } from "./GameCanvas";
import { DialogueBox } from "./DialogueBox";

type Phase = "select" | "booting" | "playing";

type FinaleData = {
  title: string;
  resolution: string;
  image: string;
  outcome?: "victory" | "defeat";
};

/** Heat drawn by a dialogue misstep, judged by the NPC referee. */
const OFFENSE_HEAT = { none: 0, minor: 12, grave: 35 } as const;

const OPENING_OPTIONS = [
  "Who are you, really?",
  "Something's wrong here. Talk.",
  "I need your help.",
];

/** Style direction handed to TTS so lines are performed, not read. */
function voiceStyle(npc: { role?: string } | null, mood?: string): string {
  const m = mood ? `in a ${mood} tone` : "with dramatic feeling";
  return `As a ${npc?.role ?? "character"} in an Indian adventure story, say this ${m}`;
}

/** Turn a white-background sprite render into a transparent-canvas sprite. */
async function chromaKeySprite(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = dataUrl;
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
    // near-white → transparent; softly feather off-whites
    if (r > 232 && g > 232 && b > 232) {
      px[i + 3] = 0;
    } else if (r > 215 && g > 215 && b > 215) {
      px[i + 3] = Math.round(px[i + 3] * 0.4);
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function World() {
  const [phase, setPhase] = useState<Phase>("select");
  const [premise, setPremise] = useState<Premise | null>(null);
  const [scene, setScene] = useState<SceneData | null>(null);
  const [questHook, setQuestHook] = useState("");
  const [bible, setBible] = useState<GameBible | null>(null);
  const [cluesFound, setCluesFound] = useState<boolean[]>([false, false, false]);
  /** The world's danger meter 0..100 — at 100 the run ends in defeat. */
  const [heat, setHeat] = useState(0);
  const [finale, setFinale] = useState<FinaleData | null>(null);
  const [finaleLoading, setFinaleLoading] = useState(false);
  const [inventory, setInventory] = useState<string[]>([]);

  // The engine made visible: model calls powering this run (text + image +
  // vision + voice), and how many rooms have pre-built while the player walks.
  const [genCalls, setGenCalls] = useState(0);
  const [interiorsReady, setInteriorsReady] = useState(0);
  const addCalls = useCallback(
    (n: number) => setGenCalls((c) => c + n),
    []
  );
  const [sprite, setSprite] = useState<HTMLCanvasElement | null>(null);
  const [bootStatus, setBootStatus] = useState("Dreaming up the world…");
  const [entering, setEntering] = useState<string | null>(null);
  const [ambient, setAmbient] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  // Dialogue state
  const [dialogue, setDialogue] = useState<{
    npc: SceneData["npc"] & object;
    history: DialogueTurn[];
    options: string[];
    thinking: boolean;
    mood?: string;
  } | null>(null);

  const scenesRef = useRef<Map<string, SceneData>>(new Map());
  const interiorPromises = useRef<Map<string, Promise<SceneData>>>(new Map());
  // Preload caches — everything the player might do next is already made.
  const voiceCache = useRef<Map<string, Promise<string | null>>>(new Map());
  const dialogueCache = useRef<Map<string, Promise<DialogueResponse>>>(new Map());
  const finalePromise = useRef<Promise<FinaleData | null> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  /* ---------------- voice (cached + performed) ---------------- */

  const fetchVoice = useCallback(
    (text: string, voice?: string, style?: string): Promise<string | null> => {
      const key = `${voice ?? ""}|${style ?? ""}|${text}`;
      const hit = voiceCache.current.get(key);
      if (hit) return hit;
      const p = post<{ audio: string | null }>("/api/voice", {
        text,
        voice,
        style,
      })
        .then(({ audio }) => {
          addCalls(1);
          // Don't pin a transient TTS failure — let a later call retry.
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
    [addCalls]
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

  /* ---------------- scene helpers ---------------- */

  const showScene = useCallback((s: SceneData) => {
    scenesRef.current.set(s.id, s);
    setScene(s);
    setAmbient(s.ambient);
    setTimeout(() => setAmbient((a) => (a === s.ambient ? null : a)), 5000);
  }, []);

  /**
   * The moment an interior exists, pre-make the player's entire next minute:
   * the NPC's opening line as spoken audio, plus the NPC's reply to EVERY
   * one of the three opening choices — and the audio for those replies too.
   * Walking in and talking is then instant end to end.
   */
  const prefetchConversation = useCallback(
    (theBible: GameBible, s: SceneData) => {
      const npc = s.npc;
      if (!npc || typeof s.clueIndex !== "number") return;
      // opening line, performed
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
          addCalls(1);
          fetchVoice(reply.line, npc.voice, voiceStyle(npc, reply.mood));
          return reply;
        });
        p.catch(() => dialogueCache.current.delete(key));
        dialogueCache.current.set(key, p);
      }
    },
    [addCalls, fetchVoice]
  );

  const prefetchInterior = useCallback(
    (theBible: GameBible, h: Hotspot) => {
      if (typeof h.clueIndex !== "number" || interiorPromises.current.has(h.id))
        return;
      const p = post<{ scene: SceneData }>("/api/scene", {
        bible: theBible,
        roomIndex: h.clueIndex,
      }).then(({ scene: s }) => {
        scenesRef.current.set(s.id, s);
        addCalls(2); // interior = layout text + image
        setInteriorsReady((r) => r + 1);
        prefetchConversation(theBible, s);
        return s;
      });
      p.catch(() => interiorPromises.current.delete(h.id));
      interiorPromises.current.set(h.id, p);
    },
    [addCalls, prefetchConversation]
  );

  /* ---------------- boot ---------------- */

  const begin = useCallback(
    async (idea: string) => {
      setPhase("booting");
      setError(null);
      setScene(null);
      setSprite(null);
      setDialogue(null);
      setPremise(null);
      scenesRef.current = new Map();
      interiorPromises.current = new Map();
      voiceCache.current = new Map();
      dialogueCache.current = new Map();
      finalePromise.current = null;

      setBible(null);
      setCluesFound([false, false, false]);
      setHeat(0);
      setFinale(null);
      setFinaleLoading(false);
      setGenCalls(0);
      setInteriorsReady(0);
      setInventory([]);

      try {
        // 1) The planner authors the COMPLETE game bible from the player's
        //    idea: universe, story spine, every room, every NPC, fail states.
        //    Every later model call referees against this one document.
        setBootStatus("Writing your game's bible…");
        const { bible: theBible } = await post<{ bible: GameBible }>(
          "/api/universe",
          { idea }
        );
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
        setPremise(chosen);
        setBible(theBible);
        addCalls(1); // the game bible

        // 2) Paint the opening street from the bible's plan.
        setBootStatus("Painting your opening scene…");
        const { scene: street } = await post<{ scene: SceneData }>(
          "/api/scene",
          { bible: theBible }
        );
        addCalls(2); // street = layout + image
        setQuestHook(theBible.story.goal);
        showScene(street);
        setPhase("playing");

        // 3) Forge the character FROM the street frame, so the sprite shares
        //    the scene's exact art style and lighting (a marker stands in
        //    until it lands).
        post<{ sprite: string }>("/api/sprite", {
          premise: chosen,
          referenceFrame: stripDataUrl(street.image),
        })
          .then(({ sprite: s }) => {
            addCalls(1); // character render
            return chromaKeySprite(s);
          })
          .then(setSprite)
          .catch(() => {});

        // 4) Pre-generate every interior while the player walks around.
        street.hotspots
          .filter((h) => h.kind === "building")
          .forEach((h) => prefetchInterior(theBible, h));

        // 5) Pre-generate the VICTORY finale too — the ending is already
        //    written in the bible, so "Unravel the truth" can land instantly.
        //    (A defeat finale is generated live if the run sours.)
        finalePromise.current = post<{ finale: FinaleData }>("/api/finale", {
          bible: theBible,
          outcome: "victory",
        })
          .then(({ finale: f }) => {
            addCalls(2);
            fetchVoice(f.resolution, "Charon", "As a storyteller closing a mystery, say this with slow gravity");
            return f;
          })
          .catch(() => null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "World generation failed.");
        setPhase("select");
      }
    },
    [prefetchInterior, showScene, addCalls, fetchVoice]
  );

  /* ---------------- interaction ---------------- */

  const onInteract = useCallback(
    async (h: Hotspot) => {
      if (!premise || !scene) return;

      if (h.kind === "exit") {
        stopVoice();
        setDialogue(null);
        const parent = scenesRef.current.get(scene.parentId ?? "street");
        if (parent) showScene(parent);
        return;
      }

      if (h.kind === "item" && h.itemName) {
        setInventory((inv) =>
          inv.includes(h.itemName!) ? inv : [...inv, h.itemName!]
        );
        // consume the hotspot from this scene
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
        // Risky actions were authored risky in the bible — they draw heat.
        const drawn = h.suspicion ?? 0;
        if (drawn > 0) setHeat((v) => Math.min(100, v + drawn));
        const outcomeLine = h.outcome
          ? h.grantsItem
            ? `${h.outcome} (+ ${h.grantsItem})`
            : h.outcome
          : `${h.name} — done.`;
        setAmbient(
          drawn > 0 && h.risk ? `${outcomeLine} — ${h.risk}` : outcomeLine
        );
        setTimeout(() => setAmbient(null), 4500);
        // one-shot: consume the action
        const updated = {
          ...scene,
          hotspots: scene.hotspots.filter((x) => x.id !== h.id),
        };
        scenesRef.current.set(updated.id, updated);
        if (h.leadsOutside) {
          const parent = scenesRef.current.get(scene.parentId ?? "street");
          if (parent) {
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
        setEntering(h.name);
        try {
          let interior = scenesRef.current.get(h.id);
          if (!interior) {
            prefetchInterior(bible, h);
            interior = await interiorPromises.current.get(h.id);
          }
          if (interior) showScene(interior);
        } catch {
          setError(`Couldn't step into ${h.name}. Try again.`);
          setTimeout(() => setError(null), 4000);
        } finally {
          setEntering(null);
        }
      }
    },
    [premise, scene, bible, prefetchInterior, showScene, speak, stopVoice]
  );

  const onSay = useCallback(
    async (line: string) => {
      if (!bible || !scene?.npc || !dialogue) return;
      const history: DialogueTurn[] = [
        ...dialogue.history,
        { speaker: "player", text: line },
      ];
      setDialogue({ ...dialogue, history, options: [], thinking: true });
      const clueIndex = scene.clueIndex;
      const hasClue = typeof clueIndex === "number";
      if (!hasClue) return;
      try {
        // First exchange with a canned opener? The reply (and its audio) were
        // pre-generated the moment this room finished building — instant.
        // (Skip the cache once heat is high: the NPC's wariness must show.)
        const isFirstTurn =
          history.filter((t) => t.speaker === "player").length === 1;
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
          addCalls(1); // dialogue turn
        }
        // The referee's verdict on the player's line: mistakes draw heat.
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
        // Victory was pre-generated at boot; defeat is always a live call.
        let f =
          outcome === "victory" && finalePromise.current
            ? await finalePromise.current
            : null;
        if (!f) {
          const res = await post<{ finale: FinaleData }>("/api/finale", {
            bible,
            outcome,
            reason,
          });
          f = res.finale;
          addCalls(2);
        }
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
    [bible, finale, finaleLoading, speak, stopVoice, addCalls]
  );

  // The hard fail state: the danger meter maxing out ends the run.
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
    setPhase("select");
    setPremise(null);
    setScene(null);
    setDialogue(null);
    setBible(null);
    setHeat(0);
    setCluesFound([false, false, false]);
    setFinale(null);
    setFinaleLoading(false);
    setGenCalls(0);
    setInteriorsReady(0);
    setInventory([]);
    voiceCache.current = new Map();
    dialogueCache.current = new Map();
    finalePromise.current = null;
  }, [stopVoice]);

  // Global Esc: close dialogue handled in DialogueBox; nothing else here.
  useEffect(() => stopVoice, [stopVoice]);

  /* ---------------- render ---------------- */

  if (phase === "select") {
    return (
      <div>
        <Landing onStart={begin} />
        {error && (
          <p className="pb-8 text-center text-sm font-semibold text-health">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (phase === "booting" || !scene || !premise) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-extrabold text-ink">
            {premise?.title ?? "Building your world"}
          </h2>
          <div className="mt-5 border-t border-ink/15 pt-4">
            <p className="text-sm font-semibold text-ink">{bootStatus}</p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-inksoft">
              universe · story · scene · character · interiors · voices — all
              generated live{genCalls > 0 ? ` (${genCalls} calls so far)` : ""}
            </p>
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
        paused={dialogue !== null || entering !== null}
        onInteract={onInteract}
      />

      {/* --- HUD: world / scene / quest / clues --- */}
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

      {/* --- Ambient line --- */}
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

      {/* --- Controls hint --- */}
      {!dialogue && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm">
          WASD / arrows — move · E — enter / talk
        </div>
      )}

      {/* --- The engine, made visible (the NB2 Lite pipeline is the product) --- */}
      {!dialogue && !finale && (
        <div
          className="panel pointer-events-none absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-lg px-3 py-2"
          title="Every frame, character, room, line, and voice is generated live; interiors pre-build in parallel while you walk"
        >
          <Zap size={11} strokeWidth={2.5} className="text-primary" />
          <span className="text-[11px] font-semibold tabular-nums text-ink">
            {genCalls} generations
          </span>
          <span className="h-3 w-px bg-ink/15" />
          <DoorOpen size={11} strokeWidth={2.5} className="text-primary" />
          <span className="text-[11px] font-semibold tabular-nums text-ink">
            {interiorsReady >= 3 ? "rooms ready · instant" : `rooms ${interiorsReady}/3`}
          </span>
        </div>
      )}

      {/* --- Entering overlay --- */}
      <AnimatePresence>
        {entering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          >
            <div className="panel rounded-2xl px-6 py-4 text-center">
              <p className="font-display text-xl font-bold text-ink">
                {entering}
              </p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium text-inksoft">
                <span className="animate-breathe inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                stepping inside…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Finale --- */}
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
                  Tell another story
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Dialogue --- */}
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

      {/* --- Error toast --- */}
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
