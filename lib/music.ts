/**
 * Theme-aware background music for the explorable world.
 *
 * Instead of generating audio through a model (slow, costs credits) or
 * shipping large licensed tracks, we keep a small **library of generative
 * themes**: each theme is a recipe (scale, chord loop, tempo, timbre,
 * rhythm) that a tiny Web Audio engine performs live in the browser. Zero
 * network, zero cost, loops forever without seams.
 *
 * The world picks a theme by matching keywords against its premise/bible
 * text (`pickMusicTheme`), and the engine ducks to silence while an NPC
 * voice line plays (`setDucked`).
 */

/** Identifier of a track in the built-in music library. */
export type MusicThemeId =
  | "noir-rain"
  | "mountain-air"
  | "bazaar-dusk"
  | "backwater-dawn"
  | "haunted-hollow"
  | "crown-ember"
  | "first-light"
  | "wandering-heart";

/** A generative "track": the musical recipe the engine performs. */
export type MusicTheme = {
  id: MusicThemeId;
  /** Human-readable track name, shown in the UI when playback starts. */
  label: string;
  /** Words in the premise/bible that select this theme. */
  keywords: string[];
  /**
   * Signature melody: scale degrees played evenly across EVERY bar.
   * This is what makes each track instantly recognisable — the pads and
   * random ornaments only add texture around it.
   */
  motif: number[];
  /** Semitone offsets of the scale, starting at the root. */
  scale: number[];
  /** MIDI note of the scale root (pads play here, drone an octave below). */
  root: number;
  /** Seconds per bar — one pad chord per bar. Tempo is the loudest cue. */
  barSeconds: number;
  /** Chord loop, each chord a list of scale-degree indices. */
  chords: number[][];
  /** Oscillator shape for the sustained pad chords. */
  padWave: OscillatorType;
  /** Pad loudness (0-1) — mountain air is mostly drone, bazaar mostly pluck. */
  padLevel: number;
  /** Oscillator shape for the plucked/bell melody notes. */
  melodyWave: OscillatorType;
  /** Probability per bar that a melody phrase plays. */
  melodyChance: number;
  /** How many melody notes per phrase: [min, max]. */
  melodyNotes: [number, number];
  /** Octave shift of melody notes above the pad register. */
  melodyOctave: number;
  /** Seconds each melody note rings (bells long, plucks short). */
  melodyDecay: number;
  /** True snaps melody onto an 8th-note grid (rhythmic), false floats free. */
  melodyOnGrid: boolean;
  /** Echo tap time in seconds (longer = more spacious). */
  echoTime: number;
  /** Echo feedback 0-1 (higher = longer tail). */
  echoFeedback: number;
  /** Low-pass cutoff in Hz — the overall brightness of the mix. */
  brightness: number;
  /** Level of the continuous root drone (0 disables it). */
  droneLevel: number;
  /** Soft hand-drum thumps per bar (0 disables percussion). */
  pulseBeats: number;
  /** Pulse loudness 0-1. */
  pulseLevel: number;
};

/**
 * The music library. Four India-flavoured moods matching the built-in
 * premises plus a neutral wanderer fallback for custom ideas.
 */
