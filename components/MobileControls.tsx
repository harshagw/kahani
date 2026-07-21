"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Hand } from "lucide-react";
import type { Hotspot } from "@/lib/universe";
import type { TouchInput } from "@/components/GameCanvas";
import { Button } from "@/components/ui/button";

const JOYSTICK_BASE = 72;
const JOYSTICK_KNOB = 28;
const DEAD_ZONE = 0.15;

/** True on phones/tablets with coarse primary pointer. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setCoarse(mq.matches || "ontouchstart" in window);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return coarse;
}

function axisFromOffset(dx: number, dy: number, radius: number): TouchInput {
  const len = Math.hypot(dx, dy);
  if (len < radius * DEAD_ZONE) return { x: 0, y: 0 };
  const nx = dx / radius;
  const ny = dy / radius;
  return {
    x: nx < -0.35 ? -1 : nx > 0.35 ? 1 : 0,
    y: ny < -0.35 ? -1 : ny > 0.35 ? 1 : 0,
  };
}

function actionLabel(near: Hotspot): string {
  switch (near.kind) {
    case "building":
      return `Enter ${near.name}`;
    case "npc":
      return `Talk to ${near.name}`;
    case "item":
      return `Pick up ${near.name}`;
    default:
      return near.name;
  }
}

/** On-screen joystick (bottom-right) and interact button (bottom-left) for touch play. */
export function MobileControls({
  touchInputRef,
  nearHotspot,
  paused,
  onInteract,
}: {
  touchInputRef: MutableRefObject<TouchInput>;
  nearHotspot: Hotspot | null;
  paused: boolean;
  onInteract: (hotspot: Hotspot) => void;
}) {
  const coarse = useCoarsePointer();
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);

  const resetJoystick = () => {
    activePointerRef.current = null;
    touchInputRef.current.x = 0;
    touchInputRef.current.y = 0;
    setKnob({ x: 0, y: 0 });
  };

  if (!coarse || paused) return null;

  const maxKnob = (JOYSTICK_BASE - JOYSTICK_KNOB) / 2;

  return (
    <>
      {/* Action — bottom-left */}
      <div
        className="pointer-events-auto fixed bottom-3 left-3 z-20 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
        aria-hidden={!nearHotspot}
      >
        <Button
          type="button"
          size="icon"
          sound="tap"
          disabled={!nearHotspot}
          aria-label={nearHotspot ? actionLabel(nearHotspot) : "Action"}
          className={`size-11 rounded-full text-sm font-bold ${
            nearHotspot
              ? "bg-main text-main-foreground shadow-shadow"
              : "bg-black/40 text-white/50"
          }`}
          onClick={() => {
            if (nearHotspot) onInteract(nearHotspot);
          }}
        >
          <Hand size={16} strokeWidth={2.5} />
        </Button>
      </div>

      {/* Joystick — bottom-right */}
      <div
        ref={baseRef}
        className="pointer-events-auto fixed bottom-3 right-3 z-20 touch-none pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]"
        style={{ width: JOYSTICK_BASE, height: JOYSTICK_BASE }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          activePointerRef.current = e.pointerId;
          baseRef.current?.setPointerCapture(e.pointerId);
          const rect = baseRef.current!.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const clampedLen = Math.min(maxKnob, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx);
          const kx = Math.cos(angle) * clampedLen;
          const ky = Math.sin(angle) * clampedLen;
          setKnob({ x: kx, y: ky });
          const axis = axisFromOffset(dx, dy, maxKnob);
          touchInputRef.current.x = axis.x;
          touchInputRef.current.y = axis.y;
        }}
        onPointerMove={(e) => {
          if (activePointerRef.current !== e.pointerId || !baseRef.current) return;
          e.preventDefault();
          const rect = baseRef.current.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const clampedLen = Math.min(maxKnob, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx);
          const kx = Math.cos(angle) * clampedLen;
          const ky = Math.sin(angle) * clampedLen;
          setKnob({ x: kx, y: ky });
          const axis = axisFromOffset(dx, dy, maxKnob);
          touchInputRef.current.x = axis.x;
          touchInputRef.current.y = axis.y;
        }}
        onPointerUp={(e) => {
          if (activePointerRef.current !== e.pointerId) return;
          resetJoystick();
        }}
        onPointerCancel={() => {
          resetJoystick();
        }}
        aria-label="Move joystick"
        role="application"
      >
        <div className="absolute inset-0 rounded-full border-2 border-white/25 bg-black/35 backdrop-blur-sm" />
        <div
          className="absolute left-1/2 top-1/2 rounded-full border-2 border-white/40 bg-main/90 shadow-shadow"
          style={{
            width: JOYSTICK_KNOB,
            height: JOYSTICK_KNOB,
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          }}
        />
      </div>
    </>
  );
}

/** Portrait-only overlay asking the player to rotate for landscape play. */
export function RotateToLandscapePrompt({ visible }: { visible: boolean }) {
  const coarse = useCoarsePointer();
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait) and (max-width: 48rem)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!visible || !coarse || !portrait) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink/90 px-8 text-center">
      <div className="rounded-base border-2 border-border bg-secondary-background px-6 py-8 shadow-shadow">
        <p className="font-display text-xl font-bold text-foreground">
          Rotate to landscape
        </p>
        <p className="mt-2 text-sm font-medium text-inksoft">
          Kahani plays best with your phone on its side.
        </p>
      </div>
    </div>
  );
}
