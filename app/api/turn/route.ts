import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { generateBeat, generateImage, toDataUrl } from "@/lib/gemini";
import type { TurnRequest, TurnResponse } from "@/lib/types";

export const runtime = "nodejs";
// Image generation can take a few seconds; give the route room to breathe.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TurnRequest;
  try {
    body = (await req.json()) as TurnRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { premise, history, choice, prevImage, stats, clock, progress } = body;
  if (!premise?.id || !premise?.setup) {
    return NextResponse.json(
      { error: "Missing or invalid premise." },
      { status: 400 }
    );
  }
  if (!stats) {
    return NextResponse.json({ error: "Missing stats." }, { status: 400 });
  }

  try {
    // 1) Resolve the action: apply stat + time consequences, move the player
    //    along the journey, and pick an image prompt that shows the result.
    const beat = await generateBeat(
      premise,
      history ?? [],
      choice ?? null,
      stats,
      clock ?? 100,
      progress ?? 0
    );

    // 2) Render the new moment, using the previous frame for continuity.
    const img = await generateImage(
      beat.imagePrompt,
      premise.styleBible,
      prevImage ?? null
    );

    const payload: TurnResponse = {
      caption: beat.caption,
      outcomeFlash: beat.outcomeFlash,
      choices: beat.choices,
      image: toDataUrl(img.b64, img.mimeType),
      effects: beat.effects,
      timeCost: beat.timeCost,
      location: beat.location,
      progress: beat.progress,
      isEnding: beat.isEnding,
      endingKind: beat.endingKind,
      endingTitle: beat.endingTitle,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate the next scene.";
    console.error("[/api/turn]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
