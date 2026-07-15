/**
 * `GET /api/games` — list saved worlds.
 * `POST /api/games` — create a new world row (quota enforced).
 */

import { NextRequest, NextResponse } from "next/server";
import { assertCanCreate, toGameListItem } from "@/lib/games";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import type { CreateGameBody, GameRecord } from "@/lib/types/server";

export const runtime = "nodejs";

/** List all public games, optionally filtered to the current user. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerMe = req.nextUrl.searchParams.get("owner") === "me";
  const supabase = await createClient();
  let query = supabase
    .from("games")
    .select("*")
    .order("created_at", { ascending: false });

  if (ownerMe) {
    query = query.eq("owner", user.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/games]", error);
    return NextResponse.json({ error: "Failed to list games." }, { status: 500 });
  }

  return NextResponse.json((data as GameRecord[]).map(toGameListItem));
}

/** Create a game row after the bible is generated; assets save incrementally afterward. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateGameBody;
  try {
    body = (await req.json()) as CreateGameBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const idea = body.idea?.trim();
  if (!idea || !body.bible?.title || !body.premise?.title) {
    return NextResponse.json({ error: "Missing idea, bible, or premise." }, { status: 422 });
  }

  try {
    await assertCanCreate(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden.";
    const status = (err as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: message }, { status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .insert({
      owner: user.id,
      title: body.bible.title,
      idea: idea.slice(0, 1200),
      bible: body.bible,
      premise: body.premise,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[POST /api/games]", error);
    return NextResponse.json({ error: "Failed to create game." }, { status: 500 });
  }

  const item = toGameListItem(data as GameRecord);
  return NextResponse.json(item, {
    status: 201,
    headers: { Location: `/api/games/${item.id}` },
  });
}
