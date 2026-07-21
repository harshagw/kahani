"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Eye,
  Flame,
  Hourglass,
  LogOut,
  Map,
  Music,
  Package,
  Search,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { FinaleData, Premise } from "@/lib/types/client";
import type { GameBible, SceneData } from "@/lib/universe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Minimap, type MinimapCell } from "@/components/Minimap";

/** Format remaining session seconds as `m:ss`. */
function formatSessionTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type WorldHudProps = {
  compact: boolean;
  premise: Premise;
  scene: SceneData;
  questHook: string;
  secondsLeft: number;
  inventory: string[];
  bible: GameBible | null;
  cluesFound: boolean[];
  allCluesFound: boolean;
  finale: FinaleData | null;
  finaleLoading: boolean;
  heat: number;
  showVision: boolean;
  onToggleVision: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
  voiceOn: boolean;
  onToggleVoice: () => void;
  onLeaveWorld: () => void;
  onRunFinale: (outcome: "victory") => void;
  dialogue: unknown;
  knownStreets: MinimapCell[];
  walkedStreets: string[];
  minimapCoord: { x: number; y: number } | null;
  playerPos: { x: number; y: number } | null;
};

/** Compact icon button used in the mobile HUD chrome. */
function MobileHudIconButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "neutral"}
      size="icon"
      hoverSound="hover"
      aria-label={label}
      title={label}
      className="size-8 [&_svg]:size-3.5"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Top HUD overlay for explorable worlds — full layout on desktop, collapsible on touch. */
