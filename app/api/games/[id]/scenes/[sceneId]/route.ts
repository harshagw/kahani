/**
 * `PUT /api/games/[id]/scenes/[sceneId]` — idempotent upsert of one saved scene.
 * Uploads image/annotated frames to Storage and updates `game_scenes`.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertGameOwner,
  rowToScene,
  sceneToRow,
  uploadDataUrl,
} from "@/lib/games";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import type { GameSceneRow, GameSceneRouteContext } from "@/lib/types/server";
import type { SceneData } from "@/lib/universe";

export const runtime = "nodejs";

/** Save or replace one scene; sets thumbnail when `sceneId` is `s0_0`. */
export async function PUT(req: NextRequest, context: GameSceneRouteContext) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gameId, sceneId } = await context.params;

  let scene: SceneData;
  try {
    scene = (await req.json()) as SceneData;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!scene.image || scene.id !== sceneId) {
    return NextResponse.json({ error: "Scene id or image missing." }, { status: 422 });
  }

  try {
    await assertGameOwner(gameId, user.id);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Forbidden.";
    return NextResponse.json({ error: message }, { status });
  }

  const supabase = await createClient();
  const base = `${user.id}/${gameId}/${sceneId}`;

  try {
    // Upload inline data URLs; pass through existing Storage URLs unchanged.
    const imageUrl = scene.image.startsWith("data:")
      ? await uploadDataUrl(supabase, `${base}/image`, scene.image)
      : scene.image;

    let annotatedUrl: string | null = null;
    if (scene.annotated) {
      annotatedUrl = scene.annotated.startsWith("data:")
        ? await uploadDataUrl(supabase, `${base}/annotated`, scene.annotated)
        : scene.annotated;
    }

    const row = sceneToRow({ ...scene, image: imageUrl, annotated: annotatedUrl ?? undefined });
    const payload = {
      game_id: gameId,
      scene_id: sceneId,
      kind: row.kind,
      x: row.x,
      y: row.y,
      data: row.data,
      image_url: imageUrl,
      annotated_url: annotatedUrl,
    };

    const { data: existing } = await supabase
      .from("game_scenes")
      .select("id")
      .eq("game_id", gameId)
      .eq("scene_id", sceneId)
      .maybeSingle();

    let saved: GameSceneRow;
    if (existing) {
      const { data, error } = await supabase
        .from("game_scenes")
        .update(payload)
        .eq("game_id", gameId)
        .eq("scene_id", sceneId)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("Update failed.");
      saved = data as GameSceneRow;
    } else {
      const { data, error } = await supabase
        .from("game_scenes")
        .insert(payload)
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed.");
      saved = data as GameSceneRow;
    }

    // Origin screen doubles as the gallery thumbnail.
    if (sceneId === "s0_0") {
      await supabase.from("games").update({ thumbnail_url: imageUrl }).eq("id", gameId);
    }

    return NextResponse.json(rowToScene(saved), {
      status: existing ? 200 : 201,
    });
  } catch (err) {
    console.error("[PUT /api/games/[id]/scenes/[sceneId]]", err);
    return NextResponse.json({ error: "Failed to save scene." }, { status: 500 });
  }
}
