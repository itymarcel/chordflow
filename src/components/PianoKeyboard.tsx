import { NoteRole, noteName } from "../music";

interface PianoKeyboardProps {
  activeNotes: number[];
  glowNotes?: number[];
  glowOpacities?: Record<number, number>;
  className?: string;
  faded?: boolean;
  miniature?: boolean;
  compactPadding?: boolean;
  noteSet?: number[];
  activeOpacity?: number;
  centerViewport?: boolean;
  viewportNotes?: number[];
  noteOpacities?: Record<number, number>;
  noteRoles?: Record<number, NoteRole>;
  noteHands?: Record<number, "left" | "right">;
  dimInactive?: boolean;
}

interface KeyDescriptor {
  midi: number;
  pitchClass: number;
  x: number;
}

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const FULL_RANGE = { start: 21, end: 108 };
const MAIN_OCTAVE_SPAN = 3;
const MINI_OCTAVE_SPAN = 2;

function normalizePitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}

function buildKeys(start: number, end: number, whiteWidth: number, blackWidth: number, keyGap: number) {
  const whiteKeys: KeyDescriptor[] = [];
  const blackKeys: KeyDescriptor[] = [];
  let whiteX = 0;

  for (let midi = start; midi <= end; midi += 1) {
    const pitchClass = normalizePitchClass(midi);
    const isBlack = !WHITE_PITCH_CLASSES.has(pitchClass);

    if (isBlack) {
      blackKeys.push({
        midi,
        pitchClass,
        x: whiteX - blackWidth / 2 - keyGap / 2
      });
      continue;
    }

    whiteKeys.push({
      midi,
      pitchClass,
      x: whiteX
    });
    whiteX += whiteWidth + keyGap;
  }

  return {
    whiteKeys,
    blackKeys,
    width: whiteKeys.length ? whiteX - keyGap : 0
  };
}

