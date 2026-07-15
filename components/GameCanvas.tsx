"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Hotspot, SceneData } from "@/lib/universe";

const SPEED_X = 26; // % of width per second
const SPEED_Y = 20; // % of height per second

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
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const debugRef = useRef(false);
  useEffect(() => {
    debugRef.current = new URLSearchParams(window.location.search).has("debug");
  }, []);

  // (Re)load the backdrop when the scene changes; spawn on walkable ground.
  // crossOrigin is required for Supabase Storage URLs used in the canvas loop.
  useEffect(() => {
    const img = new Image();
    if (scene.image.startsWith("http://") || scene.image.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.src = scene.image;
    img.onload = () => {
      imgRef.current = img;
    };
    visionRef.current = null;
    if (scene.annotated) {
      const vis = new Image();
      if (
        scene.annotated.startsWith("http://") ||
        scene.annotated.startsWith("https://")
      ) {
        vis.crossOrigin = "anonymous";
      }
      vis.src = scene.annotated;
      vis.onload = () => {
        visionRef.current = vis;
      };
    }

    const startX = spawn?.x ?? (scene.kind === "interior" ? 50 : 14);
    const startY = spawn?.y ?? 72;
    playerRef.current = { x: startX, y: startY, dir: 1, moving: false };
    exitFiredRef.current = false;
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

      // --- Move on the flat plane (grid collision; slide along walls) ---
      const p = playerRef.current;
      if (!pausedRef.current) {
        const keys = keysRef.current;
        let vx = 0;
        let vy = 0;
        if (keys["arrowleft"] || keys["a"]) vx -= 1;
        if (keys["arrowright"] || keys["d"]) vx += 1;
        if (keys["arrowup"] || keys["w"]) vy -= 1;
        if (keys["arrowdown"] || keys["s"]) vy += 1;
        if (vx !== 0) p.dir = vx > 0 ? 1 : -1;
        p.moving = vx !== 0 || vy !== 0;

        p.x = Math.max(2, Math.min(98, p.x + vx * SPEED_X * dt));
        p.y = Math.max(4, Math.min(96, p.y + vy * SPEED_Y * dt));

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

      // --- Debug overlay (?debug=1): player state ---
      if (debugRef.current) {
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
        ctx.fillStyle = "#c8552e";
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
