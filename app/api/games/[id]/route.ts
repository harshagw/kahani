/**
 * `GET /api/games/[id]` — load a full saved game (bible, scenes, finales).
 * `DELETE /api/games/[id]` — remove a game and its Storage assets (owner only).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertGameOwner,
  buildFullGameResponse,
  deleteGameAssets,
  getGameRecord,
} from "@/lib/games";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import type { GameIdRouteContext } from "@/lib/types/server";

export const runtime = "nodejs";

/** Return the full game payload for play / resume. */
export async function GET(_req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const game = await getGameRecord(id);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  try {
    const full = await buildFullGameResponse(game, user.id);
    return NextResponse.json(full);
  } catch (err) {
    console.error("[GET /api/games/[id]]", err);
    return NextResponse.json({ error: "Failed to load game." }, { status: 500 });
  }
}

/** Delete a game row (cascades scenes) and best-effort Storage cleanup. */
export async function DELETE(_req: NextRequest, context: GameIdRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const game = await assertGameOwner(id, user.id);
    const supabase = await createClient();
    await deleteGameAssets(supabase, game.owner, game.id);
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) throw error;

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "world_deleted",
      properties: { game_id: id },
    });
    await posthog.flush();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 403) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (status === 404) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    console.error("[DELETE /api/games/[id]]", err);
    return NextResponse.json({ error: "Failed to delete game." }, { status: 500 });
  }
}
