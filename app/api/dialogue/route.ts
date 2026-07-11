import { NextRequest, NextResponse } from "next/server";
import { generateDialogue } from "@/lib/world-engine";
import type { Premise } from "@/lib/types";
import type { DialogueTurn, NpcDef } from "@/lib/universe";

export const runtime = "nodejs";
export const maxDuration = 30;

type DialogueRequest = {
  premise: Premise;
  npc: NpcDef;
  sceneTitle: string;
  questHook: string;
  history: DialogueTurn[];
  playerLine: string | null;
  /** The clue this NPC guards + whether it's already found + exchange count. */
  clue?: string | null;
  clueFound?: boolean;
  exchanges?: number;
  inventory?: string[];
};

export async function POST(req: NextRequest) {
  let body: DialogueRequest;
  try {
    body = (await req.json()) as DialogueRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.premise?.id || !body.npc?.name) {
    return NextResponse.json({ error: "Missing premise or npc." }, { status: 400 });
  }
  try {
    const reply = await generateDialogue(
      body.premise,
      body.npc,
      body.sceneTitle ?? "",
      body.questHook ?? "",
      body.history ?? [],
      body.playerLine ?? null,
      {
        clue: body.clue ?? null,
        clueFound: Boolean(body.clueFound),
        exchanges:
          body.exchanges ??
          (body.history ?? []).filter((t) => t.speaker === "player").length,
        inventory: body.inventory ?? [],
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
