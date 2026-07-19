"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { playSfx } from "@/lib/sfx";
import type { DialogueTurn, NpcDef } from "@/lib/universe";

const MOOD_COLOR: Record<string, string> = {
  warm: "#6b8e5a",
  wary: "#b3862f",
  fearful: "#6d5f97",
  urgent: "#c04a2f",
  secretive: "#4a7c88",
  amused: "#b3862f",
  angry: "#b34a44",
};

/** In-world NPC conversation panel with reply chips and free-text input. */
export function DialogueBox({
  npc,
  history,
  options,
  thinking,
  speaking,
  voiceOn,
  mood,
  onToggleVoice,
  onSay,
  onClose,
}: {
  npc: NpcDef;
  history: DialogueTurn[];
  options: string[];
  thinking: boolean;
  speaking: boolean;
  voiceOn: boolean;
  mood?: string;
  onToggleVoice: () => void;
  onSay: (line: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastNpcLine = [...history].reverse().find((t) => t.speaker === "npc");

  const [typed, setTyped] = useState(0);
  useEffect(() => {
    setTyped(0);
    if (!lastNpcLine) return;
    const iv = setInterval(() => {
      setTyped((n) => {
        if (n >= lastNpcLine.text.length) {
          clearInterval(iv);
          return n;
        }
        return n + 2;
      });
    }, 18);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNpcLine?.text]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [history.length, thinking, typed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (document.activeElement?.tagName === "INPUT") return;
      const n = Number(e.key);
      if (!thinking && n >= 1 && n <= options.length) {
        playSfx("tap"); // keyboard picks mirror the chip click sound
        onSay(options[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, thinking, onSay, onClose]);

  const moodColor = mood ? (MOOD_COLOR[mood] ?? "#7c6d61") : undefined;

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto w-full max-w-2xl"
    >
      <Card className="gap-0 rounded-t-base py-4 sm:rounded-base">
        <CardContent className="px-5">
          <div className="mb-2 flex items-center gap-2.5">
            <div>
              <p className="font-display text-lg font-bold leading-none text-foreground">
                {npc.name}
              </p>
              <p className="mt-0.5 text-xs font-medium text-inksoft">
                {npc.role}
              </p>
            </div>
            {mood && moodColor && (
              <Badge
                variant="neutral"
                className="uppercase tracking-wide"
                style={{
                  color: moodColor,
                  backgroundColor: `${moodColor}18`,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: moodColor }}
                />
                {mood}
              </Badge>
            )}
            <Button
              type="button"
              variant={voiceOn ? "noShadow" : "neutral"}
              size="icon"
              sound={voiceOn ? "toggleOff" : "toggleOn"}
              className={`ml-auto size-8 ${voiceOn ? "bg-main/10 text-main" : ""}`}
              onClick={onToggleVoice}
              title={voiceOn ? "Voice on" : "Voice off"}
            >
              {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </Button>
            {/* Silent: closing already plays the "close" sweep via World. */}
            <Button
              type="button"
              variant="neutral"
              size="sm"
              sound="none"
              onClick={onClose}
            >
              Esc · leave
            </Button>
          </div>

          <div
            ref={scrollRef}
            className="no-scrollbar max-h-36 space-y-1.5 overflow-y-auto pb-1"
          >
            {history.slice(-6).map((t, i, arr) => {
              const isLastNpc =
                t.speaker === "npc" &&
                t.text === lastNpcLine?.text &&
                i === arr.length - 1;
              return (
                <p
                  key={`${i}-${t.text.slice(0, 12)}`}
                  className={
                    t.speaker === "npc"
                      ? "text-[15px] font-medium leading-snug text-foreground"
                      : "text-right text-sm font-semibold text-main"
                  }
                >
                  {isLastNpc ? t.text.slice(0, typed) : t.text}
                </p>
              );
            })}
            {thinking && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-inksoft">
                <span className="animate-breathe inline-block size-1.5 rounded-full bg-main" />
                <span
                  className="animate-breathe inline-block size-1.5 rounded-full bg-main"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="animate-breathe inline-block size-1.5 rounded-full bg-main"
                  style={{ animationDelay: "0.3s" }}
                />
              </p>
            )}
            {speaking && !thinking && lastNpcLine && (
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-main/70">
                <Volume2 size={11} /> speaking…
              </p>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!thinking && options.length > 0 && (
              <motion.div
                key={history.length}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-2.5 flex flex-wrap gap-2"
              >
                {options.map((opt, i) => (
                  <Button
                    key={opt}
                    type="button"
                    variant="neutral"
                    size="sm"
                    sound="tap"
                    className="h-auto whitespace-normal py-2 text-left"
                    onClick={() => onSay(opt)}
                  >
                    <span className="text-[11px] font-bold tabular-nums text-main">
                      {i + 1}.
                    </span>
                    {opt}
                  </Button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const line = draft.trim();
              if (!line || thinking) return;
              setDraft("");
              onSay(line);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Say anything to ${npc.name}…`}
              className="min-w-0 flex-1 rounded-base"
            />
            <Button
              type="submit"
              size="icon"
              sound="tap"
              disabled={thinking || !draft.trim()}
            >
              <Send size={15} />
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
