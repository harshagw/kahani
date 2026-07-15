/**
 * `GET /api/profile` — current user's generation quota and flags.
 */

import { NextResponse } from "next/server";
import { getGenerationQuota } from "@/lib/games";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

/** Return how many worlds the user has created and whether they can create more. */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const generation = await getGenerationQuota(user.id);
    return NextResponse.json({ generation });
  } catch (err) {
    console.error("[GET /api/profile]", err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
