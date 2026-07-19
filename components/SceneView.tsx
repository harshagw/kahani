"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Premise, Scene } from "@/lib/types";
import { MAX_TURNS } from "@/lib/constants";
import { TAG_META, type Choice, type Stats } from "@/lib/stats";
import { Hud } from "./Hud";
import { LoadingBlock } from "./LoadingBlock";
import { InstantIcon, PREMISE_ICON, TAG_ICON } from "./icons";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Legacy turn-based scene view with choice grid. */
export function SceneView({
  premise,
  scene,
  stats,
  clock,
  progress,
  scenes,
  busy,
  pendingChoice,
  readyIndices,
  error,
  onChoose,
  onRetry,
  onFinish,
  onQuit,
}: {
  premise: Premise;
  scene: Scene | null;
  stats: Stats;
  clock: number;
  progress: number;
  scenes: Scene[];
  busy: boolean;
  pendingChoice: string | null;
  readyIndices: Set<number>;
  error: string | null;
  onChoose: (option: string, index: number) => void;
  onRetry: () => void;
  onFinish: () => void;
  onQuit: () => void;
}) {
  const isFirstLoad = !scene && busy;
  const readyCount = scene
    ? scene.choices.filter((_, i) => readyIndices.has(i)).length
    : 0;

  if (isFirstLoad || !scene) {
    return <FirstLoad premise={premise} error={error} onRetry={onRetry} />;
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-foreground">
      <div className="absolute inset-0">
        <AnimatePresence mode="popLayout">
          <motion.img
            key={scene.turn}
            src={scene.image}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="animate-kenburns absolute inset-0 h-full w-full object-cover"
          />
        </AnimatePresence>
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/45 to-transparent" />
      </div>

      <div className="relative z-10 flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <Hud
            premise={premise}
            stats={stats}
            clock={clock}
            effects={scene.effects}
            timeCost={scene.timeCost}
            effectKey={scene.turn}
            progress={progress}
            location={scene.location}
            scenes={scenes}
          />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button variant="neutral" size="sm" onClick={onQuit}>
            Leave
          </Button>
          <Badge variant="neutral" className="bg-black/55 text-white">
            Ch. {Math.min(scene.turn, MAX_TURNS)}
          </Badge>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-0 sm:px-4 sm:pb-4">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          className="w-full max-w-2xl"
        >
          <Card className="gap-0 rounded-t-base py-5 sm:rounded-base">
            <CardContent className="px-5">
              <AnimatePresence mode="wait">
                {scene.outcomeFlash && !scene.isEnding && (
                  <motion.div
                    key={`flash-${scene.turn}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                    className="mb-2.5"
                  >
                    <Badge variant="neutral" className="bg-main/10 text-main">
                      <span className="size-1.5 rounded-full bg-main" />
                      {scene.outcomeFlash}
                    </Badge>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.p
                  key={scene.turn}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                  className="font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl"
                >
                  {scene.caption}
                </motion.p>
              </AnimatePresence>

              {scene.isEnding ? (
                <EndingBlock
                  title={scene.endingTitle}
                  kind={scene.endingKind}
                  onFinish={onFinish}
                />
              ) : (
                <>
                  <div className="mt-4 mb-2.5 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-inksoft">
                      Choose your move
                    </span>
                    <PregenMeter
                      ready={readyCount}
                      total={scene.choices.length}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {scene.choices.map((choice, i) => (
                      <ChoiceButton
                        key={`${scene.turn}-${i}`}
                        index={i}
                        choice={choice}
                        disabled={busy}
                        pending={pendingChoice === choice.text}
                        dimmed={busy && pendingChoice !== choice.text}
                        ready={readyIndices.has(i)}
                        onClick={() => onChoose(choice.text, i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ ease: EASE_OUT }}
            className="absolute inset-x-0 top-24 z-30 mx-auto flex w-[min(92%,28rem)] items-center gap-3"
          >
            <Alert variant="destructive" className="flex-1">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button variant="neutral" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChoiceButton({
  index,
  choice,
  disabled,
  pending,
  dimmed,
  ready,
  onClick,
}: {
  index: number;
  choice: Choice;
  disabled: boolean;
  pending: boolean;
  dimmed: boolean;
  ready: boolean;
  onClick: () => void;
}) {
  const tag = TAG_META[choice.tag];
  const Icon = TAG_ICON[choice.tag];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dimmed ? 0.45 : 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.04 + index * 0.05, ease: EASE_OUT }}
    >
      <Button
        variant="neutral"
        disabled={disabled}
        onClick={onClick}
        className={`relative h-auto w-full justify-start gap-3 whitespace-normal py-2.5 text-left ${
          pending ? "border-main/40 bg-main/8" : ""
        } ${disabled ? "cursor-default" : ""}`}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-base border-2 border-border"
          style={{ backgroundColor: `${tag.color}18`, color: tag.color }}
          title={`${tag.label} approach`}
        >
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <span className="flex-1 text-[15px] font-bold leading-tight text-foreground">
          {choice.text}
        </span>
        {pending ? (
          <span className="flex gap-1 pr-1">
            <Dot delay={0} />
            <Dot delay={0.15} />
            <Dot delay={0.3} />
          </span>
        ) : ready ? (
          <span
            className="flex size-6 items-center justify-center rounded-full bg-kind/12 text-kind"
            title="Pre-generated — instant"
          >
            <InstantIcon size={13} strokeWidth={2.5} />
          </span>
        ) : (
          <ChevronRight size={16} className="text-inksoft/40" />
        )}
      </Button>
    </motion.div>
  );
}

function PregenMeter({ ready, total }: { ready: number; total: number }) {
  const done = ready >= total;
  return (
    <motion.div layout>
      <Badge
        variant="neutral"
        className={`uppercase tracking-wide ${
          done ? "bg-kind/12 text-kind" : "text-inksoft"
        }`}
        title={
          done
            ? "All four outcomes pre-generated — tapping is instant"
            : "Generating all four branches in parallel while you decide"
        }
      >
        <InstantIcon
          size={12}
          strokeWidth={2.5}
          className={done ? "" : "animate-breathe"}
        />
        <span className="flex gap-0.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-3 rounded-full transition-colors duration-300 ${
                i < ready ? "bg-kind" : "animate-breathe bg-foreground/15"
              }`}
            />
          ))}
        </span>
        <span>
          {done ? "Moves ready · instant" : `Pre-generating ${ready}/${total}`}
        </span>
      </Badge>
    </motion.div>
  );
}