export function WorldHud({
  compact,
  premise,
  scene,
  questHook,
  secondsLeft,
  inventory,
  bible,
  cluesFound,
  allCluesFound,
  finale,
  finaleLoading,
  heat,
  showVision,
  onToggleVision,
  musicOn,
  onToggleMusic,
  voiceOn,
  onToggleVoice,
  onLeaveWorld,
  onRunFinale,
  dialogue,
  knownStreets,
  walkedStreets,
  minimapCoord,
  playerPos,
}: WorldHudProps) {
  const [questOpen, setQuestOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const timeLabel = formatSessionTime(secondsLeft);
  const lowTime = secondsLeft <= 60;
  const showMinimap = !dialogue && !finale;

  const questSummary = (
    <>
      <Card className="gap-0 px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="line-clamp-1 text-[10px] font-bold uppercase tracking-widest text-inksoft">
          {premise.title} · {scene.title}
        </p>
        {questHook && (
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
            {questHook}
          </p>
        )}
      </Card>
      <Card className="flex w-fit flex-row items-center gap-2 px-3 py-1.5">
        <Hourglass
          size={12}
          strokeWidth={2.5}
          className={lowTime ? "text-health" : "text-main"}
        />
        <span className="text-[10px] font-bold uppercase tracking-widest text-inksoft">
          Time
        </span>
        <span
          className={`text-[11px] font-bold tabular-nums ${
            lowTime ? "text-health" : "text-foreground"
          }`}
        >
          {timeLabel}
        </span>
      </Card>
      {inventory.length > 0 && (
        <Card className="flex w-fit max-w-xs flex-row flex-wrap items-center gap-1.5 gap-y-1 px-3 py-1.5">
          <Package size={12} strokeWidth={2.5} className="text-main" />
          {inventory.map((it) => (
            <Badge key={it} variant="neutral" className="text-[10px]">
              {it}
            </Badge>
          ))}
        </Card>
      )}
      {bible && (
        <Card className="flex w-fit flex-row items-center gap-2 px-3 py-1.5">
          <Search size={12} strokeWidth={2.5} className="text-main" />
          <span className="flex gap-1">
            {cluesFound.map((found, i) => (
              <span
                key={i}
                className={`h-1.5 w-4 rounded-full ${
                  found ? "bg-main" : "bg-foreground/15"
                }`}
              />
            ))}
          </span>
          <span className="text-[11px] font-bold tabular-nums text-foreground">
            {cluesFound.filter(Boolean).length}/{cluesFound.length} clues
          </span>
          {allCluesFound && !finale && (
            <Button
              size="sm"
              className="pointer-events-auto ml-1 h-7 px-3 text-[11px]"
              onClick={() => onRunFinale("victory")}
              disabled={finaleLoading}
            >
              {finaleLoading ? "Unraveling…" : "Unravel the truth"}
            </Button>
          )}
        </Card>
      )}
      {bible && heat > 0 && (
        <Card className="flex w-fit flex-row items-center gap-2 px-3 py-1.5">
          <Flame
            size={12}
            strokeWidth={2.5}
            className={heat >= 60 ? "text-health" : "text-inksoft"}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-inksoft">
            {bible.heatLabel}
          </span>
          <Progress
            value={heat}
            className="h-1.5 w-16 [&_[data-slot=progress-indicator]]:bg-health"
          />
          <span className="text-[11px] font-bold tabular-nums text-foreground">
            {heat}
          </span>
        </Card>
      )}
    </>
  );

  const utilityButtons = (
    <>
      {scene.annotated && (
        <Button
          variant={showVision ? "default" : "neutral"}
          size="icon"
          hoverSound="hover"
          onClick={onToggleVision}
          title={
            showVision
              ? "Engine vision: the borders the model traced over its own frame"
              : "Show what the engine sees"
          }
        >
          <Eye size={15} />
        </Button>
      )}
      <Button
        variant={musicOn ? "default" : "neutral"}
        size="icon"
        sound={musicOn ? "toggleOff" : "toggleOn"}
        hoverSound="hover"
        onClick={onToggleMusic}
        title={musicOn ? "Music on" : "Music off"}
      >
        <Music size={15} className={musicOn ? "" : "opacity-40"} />
      </Button>
      <Button
        variant={voiceOn ? "default" : "neutral"}
        size="icon"
        sound={voiceOn ? "toggleOff" : "toggleOn"}
        hoverSound="hover"
        onClick={onToggleVoice}
        title={voiceOn ? "Voice on" : "Voice off"}
      >
        {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </Button>
      <Button
        variant="neutral"
        size="sm"
        sound="close"
        hoverSound="hover"
        onClick={onLeaveWorld}
      >
        Leave world
      </Button>
    </>
  );

  if (!compact) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 sm:gap-3 sm:p-4">
        <div className="flex max-w-[45vw] flex-col gap-1.5 sm:max-w-sm sm:gap-2">
          {questSummary}
        </div>
        <div className="pointer-events-none flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            {utilityButtons}
          </div>
          {showMinimap && (
            <Minimap
              known={knownStreets}
              walked={walkedStreets}
              currentCoord={minimapCoord}
              player={playerPos}
              inside={scene.kind === "interior"}
              compact={false}
            />
          )}
        </div>
      </div>
    );
  }

  const cluesCount = cluesFound.filter(Boolean).length;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-1.5 p-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] pl-[max(0.375rem,env(safe-area-inset-left))] pr-[max(0.375rem,env(safe-area-inset-right))]">
      <div className="relative flex max-w-[52vw] flex-col gap-1">
        <Button
          type="button"
          variant="neutral"
          hoverSound="hover"
          aria-expanded={questOpen}
          aria-label={questOpen ? "Collapse quest info" : "Expand quest info"}
          className="pointer-events-auto h-auto max-w-full justify-start gap-1.5 px-2 py-1 text-left"
          onClick={() => {
            setQuestOpen((open) => !open);
            setSettingsOpen(false);
          }}
        >
          <Hourglass
            size={11}
            strokeWidth={2.5}
            className={`shrink-0 ${lowTime ? "text-health" : "text-main"}`}
          />
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold leading-tight text-foreground">
            {scene.title}
          </span>
          <span
            className={`shrink-0 text-[10px] font-bold tabular-nums ${
              lowTime ? "text-health" : "text-inksoft"
            }`}
          >
            {timeLabel}
          </span>
          <ChevronDown
            size={12}
            className={`shrink-0 text-inksoft transition-transform ${
              questOpen ? "rotate-180" : ""
            }`}
          />
        </Button>

        <AnimatePresence>
          {questOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto flex max-h-[38dvh] flex-col gap-1 overflow-y-auto"
            >
              <Card className="gap-0 px-2 py-1.5">
                <p className="line-clamp-1 text-[9px] font-bold uppercase tracking-widest text-inksoft">
                  {premise.title} · {scene.title}
                </p>
                {questHook && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-snug text-foreground">
                    {questHook}
                  </p>
                )}
              </Card>
              {inventory.length > 0 && (
                <Card className="flex w-fit max-w-full flex-row flex-wrap items-center gap-1 px-2 py-1">
                  <Package size={10} strokeWidth={2.5} className="text-main" />
                  {inventory.map((it) => (
                    <Badge key={it} variant="neutral" className="text-[9px]">
                      {it}
                    </Badge>
                  ))}
                </Card>
              )}
              {bible && (
                <Card className="flex w-fit max-w-full flex-row flex-wrap items-center gap-1.5 px-2 py-1">
                  <Search size={10} strokeWidth={2.5} className="text-main" />
                  <span className="flex gap-0.5">
                    {cluesFound.map((found, i) => (
                      <span
                        key={i}
                        className={`h-1 w-3 rounded-full ${
                          found ? "bg-main" : "bg-foreground/15"
                        }`}
                      />
                    ))}
                  </span>
                  <span className="text-[10px] font-bold tabular-nums text-foreground">
                    {cluesCount}/{cluesFound.length}
                  </span>
                  {allCluesFound && !finale && (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onRunFinale("victory")}
                      disabled={finaleLoading}
                    >
                      {finaleLoading ? "…" : "Unravel"}
                    </Button>
                  )}
                </Card>
              )}
              {bible && heat > 0 && (
                <Card className="flex w-fit max-w-full flex-row items-center gap-1.5 px-2 py-1">
                  <Flame
                    size={10}
                    strokeWidth={2.5}
                    className={heat >= 60 ? "text-health" : "text-inksoft"}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-inksoft">
                    {bible.heatLabel}
                  </span>
                  <Progress
                    value={heat}
                    className="h-1 min-w-10 flex-1 [&_[data-slot=progress-indicator]]:bg-health"
                  />
                  <span className="text-[10px] font-bold tabular-nums text-foreground">
                    {heat}
                  </span>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative flex flex-col items-end gap-1">
        <div className="pointer-events-auto flex items-center gap-1">
          {showMinimap && (
            <MobileHudIconButton
              active={mapOpen}
              label={mapOpen ? "Hide map" : "Show map"}
              onClick={() => {
                setMapOpen((open) => !open);
                setSettingsOpen(false);
              }}
            >
              <Map />
            </MobileHudIconButton>
          )}
          <MobileHudIconButton
            active={settingsOpen}
            label={settingsOpen ? "Close settings" : "Open settings"}
            onClick={() => {
              setSettingsOpen((open) => !open);
              setQuestOpen(false);
            }}
          >
            <Settings2 />
          </MobileHudIconButton>
          <MobileHudIconButton label="Leave world" onClick={onLeaveWorld}>
            <LogOut />
          </MobileHudIconButton>
        </div>

        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto"
            >
              <Card className="flex flex-row items-center gap-1 px-1 py-1">
                {scene.annotated && (
                  <MobileHudIconButton
                    active={showVision}
                    label={
                      showVision ? "Hide engine vision" : "Show engine vision"
                    }
                    onClick={onToggleVision}
                  >
                    <Eye />
                  </MobileHudIconButton>
                )}
                <MobileHudIconButton
                  active={musicOn}
                  label={musicOn ? "Music on" : "Music off"}
                  onClick={onToggleMusic}
                >
                  <Music className={musicOn ? "" : "opacity-40"} />
                </MobileHudIconButton>
                <MobileHudIconButton
                  active={voiceOn}
                  label={voiceOn ? "Voice on" : "Voice off"}
                  onClick={onToggleVoice}
                >
                  {voiceOn ? <Volume2 /> : <VolumeX />}
                </MobileHudIconButton>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {mapOpen && showMinimap && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
            >
              <Minimap
                known={knownStreets}
                walked={walkedStreets}
                currentCoord={minimapCoord}
                player={playerPos}
                inside={scene.kind === "interior"}
                compact
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