export const MUSIC_LIBRARY: MusicTheme[] = [
  {
    // Rain-slicked city noir: very low, very slow, lonely single notes.
    id: "noir-rain",
    label: "Midnight Rain",
    motif: [0, -3, -1, -3], // brooding low crawl
    keywords: [
      "noir", "rain", "monsoon", "night", "neon", "mumbai", "midnight",
      "city", "smuggl", "crime", "detective", "shadow", "storm", "thunder",
      "alley", "murder", "mystery", "spy", "thief", "cyber", "gothic",
    ],
    scale: [0, 2, 3, 5, 7, 8, 10], // natural minor
    root: 41, // F2 — deep and murky
    barSeconds: 4.4,
    chords: [
      [0, 2, 4],
      [5, 7, 9],
      [3, 5, 7],
      [4, 6, 8],
    ],
    padWave: "sine",
    padLevel: 1,
    melodyWave: "sine",
    melodyChance: 0.35,
    melodyNotes: [1, 1],
    melodyOctave: 2,
    melodyDecay: 2.4,
    melodyOnGrid: false,
    echoTime: 0.7,
    echoFeedback: 0.5,
    brightness: 750,
    droneLevel: 0.5,
    pulseBeats: 0,
    pulseLevel: 0,
  },
  {
    // Thin cold air: a huge drone, glacial bars, distant high bells.
    id: "mountain-air",
    label: "Thin Air",
    motif: [4, 7], // two great temple bells per bar
    keywords: [
      "mountain", "himalaya", "monastery", "snow", "pilgrim", "summit",
      "monk", "peak", "glacier", "whiteout", "tibet", "ancient", "mist",
      "fog", "valley", "forest", "ruin", "legend", "myth", "spirit",
    ],
    scale: [0, 2, 4, 7, 9], // major pentatonic
    root: 48, // C3
    barSeconds: 6.5,
    chords: [
      [0, 3, 5],
      [0, 2, 4],
      [1, 3, 5],
      [0, 3, 7],
    ],
    padWave: "sine",
    padLevel: 0.45,
    melodyWave: "sine",
    melodyChance: 0.7,
    melodyNotes: [1, 2],
    melodyOctave: 3, // bell register, far above everything else
    melodyDecay: 4,
    melodyOnGrid: false,
    echoTime: 0.9,
    echoFeedback: 0.55,
    brightness: 2400,
    droneLevel: 1,
    pulseBeats: 0,
    pulseLevel: 0,
  },
  {
    // Golden-hour bazaar: twice the tempo, buzzy plucks, hand-drum pulse.
    id: "bazaar-dusk",
    label: "Bazaar at Dusk",
    motif: [0, 2, 4, 2, 5, 4, 2, 0], // running sitar-ish arpeggio
    keywords: [
      "bazaar", "market", "delhi", "dusk", "spice", "mughal", "lane",
      "gali", "chowk", "haveli", "fort", "heist", "merchant", "antique",
      "festival", "carnival", "desert", "rajasthan", "caravan",
      "chase", "circus",
    ],
    scale: [0, 1, 4, 5, 7, 8, 11], // double harmonic (Bhairav flavour)
    root: 50, // D3
    barSeconds: 2.4,
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [1, 3, 5],
      [0, 2, 4],
    ],
    padWave: "triangle",
    padLevel: 0.5,
    melodyWave: "sawtooth", // sitar-ish buzz once low-passed
    melodyChance: 0.95,
    melodyNotes: [3, 5],
    melodyOctave: 1,
    melodyDecay: 0.5,
    melodyOnGrid: true, // danceable, snapped to the 8th grid
    echoTime: 0.3,
    echoFeedback: 0.25,
    brightness: 2800,
    droneLevel: 0.45,
    pulseBeats: 4,
    pulseLevel: 0.8,
  },
  {
    // Still green water at dawn: mid-register lilt with long soft echoes.
    id: "backwater-dawn",
    label: "Still Waters",
    motif: [0, 1, 2, 4, 2, 1], // rising-falling ripple
    keywords: [
      "backwater", "kerala", "water", "river", "boat", "canal", "lagoon",
      "coast", "tide", "temple", "palm", "island", "sea", "fisher",
      "ocean", "beach", "ship", "sail", "harbor", "harbour", "goa",
      "village", "lake",
    ],
    scale: [0, 2, 4, 7, 9], // major pentatonic
    root: 55, // G3 — the brightest, most open register
    barSeconds: 4.8,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [2, 4, 6],
      [0, 3, 5],
    ],
    padWave: "sine",
    padLevel: 0.8,
    melodyWave: "triangle",
    melodyChance: 0.8,
    melodyNotes: [2, 3],
    melodyOctave: 1,
    melodyDecay: 1.8,
    melodyOnGrid: false,
    echoTime: 0.55,
    echoFeedback: 0.45,
    brightness: 1900,
    droneLevel: 0.3,
    pulseBeats: 0,
    pulseLevel: 0,
  },
  {
    // Cold dread: slow tritone leaps in a hungarian-minor gloom.
    id: "haunted-hollow",
    label: "Haunted Hollow",
    motif: [0, 6, 0, 1], // the tritone leap is instant unease
    keywords: [
      "haunt", "ghost", "curse", "witch", "demon", "grave", "undead",
      "vampire", "horror", "creep", "abandon", "asylum", "possess",
      "seance", "occult", "skull", "nightmare",
    ],
    scale: [0, 2, 3, 6, 7, 8, 11], // hungarian minor
    root: 44, // G#2 — cold and hollow
    barSeconds: 5.4,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 3, 6],
      [4, 6, 8],
    ],
    padWave: "sine",
    padLevel: 0.7,
    melodyWave: "sine",
    melodyChance: 0.3,
    melodyNotes: [1, 1],
    melodyOctave: 2,
    melodyDecay: 3,
    melodyOnGrid: false,
    echoTime: 0.8,
    echoFeedback: 0.6,
    brightness: 700,
    droneLevel: 0.8,
    pulseBeats: 0,
    pulseLevel: 0,
  },
  {
    // Martial fanfare: repeated-note dorian call over a marching pulse.
    id: "crown-ember",
    label: "Crown & Ember",
    motif: [0, 0, 4, 5, 4, 2], // fanfare with a repeated opening note
    keywords: [
      "king", "queen", "royal", "palace", "throne", "kingdom", "empire",
      "war", "battle", "army", "warrior", "soldier", "rebel", "conquer",
      "sword", "epic", "dynasty", "maharaja", "raja",
    ],
    scale: [0, 2, 3, 5, 7, 9, 10], // dorian — heroic minor
    root: 45, // A2
    barSeconds: 3,
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [4, 6, 8],
      [0, 2, 4],
    ],
    padWave: "triangle",
    padLevel: 0.8,
    melodyWave: "sawtooth", // brassy once low-passed
    melodyChance: 0.5,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 0.6,
    melodyOnGrid: true,
    echoTime: 0.35,
    echoFeedback: 0.3,
    brightness: 2000,
    droneLevel: 0.6,
    pulseBeats: 4,
    pulseLevel: 0.9,
  },
  {
    // Warm dawn romance: high tender major-key turns, barely any shadow.
    id: "first-light",
    label: "First Light",
    motif: [2, 4, 5, 4], // tender rising turn
    keywords: [
      "love", "romance", "romantic", "heart", "longing", "letter",
      "reunion", "promise", "blossom", "spring", "wedding", "bride",
      "dil", "pyaar", "ishq", "beloved", "sweetheart",
    ],
    scale: [0, 2, 4, 5, 7, 9, 11], // major
    root: 57, // A3 — the warmest, highest register
    barSeconds: 4,
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [1, 3, 5],
      [4, 6, 8],
    ],
    padWave: "sine",
    padLevel: 0.9,
    melodyWave: "sine",
    melodyChance: 0.7,
    melodyNotes: [1, 2],
    melodyOctave: 1,
    melodyDecay: 1.6,
    melodyOnGrid: false,
    echoTime: 0.5,
    echoFeedback: 0.4,
    brightness: 2200,
    droneLevel: 0.25,
    pulseBeats: 0,
    pulseLevel: 0,
  },
  {
    // Neutral wanderer's theme — fallback when no keywords match.
    id: "wandering-heart",
    label: "Wanderer's Heart",
    motif: [0, 2, 3, 2], // simple hopeful turn
    keywords: [],
    scale: [0, 3, 5, 7, 10], // minor pentatonic
    root: 48, // C3
    barSeconds: 3.4,
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [2, 4, 6],
      [1, 3, 5],
    ],
    padWave: "sine",
    padLevel: 0.8,
    melodyWave: "triangle",
    melodyChance: 0.6,
    melodyNotes: [1, 3],
    melodyOctave: 1,
    melodyDecay: 1,
    melodyOnGrid: true,
    echoTime: 0.45,
    echoFeedback: 0.35,
    brightness: 1500,
    droneLevel: 0.5,
    pulseBeats: 2,
    pulseLevel: 0.5,
  },
];

