// @ts-ignore — @magenta/music ships incomplete types
import * as mm from "@magenta/music";
import { ChordQuality, ChordSuggestion, DetectedChord, detectChord } from "./music";

const CHECKPOINT_URL =
  "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn";

export type MagentaState = "idle" | "loading" | "ready" | "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rnn: any = null;
let state: MagentaState = "idle";
const listeners = new Set<(s: MagentaState) => void>();

function setState(next: MagentaState) {
  state = next;
  listeners.forEach((fn) => fn(next));
}

export function getMagentaState(): MagentaState {
  return state;
}

export function subscribeMagentaState(fn: (s: MagentaState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initMagenta(): void {
  if (state !== "idle") return;
  setState("loading");
  (async () => {
    try {
      const model = new mm.MusicRNN(CHECKPOINT_URL);
      await model.initialize();
      rnn = model;
      setState("ready");
    } catch (err) {
      console.error("[Magenta] init failed:", err);
      setState("error");
    }
  })();
}

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Scale intervals per chord quality used to enrich the seed with passing tones
const QUALITY_SCALE_INTERVALS: Partial<Record<string, number[]>> = {
  maj:     [0, 2, 4, 5, 7, 9, 11],  // ionian
  maj7:    [0, 2, 4, 5, 7, 9, 11],
  maj9:    [0, 2, 4, 5, 7, 9, 11],
  "6":     [0, 2, 4, 5, 7, 9, 11],
  min:     [0, 2, 3, 5, 7, 9, 10],  // dorian
  min7:    [0, 2, 3, 5, 7, 9, 10],
  min9:    [0, 2, 3, 5, 7, 9, 10],
  min6:    [0, 2, 3, 5, 7, 9, 10],
  minMaj7: [0, 2, 3, 5, 7, 8, 11],  // melodic minor
  "7":     [0, 2, 4, 5, 7, 9, 10],  // mixolydian
  "9":     [0, 2, 4, 5, 7, 9, 10],
  m7b5:    [0, 1, 3, 5, 6, 8, 10],  // locrian
  dim:     [0, 2, 3, 5, 6, 8, 9, 11], // whole-half diminished
  dim7:    [0, 2, 3, 5, 6, 8, 9, 11],
  aug:     [0, 2, 4, 6, 8, 10],     // whole tone
  sus2:    [0, 2, 5, 7, 9, 10],
  sus4:    [0, 2, 5, 7, 9, 10],
};

const QUALITY_INTERVALS: Partial<Record<string, number[]>> = {
  maj:     [0, 4, 7],
  min:     [0, 3, 7],
  dim:     [0, 3, 6],
  aug:     [0, 4, 8],
  "6":     [0, 4, 7, 9],
  min6:    [0, 3, 7, 9],
  "7":     [0, 4, 7, 10, 14, 21],       // dom13:  R 3 5 b7 9 13
  "9":     [0, 4, 7, 10, 14, 21],       // dom13 (9 already included)
  maj7:    [0, 4, 7, 11, 14],           // maj9:   R 3 5 7 9
  maj9:    [0, 4, 7, 11, 14, 21],       // maj13:  R 3 5 7 9 13
  min7:    [0, 3, 7, 10, 14, 17],       // min11:  R b3 5 b7 9 11
  min9:    [0, 3, 7, 10, 14, 17, 21],   // min13:  R b3 5 b7 9 11 13
  minMaj7: [0, 3, 7, 11, 14],           // minMaj9: R b3 5 7 9
  m7b5:    [0, 3, 6, 10, 14],           // half-dim 9
  dim7:    [0, 3, 6, 9],
  sus2:    [0, 2, 7],
  sus4:    [0, 5, 7]
};

const SUFFIX_MAP: Partial<Record<string, string>> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "aug",
  "6": "6",
  min6: "m6",
  "7": "7",
  "9": "9",
  maj7: "maj7",
  maj9: "maj9",
  min7: "m7",
  min9: "m9",
  minMaj7: "mMaj7",
  m7b5: "m7b5",
  dim7: "dim7",
  sus2: "sus2",
  sus4: "sus4"
};

function normPc(n: number): number {
  return ((n % 12) + 12) % 12;
}

function buildChordNotes(root: number, quality: string): number[] {
  const rootMidi = 60 + root - (root >= 9 ? 12 : 0);
  return (QUALITY_INTERVALS[quality] ?? [0, 4, 7]).map((i) => rootMidi + i);
}

// basic_rnn was trained on pitches 48–83; clamp by octave-shifting to preserve pitch class.
const MELODY_MIN = 48;
const MELODY_MAX = 83;

function clampToMelodyRange(note: number): number {
  let n = note;
  while (n > MELODY_MAX) n -= 12;
  while (n < MELODY_MIN) n += 12;
  return n;
}

export async function getMagentaSuggestions(
  chord: DetectedChord,
  anchorNotes: number[]
): Promise<ChordSuggestion[]> {
  if (state !== "ready" || !rnn) return [];

  const sorted = [...anchorNotes].map(clampToMelodyRange).sort((a, b) => a - b);
  if (!sorted.length) return [];

  // Build scale passing tones for the chord's mode, excluding chord-tone pitch classes
  const chordPCSet = new Set(sorted.map(normPc));
  const baseNote = 60 + chord.root - (chord.root >= 9 ? 12 : 0);
  const scaleIntervals = QUALITY_SCALE_INTERVALS[chord.quality] ?? [0, 2, 4, 5, 7, 9, 11];
  const passingTones = scaleIntervals
    .map((i) => clampToMelodyRange(baseNote + i))
    .filter((n) => !chordPCSet.has(normPc(n)));

  // 16-step seed: alternate chord tones and scale passing tones for melodic context
  const SEED_STEPS = 16;
  const stepSec = 0.125; // sixteenth note at 120 BPM
  const rawSeed = {
    ticksPerQuarter: 220,
    totalTime: SEED_STEPS * stepSec,
    tempos: [{ time: 0, qpm: 120 }],
    timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
    notes: Array.from({ length: SEED_STEPS }, (_, i) => ({
      // interleave: even indices → chord tone, odd → passing tone (falls back to chord)
      pitch: i % 2 === 0 ? sorted[Math.floor(i / 2) % sorted.length] : (passingTones[(Math.floor(i / 2)) % (passingTones.length || 1)] ?? sorted[0]),
      startTime: i * stepSec,
      endTime: (i + 1) * stepSec,
      velocity: 70 + (i % 4 === 0 ? 15 : 0) // slight accent on beat
    }))
  };

  // MusicRNN.continueSequence requires a quantized sequence
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quantized: any;
  try {
    quantized = mm.sequences.quantizeNoteSequence(rawSeed, 4); // 4 steps per quarter = sixteenth
  } catch (err) {
    console.error("[Magenta] quantize failed:", err);
    return [];
  }

  // Run at several temperatures sequentially — each produces a different continuation,
  // giving us a different pitch-class distribution and therefore a different chord candidate.
  const currentPCSet = new Set(chord.pitchClasses);
  const perRunCounts: Record<number, number>[] = [];

  // Temperatures shifted up: drop the boring 0.8 run, push into more exploratory range
  for (const temperature of [1.1, 1.5, 1.9, 2.3]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await rnn.continueSequence(quantized, 32, temperature);
      const notes: { pitch?: number }[] = result?.notes ?? [];
      if (notes.length < 8) continue;

      // Analyse only the tail — early notes are still anchored to the seed
      const counts: Record<number, number> = {};
      notes.slice(-16).forEach((note) => {
        if (typeof note.pitch !== "number") return;
        const pc = normPc(note.pitch);
        // Aggressively suppress current chord tones; amplify anything new
        counts[pc] = (counts[pc] ?? 0) + (currentPCSet.has(pc) ? 0.3 : 3.0);
      });
      perRunCounts.push(counts);
    } catch {
      // ignore individual run failures, keep going
    }
  }

  const suggestions: ChordSuggestion[] = [];
  const seenLabels = new Set<string>();

  for (const counts of perRunCounts) {
    if (suggestions.length >= 6) break;

    const topPCs = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([pc]) => Number(pc));

    for (const size of [4, 3, 5]) {
      if (suggestions.length >= 6) break;
      if (topPCs.length < size) continue;

      const testNotes = topPCs
        .slice(0, size)
        .map((pc) => 60 + pc - (pc >= 9 ? 12 : 0));

      const detected = detectChord(testNotes);
      if (!detected || detected.quality === "unknown") continue;
      if (detected.root === chord.root && detected.quality === chord.quality) continue;

      const label = `${NOTE_NAMES[detected.root]}${SUFFIX_MAP[detected.quality] ?? ""}`;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const motion = (detected.root - chord.root + 12) % 12;
      const direction: "up" | "down" = motion <= 6 ? "up" : "down";
      const quality = detected.quality as Exclude<ChordQuality, "unknown">;

      suggestions.push({
        id: `magenta-${label}-${chord.name}`,
        label,
        keyName: "AI",
        degreeLabel: "",
        reason: "",
        notes: buildChordNotes(detected.root, detected.quality),
        root: detected.root,
        quality,
        direction,
        category: "color",
        tensionLevel: "colorful"
      });
    }
  }

  return suggestions;
}
