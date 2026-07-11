"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Hotspot, SceneData } from "@/lib/universe";

/** Default depth band the player walks in, as % of frame height (pseudo-2.5D). */
const DEFAULT_BAND_TOP = 58;
const BAND_BOTTOM = 92;
const SPEED_X = 26; // % of width per second
const SPEED_DEPTH = 0.55; // band fraction per second

export type PlayerState = {
  x: number; // 0-100 (% of width)
  depth: number; // 0..1 within the walk band
  dir: 1 | -1;
  moving: boolean;
};

export function GameCanvas({
  scene,
  sprite,
  paused,
  onInteract,
}: {
  scene: SceneData;
  sprite: HTMLCanvasElement | null;
  /** True while dialogue / overlays own the keyboard. */
  paused: boolean;
  onInteract: (hotspot: Hotspot) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const playerRef = useRef<PlayerState>({ x: 12, depth: 0.5, dir: 1, moving: false });
  const nearRef = useRef<Hotspot | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Escape hatch: frames spent pushing into walls with no progress. Past a
  // threshold, collision relaxes so the player can never be trapped.
  const stuckFramesRef = useRef(0);
  const debugRef = useRef(false);
  useEffect(() => {
    debugRef.current = new URLSearchParams(window.location.search).has("debug");
  }, []);

  // (Re)load the backdrop when the scene changes; reset to a SAFE spawn —
  // never inside an obstacle box (e.g. don't spawn standing in the canal).
  useEffect(() => {
    const img = new Image();
    img.src = scene.image;
    img.onload = () => {
      imgRef.current = img;
    };

    const startX = scene.kind === "interior" ? 50 : 12;
    const depth = 0.6;
    const top = Math.max(32, Math.min(80, scene.groundTop ?? DEFAULT_BAND_TOP));
    const py = top + (BAND_BOTTOM - top) * depth;
    const blockedAt = (x: number) =>
      (scene.obstacles ?? []).some(
        (o) => x >= o.x && x <= o.x + o.w && py >= o.y && py <= o.y + o.h
      );
    let x = startX;
    if (blockedAt(x)) {
      outer: for (let dx = 4; dx <= 92; dx += 4) {
        for (const cand of [startX + dx, startX - dx]) {
          if (cand >= 2 && cand <= 98 && !blockedAt(cand)) {
            x = cand;
            break outer;
          }
        }
      }
    }
    playerRef.current = { x, depth, dir: 1, moving: false };
  }, [scene.id, scene.image, scene.kind, scene.groundTop, scene.obstacles]);

  // Ground horizon from the vision pass over the actual frame.
  const bandTop = Math.max(
    32,
    Math.min(80, scene.groundTop ?? DEFAULT_BAND_TOP)
  );

  const playerFoot = useCallback((): { px: number; py: number } => {
    const p = playerRef.current;
    return { px: p.x, py: bandTop + (BAND_BOTTOM - bandTop) * p.depth };
  }, [bandTop]);

  /** True when the point is inside a no-walk obstacle box (water, people,
   *  stalls…) — unless it's within an interaction zone, which stays reachable. */
  const isBlocked = useCallback(
    (px: number, py: number): boolean => {
      const obstacles = scene.obstacles ?? [];
      if (obstacles.length === 0) return false;
      const m = 4;
      for (const h of scene.hotspots) {
        if (
          px >= h.rect.x - m &&
          px <= h.rect.x + h.rect.w + m &&
          py >= h.rect.y - m &&
          py <= h.rect.y + h.rect.h + m
        ) {
          return false; // doors and NPCs must stay approachable
        }
      }
      for (const o of obstacles) {
        if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
          return true;
        }
      }
      return false;
    },
    [scene.obstacles, scene.hotspots]
  );

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

      // --- Move (with obstacle collision; slide along the blocked axis) ---
      const p = playerRef.current;
      if (!pausedRef.current) {
        const keys = keysRef.current;
        let vx = 0;
        let vd = 0;
        if (keys["arrowleft"] || keys["a"]) vx -= 1;
        if (keys["arrowright"] || keys["d"]) vx += 1;
        if (keys["arrowup"] || keys["w"]) vd -= 1;
        if (keys["arrowdown"] || keys["s"]) vd += 1;
        if (vx !== 0) p.dir = vx > 0 ? 1 : -1;
        p.moving = vx !== 0 || vd !== 0;

        const footY = (depth: number) =>
          bandTop + (BAND_BOTTOM - bandTop) * depth;
        const nx = Math.max(2, Math.min(98, p.x + vx * SPEED_X * dt));
        const nd = Math.max(0, Math.min(1, p.depth + vd * SPEED_DEPTH * dt));

        // After ~0.5s of pushing with zero progress, collision relaxes —
        // a briefly-wrong obstacle box must never trap the player.
        const relaxed = stuckFramesRef.current > 30;

        if (relaxed || !isBlocked(nx, footY(nd))) {
          p.x = nx;
          p.depth = nd;
          stuckFramesRef.current = 0;
        } else if (!isBlocked(nx, footY(p.depth))) {
          p.x = nx; // slide horizontally along the obstacle
          stuckFramesRef.current = 0;
        } else if (!isBlocked(p.x, footY(nd))) {
          p.depth = nd; // slide in depth along the obstacle
          stuckFramesRef.current = 0;
        } else if (p.moving) {
          stuckFramesRef.current++;
        }
      } else {
        p.moving = false;
        stuckFramesRef.current = 0;
      }

      // --- Near hotspot? ---
      const { px, py } = playerFoot();
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

      // --- Draw backdrop (cover fit) ---
      // All game coordinates are percentages OF THE IMAGE, so everything —
      // hotspots, obstacles, the player — is mapped through the image's drawn
      // rect. The person and the background always share one aspect/space,
      // whatever the window shape.
      ctx.clearRect(0, 0, cw, ch);
      const img = imgRef.current;
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

      // --- Debug overlay (?debug=1): obstacle boxes + walk band ---
      if (debugRef.current) {
        for (const o of scene.obstacles ?? []) {
          ctx.fillStyle = "rgba(255,0,0,0.22)";
          ctx.fillRect(X(o.x), Y(o.y), (o.w / 100) * dw, (o.h / 100) * dh);
          ctx.strokeStyle = "rgba(255,0,0,0.7)";
          ctx.strokeRect(X(o.x), Y(o.y), (o.w / 100) * dw, (o.h / 100) * dh);
        }
        const gy = Y(bandTop);
        ctx.strokeStyle = "rgba(0,255,120,0.8)";
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(cw, gy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(8, ch - 30, 240, 22);
        ctx.fillStyle = "#7CFC9E";
        ctx.font = "12px monospace";
        ctx.fillText(
          `x=${p.x.toFixed(1)} depth=${p.depth.toFixed(2)} stuck=${stuckFramesRef.current}`,
          14,
          ch - 14
        );
      }

      // --- Hotspot affordances ---
      for (const h of scene.hotspots) {
        const hx = X(h.rect.x);
        const hy = Y(h.rect.y);
        const hw = (h.rect.w / 100) * dw;
        const hh = (h.rect.h / 100) * dh;
        const isNear = near?.id === h.id;

        // Marker dot above the zone
        const t = now / 500;
        const bob = Math.sin(t + h.rect.x) * 3;
        ctx.beginPath();
        ctx.arc(hx + hw / 2, hy - 10 + bob, isNear ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isNear ? "#ffb24d" : "rgba(255,255,255,0.75)";
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

      // --- Player sprite (sized against the IMAGE, not the window) ---
      const footX = X(px);
      const footY = Y(py);
      const scale = 0.85 + 0.2 * p.depth;
      const spriteH = dh * 0.16 * scale;

      // soft ground shadow
      ctx.beginPath();
      ctx.ellipse(footX, footY, spriteH * 0.18, spriteH * 0.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fill();

      if (sprite) {
        const ratio = sprite.width / sprite.height;
        const sh = spriteH;
        const sw = sh * ratio;
        const bob = p.moving ? Math.abs(Math.sin(now / 110)) * sh * 0.03 : 0;
        ctx.save();
        ctx.translate(footX, footY - bob);
        if (p.dir === -1) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -sw / 2, -sh, sw, sh);
        ctx.restore();
      } else {
        // fallback marker while the sprite generates
        ctx.beginPath();
        ctx.arc(footX, footY - spriteH * 0.5, spriteH * 0.16, 0, Math.PI * 2);
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
  }, [scene, sprite, playerFoot, isBlocked, bandTop]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
