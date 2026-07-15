/**
 * `PUT /api/games/[id]/finales/[outcome]` — upsert victory or defeat finale.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertGameOwner,
  uploadDataUrl,
} from "@/lib/games";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import type {
  FinaleOutcome,
  FinaleRouteContext,
  PutFinaleBody,
} from "@/lib/types/server";

export const runtime = "nodejs";

const OUTCOMES = new Set<FinaleOutcome>(["victory", "defeat"]);

/** Save one finale variant into the game's `finale` jsonb column. */
export async function PUT(req: NextRequest, context: FinaleRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId, outcome: rawOutcome } = await context.params;
  if (!OUTCOMES.has(rawOutcome as FinaleOutcome)) {
    return NextResponse.json({ error: "Invalid outcome." }, { status: 422 });
  }
  const outcome = rawOutcome as FinaleOutcome;

  let body: PutFinaleBody;
  try {
    body = (await req.json()) as PutFinaleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.title || !body.resolution || !body.image) {
    return NextResponse.json({ error: "Missing finale fields." }, { status: 422 });
  }

  try {
    const game = await assertGameOwner(gameId, user.id);
    const supabase = await createClient();
    const imageUrl = body.image.startsWith("data:")
      ? await uploadDataUrl(supabase, `${user.id}/${gameId}/finale-${outcome}`, body.image)
      : body.image;

    const stored: PutFinaleBody = {
      title: body.title,
      resolution: body.resolution,
      image: imageUrl,
      outcome,
    };

    const finales = { ...(game.finale ?? {}), [outcome]: stored };
    const { error } = await supabase.from("games").update({ finale: finales }).eq("id", gameId);
    if (error) throw error;

    return NextResponse.json(stored);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 403 || status === 404) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Forbidden." },
        { status }
      );
    }
    console.error("[PUT /api/games/[id]/finales/[outcome]]", err);
    return NextResponse.json({ error: "Failed to save finale." }, { status: 500 });
  }
}
