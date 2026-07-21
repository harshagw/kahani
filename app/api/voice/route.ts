import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { synthesizeVoice } from "@/lib/world-engine";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/voice — synthesize NPC dialogue as Sarvam Bulbul v3 audio. */
export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    text: string;
    voice?: string;
    pace?: number;
    temperature?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }

  const pace =
    typeof body.pace === "number"
      ? Math.max(0.5, Math.min(2, body.pace))
      : undefined;
  const temperature =
    typeof body.temperature === "number"
      ? Math.max(0.01, Math.min(2, body.temperature))
      : undefined;

  // Voice is best-effort: a null audio means the client plays nothing.
  const audio = await synthesizeVoice(body.text.slice(0, 500), body.voice, {
    pace,
    temperature,
  });
  return NextResponse.json({ audio });
}
