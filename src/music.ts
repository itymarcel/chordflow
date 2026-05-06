export type ChordQuality =
  | "maj"
  | "min"
  | "dim"
  | "aug"
  | "6"
  | "min6"
  | "7"
  | "9"
  | "maj7"
  | "maj9"
  | "min7"
  | "min9"
  | "minMaj7"
  | "m7b5"
  | "dim7"
  | "sus2"
  | "sus4"
  | "unknown";

export interface DetectedChord {
  root: number;
  bass: number;
  quality: ChordQuality;
  name: string;
  aliases: string[];
  pitchClasses: number[];
  confidence: number;
}

export interface ChordSuggestion {
  id: string;
  label: string;
  keyName: string;
  degreeLabel: string;
  reason: string;
  notes: number[];
  root: number;
  quality: Exclude<ChordQuality, "unknown">;
  direction: "up" | "down";
  category: SuggestionCategory;
  tensionLevel: TensionLevel;
}

export interface SuggestionContext {
  recentChords?: DetectedChord[];
  progressionMode?: ProgressionMode;
}

export type SuggestionMood = "jazz" | "pop" | "blues" | "gospel";
export type ProgressionMode = "auto" | "major_ii_v_i" | "minor_ii_v_i" | "turnaround" | "backdoor" | "backcycling";
export type SuggestionCategory = "cadence" | "turnaround" | "modulation" | "borrowed" | "blues" | "color";
export type TensionLevel = "safe" | "colorful" | "outside";
export type NoteRole = "bass" | "chord" | "tension" | "outside";

export interface ChordNoteAnalysis {
  noteRoles: Record<number, NoteRole>;
  leftHand: number[];
  rightHand: number[];
  tensionLevel: TensionLevel;
}

interface ChordPattern {
  quality: Exclude<ChordQuality, "unknown">;
  suffix: string;
  required: number[];
  optional: number[];
  avoid?: number[];
  priority: number;
  rootless?: boolean;
}

interface KeyContext {
  keyRoot: number;
  mode: "major" | "minor";
}

interface ChordRole {
  keyRoot: number;
  mode: "major" | "minor";
  degree: string;
  weight: number;
}

interface FunctionalMove {
  from: string;
  to: string;
  quality: Exclude<ChordQuality, "unknown">;
  source: string;
  category: SuggestionCategory;
  mode: "major" | "minor" | "either";
  baseWeight: number;
  moods: SuggestionMood[];
  allowSemitone?: boolean;
}

interface CandidateMatch {
  root: number;
  quality: Exclude<ChordQuality, "unknown">;
  suffix: string;
  name: string;
  score: number;
  confidence: number;
}

interface ProgressionSchemaStep {
  degree: string;
  quality: Exclude<ChordQuality, "unknown">;
}

interface ProgressionSchema {
  id: Exclude<ProgressionMode, "auto">;
  name: string;
  mode: "major" | "minor";
  moods: SuggestionMood[];
  category: SuggestionCategory;
  steps: ProgressionSchemaStep[];
  baseWeight: number;
}

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const DEGREE_INDEX: Record<string, number> = {
  I: 0,
  ii: 1,
  iii: 2,
  IV: 3,
  V: 4,
  vi: 5,
  "vii°": 6,
  i: 0,
  "ii°": 1,
  III: 2,
  iv: 3,
  v: 4,
  VI: 5,
  VII: 6
};
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const SPECIAL_DEGREE_INTERVALS: Record<string, { major?: number; minor?: number }> = {
  "VI7": { major: 9 },
  "bVII7": { major: 10 },
  "bII7": { major: 1 },
  "iv": { major: 5, minor: 5 },
  "V7": { minor: 7 },
  "iiø": { minor: 2 },
  "V/iii": { major: 11 },
  "#I°": { major: 1 }
};

