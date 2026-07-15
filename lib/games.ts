/**
 * Server-side persistence for saved games: Supabase Storage uploads,
 * Postgres row mapping, and quota enforcement.
 */

import { FREE_GAME_LIMIT, GEN_CALL_COST } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type {
  FullGameResponse,
  GameListItem,
  GenerationQuota,
} from "@/lib/types/client";
import type {
  GameRecord,
  GameSceneRow,
  ParsedDataUrl,
} from "@/lib/types/server";
import type { SceneData } from "@/lib/universe";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Public Supabase Storage bucket for generated game assets. */
export const GAME_ASSETS_BUCKET = "game-assets";

/**
 * Derive total AI generation calls from persisted assets.
 * Must stay in sync with `GEN_CALL_COST` and client `addCalls` sites.
 *
 * @param game - Parent game row (sprite + finales).
 * @param scenes - Saved scene rows or client scene list (only `kind` is read).
 */
export function computeGenCallsFromAssets(
  game: Pick<GameRecord, "sprite_url" | "finale">,
  scenes: Array<Pick<GameSceneRow, "kind">>
): number {
  const streetCount = scenes.filter((s) => s.kind === "street").length;
  const interiorCount = scenes.filter((s) => s.kind === "interior").length;
  let total = GEN_CALL_COST.universe;
  total += streetCount * GEN_CALL_COST.screen;
  total += interiorCount * GEN_CALL_COST.interior;
  if (game.sprite_url) total += GEN_CALL_COST.sprite;
  if (game.finale?.victory) total += GEN_CALL_COST.finale;
  if (game.finale?.defeat) total += GEN_CALL_COST.finale;
  return total;
}

/**
 * Map file extension from a MIME type string.
 * @param mimeType - MIME type from a data URL.
 */
function mimeToExt(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("wav")) return "wav";
  return "bin";
}

/**
 * Parse a `data:mime;base64,...` URL into raw bytes for Storage upload.
 * @param dataUrl - Inline data URL from Gemini generation.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL.");
  }
  const mimeType = match[1];
  const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
  return { mimeType, bytes, ext: mimeToExt(mimeType) };
}

/**
 * Build the public URL for an object in the game-assets bucket.
 * @param supabase - Authenticated Supabase client.
 * @param path - Object path within the bucket.
 */
