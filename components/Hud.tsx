"use client";

import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Premise, Scene } from "@/lib/types";
import {
  CLOCK_META,
  STAT_META,
  type Effects,
  type Stats,
} from "@/lib/stats";
import { CLOCK_ICON, GoalIcon, STAT_ICON } from "./icons";

/** Top HUD: stat meters, counters, and journey trail. */
export function Hud({
  premise,
  stats,
  clock,
  effects,
  timeCost,
  effectKey,
  progress,
  location,
  scenes,
}: {
  premise: Premise;
  stats: Stats;
  clock: number;
  effects: Effects;
  timeCost: number;
  effectKey: number;
  progress: number;
  location: string;
  scenes: Scene[];
}) {
  return (
    <div className="pointer-events-none flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Meter
          Icon={STAT_ICON.health}
          color={STAT_META.health.color}
          value={stats.health}
          delta={effects.health}
          effectKey={effectKey}
          low={stats.health <= 30}
        />
        <Meter
          Icon={CLOCK_ICON}
          color={CLOCK_META.color}
          value={clock}
          delta={timeCost ? -timeCost : undefined}
          effectKey={effectKey}
          low={clock <= 25}
        />
        <Counter
          Icon={STAT_ICON.rupees}
          color={STAT_META.rupees.color}
          value={`₹${stats.rupees.toLocaleString("en-IN")}`}
          delta={effects.rupees}
          effectKey={effectKey}
        />
        <Counter
          Icon={STAT_ICON.karma}
          color={STAT_META.karma.color}
          value={String(stats.karma)}
          delta={effects.karma}
          effectKey={effectKey}
        />
      </div>

      <JourneyTrail
        premise={premise}
        progress={progress}
        location={location}
        scenes={scenes}
      />
    </div>
  );
}

function Meter({
  Icon,
  color,
  value,
  delta,
  effectKey,
  low,
}: {
  Icon: LucideIcon;
  color: string;
  value: number;
  delta?: number;
  effectKey: number;
  low: boolean;
}) {
  return (
    <Card className="relative flex-row items-center gap-1.5 px-2.5 py-1.5">
      <Icon size={13} strokeWidth={2.25} style={{ color }} />
      <Progress
        value={Math.max(0, Math.min(100, value))}
        className="h-1.5 w-12 sm:w-16 [&_[data-slot=progress-indicator]]:transition-all"
        style={
          {
            ["--progress-color" as string]: color,
          } as CSSProperties
        }
      />
      <span
        className={`w-5 text-right text-[11px] font-bold tabular-nums ${
          low ? "text-health" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <Delta delta={delta} effectKey={effectKey} />
    </Card>
  );
}

function Counter({
  Icon,
  color,
  value,
  delta,
  effectKey,
}: {
  Icon: LucideIcon;
  color: string;
  value: string;
  delta?: number;
  effectKey: number;
}) {
  return (
    <Card className="relative flex-row items-center gap-1.5 px-2.5 py-1.5">
      <Icon size={13} strokeWidth={2.25} style={{ color }} />
      <span className="text-[11px] font-bold tabular-nums text-foreground">
        {value}
      </span>
      <Delta delta={delta} effectKey={effectKey} />
    </Card>
  );
}

function Delta({ delta, effectKey }: { delta?: number; effectKey: number }) {
  return (
    <AnimatePresence>
      {typeof delta === "number" && delta !== 0 && (
        <motion.span
          key={effectKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: -18 }}
          exit={{ opacity: 0, y: -26 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute -top-1 right-1 text-[11px] font-extrabold tabular-nums ${
            delta > 0 ? "text-kind" : "text-health"
          }`}
        >
          {delta > 0 ? `+${delta}` : delta}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function JourneyTrail({
  premise,
  progress,
  location,
  scenes,
}: {
  premise: Premise;
  progress: number;
  location: string;
  scenes: Scene[];
}) {
  const pct = Math.max(0, Math.min(100, progress));

  return (
    <Card className="w-full max-w-sm gap-0 px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold text-main">
          {location || "…"}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-inksoft">
          {pct}%
          <GoalIcon size={11} strokeWidth={2.25} />
          {premise.goalLabel}
        </span>
      </div>

      <div className="relative h-4">
        <div className="absolute top-1/2 left-1 right-4 h-1.5 -translate-y-1/2 rounded-full bg-foreground/10" />
        <motion.div
          className="absolute top-1/2 left-1 h-1.5 -translate-y-1/2 rounded-full bg-main"
          initial={false}
          animate={{ width: `calc(${Math.min(pct, 94)}% - 4px)` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
        {scenes.map((s, i) => (
          <div
            key={i}
            className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/25"
            style={{ left: `${Math.min(Math.max(s.progress, 0), 94)}%` }}
          />
        ))}
        <motion.div
          className="absolute top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-secondary-background bg-main"
          initial={false}
          animate={{ left: `${Math.min(pct, 94)}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
        <GoalIcon
          size={13}
          strokeWidth={2.25}
          className="absolute top-1/2 right-0 -translate-y-1/2 text-inksoft"
        />
      </div>
    </Card>
  );
}