const CHORD_PATTERNS: ChordPattern[] = [
  { quality: "maj9", suffix: "maj9", required: [0, 2, 4, 11], optional: [7, 9], avoid: [3, 10], priority: 19 },
  { quality: "9", suffix: "9", required: [0, 2, 4, 10], optional: [7, 5, 9], avoid: [3, 11], priority: 19 },
  { quality: "min9", suffix: "m9", required: [0, 2, 3, 10], optional: [7, 5, 8], avoid: [4, 11], priority: 18 },
  { quality: "maj7", suffix: "maj7", required: [0, 4, 11], optional: [7, 2, 9], avoid: [3, 10], priority: 16 },
  { quality: "7", suffix: "7", required: [0, 4, 10], optional: [7, 2, 5, 9], avoid: [11, 3], priority: 17 },
  { quality: "minMaj7", suffix: "mMaj7", required: [0, 3, 11], optional: [7, 2, 5, 9], avoid: [4, 10], priority: 15 },
  { quality: "min7", suffix: "m7", required: [0, 3, 10], optional: [7, 2, 5, 8], avoid: [4, 11], priority: 15 },
  { quality: "m7b5", suffix: "m7b5", required: [0, 3, 6, 10], optional: [2, 5, 8], avoid: [7, 4, 11], priority: 18 },
  { quality: "dim7", suffix: "dim7", required: [0, 3, 6, 9], optional: [2, 5], avoid: [4, 7, 10, 11], priority: 18 },
  { quality: "6", suffix: "6", required: [0, 4, 9], optional: [7, 2], avoid: [10, 11, 3], priority: 10 },
  { quality: "min6", suffix: "m6", required: [0, 3, 9], optional: [7, 2], avoid: [10, 11, 4], priority: 10 },
  { quality: "maj", suffix: "", required: [0, 4], optional: [7, 2, 9], avoid: [3, 10], priority: 8 },
  { quality: "min", suffix: "m", required: [0, 3], optional: [7, 2, 5, 8], avoid: [4, 11], priority: 8 },
  { quality: "dim", suffix: "dim", required: [0, 3, 6], optional: [9], avoid: [4, 7, 10, 11], priority: 9 },
  { quality: "aug", suffix: "aug", required: [0, 4, 8], optional: [10], avoid: [3, 7, 11], priority: 9 },
  { quality: "sus2", suffix: "sus2", required: [0, 2, 7], optional: [10], avoid: [3, 4, 11], priority: 7 },
  { quality: "sus4", suffix: "sus4", required: [0, 5, 7], optional: [10], avoid: [3, 4, 11], priority: 7 },
  { quality: "maj9", suffix: "maj9", required: [2, 4, 11], optional: [7, 9], avoid: [3, 10], priority: 10, rootless: true },
  { quality: "9", suffix: "9", required: [2, 4, 10], optional: [5, 9], avoid: [3, 11], priority: 11, rootless: true },
  { quality: "min9", suffix: "m9", required: [2, 3, 10], optional: [5, 7], avoid: [4, 11], priority: 10, rootless: true },
  { quality: "maj7", suffix: "maj7", required: [4, 11], optional: [2, 7, 9], avoid: [3, 10], priority: 6, rootless: true },
  { quality: "7", suffix: "7", required: [4, 10], optional: [2, 5, 9], avoid: [3, 11], priority: 7, rootless: true },
  { quality: "min7", suffix: "m7", required: [3, 10], optional: [2, 5, 7], avoid: [4, 11], priority: 6, rootless: true },
  { quality: "m7b5", suffix: "m7b5", required: [3, 6, 10], optional: [1, 5, 8], avoid: [4, 7, 11], priority: 7, rootless: true }
];

const QUALITY_INTERVALS: Record<Exclude<ChordQuality, "unknown">, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "6": [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  "9": [0, 4, 7, 10, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  minMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7]
};

const STRUCTURAL_INTERVALS: Record<Exclude<ChordQuality, "unknown">, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "6": [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  "9": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10],
  minMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7]
};

const TENSION_INTERVALS: Record<Exclude<ChordQuality, "unknown">, number[]> = {
  maj: [2, 9],
  min: [2, 5, 9],
  dim: [2, 5],
  aug: [2, 10],
  "6": [2],
  min6: [2, 5],
  "7": [2, 5, 9],
  "9": [2, 5, 9],
  maj7: [2, 9],
  maj9: [2, 9],
  min7: [2, 5, 9],
  min9: [2, 5, 9],
  minMaj7: [2, 5, 9],
  m7b5: [2, 5, 8],
  dim7: [2, 5],
  sus2: [9],
  sus4: [2, 9]
};

const DIATONIC_MAJOR: Record<string, Exclude<ChordQuality, "unknown">> = {
  I: "maj7",
  ii: "min7",
  iii: "min7",
  IV: "maj7",
  V: "7",
  vi: "min7",
  "vii°": "m7b5"
};

const DIATONIC_MINOR: Record<string, Exclude<ChordQuality, "unknown">> = {
  i: "min7",
  "ii°": "m7b5",
  III: "maj7",
  iv: "min7",
  v: "min7",
  VI: "maj7",
  VII: "7"
};