function resolveRange(miniature: boolean, focusNotes: number[], centerViewport: boolean) {
  if (miniature) {
    if (!focusNotes.length) {
      return { start: 60, end: 83 };
    }

    const sorted = [...focusNotes].sort((a, b) => a - b);
    const minNote = sorted[0];
    const maxNote = sorted[sorted.length - 1];
    const spanSize = MINI_OCTAVE_SPAN * 12;
    let start = Math.floor(minNote / 12) * 12;
    let end = start + spanSize - 1;

    while (end < maxNote && end < FULL_RANGE.end) {
      start += 12;
      end += 12;
    }

    if (start < FULL_RANGE.start) {
      start = FULL_RANGE.start;
      end = start + spanSize - 1;
    }

    if (end > FULL_RANGE.end) {
      end = FULL_RANGE.end;
      start = end - (spanSize - 1);
    }

    return { start, end };
  }

  if (!centerViewport || !focusNotes.length) {
    return { start: 48, end: 83 };
  }

  const sorted = [...focusNotes].sort((a, b) => a - b);
  const average = sorted.reduce((sum, note) => sum + note, 0) / sorted.length;
  const centeredOctaveC = Math.floor(average / 12) * 12;
  let start = centeredOctaveC - 12;
  let end = start + MAIN_OCTAVE_SPAN * 12 - 1;

  if (start < FULL_RANGE.start) {
    start = FULL_RANGE.start;
    end = start + MAIN_OCTAVE_SPAN * 12 - 1;
  }

  if (end > FULL_RANGE.end) {
    end = FULL_RANGE.end;
    start = end - (MAIN_OCTAVE_SPAN * 12 - 1);
  }

  return { start, end };
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const value = Number.parseInt(cleaned, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function blendColor(baseHex: string, targetHex: string, amount: number): string {
  const [baseR, baseG, baseB] = hexToRgb(baseHex);
  const [targetR, targetG, targetB] = hexToRgb(targetHex);
  const clamp = Math.max(0, Math.min(1, amount));
  const r = Math.round(baseR + (targetR - baseR) * clamp);
  const g = Math.round(baseG + (targetG - baseG) * clamp);
  const b = Math.round(baseB + (targetB - baseB) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
}

function roleColor(isBlack: boolean, role: NoteRole | undefined, active: boolean): string {
  if (role === "tension") {
    return active ? "#7dff63" : "#71d8ff";
  }

  if (role === "outside") {
    return active ? "#d6ff72" : "#c5ae71";
  }

  if (role === "bass") {
    return active ? "#39ff14" : "#52ff4a";
  }

  return active ? "#39ff14" : isBlack ? "#7dff63" : "#7dff63";
}

function handColor(isBlack: boolean, hand: "left" | "right" | undefined, active: boolean): string {
  if (hand === "left") {
    return active ? "#39ff14" : "#58f76a";
  }

  if (hand === "right") {
    return active ? "#52d6ff" : "#73dfff";
  }

  return active ? "#39ff14" : isBlack ? "#7dff63" : "#7dff63";
}

export function PianoKeyboard({
  activeNotes,
  glowNotes = [],
  glowOpacities = {},
  className = "",
  faded = false,
  miniature = false,
  compactPadding = false,
  noteSet,
  activeOpacity = 1,
  centerViewport = false,
  viewportNotes,
  noteOpacities = {},
  noteRoles = {},
  noteHands = {},
  dimInactive = false
}: PianoKeyboardProps) {
  const focusNotes = viewportNotes ?? (activeNotes.length ? activeNotes : noteSet ?? []);
  const range = resolveRange(miniature, focusNotes, centerViewport);
  const whiteWidth = miniature ? 18 : 34;
  const whiteHeight = miniature ? 78 : 180;
  const blackWidth = miniature ? 11 : 22;
  const blackHeight = miniature ? 48 : 108;
  const keyGap = 2;
  const { whiteKeys, blackKeys, width } = buildKeys(range.start, range.end, whiteWidth, blackWidth, keyGap);
  const activeNoteSet = new Set(activeNotes);
  const glowNoteSet = new Set(glowNotes);
  const suggestedNoteSet = new Set(noteSet ?? []);
  const whiteBase = "#d6e1e8";
  const blackBase = "#243543";
  const labelClassName = miniature ? "text-[9px]" : "text-[11px]";
  const labelLaneHeight = miniature ? 12 : 18;

  return (
    <div
      className={`relative overflow-visible ${compactPadding ? "px-0 pb-2 pt-1" : "px-2 pb-3 pt-4"} ${className}`}
      style={{ opacity: faded ? 0.55 : 1 }}
    >
      <div className="relative mx-auto" style={{ width, height: whiteHeight + labelLaneHeight }}>
        {whiteKeys.map((key) => {
          const active = activeNoteSet.has(key.midi);
          const suggested = suggestedNoteSet.has(key.midi);
          const highlightOpacity = active ? noteOpacities[key.midi] ?? activeOpacity : 1;
          const showLabel = active || suggested;

          if (!showLabel) {
            return null;
          }

          return (
            <span
              key={`white-label-${key.midi}`}
              className={`absolute font-body font-bold ${labelClassName}`}
              style={{
                left: key.x + whiteWidth / 2,
                top: 0,
                transform: "translateX(-50%)",
                color: "#ffffff",
                opacity: active ? highlightOpacity : 1,
                zIndex: 3
              }}
            >
              {noteName(key.pitchClass)}
            </span>
          );
        })}

        {blackKeys.map((key) => {
          const active = activeNoteSet.has(key.midi);
          const suggested = suggestedNoteSet.has(key.midi);
          const highlightOpacity = active ? noteOpacities[key.midi] ?? activeOpacity : 1;
          const showLabel = active || suggested;

          if (!showLabel) {
            return null;
          }

          return (
            <span
              key={`black-label-${key.midi}`}
              className={`absolute font-body font-bold ${labelClassName}`}
              style={{
                left: key.x + blackWidth / 2,
                top: 0,
                transform: "translateX(-50%)",
                color: "#ffffff",
                opacity: active ? highlightOpacity : 1,
                zIndex: 4
              }}
            >
              {noteName(key.pitchClass)}
            </span>
          );
        })}

        <div className="absolute left-0 top-0" style={{ width, height: whiteHeight, transform: `translateY(${labelLaneHeight}px)` }}>
          {whiteKeys.map((key) => {
            const active = activeNoteSet.has(key.midi);
            const glowing = glowNoteSet.has(key.midi);
            const glowOpacity = glowOpacities[key.midi] ?? (glowing ? 1 : 0);
            const suggested = suggestedNoteSet.has(key.midi);
            const highlightOpacity = active ? noteOpacities[key.midi] ?? activeOpacity : 1;
            const role = noteRoles[key.midi];
            const hand = noteHands[key.midi];
            const targetColor = suggested && hand ? handColor(false, hand, false) : roleColor(false, role, active);
            const activeColor = hand ? handColor(false, hand, true) : roleColor(false, role, true);
            const color = active
              ? blendColor(whiteBase, activeColor, highlightOpacity)
              : suggested
                ? targetColor
                : whiteBase;

            return (
              <div
                key={`white-${key.midi}`}
                className="absolute rounded-b-xl transition-colors duration-150"
                style={{
                  left: key.x,
                  width: whiteWidth,
                  height: whiteHeight,
                  background: color,
                  boxShadow: glowing
                    ? `0 0 ${42 * glowOpacity}px rgba(57,255,20,${0.45 * glowOpacity}), 0 0 ${24 * glowOpacity}px ${activeColor}, 0 0 ${10 * glowOpacity}px ${activeColor}, inset 0 0 ${14 * glowOpacity}px ${activeColor}`
                    : undefined,
                  opacity: dimInactive && !active && !suggested ? 0.4 : 1,
                  zIndex: glowing ? 3 : 1
                }}
                title={noteName(key.pitchClass)}
              />
            );
          })}

          {blackKeys.map((key) => {
            const active = activeNoteSet.has(key.midi);
            const glowing = glowNoteSet.has(key.midi);
            const glowOpacity = glowOpacities[key.midi] ?? (glowing ? 1 : 0);
            const suggested = suggestedNoteSet.has(key.midi);
            const highlightOpacity = active ? noteOpacities[key.midi] ?? activeOpacity : 1;
            const role = noteRoles[key.midi];
            const hand = noteHands[key.midi];
            const targetColor = suggested && hand ? handColor(true, hand, false) : roleColor(true, role, active);
            const activeColor = hand ? handColor(true, hand, true) : roleColor(true, role, true);
            const color = active
              ? blendColor(blackBase, activeColor, highlightOpacity)
              : suggested
                ? targetColor
                : blackBase;

            return (
              <div
                key={`black-${key.midi}`}
                className="absolute rounded-b-lg transition-colors duration-150"
                style={{
                  left: key.x,
                  width: blackWidth,
                  height: blackHeight,
                  background: color,
                  boxShadow: glowing
                    ? `0 0 ${30 * glowOpacity}px rgba(57,255,20,${0.38 * glowOpacity}), 0 0 ${16 * glowOpacity}px ${activeColor}, 0 0 ${8 * glowOpacity}px ${activeColor}, inset 0 0 ${10 * glowOpacity}px ${activeColor}`
                    : undefined,
                  zIndex: glowing ? 4 : 2
                }}
                title={noteName(key.pitchClass)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
