/**
 * `POST /api/screen` — generate one overworld tile at grid coordinate (x, y).
 * Supports continuity from either inline base64 or a saved Storage URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchImageAsBase64 } from "@/lib/games";
import { requireUser } from "@/lib/supabase/auth";
import type { ScreenRequest } from "@/lib/types/server";
import { generateScreen } from "@/lib/world-engine";

export const runtime = "nodejs";
export const maxDuration = 120;

const DIRS = new Set(["n", "e", "s", "w"]);

/** Paint, trace, and vision-parse the next overworld screen. */
export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ScreenRequest;
  try {
    body = (await req.json()) as ScreenRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body.bible?.story?.goal ||
    !Array.isArray(body.bible.rooms) ||
    typeof body.x !== "number" ||
    typeof body.y !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing bible or screen coordinates." },
      { status: 400 }
    );
  }
  try {
    // Resume from Storage: fetch the neighbor frame server-side when needed.
    let prevImage = body.prevImage || null;
    if (!prevImage && body.prevImageUrl) {
      prevImage = await fetchImageAsBase64(body.prevImageUrl);
    }
    const scene = await generateScreen(
      body.bible,
      Math.round(body.x),
      Math.round(body.y),
      body.arriveFrom && DIRS.has(body.arriveFrom) ? body.arriveFrom : null,
      prevImage,
      (body.unplacedRooms ?? []).filter(
        (r) => Number.isInteger(r) && r >= 0 && r <= 2
      )
    );
    return NextResponse.json({ scene });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to dream the next screen.";
    console.error("[/api/screen]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
