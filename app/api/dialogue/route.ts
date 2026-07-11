import { NextRequest, NextResponse } from "next/server";
import { generateDialogue } from "@/lib/world-engine";
import type { DialogueTurn, GameBible } from "@/lib/universe";

export const runtime = "nodejs";
export const maxDuration = 30;

type DialogueRequest = {
  bible: GameBible;
  /** Which of the bible's 3 NPCs is speaking. */
  npcIndex: number;
  history: DialogueTurn[];
  playerLine: string | null;
  clueFound?: boolean;
  exchanges?: number;
  inventory?: string[];
  /** Current danger-meter value 0..100. */
  heat?: number;
};

export async function POST(req: NextRequest) {
  let body: DialogueRequest;
  try {
    body = (await req.json()) as DialogueRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.bible?.npcs?.length || typeof body.npcIndex !== "number") {
    return NextResponse.json(
      { error: "Missing bible or npcIndex." },
      { status: 400 }
    );
  }
  try {
    const reply = await generateDialogue(
      body.bible,
      body.npcIndex,
      body.history ?? [],
      body.playerLine ?? null,
      {
        clueFound: Boolean(body.clueFound),
        exchanges:
          body.exchanges ??
          (body.history ?? []).filter((t) => t.speaker === "player").length,
        inventory: body.inventory ?? [],
        heat: body.heat ?? 0,
      }
    );
    return NextResponse.json(reply);
  } catch (err) {
    console.error("[/api/dialogue]", err);
    return NextResponse.json(
      { error: "The character lost their train of thought." },
      { status: 500 }
    );
  }
}
