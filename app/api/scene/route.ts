import { NextRequest, NextResponse } from "next/server";
import { generateInteriorScene } from "@/lib/world-engine";
import type { GameBible } from "@/lib/universe";

export const runtime = "nodejs";
export const maxDuration = 60;

type SceneRequest = {
  bible: GameBible;
  /** Which bible room (0-2) to build the interior of. */
  roomIndex: number;
  /** The overworld screen the building stands on (for the exit door). */
  parentId?: string;
};

export async function POST(req: NextRequest) {
  let body: SceneRequest;
  try {
    body = (await req.json()) as SceneRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body.bible?.story?.goal ||
    !Array.isArray(body.bible.rooms) ||
    typeof body.roomIndex !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing bible or roomIndex." },
      { status: 400 }
    );
  }

  try {
    const scene = await generateInteriorScene(
      body.bible,
      body.roomIndex,
      body.parentId || "s0_0"
    );
    return NextResponse.json({ scene });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate the scene.";
    console.error("[/api/scene]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
