import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { generateFinale, type FinaleOutcome } from "@/lib/world-engine";
import type { GameBible } from "@/lib/universe";

export const runtime = "nodejs";
export const maxDuration = 60;

type FinaleRequest = {
  bible: GameBible;
  outcome?: FinaleOutcome;
  /** For defeats: which fail state fired, in plain words. */
  reason?: string;
};

export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FinaleRequest;
  try {
    body = (await req.json()) as FinaleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.bible?.story?.secret) {
    return NextResponse.json({ error: "Missing game bible." }, { status: 400 });
  }
  try {
    const finale = await generateFinale(
      body.bible,
      body.outcome === "defeat" ? "defeat" : "victory",
      body.reason
    );
    return NextResponse.json({ finale });
  } catch (err) {
    console.error("[/api/finale]", err);
    return NextResponse.json(
      { error: "The ending slipped away. Try again." },
      { status: 500 }
    );
  }
}
