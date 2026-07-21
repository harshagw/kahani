import { DEFAULT_RETRY_OPTS, withRetry } from "@/lib/retry";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const DEFAULT_MODEL = process.env.SARVAM_TTS_MODEL || "bulbul:v3";
const DEFAULT_LANGUAGE = process.env.SARVAM_TTS_LANGUAGE || "en-IN";

/** Default NPC speaker when none is assigned or the id is unknown. */
export const DEFAULT_SPEAKER = "priya";

/** Narrator voice for finale resolution lines. */
export const NARRATOR_SPEAKER = "shubh";

/** Bulbul v3 speakers assigned to NPCs at bible generation. */
export const VOICE_NAMES = [
  "aditya",
  "rahul",
  "anand",
  "varun",
  "mohit",
  "rohan",
  "amit",
  "priya",
  "neha",
  "kavya",
  "ishita",
] as const;

/** Map legacy Gemini TTS voice names from older saved games. */
export const LEGACY_GEMINI_VOICE_MAP: Record<string, string> = {
  Puck: "rohan",
  Charon: "aditya",
  Kore: "priya",
  Fenrir: "varun",
  Aoede: "kavya",
  Leda: "ishita",
  Orus: "anand",
  Zephyr: "amit",
};

export type SarvamSpeechOpts = {
  pace?: number;
  temperature?: number;
};

type SarvamTtsResponse = {
  request_id?: string | null;
  audios: string[];
};

/**
 * Resolve a Bulbul speaker id, mapping legacy Gemini names when needed.
 */
export function resolveSpeaker(voice?: string): string {
  if (!voice) return DEFAULT_SPEAKER;
  const lower = voice.toLowerCase();
  if ((VOICE_NAMES as readonly string[]).includes(lower)) return lower;
  const mapped = LEGACY_GEMINI_VOICE_MAP[voice];
  if (mapped) return mapped;
  return DEFAULT_SPEAKER;
}

/**
 * Synthesize speech via Sarvam Bulbul v3. Returns a data-URL WAV, or null.
 */
export async function synthesizeSarvamSpeech(
  text: string,
  speaker?: string,
  opts?: SarvamSpeechOpts
): Promise<string | null> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    console.error("[synthesizeSarvamSpeech] SARVAM_API_KEY is not set");
    return null;
  }

  const resolved = resolveSpeaker(speaker);
  const pace = opts?.pace ?? 1.0;
  const temperature = opts?.temperature ?? 0.6;

  try {
    const res = await withRetry(async () => {
      const response = await fetch(SARVAM_TTS_URL, {
        method: "POST",
        headers: {
          "api-subscription-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model: DEFAULT_MODEL,
          target_language_code: DEFAULT_LANGUAGE,
          speaker: resolved,
          pace,
          temperature,
          output_audio_codec: "wav",
          speech_sample_rate: 24000,
        }),
      });

      if (!response.ok) {
        const err = new Error(
          `Sarvam TTS ${response.status}: ${await response.text()}`
        ) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      return (await response.json()) as SarvamTtsResponse;
    }, DEFAULT_RETRY_OPTS);

    const combined = res.audios?.join("") ?? "";
    if (!combined) return null;
    return `data:audio/wav;base64,${combined}`;
  } catch (err) {
    console.error("[synthesizeSarvamSpeech] voice unavailable:", err);
    return null;
  }
}