function EndingBlock({
  title,
  kind,
  onFinish,
}: {
  title?: string;
  kind?: "victory" | "defeat" | "neutral";
  onFinish: () => void;
}) {
  const label =
    kind === "victory"
      ? "You reached your goal"
      : kind === "defeat"
        ? "Your journey ends here"
        : "Your story ends";
  const accent =
    kind === "victory"
      ? "text-kind"
      : kind === "defeat"
        ? "text-health"
        : "text-main";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT }}
      className="mt-4 flex flex-col items-start gap-3"
    >
      <p className={`text-xs font-bold uppercase tracking-[0.2em] ${accent}`}>
        {label}
      </p>
      {title && (
        <h2 className="font-display text-2xl font-extrabold text-foreground">
          {title}
        </h2>
      )}
      <Button className="mt-1" onClick={onFinish}>
        See your journey →
      </Button>
    </motion.div>
  );
}

function FirstLoad({
  premise,
  error,
  onRetry,
}: {
  premise: Premise;
  error: string | null;
  onRetry: () => void;
}) {
  const Icon = PREMISE_ICON[premise.id];
  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center px-6 text-center">
      <Card className="flex size-20 items-center justify-center text-main">
        {Icon ? <Icon size={34} strokeWidth={2} /> : null}
      </Card>
      <h2 className="mt-5 font-display text-3xl font-extrabold text-foreground">
        {premise.title}
      </h2>
      {error ? (
        <div className="mt-5 flex flex-col items-center gap-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="neutral" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <LoadingBlock label="Setting the scene…" className="mt-3 w-44" />
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="animate-breathe inline-block size-1.5 rounded-full bg-main"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}
