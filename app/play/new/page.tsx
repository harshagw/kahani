"use client";

/**
 * Create entry point: validates quota, then starts live world generation.
 * Redirects to `/` when creation is disabled or over quota.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { World } from "@/components/World";

function PlayNewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idea = searchParams.get("idea")?.trim() ?? "";
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.generation?.canCreate) {
          router.replace("/");
          return;
        }
        if (!idea) {
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
  }, [idea, router]);

  if (!allowed || !idea) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm font-semibold text-inksoft">Checking your quota…</p>
      </div>
    );
  }

  return <World mode="create" initialIdea={idea} />;
}

export default function PlayNewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center px-6">
          <p className="text-sm font-semibold text-inksoft">Loading…</p>
        </div>
      }
    >
      <PlayNewInner />
    </Suspense>
  );
}
