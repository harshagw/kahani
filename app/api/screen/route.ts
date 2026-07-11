import { NextRequest, NextResponse } from "next/server";
import { generateScreen, type Direction } from "@/lib/world-engine";
import type { GameBible } from "@/lib/universe";

export const runtime = "nodejs";
export const maxDuration = 120;

type ScreenRequest = {
  bible: GameBible;
  x: number;
  y: number;
  /** Direction the player walked to reach this screen. */
  arriveFrom?: Direction | null;
  /** Previous screen's frame (base64, no data-url prefix) for continuity. */
  prevImage?: string | null;
  /** Bible rooms (0-2) not yet placed anywhere in the world. */
  unplacedRooms?: number[];
};

const DIRS = new Set(["n", "e", "s", "w"]);

export async function POST(req: NextRequest) {
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
    const scene = await generateScreen(
      body.bible,
      Math.round(body.x),
      Math.round(body.y),
      body.arriveFrom && DIRS.has(body.arriveFrom) ? body.arriveFrom : null,
      body.prevImage || null,
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
