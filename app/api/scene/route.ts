import { NextRequest, NextResponse } from "next/server";
import { generateInteriorScene, generateStreetScene } from "@/lib/world-engine";
import type { GameBible } from "@/lib/universe";

export const runtime = "nodejs";
export const maxDuration = 60;

type SceneRequest = {
  bible: GameBible;
  /** Omitted for the opening street; 0-2 to enter that room. */
  roomIndex?: number;
};

export async function POST(req: NextRequest) {
  let body: SceneRequest;
  try {
    body = (await req.json()) as SceneRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.bible?.story?.goal || !Array.isArray(body.bible.rooms)) {
    return NextResponse.json({ error: "Missing game bible." }, { status: 400 });
  }

  try {
    if (typeof body.roomIndex === "number") {
      const scene = await generateInteriorScene(body.bible, body.roomIndex);
      return NextResponse.json({ scene });
    }
    const scene = await generateStreetScene(body.bible);
    return NextResponse.json({ scene });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate the scene.";
    console.error("[/api/scene]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
