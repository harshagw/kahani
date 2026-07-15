"use client";

/**
 * Gallery-forward home page: create entry, your saved worlds, and community grid.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  GameListItem,
  GenerationQuota,
  ProfileResponse,
} from "@/lib/types/client";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Authenticated JSON fetch with consistent error handling. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

/** Default post-login landing: create CTA, owned worlds, and public gallery. */
export function Home() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [games, setGames] = useState<GameListItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [quota, setQuota] = useState<GenerationQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [gameList, profile] = await Promise.all([
        request<GameListItem[]>("/api/games"),
        request<ProfileResponse>("/api/profile"),
      ]);
      setGames(gameList);
      setQuota(profile.generation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gallery.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mine = userId ? games.filter((g) => g.owner === userId) : [];
  // Everyone else's worlds — replay loads from storage, no new generation.
  const gallery = userId ? games.filter((g) => g.owner !== userId) : games;

  /** Navigate to create flow; quota is enforced again server-side. */
  const startCreate = () => {
    const text = idea.trim();
    if (!text || !quota?.canCreate) return;
    router.push(`/play/new?idea=${encodeURIComponent(text)}`);
  };

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const deleteGame = async (id: string) => {
    if (!confirm("Delete this world? This cannot be undone.")) return;
    try {
      // 204 No Content — no JSON body on success.
      const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed.");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const quotaMessage = !quota?.canCreate
    ? quota?.limit === 0
      ? "Creating new worlds is currently disabled."
      : "You've used your free world."
    : null;

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-6 py-14 md:py-24">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mb-12 border-b border-ink/15 pb-6"
      >
        <div className="mb-4 flex items-end justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Community gallery · saved worlds
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
        <p className="mt-4 max-w-md text-lg font-semibold text-ink">
          Walk worlds others have built — or describe your own.
        </p>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.06, ease: EASE_OUT }}
        className="mb-14"
      >
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-inksoft">
          Create
        </p>
        {quota?.canCreate ? (
          <div className="card rounded-2xl p-2">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startCreate();
              }}
              rows={3}
              placeholder="e.g. A rain-flooded night market in Mumbai. I'm a courier carrying a sealed tiffin box someone will kill for…"
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] font-medium leading-relaxed text-ink outline-none placeholder:text-inksoft/50"
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[11px] font-medium text-inksoft/70">
                ⌘↵ to build · {quota.unlimited ? "unlimited" : `${quota.used}/${quota.limit} used`}
              </span>
              <button
                onClick={startCreate}
                disabled={!idea.trim()}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft transition enabled:hover:brightness-105 enabled:active:scale-95 disabled:opacity-40"
              >
                Build a new world
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-ink/10 bg-ink/5 px-4 py-5">
            <p className="text-sm font-semibold text-ink">{quotaMessage}</p>
            {mine.length > 0 && (
              <button
                type="button"
                onClick={() => router.push(`/play/${mine[0].id}`)}
                className="mt-3 text-sm font-bold text-primary transition hover:underline"
              >
                Continue your world →
              </button>
            )}
          </div>
        )}
      </motion.section>

      {error && (
        <p className="mb-8 text-sm font-semibold text-health">{error}</p>
      )}

      {mine.length > 0 && (
        <section className="mb-14">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-inksoft">
            Your world{mine.length > 1 ? "s" : ""}
          </p>
          <ul>
            {mine.map((game, i) => (
              <motion.li
                key={game.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease: EASE_OUT }}
              >
                <div className="group flex w-full items-center gap-4 border-t border-ink/10 py-4">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink/10">
                    {game.thumbnailUrl ? (
                      <img
                        src={game.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-inksoft">
                        …
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold text-ink">{game.title}</h2>
                    <p className="text-xs font-medium text-inksoft">
                      {new Date(game.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/play/${game.id}`)}
                    className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white transition hover:brightness-105"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteGame(game.id)}
                    className="shrink-0 rounded-full p-2 text-inksoft transition hover:bg-health/10 hover:text-health"
                    title="Delete world"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-inksoft">
          Community worlds
        </p>
        {loading ? (
          <p className="text-sm font-medium text-inksoft">Loading gallery…</p>
        ) : gallery.length === 0 ? (
          <p className="text-sm font-medium text-inksoft">
            No community worlds yet — be the first to build one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
            {gallery.map((game, i) => (
              <motion.button
                key={game.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12 + i * 0.04, ease: EASE_OUT }}
                onClick={() => router.push(`/play/${game.id}`)}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-ink/10 text-left transition hover:border-primary/40"
              >
                {game.thumbnailUrl ? (
                  <img
                    src={game.thumbnailUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-ink/10" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                <p className="absolute inset-x-0 bottom-0 px-3 pb-3 font-display text-sm font-bold text-white">
                  {game.title}
                </p>
              </motion.button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
