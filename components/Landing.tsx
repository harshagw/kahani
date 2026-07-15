"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { PREMISES } from "@/lib/premises";
import { createClient } from "@/lib/supabase/client";
import { PREMISE_ICON } from "./icons";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function Landing({ onStart }: { onStart: (idea: string) => void }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const submit = () => {
    const text = idea.trim();
    if (text) onStart(text);
  };

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-5xl grid-cols-1 items-start gap-10 px-6 py-14 md:grid-cols-[minmax(0,1fr)_1.25fr] md:gap-16 md:py-24">
      {/* Left-biased title block */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="md:sticky md:top-24"
      >
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-ink/15 pb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Generated live · Nano Banana 2 Lite
          </p>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="shrink-0 text-xs font-bold uppercase tracking-widest text-inksoft transition hover:text-ink disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <h1 className="font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-ink sm:text-7xl">
          Kahani
        </h1>
        <p className="mt-4 max-w-xs text-lg font-semibold text-ink">
          Describe a scene. Walk into it.
        </p>
        <p className="mt-4 max-w-sm text-sm font-medium leading-relaxed text-inksoft">
          Any Indian street, myth, or monsoon becomes a living, explorable
          world — places, characters, and voices generated as you play. WASD to
          move, E to enter.
        </p>
      </motion.header>

      {/* Scene-idea entry */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: EASE_OUT }}
      >
        <label
          htmlFor="scene-idea"
          className="mb-2 block text-xs font-bold uppercase tracking-widest text-inksoft"
        >
          Your opening scene
        </label>
        <div className="card rounded-2xl p-2">
          <textarea
            id="scene-idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={4}
            placeholder="e.g. A rain-flooded night market in Mumbai. I'm a courier carrying a sealed tiffin box someone will kill for…"
            className="w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] font-medium leading-relaxed text-ink outline-none placeholder:text-inksoft/50"
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-medium text-inksoft/70">
              Any place, any era, any story — ⌘↵ to start
            </span>
            <button
              onClick={submit}
              disabled={!idea.trim()}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft transition enabled:hover:brightness-105 enabled:active:scale-95 disabled:opacity-40"
            >
              Build my world
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* One-tap starting points */}
        <p className="mb-1 mt-8 text-xs font-bold uppercase tracking-widest text-inksoft">
          Or start from one of these
        </p>
        <ul>
          {PREMISES.map((premise, i) => {
            const Icon = PREMISE_ICON[premise.id];
            return (
              <motion.li
                key={premise.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.06, ease: EASE_OUT }}
              >
                <button
                  onClick={() => onStart(premise.setup)}
                  className="group flex w-full items-center gap-4 border-t border-ink/10 py-4 text-left transition-colors hover:border-primary/40"
                >
                  {Icon ? (
                    <Icon
                      size={22}
                      strokeWidth={1.75}
                      className="shrink-0 text-primary"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold text-ink">
                      {premise.title}
                    </h2>
                    <p className="truncate text-sm font-medium text-inksoft">
                      {premise.tagline}
                    </p>
                  </div>
                  <ArrowRight
                    size={17}
                    className="shrink-0 text-inksoft/40 transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary"
                  />
                </button>
              </motion.li>
            );
          })}
        </ul>

        <p className="mt-8 border-t border-ink/10 pt-5 text-xs font-medium text-inksoft/70">
          Real-time generative storytelling · built for the NB2 Lite hackathon
        </p>
      </motion.div>
    </div>
  );
}
