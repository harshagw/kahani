# Kahani World — describe a scene, walk into it

**An AI game studio that runs while you play.** Type one sentence — *"a
rain-flooded night market in Mumbai, I'm a courier carrying a tiffin box
someone will kill for"* — and thirty seconds later you're **walking through
that world with arrow keys**: an isometric street painted by Nano Banana 2
Lite, a player character forged in the same art style, buildings you can
enter, characters who speak to you out loud, and one hidden mystery that
converges to a finale.

## Why this needs NB2 Lite (generation is load-bearing)

This is not a prompt-box-to-image app. The game **cannot exist** without
fast, cheap, high-volume generation:

- Every visible thing is generated at play-time: the street, the player
  sprite, every interior, the finale frame. Nothing is pre-made.
- **Spatial prefetch:** the moment the street appears, all 3 interiors
  generate **in parallel while you walk** — so pressing E at a door is
  instant. The HUD shows it live: *"rooms pre-building 2/3"* → *"all rooms
  pre-built · doors open instantly."*
- A single 5-minute run fires **~20+ model calls** (level-design text,
  image renders, vision passes, dialogue turns, TTS lines) — visible in the
  in-game "AI generations this run" ticker. At $0.034 / 1k images, a full
  playthrough costs well under a rupee.



## The pipeline per scene

<img width="765" height="645" alt="Screenshot 2026-07-11 at 6 39 56 PM" src="https://github.com/user-attachments/assets/655d9215-4dc4-4542-a39e-68899f742593" />


**Dialogue:** each NPC guards one clue of the world's single mystery.
Conversations are bounded — the clue must surface by the second exchange and
the chat closes by the third. NPC lines are voiced with **Gemini TTS**.
Collect all 3 clues → **"Unravel the truth"** → a generated finale frame +
the secret, spoken aloud.

## Google AI stack used

| Model | Role |
| --- | --- |
| `gemini-3.1-flash-lite-image` (NB2 Lite) | streets, interiors, sprite, finale — all live |
| `gemini-3.5-flash` | universe + story arc, level design, walkability vision, NPC dialogue |
| `gemini-3.1-flash-tts-preview` (Gemini Audio) | every NPC line + the finale, spoken |

## Run it

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY + model ids
npm run dev                  # http://localhost:3000
```

Controls: **WASD / arrows** move · **E** enter / talk · **1–3** replies ·
type anything to any character · **Esc** leave.

## Impact in India

Kahani ("story") turns any Indian setting — a Chandni Chowk gali, Kerala
backwaters, a Himalayan pilgrimage — into a playable, voiced world in
seconds, with zero art budget. That unlocks: regional storytelling and
folklore preservation in any of India's languages (swap the TTS voice),
game-based learning where a classroom describes a historical scene and walks
through it, and a path for India's indie game developers — the cost of world
art drops from lakhs to paise.

## Project map

| Path | Role |
| --- | --- |
| `lib/world-engine.ts` | universe/story/scene/sprite/dialogue/voice/finale generation |
| `app/api/*` | `universe` · `scene` · `sprite` · `dialogue` · `voice` · `finale` |
| `components/World.tsx` | orchestrator: scene cache, parallel prefetch, clues, finale |
| `components/GameCanvas.tsx` | canvas loop: movement, collision, hotspots, sprite |
| `components/DialogueBox.tsx` | voiced NPC conversations |
| `docs/` | PRD, design brief, game design |
