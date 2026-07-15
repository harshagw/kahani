import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { generateBible } from "@/lib/world-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { idea: string };
  try {
    body = (await req.json()) as { idea: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const idea = body.idea?.trim();
  if (!idea) {
    return NextResponse.json({ error: "Describe your scene first." }, { status: 400 });
  }
  try {
    const bible = await generateBible(idea.slice(0, 1200));
    return NextResponse.json({ bible });
  } catch (err) {
    console.error("[/api/universe]", err);
    return NextResponse.json(
      { error: "Couldn't shape that idea into a world. Try rephrasing." },
      { status: 500 }
    );
  }
}
