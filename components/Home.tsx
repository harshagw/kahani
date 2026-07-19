"use client";

/**
 * Gallery-forward home page: create entry, your saved worlds, and community grid.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Trash2 } from "lucide-react";
import { World } from "@/components/World";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BrandLogo } from "@/components/BrandLogo";
import { HomePageSkeleton } from "@/components/HomePageSkeleton";
import { MAX_CREATE_IDEA_LENGTH } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { GameListItem } from "@/lib/types/client";

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
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [creatingIdea, setCreatingIdea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const gameList = await request<GameListItem[]>("/api/games");
      setGames(gameList);
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
  const gallery = userId ? games.filter((g) => g.owner !== userId) : games;

  const startCreate = () => {
    const text = idea.trim();
    if (!text) return;
    setCreatingIdea(text);
  };

  const signOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/games/${deleteTarget}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed.");
      }
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setDeleteTarget(null);
    }
  };

  if (creatingIdea) {
    return <World mode="create" initialIdea={creatingIdea} />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-6 py-14 md:py-24">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mb-12 border-b-2 border-border pb-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-main">
            Community gallery · saved worlds
          </p>
          <Button
            type="button"
            variant="noShadow"
            className="h-auto shrink-0 bg-transparent p-0 text-xs font-bold uppercase tracking-widest text-inksoft hover:translate-x-0 hover:translate-y-0 hover:shadow-shadow hover:text-foreground"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
          <BrandLogo size={60} className="h-18 w-18 shrink-0" />
          <div>
            <h1 className="font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-foreground sm:text-7xl">
              Kahani
            </h1>
          </div>
        </div>
                    <p className="mt-4 max-w-lg text-lg font-semibold text-foreground">
              Walk worlds others have built — or describe your own.
            </p>
      </motion.header>

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <HomePageSkeleton />
      ) : (
        <>
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06, ease: EASE_OUT }}
            className="mb-14"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-inksoft">
              Create
            </p>
            <Card>
              <CardContent>
                <Textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      startCreate();
                  }}
                  maxLength={MAX_CREATE_IDEA_LENGTH}
                  rows={3}
                  placeholder="e.g. A rain-flooded night market in Mumbai. I'm a courier carrying a sealed tiffin box someone will kill for…"
                  className="resize-none"
                />
              </CardContent>
              <CardFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] font-medium text-inksoft/70">
                  ⌘↵ to build
                </span>
                <Button onClick={startCreate} disabled={!idea.trim()}>
                  Build a new world
                  <ArrowRight size={15} />
                </Button>
              </CardFooter>
            </Card>
          </motion.section>

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
                    transition={{
                      duration: 0.4,
                      delay: 0.1 + i * 0.05,
                      ease: EASE_OUT,
                    }}
                  >
                    <div className="group flex w-full items-center gap-4 border-t-2 border-border py-4">
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-base border-2 border-border bg-foreground/10">
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
                        <h2 className="font-display text-lg font-bold text-foreground">
                          {game.title}
                        </h2>
                        <p className="text-xs font-medium text-inksoft">
                          {new Date(game.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => router.push(`/play/${game.id}`)}
                      >
                        Continue
                      </Button>
                      <Button
                        type="button"
                        variant="neutral"
                        size="icon"
                        className="shrink-0 text-inksoft hover:text-health"
                        onClick={() => setDeleteTarget(game.id)}
                        title="Delete world"
                      >
                        <Trash2 size={16} />
                      </Button>
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
            {gallery.length === 0 ? (
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
                    transition={{
                      duration: 0.4,
                      delay: 0.12 + i * 0.04,
                      ease: EASE_OUT,
                    }}
                    onClick={() => router.push(`/play/${game.id}`)}
                    className="group relative aspect-4/3 overflow-hidden rounded-base border-2 border-border text-left shadow-shadow transition hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none"
                  >
                    {game.thumbnailUrl ? (
                      <img
                        src={game.thumbnailUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-foreground/10" />
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-foreground/80 via-foreground/20 to-transparent" />
                    <p className="absolute inset-x-0 bottom-0 px-3 pb-3 font-display text-sm font-bold text-white">
                      {game.title}
                    </p>
                  </motion.button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this world?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