export function publicStorageUrl(supabase: SupabaseClient, path: string): string {
  const { data } = supabase.storage.from(GAME_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload a data URL to Supabase Storage and return its public URL.
 * Uses upsert so repeated saves of the same scene overwrite cleanly.
 *
 * @param supabase - Authenticated Supabase client (RLS scopes writes to owner folder).
 * @param path - Storage path without extension (extension inferred from MIME).
 * @param dataUrl - Inline image/audio data URL.
 */
export async function uploadDataUrl(
  supabase: SupabaseClient,
  path: string,
  dataUrl: string
): Promise<string> {
  const { mimeType, bytes, ext } = parseDataUrl(dataUrl);
  const objectPath = path.includes(".") ? path : `${path}.${ext}`;
  const { error } = await supabase.storage
    .from(GAME_ASSETS_BUCKET)
    .upload(objectPath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw error;
  return publicStorageUrl(supabase, objectPath);
}

/**
 * Strip inline image fields from a client `SceneData` for the `data` jsonb column.
 * @param scene - Full scene from generation or client state.
 */
export function sceneToRow(scene: SceneData): Omit<GameSceneRow, "id" | "game_id"> {
  const { image, annotated, ...data } = scene;
  void image;
  void annotated;
  return {
    scene_id: scene.id,
    kind: scene.kind,
    x: scene.coord?.x ?? null,
    y: scene.coord?.y ?? null,
    data,
    image_url: "",
    annotated_url: null,
  };
}

/**
 * Reconstruct a client `SceneData` from a database row + Storage URLs.
 * @param row - `game_scenes` row from Postgres.
 */
export function rowToScene(row: GameSceneRow): SceneData {
  return {
    ...row.data,
    id: row.scene_id,
    kind: row.kind,
    image: row.image_url,
    annotated: row.annotated_url ?? undefined,
    coord:
      row.x !== null && row.y !== null ? { x: row.x, y: row.y } : row.data.coord,
  };
}

/**
 * Count how many worlds the user has created and whether they may create another.
 * Respects `FREE_GAME_LIMIT` and `profiles.is_unlimited`.
 *
 * @param userId - Authenticated Supabase user id.
 */
export async function getGenerationQuota(userId: string): Promise<GenerationQuota> {
  const supabase = await createClient();
  const [{ count, error: countError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from("games")
        .select("*", { count: "exact", head: true })
        .eq("owner", userId),
      supabase.from("profiles").select("is_unlimited").eq("id", userId).maybeSingle(),
    ]);

  if (countError) throw countError;
  if (profileError) throw profileError;

  const used = count ?? 0;
  const unlimited = Boolean(profile?.is_unlimited);
  const limit = FREE_GAME_LIMIT;
  const canCreate = unlimited || used < limit;

  return { used, limit, unlimited, canCreate };
}

/**
 * Ensure the user is allowed to create a new game; throws with `status: 403` if not.
 * @param user - Authenticated Supabase user.
 */
export async function assertCanCreate(user: User): Promise<GenerationQuota> {
  const quota = await getGenerationQuota(user.id);
  if (!quota.canCreate) {
    const message =
      quota.limit === 0
        ? "Creating new worlds is currently disabled."
        : "You have reached your free world limit.";
    const err = new Error(message) as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return quota;
}

/**
 * Fetch a single game row by id.
 * @param id - Game UUID.
 */
export async function getGameRecord(id: string): Promise<GameRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as GameRecord | null;
}

/**
 * Load a game and verify the caller owns it.
 * @throws Error with `status` 404 or 403 when missing or forbidden.
 */
export async function assertGameOwner(gameId: string, userId: string): Promise<GameRecord> {
  const game = await getGameRecord(gameId);
  if (!game) {
    const err = new Error("Game not found.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (game.owner !== userId) {
    const err = new Error("Forbidden.") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return game;
}

/**
 * List all saved scenes for a game, oldest first.
 * @param gameId - Parent game UUID.
 */
export async function listGameScenes(gameId: string): Promise<GameSceneRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("game_scenes")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GameSceneRow[];
}

/**
 * Assemble the full game payload returned by `GET /api/games/[id]`.
 * @param game - Parent game row.
 * @param userId - Current user (used to set `isOwner`).
 */
export async function buildFullGameResponse(
  game: GameRecord,
  userId: string
): Promise<FullGameResponse> {
  const sceneRows = await listGameScenes(game.id);
  return {
    id: game.id,
    owner: game.owner,
    isOwner: game.owner === userId,
    title: game.title,
    idea: game.idea,
    bible: game.bible,
    premise: game.premise,
    spriteUrl: game.sprite_url,
    finales: game.finale ?? {},
    scenes: sceneRows.map(rowToScene),
    genCalls: computeGenCallsFromAssets(game, sceneRows),
    createdAt: game.created_at,
  };
}

/**
 * Convert a DB game row to the list-item shape for `GET /api/games`.
 * @param game - Full game row from Postgres.
 */
export function toGameListItem(game: GameRecord): GameListItem {
  return {
    id: game.id,
    owner: game.owner,
    title: game.title,
    thumbnailUrl: game.thumbnail_url,
    createdAt: game.created_at,
  };
}

/**
 * Best-effort delete of all Storage objects under `{ownerId}/{gameId}/`.
 * @param supabase - Authenticated client (owner must match folder prefix).
 */
export async function deleteGameAssets(
  supabase: SupabaseClient,
  ownerId: string,
  gameId: string
): Promise<void> {
  const prefix = `${ownerId}/${gameId}`;
  const { data, error } = await supabase.storage.from(GAME_ASSETS_BUCKET).list(prefix, {
    limit: 1000,
  });
  if (error || !data?.length) return;
  const paths = data.map((item) => `${prefix}/${item.name}`);
  await supabase.storage.from(GAME_ASSETS_BUCKET).remove(paths);
}

/**
 * Fetch a remote image URL and return raw base64 (no data-URL prefix).
 * Used when continuing screen generation from a saved Storage URL.
 *
 * @param url - Public Storage URL of a prior screen.
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}