const FUNCTIONAL_MOVES: FunctionalMove[] = [
  { from: "I", to: "ii", quality: "min7", source: "predominant setup", category: "cadence", mode: "major", baseWeight: 1.25, moods: ["jazz", "gospel"] },
  { from: "I", to: "vi", quality: "min7", source: "turnaround release", category: "turnaround", mode: "major", baseWeight: 1.05, moods: ["jazz", "pop", "gospel"] },
  { from: "I", to: "IV", quality: "maj7", source: "subdominant lift", category: "cadence", mode: "major", baseWeight: 0.95, moods: ["pop", "gospel", "blues"] },
  { from: "I", to: "V", quality: "7", source: "direct dominant push", category: "cadence", mode: "major", baseWeight: 0.9, moods: ["pop", "blues"] },
  { from: "ii", to: "V", quality: "7", source: "dominant preparation", category: "cadence", mode: "major", baseWeight: 1.8, moods: ["jazz", "gospel", "pop"] },
  { from: "ii", to: "bII7", quality: "7", source: "tritone substitute dominant", category: "modulation", mode: "major", baseWeight: 1.35, moods: ["jazz"], allowSemitone: true },
  { from: "iii", to: "vi", quality: "min7", source: "circle of fourths backcycle", category: "turnaround", mode: "major", baseWeight: 1.45, moods: ["jazz", "gospel"] },
  { from: "iii", to: "VI7", quality: "7", source: "secondary dominant into ii", category: "modulation", mode: "major", baseWeight: 1.55, moods: ["jazz", "gospel"] },
  { from: "IV", to: "I", quality: "maj7", source: "plagal return", category: "cadence", mode: "major", baseWeight: 0.95, moods: ["pop", "gospel", "blues"] },
  { from: "IV", to: "iv", quality: "min7", source: "borrowed subdominant color", category: "borrowed", mode: "major", baseWeight: 1.2, moods: ["jazz", "gospel", "blues"] },
  { from: "IV", to: "V", quality: "7", source: "subdominant to dominant", category: "cadence", mode: "major", baseWeight: 1.15, moods: ["pop", "gospel", "blues"] },
  { from: "V", to: "I", quality: "maj7", source: "dominant resolution", category: "cadence", mode: "major", baseWeight: 2.0, moods: ["jazz", "pop", "gospel", "blues"] },
  { from: "V", to: "vi", quality: "min7", source: "deceptive resolution", category: "color", mode: "major", baseWeight: 0.9, moods: ["pop", "gospel"] },
  { from: "vi", to: "ii", quality: "min7", source: "turnaround backcycle", category: "turnaround", mode: "major", baseWeight: 1.55, moods: ["jazz", "pop", "gospel"] },
  { from: "vi", to: "IV", quality: "maj7", source: "pop cycle motion", category: "turnaround", mode: "major", baseWeight: 0.95, moods: ["pop"] },
  { from: "vii°", to: "I", quality: "maj7", source: "leading-tone resolution", category: "cadence", mode: "major", baseWeight: 1.5, moods: ["jazz", "gospel"] },
  { from: "VI7", to: "ii", quality: "min7", source: "secondary dominant resolution", category: "modulation", mode: "major", baseWeight: 1.7, moods: ["jazz", "gospel"] },
  { from: "bVII7", to: "I", quality: "maj7", source: "backdoor resolution", category: "cadence", mode: "major", baseWeight: 1.75, moods: ["jazz", "gospel", "blues"] },
  { from: "bII7", to: "I", quality: "maj7", source: "tritone dominant resolution", category: "modulation", mode: "major", baseWeight: 1.85, moods: ["jazz"], allowSemitone: true },
  { from: "iv", to: "bVII7", quality: "7", source: "backdoor dominant setup", category: "borrowed", mode: "major", baseWeight: 1.55, moods: ["jazz", "gospel", "blues"] },
  { from: "#I°", to: "ii", quality: "min7", source: "passing diminished lift", category: "color", mode: "major", baseWeight: 1.45, moods: ["jazz", "gospel"], allowSemitone: true },
  { from: "V/iii", to: "iii", quality: "min7", source: "secondary dominant resolution", category: "modulation", mode: "major", baseWeight: 1.5, moods: ["jazz"] },
  { from: "i", to: "iv", quality: "min7", source: "minor subdominant motion", category: "cadence", mode: "minor", baseWeight: 1.0, moods: ["jazz", "blues", "gospel"] },
  { from: "i", to: "iiø", quality: "m7b5", source: "minor predominant setup", category: "cadence", mode: "minor", baseWeight: 1.35, moods: ["jazz", "gospel"] },
  { from: "i", to: "VI", quality: "maj7", source: "minor color expansion", category: "color", mode: "minor", baseWeight: 0.95, moods: ["jazz", "gospel"] },
  { from: "iiø", to: "V7", quality: "7", source: "minor dominant preparation", category: "cadence", mode: "minor", baseWeight: 1.9, moods: ["jazz", "gospel"] },
  { from: "III", to: "iiø", quality: "m7b5", source: "minor backcycle toward dominant", category: "turnaround", mode: "minor", baseWeight: 1.35, moods: ["jazz", "gospel"] },
  { from: "iv", to: "V7", quality: "7", source: "minor subdominant to dominant", category: "cadence", mode: "minor", baseWeight: 1.45, moods: ["jazz", "gospel", "blues"] },
  { from: "V7", to: "i", quality: "min7", source: "minor dominant resolution", category: "cadence", mode: "minor", baseWeight: 2.0, moods: ["jazz", "gospel", "blues"] },
  { from: "V7", to: "VI", quality: "maj7", source: "minor deceptive color", category: "color", mode: "minor", baseWeight: 0.8, moods: ["gospel"] },
  { from: "I", to: "IV", quality: "7", source: "blues subdominant move", category: "blues", mode: "major", baseWeight: 1.3, moods: ["blues"] },
  { from: "IV", to: "V", quality: "7", source: "blues dominant climb", category: "blues", mode: "major", baseWeight: 1.3, moods: ["blues"] },
  { from: "V", to: "I", quality: "7", source: "blues turnaround resolution", category: "blues", mode: "major", baseWeight: 1.35, moods: ["blues"] }
];

const PROGRESSION_SCHEMAS: ProgressionSchema[] = [
  {
    id: "major_ii_v_i",
    name: "major ii-V-I",
    mode: "major",
    moods: ["jazz", "pop", "gospel"],
    category: "cadence",
    steps: [
      { degree: "ii", quality: "min7" },
      { degree: "V", quality: "7" },
      { degree: "I", quality: "maj7" }
    ],
    baseWeight: 2.5
  },
  {
    id: "minor_ii_v_i",
    name: "minor iiø-V-i",
    mode: "minor",
    moods: ["jazz", "gospel", "blues"],
    category: "cadence",
    steps: [
      { degree: "iiø", quality: "m7b5" },
      { degree: "V7", quality: "7" },
      { degree: "i", quality: "min7" }
    ],
    baseWeight: 2.45
  },
  {
    id: "turnaround",
    name: "turnaround",
    mode: "major",
    moods: ["jazz", "pop", "gospel"],
    category: "turnaround",
    steps: [
      { degree: "I", quality: "maj7" },
      { degree: "vi", quality: "min7" },
      { degree: "ii", quality: "min7" },
      { degree: "V", quality: "7" }
    ],
    baseWeight: 2.2
  },
  {
    id: "backdoor",
    name: "backdoor",
    mode: "major",
    moods: ["jazz", "gospel", "blues"],
    category: "borrowed",
    steps: [
      { degree: "iv", quality: "min7" },
      { degree: "bVII7", quality: "7" },
      { degree: "I", quality: "maj7" }
    ],
    baseWeight: 2.15
  },
  {
    id: "backcycling",
    name: "backcycling",
    mode: "major",
    moods: ["jazz", "gospel"],
    category: "turnaround",
    steps: [
      { degree: "iii", quality: "min7" },
      { degree: "VI7", quality: "7" },
      { degree: "ii", quality: "min7" },
      { degree: "V", quality: "7" },
      { degree: "I", quality: "maj7" }
    ],
    baseWeight: 2.35
  }
];

function normalizePitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}

function uniqPitchClasses(notes: number[]): number[] {
  return Array.from(new Set(notes.map(normalizePitchClass))).sort((a, b) => a - b);
}

function buildScale(keyRoot: number, mode: "major" | "minor"): number[] {
  const intervals = mode === "major" ? MAJOR_SCALE : NATURAL_MINOR_SCALE;
  return intervals.map((interval) => (keyRoot + interval) % 12);
}

function degreeToPitchClass(keyRoot: number, mode: "major" | "minor", degree: string): number {
  const special = SPECIAL_DEGREE_INTERVALS[degree];
  if (special) {
    const interval = mode === "major" ? special.major : special.minor;
    if (interval !== undefined) {
      return (keyRoot + interval) % 12;
    }
  }

  const scale = buildScale(keyRoot, mode);
  const accidental = degree.startsWith("b") ? -1 : degree.startsWith("#") ? 1 : 0;
  const numeral = degree.replace(/^(b|#)/, "").replace(/7|ø/g, "");
  const index = DEGREE_INDEX[numeral];
  return (scale[index] + accidental + 12) % 12;
}

function noteName(note: number): string {
  return NOTE_NAMES[normalizePitchClass(note)];
}

export { noteName };

export function midiToLabel(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${noteName(note)}${octave}`;
}

function inferTensionLevel(
  quality: Exclude<ChordQuality, "unknown">,
  category: SuggestionCategory,
  roles?: NoteRole[]
): TensionLevel {
  if (roles?.includes("outside")) {
    return "outside";
  }

  if (
    category === "modulation" ||
    category === "borrowed" ||
    quality === "9" ||
    quality === "maj9" ||
    quality === "min9" ||
    quality === "dim7" ||
    quality === "aug" ||
    quality === "minMaj7"
  ) {
    return "colorful";
  }

  if (roles?.includes("tension")) {
    return "colorful";
  }

  return "safe";
}

function scorePattern(root: number, pitchClasses: number[], bass: number, pattern: ChordPattern): CandidateMatch | null {
  const normalized = pitchClasses.map((pc) => (pc - root + 12) % 12);

  if (!pattern.required.every((interval) => normalized.includes(interval))) {
    return null;
  }

  let score = pattern.priority;

  for (const interval of normalized) {
    if (pattern.required.includes(interval)) {
      score += interval === 0 ? 2.6 : 1.8;
      continue;
    }

    if (pattern.optional.includes(interval)) {
      score += 0.45;
      continue;
    }

    if (pattern.avoid?.includes(interval)) {
      score -= 1.35;
      continue;
    }

    score -= 0.5;
  }

  if (normalized.includes(7)) {
    score += 0.25;
  }

  if (normalized.includes(0) && !pattern.rootless) {
    score += 0.8;
  }

  const bassInterval = (bass - root + 12) % 12;

  if (root === bass) {
    score += pattern.rootless ? 0.3 : 2.2;
  } else if (bassInterval === 7) {
    score += 0.35;
  } else if (bassInterval === 3 || bassInterval === 4) {
    score -= pattern.rootless ? 0.1 : 0.45;
  } else if (pattern.required.includes(bassInterval)) {
    score += 0.05;
  } else {
    score -= 0.55;
  }

  if (pattern.rootless && normalized.includes(0)) {
    score -= 0.5;
  }

  const confidence = Math.max(0.2, Math.min(0.99, score / 24));

  return {
    root,
    quality: pattern.quality,
    suffix: pattern.suffix,
    name: `${noteName(root)}${pattern.suffix}${root !== bass ? `/${noteName(bass)}` : ""}`,
    score,
    confidence
  };
}

function qualityMatches(actual: ChordQuality, expected: Exclude<ChordQuality, "unknown">): boolean {
  if (actual === expected) {
    return true;
  }

  const compatible: Partial<Record<Exclude<ChordQuality, "unknown">, ChordQuality[]>> = {
    maj9: ["maj7", "maj", "6"],
    "9": ["7", "sus4", "sus2"],
    min9: ["min7", "min", "min6"],
    maj7: ["maj", "6"],
    min7: ["min", "min6"],
    "7": ["sus4", "sus2"],
    min: ["min7", "min6"],
    maj: ["maj7", "6"],
    dim: ["m7b5", "dim7"]
  };

  return compatible[expected]?.includes(actual) ?? false;
}

function detectChordRoles(chord: DetectedChord): ChordRole[] {
  const roles: ChordRole[] = [];

  for (let keyRoot = 0; keyRoot < 12; keyRoot += 1) {
    for (const [degree, quality] of Object.entries(DIATONIC_MAJOR)) {
      if (degreeToPitchClass(keyRoot, "major", degree) === chord.root && qualityMatches(chord.quality, quality)) {
        roles.push({ keyRoot, mode: "major", degree, weight: chord.confidence });
      }
    }

    for (const [degree, quality] of Object.entries(DIATONIC_MINOR)) {
      if (degreeToPitchClass(keyRoot, "minor", degree) === chord.root && qualityMatches(chord.quality, quality)) {
        roles.push({ keyRoot, mode: "minor", degree, weight: chord.confidence });
      }
    }

    if (degreeToPitchClass(keyRoot, "major", "VI7") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "major", degree: "VI7", weight: chord.confidence + 0.15 });
    }

    if (degreeToPitchClass(keyRoot, "major", "bVII7") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "major", degree: "bVII7", weight: chord.confidence + 0.1 });
    }

    if (degreeToPitchClass(keyRoot, "major", "bII7") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "major", degree: "bII7", weight: chord.confidence + 0.1 });
    }

    if (degreeToPitchClass(keyRoot, "major", "iv") === chord.root && qualityMatches(chord.quality, "min7")) {
      roles.push({ keyRoot, mode: "major", degree: "iv", weight: chord.confidence + 0.05 });
    }

    if (degreeToPitchClass(keyRoot, "major", "I") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "major", degree: "I", weight: chord.confidence + 0.12 });
    }

    if (degreeToPitchClass(keyRoot, "major", "IV") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "major", degree: "IV", weight: chord.confidence + 0.12 });
    }

    if (degreeToPitchClass(keyRoot, "major", "V/iii") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "major", degree: "V/iii", weight: chord.confidence + 0.18 });
    }

    if (degreeToPitchClass(keyRoot, "major", "#I°") === chord.root && chord.quality === "dim7") {
      roles.push({ keyRoot, mode: "major", degree: "#I°", weight: chord.confidence + 0.16 });
    }

    if (degreeToPitchClass(keyRoot, "minor", "V7") === chord.root && chord.quality === "7") {
      roles.push({ keyRoot, mode: "minor", degree: "V7", weight: chord.confidence + 0.1 });
    }

    if (degreeToPitchClass(keyRoot, "minor", "iiø") === chord.root && chord.quality === "m7b5") {
      roles.push({ keyRoot, mode: "minor", degree: "iiø", weight: chord.confidence + 0.1 });
    }
  }

  return roles.sort((a, b) => b.weight - a.weight);
}

export function getDetectedChordDegreeLabel(chord: DetectedChord | null): string {
  if (!chord) {
    return "";
  }

  return detectChordRoles(chord)[0]?.degree ?? "";
}

function buildSuggestionFromDegree(context: KeyContext, degree: string, quality: Exclude<ChordQuality, "unknown">): ChordSuggestion {
  const root = degreeToPitchClass(context.keyRoot, context.mode, degree);
  const rootMidi = 60 + root - (root >= 9 ? 12 : 0);
  const suffixMap: Record<Exclude<ChordQuality, "unknown">, string> = {
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

  return {
    id: `${context.keyRoot}-${context.mode}-${degree}-${quality}`,
    label: `${noteName(root)}${suffixMap[quality]}`,
    keyName: `${noteName(context.keyRoot)} ${context.mode}`,
    degreeLabel: degree,
    reason: "",
    notes: QUALITY_INTERVALS[quality].map((interval) => rootMidi + interval),
    root,
    quality,
    direction: "up",
    category: "cadence",
    tensionLevel: inferTensionLevel(quality, "cadence")
  };
}

function signedMotion(fromRoot: number, toRoot: number): number {
  const up = (toRoot - fromRoot + 12) % 12;
  if (up === 0) {
    return 0;
  }

  return up <= 6 ? up : up - 12;
}

function withDirection(suggestion: ChordSuggestion, sourceRoot: number): ChordSuggestion {
  return {
    ...suggestion,
    direction: signedMotion(sourceRoot, suggestion.root) < 0 ? "down" : "up"
  };
}

function rankFunctionalMove(role: ChordRole, suggestion: ChordSuggestion, move: FunctionalMove, mood: SuggestionMood): number {
  const currentRoot = degreeToPitchClass(role.keyRoot, role.mode, move.from);
  const motion = signedMotion(currentRoot, suggestion.root);
  const fourthOrFifthBias = Math.abs(motion) === 5 ? 0.75 : 0;
  const dominantBias = move.quality === "7" || move.quality === "9" ? 0.25 : 0;
  const subdominantBias = move.to === "ii" || move.to === "IV" || move.to === "iv" || move.to === "iiø" ? 0.22 : 0;
  const semitonePenalty = !move.allowSemitone && Math.abs(motion) <= 1 ? -1.2 : 0;
  const moodBias = move.moods.includes(mood) ? 0.85 : mood === "jazz" ? 0.1 : -0.35;

  return role.weight + move.baseWeight + fourthOrFifthBias + dominantBias + subdominantBias + semitonePenalty + moodBias;
}

function rankHistoryContext(
  chord: DetectedChord,
  suggestion: ChordSuggestion,
  recentChords: DetectedChord[]
): number {
  if (!recentChords.length) {
    return 0;
  }

  let score = 0;
  const previous = recentChords[0];
  const older = recentChords[1];
  const lastMotion = signedMotion(previous.root, chord.root);
  const nextMotion = signedMotion(chord.root, suggestion.root);

  if (Math.abs(lastMotion) === 5 && Math.abs(nextMotion) === 5) {
    score += 0.75;
  }

  if (lastMotion !== 0 && nextMotion !== 0 && Math.sign(lastMotion) === Math.sign(nextMotion)) {
    score += 0.22;
  }

  if (previous.root === suggestion.root) {
    score -= 0.9;
  }

  if (older) {
    if (older.root === suggestion.root) {
      score += 0.35;
    }

    const olderMotion = signedMotion(older.root, previous.root);
    if (Math.abs(olderMotion) === 5 && Math.abs(lastMotion) === 5 && Math.abs(nextMotion) === 5) {
      score += 0.55;
    }
  }

  if (suggestion.category === "turnaround" && recentChords.length >= 2) {
    score += 0.25;
  }

  return score;
}

function stepMatchesRole(role: ChordRole, chord: DetectedChord, schema: ProgressionSchema, stepIndex: number): boolean {
  const step = schema.steps[stepIndex];
  return role.mode === schema.mode && role.degree === step.degree && qualityMatches(chord.quality, step.quality);
}

function rankSchemaPath(
  schema: ProgressionSchema,
  role: ChordRole,
  chord: DetectedChord,
  stepIndex: number,
  recentChords: DetectedChord[],
  mood: SuggestionMood
): number {
  let score = schema.baseWeight + role.weight;

  if (schema.moods.includes(mood)) {
    score += 0.9;
  }

  if (stepIndex > 0) {
    score += stepIndex * 0.25;
  }

  for (let offset = 1; offset <= Math.min(stepIndex, recentChords.length); offset += 1) {
    const previousChord = recentChords[offset - 1];
    const previousRoles = detectChordRoles(previousChord);
    const matched = previousRoles.some((previousRole) => {
      return (
        previousRole.keyRoot === role.keyRoot &&
        previousRole.mode === role.mode &&
        stepMatchesRole(previousRole, previousChord, schema, stepIndex - offset)
      );
    });

    if (!matched) {
      break;
    }

    score += 0.85 + (stepIndex - offset) * 0.08;
  }

  const nextStep = schema.steps[stepIndex + 1];
  if (nextStep) {
    const nextRoot = degreeToPitchClass(role.keyRoot, role.mode, nextStep.degree);
    const motion = signedMotion(chord.root, nextRoot);
    if (Math.abs(motion) === 5) {
      score += 0.5;
    }
  }

  return score;
}

function buildSchemaSuggestions(
  chord: DetectedChord,
  mood: SuggestionMood,
  recentChords: DetectedChord[],
  progressionMode: ProgressionMode
): Array<ChordSuggestion & { rank: number }> {
  const roles = detectChordRoles(chord);
  const schemas =
    progressionMode === "auto"
      ? PROGRESSION_SCHEMAS
      : PROGRESSION_SCHEMAS.filter((schema) => schema.id === progressionMode);
  const bestByLabel = new Map<string, ChordSuggestion & { rank: number }>();

  for (const role of roles.slice(0, 10)) {
    for (const schema of schemas) {
      for (let stepIndex = 0; stepIndex < schema.steps.length; stepIndex += 1) {
        if (!stepMatchesRole(role, chord, schema, stepIndex)) {
          continue;
        }

        const rank = rankSchemaPath(schema, role, chord, stepIndex, recentChords, mood);
        const nextStep = schema.steps[stepIndex + 1];

        if (nextStep) {
          const suggestion = buildSuggestionFromDegree({ keyRoot: role.keyRoot, mode: role.mode }, nextStep.degree, nextStep.quality);
          suggestion.reason = `${schema.name} in ${noteName(role.keyRoot)} ${role.mode}`;
          suggestion.category = schema.category;
          suggestion.tensionLevel = inferTensionLevel(nextStep.quality, schema.category);
          const ranked = {
            ...withDirection(suggestion, chord.root),
            rank
          };
          const existing = bestByLabel.get(suggestion.label);
          if (!existing || ranked.rank > existing.rank) {
            bestByLabel.set(suggestion.label, ranked);
          }
        }

        if (progressionMode !== "auto" && stepIndex === 0 && schema.steps[stepIndex + 2]) {
          const laterStep = schema.steps[stepIndex + 2];
          const followup = buildSuggestionFromDegree({ keyRoot: role.keyRoot, mode: role.mode }, laterStep.degree, laterStep.quality);
          followup.reason = `${schema.name} resolution in ${noteName(role.keyRoot)} ${role.mode}`;
          followup.category = schema.category;
          followup.tensionLevel = inferTensionLevel(laterStep.quality, schema.category);
          const rankedFollowup = {
            ...withDirection(followup, chord.root),
            rank: rank - 0.35
          };
          const existingFollowup = bestByLabel.get(followup.label);
          if (!existingFollowup || rankedFollowup.rank > existingFollowup.rank) {
            bestByLabel.set(followup.label, rankedFollowup);
          }
        }
      }
    }
  }

  if (!bestByLabel.size && progressionMode !== "auto") {
    const schema = PROGRESSION_SCHEMAS.find((entry) => entry.id === progressionMode);
    if (schema) {
      for (let keyRoot = 0; keyRoot < 12; keyRoot += 1) {
        const role = roles.find((entry) => entry.keyRoot === keyRoot && entry.mode === schema.mode) ?? roles[0];
        if (!role) {
          continue;
        }

        for (let stepIndex = 0; stepIndex < Math.min(2, schema.steps.length); stepIndex += 1) {
          const step = schema.steps[stepIndex];
          const suggestion = buildSuggestionFromDegree({ keyRoot: role.keyRoot, mode: schema.mode }, step.degree, step.quality);
          suggestion.reason = `${schema.name} guide in ${noteName(role.keyRoot)} ${schema.mode}`;
          suggestion.category = schema.category;
          suggestion.tensionLevel = inferTensionLevel(step.quality, schema.category);
          const ranked = {
            ...withDirection(suggestion, chord.root),
            rank: schema.baseWeight - stepIndex * 0.15
          };
          const existing = bestByLabel.get(suggestion.label);
          if (!existing || ranked.rank > existing.rank) {
            bestByLabel.set(suggestion.label, ranked);
          }
        }
      }
    }
  }

  return Array.from(bestByLabel.values());
}

function getFallbackSuggestionsForEmptyState(progressionMode: ProgressionMode): ChordSuggestion[] {
  const schema =
    progressionMode !== "auto" ? PROGRESSION_SCHEMAS.find((entry) => entry.id === progressionMode) : undefined;

  if (schema) {
    return schema.steps.slice(0, 4).map((step, index) => ({
      ...buildSuggestionFromDegree({ keyRoot: 0, mode: schema.mode }, step.degree, step.quality),
      reason: `${schema.name} guide in C ${schema.mode}`,
      category: schema.category,
      tensionLevel: inferTensionLevel(step.quality, schema.category),
      direction: index === 0 ? "up" : "down"
    }));
  }

  return [
    {
      ...buildSuggestionFromDegree({ keyRoot: 0, mode: "major" }, "ii", "min7"),
      reason: "major ii-V-I in C major",
      direction: "up",
      category: "cadence",
      tensionLevel: inferTensionLevel("min7", "cadence")
    },
    {
      ...buildSuggestionFromDegree({ keyRoot: 0, mode: "major" }, "V", "7"),
      reason: "major ii-V-I in C major",
      direction: "up",
      category: "cadence",
      tensionLevel: inferTensionLevel("7", "cadence")
    },
    {
      ...buildSuggestionFromDegree({ keyRoot: 9, mode: "minor" }, "iiø", "m7b5"),
      reason: "minor iiø-V-i in A minor",
      direction: "down",
      category: "cadence",
      tensionLevel: inferTensionLevel("m7b5", "cadence")
    },
    {
      ...buildSuggestionFromDegree({ keyRoot: 0, mode: "major" }, "vi", "min7"),
      reason: "turnaround in C major",
      direction: "down",
      category: "turnaround",
      tensionLevel: inferTensionLevel("min7", "turnaround")
    }
  ];
}

function getFunctionalSuggestions(
  chord: DetectedChord,
  mood: SuggestionMood,
  recentChords: DetectedChord[]
): Array<ChordSuggestion & { rank: number }> {
  const roles = detectChordRoles(chord);
  const bestByLabel = new Map<string, ChordSuggestion & { rank: number }>();

  for (const role of roles.slice(0, 10)) {
    for (const move of FUNCTIONAL_MOVES) {
      if (move.mode !== "either" && move.mode !== role.mode) {
        continue;
      }

      if (move.from !== role.degree) {
        continue;
      }

      const suggestion = buildSuggestionFromDegree({ keyRoot: role.keyRoot, mode: role.mode }, move.to, move.quality);
      suggestion.reason = `${move.source} in ${noteName(role.keyRoot)} ${role.mode}`;
      suggestion.category = move.category;
      suggestion.tensionLevel = inferTensionLevel(move.quality, move.category);

      const rankedSuggestion = {
        ...withDirection(suggestion, chord.root),
        rank: rankFunctionalMove(role, suggestion, move, mood) + rankHistoryContext(chord, suggestion, recentChords)
      };
      const existing = bestByLabel.get(suggestion.label);

      if (!existing || rankedSuggestion.rank > existing.rank) {
        bestByLabel.set(suggestion.label, rankedSuggestion);
      }
    }
  }

  return Array.from(bestByLabel.values());
}

export function detectChord(notes: number[]): DetectedChord | null {
  if (notes.length < 3) {
    return null;
  }

  const sortedNotes = [...notes].sort((a, b) => a - b);
  const pitchClasses = uniqPitchClasses(sortedNotes);
  const bass = normalizePitchClass(sortedNotes[0]);
  const candidates: CandidateMatch[] = [];

  for (let root = 0; root < 12; root += 1) {
    for (const pattern of CHORD_PATTERNS) {
      const match = scorePattern(root, pitchClasses, bass, pattern);
      if (match) {
        candidates.push(match);
      }
    }
  }

  if (!candidates.length) {
    return {
      root: bass,
      bass,
      quality: "unknown",
      name: `${noteName(bass)} cluster`,
      aliases: [],
      pitchClasses,
      confidence: 0.2
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const distinct = candidates.filter((candidate, index, all) => {
    return all.findIndex((entry) => entry.name === candidate.name) === index;
  });
  const best = distinct[0];
  const aliases = distinct
    .filter((candidate, index) => index > 0 && best.score - candidate.score <= 1.25)
    .slice(0, 2)
    .map((candidate) => candidate.name);

  return {
    root: best.root,
    bass,
    quality: best.quality,
    name: best.name,
    aliases,
    pitchClasses,
    confidence: best.confidence
  };
}

export function splitHands(notes: number[]): { leftHand: number[]; rightHand: number[] } {
  if (!notes.length) {
    return { leftHand: [], rightHand: [] };
  }

  const sorted = [...notes].sort((a, b) => a - b);

  if (sorted.length === 1) {
    return { leftHand: sorted, rightHand: [] };
  }

  if (sorted.length <= 3 || sorted[sorted.length - 1] - sorted[0] <= 9) {
    return { leftHand: [sorted[0]], rightHand: sorted.slice(1) };
  }

  let splitIndex = Math.ceil(sorted.length / 2) - 1;
  let bestGapScore = -Infinity;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const gap = sorted[index + 1] - sorted[index];
    const midpoint = (sorted[index] + sorted[index + 1]) / 2;
    const centralBias = midpoint >= 48 && midpoint <= 72 ? 1.25 : 0;
    const score = gap + centralBias;

    if (score > bestGapScore) {
      bestGapScore = score;
      splitIndex = index;
    }
  }

  const leftHand = sorted.slice(0, splitIndex + 1);
  const rightHand = sorted.slice(splitIndex + 1);

  if (!rightHand.length) {
    return { leftHand: sorted.slice(0, 1), rightHand: sorted.slice(1) };
  }

  return { leftHand, rightHand };
}

export function analyzeChordNotes(chord: DetectedChord | null, notes: number[]): ChordNoteAnalysis {
  const sorted = [...notes].sort((a, b) => a - b);
  const { leftHand, rightHand } = splitHands(sorted);
  const noteRoles: Record<number, NoteRole> = {};

  if (!sorted.length || !chord || chord.quality === "unknown") {
    sorted.forEach((note, index) => {
      noteRoles[note] = index === 0 ? "bass" : "outside";
    });

    return {
      noteRoles,
      leftHand,
      rightHand,
      tensionLevel: sorted.length > 3 ? "outside" : "safe"
    };
  }

  const bassNote = sorted[0];
  const structural = new Set(STRUCTURAL_INTERVALS[chord.quality]);
  const tensions = new Set(TENSION_INTERVALS[chord.quality]);

  sorted.forEach((note) => {
    const interval = (normalizePitchClass(note) - chord.root + 12) % 12;

    if (note === bassNote) {
      noteRoles[note] = interval === 0 ? "bass" : structural.has(interval) ? "chord" : tensions.has(interval) ? "tension" : "outside";
      return;
    }

    if (structural.has(interval)) {
      noteRoles[note] = "chord";
      return;
    }

    if (tensions.has(interval)) {
      noteRoles[note] = "tension";
      return;
    }

    noteRoles[note] = "outside";
  });

  const roles = Object.values(noteRoles);

  return {
    noteRoles,
    leftHand,
    rightHand,
    tensionLevel: inferTensionLevel(chord.quality, "cadence", roles)
  };
}

export function getChordSuggestions(
  chord: DetectedChord | null,
  mood: SuggestionMood = "jazz",
  context: SuggestionContext = {}
): ChordSuggestion[] {
  const progressionMode = context.progressionMode ?? "auto";

  if (!chord) {
    return getFallbackSuggestionsForEmptyState(progressionMode);
  }

  const recentChords = context.recentChords ?? [];
  const schemaSuggestions = buildSchemaSuggestions(chord, mood, recentChords, progressionMode);
  const functionalSuggestions = getFunctionalSuggestions(chord, mood, recentChords);
  const bestByLabel = new Map<string, ChordSuggestion & { rank: number }>();

  [...schemaSuggestions, ...functionalSuggestions].forEach((suggestion) => {
    const existing = bestByLabel.get(suggestion.label);
    if (!existing || suggestion.rank > existing.rank) {
      bestByLabel.set(suggestion.label, suggestion);
    }
  });

  const scoredSuggestions = Array.from(bestByLabel.values());

  if (!scoredSuggestions.length) {
    const fallbackBase: ChordSuggestion[] = [
      {
        ...buildSuggestionFromDegree({ keyRoot: chord.root, mode: "major" }, "ii", "min7"),
        reason: `From a major ii-V-I built around ${noteName(chord.root)}`,
        category: "cadence",
        tensionLevel: inferTensionLevel("min7", "cadence")
      },
      {
        ...buildSuggestionFromDegree({ keyRoot: chord.root, mode: "major" }, "V", "7"),
        reason: `From a dominant setup around ${noteName(chord.root)}`,
        category: "cadence",
        tensionLevel: inferTensionLevel("7", "cadence")
      },
      {
        ...buildSuggestionFromDegree({ keyRoot: chord.root, mode: "minor" }, "iiø", "m7b5"),
        reason: `From a minor iiø-V-i around ${noteName(chord.root)}`,
        category: "cadence",
        tensionLevel: inferTensionLevel("m7b5", "cadence")
      },
      {
        ...buildSuggestionFromDegree({ keyRoot: chord.root, mode: "major" }, "vi", "min7"),
        reason: `From a turnaround around ${noteName(chord.root)}`,
        category: "turnaround",
        tensionLevel: inferTensionLevel("min7", "turnaround")
      }
    ];
    const fallback = fallbackBase.map((suggestion) => withDirection(suggestion, chord.root));

    return fallback;
  }

  scoredSuggestions.sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label));
  const upward = scoredSuggestions.filter((suggestion) => suggestion.direction === "up");
  const downward = scoredSuggestions.filter((suggestion) => suggestion.direction === "down");
  const ordered = [...upward.slice(0, 2), ...downward.slice(0, 2)];

  if (ordered.length < 4) {
    const remaining = scoredSuggestions.filter((suggestion) => !ordered.includes(suggestion));
    ordered.push(...remaining.slice(0, 4 - ordered.length));
  }

  return ordered.slice(0, 4).map(({ rank: _rank, ...suggestion }) => ({
    ...suggestion,
    id: `${suggestion.label}-${suggestion.keyName}-${suggestion.degreeLabel}-${suggestion.reason}-${suggestion.direction}`
  }));
}
