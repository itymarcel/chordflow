# ChordFlow

Interactive MIDI chord detector and jazz-harmony chord suggester. Plays in the browser, no backend.

## Stack

- React 18 + TypeScript (Create React App via Craco)
- Tailwind CSS (dark neon theme, Space Grotesk / IBM Plex Sans fonts)
- Web MIDI API for real-time keyboard/controller input
- Zero external music-theory libraries — all logic is hand-rolled

## Key files

| File | Role |
|---|---|
| `src/music.ts` | Core engine (~1 133 lines): chord detection, suggestion ranking, voice leading |
| `src/App.tsx` | State orchestrator, MIDI event wiring, UI layout |
| `src/hooks.ts` | `useMidiInputs` — wraps Web MIDI API |
| `src/components/PianoKeyboard.tsx` | Animated visual keyboard |
| `src/components/SuggestionCard.tsx` | Single chord suggestion tile |

## How the engine works

**Detection** — `detectChord` scores every (root, quality) pair against 23 chord patterns using required/optional/avoided intervals. Top match wins; next two become aliases.

**Suggestions** — two parallel pipelines, merged and de-duped into 4 cards (2 directionally up, 2 down):
1. **Schema-based** (`buildSchemaSuggestions`): matches current chord to 5 hard-coded progression schemas (ii-V-I, turnarounds, backdoor, backcycling, etc.) and returns the next step.
2. **Functional harmonic** (`getFunctionalSuggestions`): 32 predefined moves (cadences, modulations, borrowed chords…) each with a base weight, mood applicability vector, and category. Ranked by move weight + mood bias + semitone-distance penalty + history context.

**Voice leading** — `closeVoice` nudges suggestion notes to the nearest octave relative to the last played notes.

**History** — last 4 chords influence ranking; penalises repetition, rewards consistent root-motion direction (e.g. circle-of-fifths runs).

## Data model highlights

```ts
DetectedChord   { root, bass, quality, name, aliases, pitchClasses, confidence }
ChordSuggestion { label, degreeLabel, reason, notes, direction, category, tensionLevel }
SuggestionMood  = "jazz" | "pop" | "blues" | "gospel"
ProgressionMode = "auto" | "major_ii_v_i" | "minor_ii_v_i" | "turnaround" | "backdoor" | "backcycling"
```

## Commands

```bash
npm start      # dev server (browser auto-open suppressed via .env BROWSER=none)
npm run build  # production build → /build
```

## Things to know

- All music theory is self-contained in `music.ts`; don't reach for external libraries.
- The 32 functional moves and 5 schemas are the main levers for tuning suggestion quality — edit those arrays before touching ranking weights.
- Web MIDI requires a secure context (localhost or HTTPS) and a browser that supports it (Chrome/Edge).
- `craco.config.js` only sets PostCSS; no webpack customisation beyond what CRA provides.