/**
 * Look up a library track by id — used when the game bible carries a
 * model-chosen `musicTheme`. Returns null for unknown/missing ids so the
 * caller can fall back to keyword matching (older saved games).
 */
export function getMusicTheme(id: string | null | undefined): MusicTheme | null {
  if (!id) return null;
  return MUSIC_LIBRARY.find((t) => t.id === id) ?? null;
}

/** Stable string hash (FNV-1a) for deterministic per-world fallback. */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick the library theme whose keywords best match the world's flavour
 * text (premise + full bible). Worlds are created from free-text ideas, so
 * when no keyword matches, fall back to a **hash of the text** — every
 * world still gets a stable theme, but different worlds get different
 * tracks instead of all landing on the same default.
 */
export function pickMusicTheme(flavourText: string): MusicTheme {
  const text = flavourText.toLowerCase();
  let best: MusicTheme | null = null;
  let bestScore = 0;
  for (const theme of MUSIC_LIBRARY) {
    const score = theme.keywords.reduce(
      (n, kw) => n + (text.includes(kw) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      best = theme;
      bestScore = score;
    }
  }
  return best ?? MUSIC_LIBRARY[hashText(text) % MUSIC_LIBRARY.length];
}

/** MIDI note number → frequency in Hz. */
function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Resolve a scale-degree index (any octave) to a MIDI note. */
function degreeToMidi(theme: MusicTheme, degree: number): number {
  const n = theme.scale.length;
  const octave = Math.floor(degree / n);
  const step = theme.scale[((degree % n) + n) % n];
  return theme.root + octave * 12 + step;
}

/** Overall music level — audible character, but still under the voice. */
const MASTER_LEVEL = 0.22;
/** Seconds to fade to silence when ducked (NPC starts talking). */
const DUCK_FADE = 0.35;
/** Seconds to fade back in after the NPC finishes. */
const RESUME_FADE = 1.4;

/**
 * Tiny generative Web Audio performer for a {@link MusicTheme}.
 *
 * Per bar: a swelling pad chord, an optional melody phrase (echoed), an
 * optional hand-drum pulse, plus a continuous root drone — all through a
 * low-pass filter that sets the theme's brightness. Safe to construct
 * during SSR — it only touches Web Audio on `start()`.
 */
export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Duck/mute stage — ramped to 0 while an NPC speaks or music is off. */
  private duck: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private theme: MusicTheme | null = null;
  private bar = 0;
  private muted = false;
  private ducked = false;
  private disposed = false;

  /** Begin (or switch to) a theme. Idempotent for the same theme id. */
  start(theme: MusicTheme): void {
    if (this.disposed || typeof window === "undefined") return;
    if (this.theme?.id === theme.id && this.timer !== null) return;
    this.ensureGraph();
    if (!this.ctx) return;

    this.theme = theme;
    this.bar = 0;
    const t = this.ctx.currentTime;
    this.filter!.frequency.setTargetAtTime(theme.brightness, t, 0.5);
    this.delay!.delayTime.setTargetAtTime(theme.echoTime, t, 0.5);
    this.feedback!.gain.setTargetAtTime(theme.echoFeedback, t, 0.5);
    this.restartDrone(theme);
    if (this.timer !== null) clearTimeout(this.timer);
    this.scheduleLoop();
  }

  /** Music toggle from the HUD. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyDuck();
  }

  /** Fade out while the NPC voice line plays; fade back in after. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyDuck();
  }

  /** Stop playback and release the audio context. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.1);
      const ctx = this.ctx;
      setTimeout(() => void ctx.close().catch(() => {}), 500);
    }
    this.ctx = null;
  }

  /** Lazily build the shared node graph and unlock autoplay. */
  private ensureGraph(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return; // no Web Audio — music silently unavailable
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = MASTER_LEVEL;
    this.master.connect(ctx.destination);

    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.master);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1400;
    this.filter.connect(this.duck);

    // Feedback delay gives melody notes a soft, spacious echo tail.
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.45;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.35;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.duck);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.5;
    this.delaySend.connect(this.delay);

    // Browsers block audio until a user gesture; the game is driven by
    // keyboard/pointer input, so resume on the first interaction.
    if (ctx.state === "suspended") {
      const unlock = () => {
        void ctx.resume().catch(() => {});
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
    }
  }

  /** Swap the continuous root drone when the theme changes. */
  private restartDrone(theme: MusicTheme): void {
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    if (this.drone && this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, t, 0.5);
      this.drone.stop(t + 2);
    }
    if (theme.droneLevel <= 0) {
      this.drone = null;
      this.droneGain = null;
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(theme.root - 12);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(theme.droneLevel * 0.2, t, 2);
    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(t);
    this.drone = osc;
    this.droneGain = gain;
  }

  /** Schedule the current bar, then re-arm for the next one. */
  private scheduleLoop(): void {
    if (this.disposed || !this.ctx || !this.theme) return;
    this.playBar(this.ctx.currentTime + 0.05);
    this.bar += 1;
    this.timer = setTimeout(
      () => this.scheduleLoop(),
      this.theme.barSeconds * 1000
    );
  }

  /** Perform one bar: pad chord, optional melody phrase, optional pulse. */
  private playBar(t: number): void {
    const { ctx, theme, filter } = this;
    if (!ctx || !theme || !filter) return;
    const barLen = theme.barSeconds;
    const chord = theme.chords[this.bar % theme.chords.length];

    for (const degree of chord) {
      const osc = ctx.createOscillator();
      osc.type = theme.padWave;
      osc.frequency.value = midiToHz(degreeToMidi(theme, degree));
      const gain = ctx.createGain();
      const peak = (0.32 * theme.padLevel) / chord.length;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + barLen * 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, t + barLen * 1.3);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(t);
      osc.stop(t + barLen * 1.4);
    }

    // The signature motif plays EVERY bar — the unmistakable identity of
    // the track. Fast themes get short plucks, slow themes long rings.
    const stepLen = barLen / theme.motif.length;
    theme.motif.forEach((motifDegree, i) => {
      const at = t + i * stepLen;
      const osc = ctx.createOscillator();
      osc.type = theme.melodyWave;
      osc.frequency.value = midiToHz(
        degreeToMidi(theme, motifDegree + theme.scale.length * theme.melodyOctave)
      );
      const decay = Math.min(theme.melodyDecay, stepLen * 1.8);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.2, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(gain);
      gain.connect(filter);
      if (this.delaySend) gain.connect(this.delaySend);
      osc.start(at);
      osc.stop(at + decay + 0.2);
    });

    if (Math.random() < theme.melodyChance) {
      const [min, max] = theme.melodyNotes;
      const notes = min + Math.floor(Math.random() * (max - min + 1));
      for (let i = 0; i < notes; i++) {
        // Rhythmic themes snap notes onto an 8th-note grid; ambient ones float.
        const at = theme.melodyOnGrid
          ? t + (Math.floor(Math.random() * 8) * barLen) / 8
          : t + Math.random() * barLen * 0.7;
        const degree =
          chord[Math.floor(Math.random() * chord.length)] +
          theme.scale.length * theme.melodyOctave;
        const osc = ctx.createOscillator();
        osc.type = theme.melodyWave;
        osc.frequency.value = midiToHz(degreeToMidi(theme, degree));
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.14, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + theme.melodyDecay);
        osc.connect(gain);
        gain.connect(filter);
        if (this.delaySend) gain.connect(this.delaySend);
        osc.start(at);
        osc.stop(at + theme.melodyDecay + 0.2);
      }
    }

    // Hand-drum pulse: a short pitch-dropping thump on each beat.
    if (theme.pulseBeats > 0 && theme.pulseLevel > 0) {
      for (let b = 0; b < theme.pulseBeats; b++) {
        const at = t + (b * barLen) / theme.pulseBeats;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, at);
        osc.frequency.exponentialRampToValueAtTime(55, at + 0.09);
        const gain = ctx.createGain();
        // Off-beats land softer for a dha-ti feel instead of a metronome.
        const level = 0.5 * theme.pulseLevel * (b % 2 === 0 ? 1 : 0.55);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(gain);
        gain.connect(this.duck!);
        osc.start(at);
        osc.stop(at + 0.2);
      }
    }
  }

  /** Ramp the duck stage toward its target (mute and duck share it). */
  private applyDuck(): void {
    if (!this.ctx || !this.duck) return;
    const silent = this.muted || this.ducked;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(
      silent ? 0 : 1,
      t,
      silent ? DUCK_FADE : RESUME_FADE
    );
  }
}
