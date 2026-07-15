/**
 * `PUT /api/games/[id]/sprite` — replace the player sprite for a saved game.
 */

import { NextRequest, NextResponse } from "next/server";
import { assertGameOwner, uploadDataUrl } from "@/lib/games";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import type { GameIdRouteContext, PutSpriteBody } from "@/lib/types/server";

export const runtime = "nodejs";

/** Upload sprite data URL and persist the public URL on the game row. */
export async function PUT(req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId } = await context.params;

  let body: PutSpriteBody;
  try {
    body = (await req.json()) as PutSpriteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.sprite?.startsWith("data:")) {
    return NextResponse.json({ error: "Missing sprite data URL." }, { status: 422 });
  }

  try {
    await assertGameOwner(gameId, user.id);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Forbidden.";
    return NextResponse.json({ error: message }, { status });
  }

  const supabase = await createClient();
  const path = `${user.id}/${gameId}/sprite`;

  try {
    const spriteUrl = await uploadDataUrl(supabase, path, body.sprite);
    const { error } = await supabase
      .from("games")
      .update({ sprite_url: spriteUrl })
      .eq("id", gameId);
    if (error) throw error;
    return NextResponse.json({ spriteUrl });
  } catch (err) {
    console.error("[PUT /api/games/[id]/sprite]", err);
    return NextResponse.json({ error: "Failed to save sprite." }, { status: 500 });
  }
}
