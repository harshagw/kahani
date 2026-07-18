"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Hotspot, SceneData, WalkGrid } from "@/lib/universe";
import { getCachedImage, preloadImage } from "@/lib/image-cache";

const SPEED_X = 26; // % of width per second
const SPEED_Y = 20; // % of height per second

/**
 * True when the walkability mask blocks the point (percent coordinates). The
 * player's foot is sampled against the grid so painted obstacles — buildings,
 * water, props — are non-walkable and travel follows the open ground between
 * them. With no grid (older saved games, interiors) everything is walkable.
 */
function cellBlocked(x: number, y: number, walk: WalkGrid | undefined): boolean {
  if (!walk) return false;
  const c = Math.min(walk.cols - 1, Math.max(0, Math.floor((x / 100) * walk.cols)));
  const r = Math.min(walk.rows - 1, Math.max(0, Math.floor((y / 100) * walk.rows)));
  return !walk.cells[r * walk.cols + c];
}

export type PlayerState = {
  x: number; // 0-100 (% of width)
  y: number; // 0-100 (% of height)
  dir: 1 | -1;
  moving: boolean;
};

export type ExitDirection = "n" | "e" | "s" | "w";

export function GameCanvas({
  scene,
  sprite,
  paused,
  onInteract,
  spawn,
  onExitEdge,
  onPosition,
  showVision,
}: {
  scene: SceneData;
  sprite: HTMLCanvasElement | null;
  /** True while dialogue / overlays own the keyboard. */
  paused: boolean;
  onInteract: (hotspot: Hotspot) => void;
  /** Where to place the player on scene change (e.g. entering from an edge). */
  spawn?: { x: number; y: number } | null;
  /** Fired once when the player walks off an open edge of an overworld screen. */
  onExitEdge?: (dir: ExitDirection) => void;
  /** Live player pose for HUD (minimap); throttled in the render loop. */
  onPosition?: (p: PlayerState) => void;
  /** Show the engine's traced frame instead of the clean one. */
  showVision?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const visionRef = useRef<HTMLImageElement | null>(null);
  const showVisionRef = useRef(Boolean(showVision));
  showVisionRef.current = Boolean(showVision);
  const keysRef = useRef<Record<string, boolean>>({});
  const playerRef = useRef<PlayerState>({ x: 12, y: 70, dir: 1, moving: false });
  const nearRef = useRef<Hotspot | null>(null);
  const exitFiredRef = useRef(false);
  const onExitEdgeRef = useRef(onExitEdge);
  onExitEdgeRef.current = onExitEdge;
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const debugRef = useRef(false);
  const mainColorRef = useRef("#ffbf00");
  useEffect(() => {
    debugRef.current = new URLSearchParams(window.location.search).has("debug");
    const main = getComputedStyle(document.documentElement)
      .getPropertyValue("--main")
      .trim();
    if (main) mainColorRef.current = main;
  }, []);

  // (Re)load the backdrop when the scene changes; spawn on walkable ground.
  // crossOrigin is required for Supabase Storage URLs used in the canvas loop.
  useEffect(() => {
    let cancelled = false;

    const applyBackdrop = (img: HTMLImageElement) => {
      if (!cancelled) imgRef.current = img;
    };

    const cached = getCachedImage(scene.image);
    if (cached) {
      applyBackdrop(cached);
    } else {
      preloadImage(scene.image).then(applyBackdrop).catch(() => {});
    }

    visionRef.current = null;
    if (scene.annotated) {
      const visCached = getCachedImage(scene.annotated);
      if (visCached) {
        visionRef.current = visCached;
      } else {
        preloadImage(scene.annotated)
          .then((vis) => {
            if (!cancelled) visionRef.current = vis;
          })
          .catch(() => {});
      }
    }

    const startX = spawn?.x ?? (scene.kind === "interior" ? 50 : 14);
    const startY = spawn?.y ?? 72;
    playerRef.current = { x: startX, y: startY, dir: 1, moving: false };
    exitFiredRef.current = false;
    onPositionRef.current?.(playerRef.current);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spawn only applies at scene change
  }, [scene.id, scene.image, scene.kind, scene.annotated]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const k = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s", "e", "enter"].includes(k)) {
        e.preventDefault();
      }
      if (k === "e" || k === "enter") {
        const near = nearRef.current;
        if (near) onInteract(near);
        return;
      }
      keysRef.current[k] = true;
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onInteract]);

  // Render loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastTick = performance.now();
    let lastPositionReport = 0;
    let lastReported = { x: 0, y: 0, moving: false };

    // Walkability mask for this scene (undefined on interiors and pre-grid
    // saved games → free movement). Read once; it is immutable per scene.
    const walk = scene.walk;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      lastTick = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false; // crisp pixel-art upscale

      // --- Move on the flat plane (walkability collision; slide along walls) ---
      const p = playerRef.current;
      if (!pausedRef.current) {
        const keys = keysRef.current;
        const prevX = p.x;
        const prevY = p.y;
        let vx = 0;
        let vy = 0;
        if (keys["arrowleft"] || keys["a"]) vx -= 1;
        if (keys["arrowright"] || keys["d"]) vx += 1;
        if (keys["arrowup"] || keys["w"]) vy -= 1;
        if (keys["arrowdown"] || keys["s"]) vy += 1;
        if (vx !== 0) p.dir = vx > 0 ? 1 : -1;

        // Resolve each axis independently against the walkability mask so the
        // player slides along a wall instead of sticking to it. A player who
        // is already on a blocked cell (e.g. spawned onto one) may always
        // move — the block only applies when a step enters new blocked ground.
        const wasStuck = cellBlocked(p.x, p.y, walk);
        const nextX = Math.max(2, Math.min(98, p.x + vx * SPEED_X * dt));
        if (wasStuck || !cellBlocked(nextX, p.y, walk)) p.x = nextX;
        const nextY = Math.max(4, Math.min(96, p.y + vy * SPEED_Y * dt));
        if (wasStuck || !cellBlocked(p.x, nextY, walk)) p.y = nextY;

        // Walking is animated only when the player actually advanced, so
        // pushing into a wall shows an idle stance rather than a moonwalk.
        p.moving = p.x !== prevX || p.y !== prevY;

        // --- Walk off an open edge → the world continues one screen over ---
        const edges = scene.edges;
        if (edges && onExitEdgeRef.current && !exitFiredRef.current) {
          let dir: ExitDirection | null = null;
          if (vx > 0 && p.x >= 97.5 && edges.e) dir = "e";
          else if (vx < 0 && p.x <= 2.5 && edges.w) dir = "w";
          else if (vy < 0 && p.y <= 4.5 && edges.n) dir = "n";
          else if (vy > 0 && p.y >= 95.5 && edges.s) dir = "s";
          if (dir) {
            exitFiredRef.current = true;
            onExitEdgeRef.current(dir);
          }
        }
        // Stepping back from the edge re-arms the exit (covers failed loads).
        if (exitFiredRef.current && p.x > 8 && p.x < 92 && p.y > 10 && p.y < 90) {
          exitFiredRef.current = false;
        }
      } else {
        p.moving = false;
      }

      const reportPosition = onPositionRef.current;
      if (reportPosition) {
        const moved =
          p.x !== lastReported.x ||
          p.y !== lastReported.y ||
          p.moving !== lastReported.moving;
        if (moved && now - lastPositionReport >= 100) {
          lastPositionReport = now;
          lastReported = { x: p.x, y: p.y, moving: p.moving };
          reportPosition(p);
        }
      }

      // --- Near hotspot? ---
      const px = p.x;
      const py = p.y;
      let near: Hotspot | null = null;
      for (const h of scene.hotspots) {
        const m = 4; // forgiving margin (percent)
        if (
          px >= h.rect.x - m &&
          px <= h.rect.x + h.rect.w + m &&
          py >= h.rect.y - m &&
          py <= h.rect.y + h.rect.h + m
        ) {
          near = h;
          break;
        }
      }
      nearRef.current = near;

      // --- Draw backdrop (cover fit; game coords are % of the image) ---
      ctx.clearRect(0, 0, cw, ch);
      const img =
        showVisionRef.current && visionRef.current
          ? visionRef.current
          : imgRef.current;
      let ox = 0;
      let oy = 0;
      let dw = cw;
      let dh = ch;
      if (img && img.naturalWidth > 0) {
        const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        dw = img.naturalWidth * s;
        dh = img.naturalHeight * s;
        ox = (cw - dw) / 2;
        oy = (ch - dh) / 2;
        ctx.drawImage(img, ox, oy, dw, dh);
      } else {
        ctx.fillStyle = "#1a1410";
        ctx.fillRect(0, 0, cw, ch);
      }
      const X = (pxPct: number) => ox + (pxPct / 100) * dw;
      const Y = (pyPct: number) => oy + (pyPct / 100) * dh;

      // --- Debug overlay (?debug=1): player state + blocked walk-cells ---
      if (debugRef.current) {
        if (walk) {
          ctx.fillStyle = "rgba(255,64,64,0.28)";
          const cw2 = dw / walk.cols;
          const ch2 = dh / walk.rows;
          for (let r = 0; r < walk.rows; r++) {
            for (let c = 0; c < walk.cols; c++) {
              if (!walk.cells[r * walk.cols + c]) {
                ctx.fillRect(ox + c * cw2, oy + r * ch2, cw2, ch2);
              }
            }
          }
        }
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(8, ch - 30, 200, 22);
        ctx.fillStyle = "#7CFC9E";
        ctx.font = "12px monospace";
        ctx.fillText(`x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`, 14, ch - 14);
      }

      // --- Hotspot affordances ---
      for (const h of scene.hotspots) {
        const hx = X(h.rect.x);
        const hy = Y(h.rect.y);
        const hw = (h.rect.w / 100) * dw;
        const hh = (h.rect.h / 100) * dh;
        const isNear = near?.id === h.id;

        const t = now / 500;
        const bob = Math.sin(t + h.rect.x) * 3;
        ctx.beginPath();
        ctx.arc(hx + hw / 2, hy - 10 + bob, isNear ? 6 : 4, 0, Math.PI * 2);
        const baseColor =
          h.kind === "item"
            ? "rgba(255,215,80,0.9)"
            : h.kind === "action"
              ? "rgba(120,200,255,0.9)"
              : "rgba(255,255,255,0.75)";
        ctx.fillStyle = isNear ? "#ffb24d" : baseColor;
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (isNear) {
          ctx.strokeStyle = "rgba(255,178,77,0.9)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
          ctx.strokeRect(hx, hy, hw, hh);
          ctx.setLineDash([]);
        }
      }

      // --- Player sprite (constant size, like a real overworld character) ---
      const footX = X(px);
      const footY = Y(py);
      const spriteH = dh * 0.14;

      ctx.beginPath();
      ctx.ellipse(footX, footY, spriteH * 0.22, spriteH * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fill();

      if (sprite) {
        const ratio = sprite.width / sprite.height;
        const sh = spriteH;
        const sw = sh * ratio;
        const bob = p.moving ? Math.abs(Math.sin(now / 110)) * sh * 0.04 : 0;
        ctx.save();
        ctx.translate(footX, footY - bob);
        if (p.dir === -1) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -sw / 2, -sh, sw, sh);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(footX, footY - spriteH * 0.5, spriteH * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = mainColorRef.current;
        ctx.fill();
      }

      // --- Interaction prompt ---
      if (near && !pausedRef.current) {
        const label =
          near.kind === "building"
            ? `E — enter ${near.name}`
            : near.kind === "npc"
              ? `E — talk to ${near.name}`
              : near.kind === "item"
                ? `E — pick up ${near.name}`
                : `E — ${near.name}`;
        ctx.font = "600 14px var(--font-sans), system-ui, sans-serif";
        const tw = ctx.measureText(label).width;
        const bx = footX - tw / 2 - 12;
        const by = footY - spriteH - 40;
        ctx.fillStyle = "rgba(20,14,10,0.82)";
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 24, 30, 15);
        ctx.fill();
        ctx.fillStyle = "#ffb24d";
        ctx.fillText(label, bx + 12, by + 20);
        if (near.hint) {
          ctx.font = "500 11px var(--font-sans), system-ui, sans-serif";
          const hw2 = ctx.measureText(near.hint).width;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillText(near.hint, footX - hw2 / 2, by - 8);
        }
      }
    };

    raf = requestAnimationFrame(tick);

    // rAF stops in hidden/occluded tabs; keep the simulation ticking (slowly)
    // via a timer so the game never appears frozen after a tab switch.
    const fallback = setInterval(() => {
      if (performance.now() - lastTick > 250) {
        cancelAnimationFrame(raf);
        tick(performance.now());
      }
    }, 120);

    // Test/debug hooks (?debug=1): drive keys + read state programmatically.
    if (debugRef.current) {
      (window as unknown as Record<string, unknown>).__kahani = {
        setKey: (k: string, v: boolean) => {
          keysRef.current[k] = v;
        },
        state: () => ({
          ...playerRef.current,
          near: nearRef.current?.name ?? null,
        }),
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(fallback);
      delete (window as unknown as Record<string, unknown>).__kahani;
    };
  }, [scene, sprite]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
