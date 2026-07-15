"use client";

/**
 * Create entry point: validates quota, then starts live world generation.
 * Idea is read once from sessionStorage (set on Home) — not the URL.
 * Redirects to `/` when creation is disabled, over quota, or idea is missing.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { World } from "@/components/World";
import { CREATE_IDEA_STORAGE_KEY } from "@/lib/constants";

export default function PlayNewPage() {
  const router = useRouter();
  const [idea, setIdea] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stored = sessionStorage.getItem(CREATE_IDEA_STORAGE_KEY)?.trim() ?? "";
    sessionStorage.removeItem(CREATE_IDEA_STORAGE_KEY);

    if (!stored) {
      router.replace("/");
      return;
    }
    setIdea(stored);

    (async () => {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.generation?.canCreate) {
          router.replace("/");
          return;
        }
        setAllowed(true);
      } catch {
        if (!cancelled) router.replace("/");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (allowed !== true || !idea) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm font-semibold text-inksoft">Checking your quota…</p>
      </div>
    );
  }

  return <World mode="create" initialIdea={idea} />;
}
