import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info, X } from "lucide-react";
import { PianoCard } from "./components/PianoCard";
import { SuggestionCard } from "./components/SuggestionCard";
import { useMidiInputs } from "./hooks";
import { getMagentaState, getMagentaSuggestions, initMagenta, MagentaState, subscribeMagentaState } from "./magenta";
import { analyzeChordNotes, ChordSuggestion, detectChord, DetectedChord, getDetectedChordDegreeLabel, getChordSuggestions, ProgressionMode, SuggestionMood } from "./music";

const NOTE_FADE_DURATION_MS = 900;
const GLOW_FADE_DURATION_MS = 1000;
const PULSE_DURATION_MS = 7500;
const PULSE_COOLDOWN_MS = 120;
const CHORD_GROUP_WINDOW_MS = 100;

interface ChordSnapshot {
  id: string;
  chordText: string;
  degreeLabel: string;
  notes: number[];
  suggestions: ChordSuggestion[];
}

type LayoutMode = "simple" | "advanced";

function normalizePitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}

function nearestMidiForPitchClass(pitchClass: number, around: number): number {
  const base = normalizePitchClass(around);
  const diff = (pitchClass - base + 12) % 12;
  const up = around + diff;
  const down = up - 12;
  return Math.abs(up - around) <= Math.abs(down - around) ? up : down;
}

function closeVoice(notes: number[], anchorNotes: number[]): number[] {
  if (!anchorNotes.length) {
    return notes;
  }

  const pitchClasses = Array.from(new Set(notes.map(normalizePitchClass)));
  const sortedAnchors = [...anchorNotes].sort((a, b) => a - b);
  const anchorWindow =
    sortedAnchors.length >= pitchClasses.length
      ? sortedAnchors.slice(0, pitchClasses.length)
      : [...sortedAnchors];
  const fallbackAnchor = Math.round(sortedAnchors.reduce((sum, note) => sum + note, 0) / sortedAnchors.length);
  const voiced = pitchClasses.map((pitchClass, index) => {
    const anchor = anchorWindow[index] ?? fallbackAnchor + index * 2;
    return nearestMidiForPitchClass(pitchClass, anchor);
  });

  voiced.sort((a, b) => a - b);

  for (let index = 1; index < voiced.length; index += 1) {
    while (voiced[index] <= voiced[index - 1] - 2) {
      voiced[index] += 12;
    }

    while (voiced[index] - voiced[index - 1] > 7) {
      voiced[index] -= 12;
    }
  }

  const bottomAnchor = sortedAnchors[0];
  return voiced
    .map((note) => {
      let adjusted = note;
      while (adjusted < bottomAnchor - 5) {
        adjusted += 12;
      }
      while (adjusted > bottomAnchor + 12) {
        adjusted -= 12;
      }
      return adjusted;
    })
    .sort((a, b) => a - b);
}

function App() {
  const { activeNotes, devices, midiSupported, selectedId, setSelectedId } = useMidiInputs();
  const [isPaused, setIsPaused] = useState(false);
  const [pausedNotes, setPausedNotes] = useState<number[]>([]);
  const [closeVoicings, setCloseVoicings] = useState(true);
  const [mood, setMood] = useState<SuggestionMood>("jazz");
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("auto");
  const [engine, setEngine] = useState<"linear" | "neural">("neural");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("simple");
  const [showInfo, setShowInfo] = useState(false);
  const [magentaState, setMagentaState] = useState<MagentaState>(() => getMagentaState());
  const [magentaWorking, setMagentaWorking] = useState(false);
  const [committedSuggestions, setCommittedSuggestions] = useState<ChordSuggestion[]>([]);
  const [committedChord, setCommittedChord] = useState<DetectedChord | null>(null);
  const [committedChordHistory, setCommittedChordHistory] = useState<DetectedChord[]>([]);
  const [chordSnapshots, setChordSnapshots] = useState<ChordSnapshot[]>([]);
  const [committedChordText, setCommittedChordText] = useState("");
  const [committedVoicingAnchor, setCommittedVoicingAnchor] = useState<number[]>([]);
  const [viewportNotes, setViewportNotes] = useState<number[]>([]);
  const [pulseToken, setPulseToken] = useState(0);
  const [releasedOverlayNoteTimes, setReleasedOverlayNoteTimes] = useState<Record<number, number>>({});
  const [animationNow, setAnimationNow] = useState(() => Date.now());
  const previousActiveNotesRef = useRef<number[]>([]);
  const lastPulseAtRef = useRef(0);
  const noteGroupStartedAtRef = useRef<number | null>(null);
  const noteGroupNotesRef = useRef<number[]>([]);
  const noteGroupTimerRef = useRef<number | null>(null);
  const committedChordHistoryRef = useRef<DetectedChord[]>([]);
  const committedVoicingAnchorRef = useRef<number[]>([]);
  const moodRef = useRef<SuggestionMood>(mood);
  const progressionModeRef = useRef<ProgressionMode>(progressionMode);
  const engineRef = useRef<"linear" | "neural">(engine);
  const effectiveActiveNotes = isPaused ? pausedNotes : activeNotes;

  const displayedCommittedSuggestions = useMemo(() => {
    const unique = committedSuggestions.filter((suggestion, index, all) => {
      return all.findIndex((entry) => entry.id === suggestion.id) === index;
    });

    return unique.slice(0, 4);
  }, [committedSuggestions]);
  const observationReleasedNotes = useMemo(
    () => Object.keys(releasedOverlayNoteTimes).map(Number).sort((a, b) => a - b),
    [releasedOverlayNoteTimes]
  );
  const observationOverlayNotes = useMemo(() => {
    const committedSet = new Set(committedVoicingAnchor);
    return effectiveActiveNotes.filter((note) => !committedSet.has(note)).sort((a, b) => a - b);
  }, [committedVoicingAnchor, effectiveActiveNotes]);
  const observationNotes = useMemo(() => {
    return Array.from(new Set([...committedVoicingAnchor, ...observationOverlayNotes])).sort((a, b) => a - b);
  }, [committedVoicingAnchor, observationOverlayNotes]);
  const observationNoteOpacities = useMemo(() => {
    const opacities: Record<number, number> = {};

    committedVoicingAnchor.forEach((note) => {
      opacities[note] = 1;
    });

    observationOverlayNotes.forEach((note) => {
      opacities[note] = 1;
    });

    observationReleasedNotes.forEach((note) => {
      const startedAt = releasedOverlayNoteTimes[note];
      if (startedAt === undefined) {
        return;
      }
      const opacity = Math.max(0, 1 - (animationNow - startedAt) / NOTE_FADE_DURATION_MS);
      if (opacity > 0) {
        opacities[note] = opacity;
      }
    });

    return opacities;
  }, [animationNow, committedVoicingAnchor, observationOverlayNotes, observationReleasedNotes, releasedOverlayNoteTimes]);
  const observationGlowNotes = useMemo(() => {
    const noteSet = new Set(observationOverlayNotes);
    observationReleasedNotes.forEach((note) => {
      noteSet.add(note);
    });
    return Array.from(noteSet).sort((a, b) => a - b);
  }, [observationOverlayNotes, observationReleasedNotes]);
  const observationGlowOpacities = useMemo(() => {
    const opacities: Record<number, number> = {};

    observationOverlayNotes.forEach((note) => {
      opacities[note] = 1;
    });

    Object.entries(releasedOverlayNoteTimes).forEach(([note, startedAt]) => {
      const numericNote = Number(note);
      const opacity = Math.max(0, 1 - (animationNow - startedAt) / GLOW_FADE_DURATION_MS);
      if (opacity > 0) {
        opacities[numericNote] = opacity;
      }
    });

    return opacities;
  }, [animationNow, observationOverlayNotes, releasedOverlayNoteTimes]);
  const displayedChordText = committedChordText;
  const displayedChordDegreeLabel = useMemo(() => getDetectedChordDegreeLabel(committedChord), [committedChord]);
  const displayedChordAnalysis = useMemo(
    () => analyzeChordNotes(committedChord, observationNotes.length ? observationNotes : committedVoicingAnchor),
    [committedChord, committedVoicingAnchor, observationNotes]
  );
  const recommitSuggestionHistory = useMemo(() => committedChordHistory.slice(1), [committedChordHistory]);
  const suggestionDisplaySet = useMemo(() => {
    if (!closeVoicings || !committedVoicingAnchor.length) {
      return displayedCommittedSuggestions;
    }

    return displayedCommittedSuggestions.map((suggestion) => ({
      ...suggestion,
      notes: closeVoice(suggestion.notes, committedVoicingAnchor),
      id: `${suggestion.id}-close`
    }));
  }, [closeVoicings, committedVoicingAnchor, displayedCommittedSuggestions]);
  const suggestionSlots = useMemo(() => {
    const upward = suggestionDisplaySet.filter((suggestion) => suggestion.direction === "up");
    const downward = suggestionDisplaySet.filter((suggestion) => suggestion.direction === "down");
    const remaining = suggestionDisplaySet.filter(
      (suggestion) => !upward.includes(suggestion) && !downward.includes(suggestion)
    );

    const top: (typeof suggestionDisplaySet)[number][] = [...upward];
    const bottom: (typeof suggestionDisplaySet)[number][] = [...downward];

    while (top.length < 2 && remaining.length) {
      const next = remaining.shift();
      if (next) {
        top.push(next);
      }
    }

    while (bottom.length < 2 && remaining.length) {
      const next = remaining.shift();
      if (next) {
        bottom.push(next);
      }
    }

    return {
      top: Array.from({ length: 2 }, (_, index) => top[index] ?? null),
      bottom: Array.from({ length: 2 }, (_, index) => bottom[index] ?? null)
    };
  }, [suggestionDisplaySet]);
  const verticalSuggestions = useMemo(
    () => [...suggestionSlots.top, ...suggestionSlots.bottom],
    [suggestionSlots.bottom, suggestionSlots.top]
  );
  const previousSnapshots = useMemo(() => chordSnapshots.slice(1, 4).reverse(), [chordSnapshots]);
  const previousSnapshot = useMemo(() => chordSnapshots[1] ?? null, [chordSnapshots]);
  const alignedPreviousSnapshots = useMemo(() => {
    const slots: Array<ChordSnapshot | null> = [null, null, null];
    previousSnapshots.forEach((snapshot, index) => {
      const targetIndex = 2 - (previousSnapshots.length - 1 - index);
      slots[targetIndex] = snapshot;
    });
    return slots;
  }, [previousSnapshots]);
  const simpleSuggestions = useMemo(() => verticalSuggestions.slice(0, 3), [verticalSuggestions]);
  const advancedSuggestions = useMemo(() => verticalSuggestions.slice(0, 3), [verticalSuggestions]);
  const menuControlClassName = "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink";
  const menuSelectClassName = "bg-transparent px-0 py-0 pr-6 text-sm text-ink outline-none";
  const menuLabelClassName = "opacity-50";

  useEffect(() => {
    committedChordHistoryRef.current = committedChordHistory;
  }, [committedChordHistory]);

  useEffect(() => {
    committedVoicingAnchorRef.current = committedVoicingAnchor;
  }, [committedVoicingAnchor]);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    progressionModeRef.current = progressionMode;
  }, [progressionMode]);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    initMagenta(); // neural is the default engine, so start loading immediately
    return subscribeMagentaState(setMagentaState);
  }, []);

  useEffect(() => {
    return () => {
      if (noteGroupTimerRef.current !== null) {
        window.clearTimeout(noteGroupTimerRef.current);
      }
    };
  }, []);

  function commitGroupedNotes(groupedNotes: number[]) {
    const pendingNotes = [...groupedNotes].sort((a, b) => a - b);
    setCommittedVoicingAnchor(pendingNotes);
    setReleasedOverlayNoteTimes((current) => {
      const next = { ...current };
      pendingNotes.forEach((note) => {
        delete next[note];
      });
      return next;
    });

    const pendingChord = detectChord(pendingNotes);
    if (!pendingChord) {
      setCommittedChord(null);
      setCommittedSuggestions([]);
      setCommittedChordText("");
      return;
    }

    const pendingChordText = [pendingChord.name, ...pendingChord.aliases].join(" or ");
    const pendingChordDegreeLabel = getDetectedChordDegreeLabel(pendingChord);
    const nextSuggestions = engineRef.current === "neural"
      ? []
      : getChordSuggestions(pendingChord, moodRef.current, {
        recentChords: committedChordHistoryRef.current,
        progressionMode: progressionModeRef.current
      })
        .filter((suggestion, index, all) => all.findIndex((entry) => entry.id === suggestion.id) === index)
        .slice(0, 4);

    setCommittedChord(pendingChord);
    setCommittedSuggestions(nextSuggestions);
    setCommittedChordText(pendingChordText);
    setCommittedChordHistory((current) => [pendingChord, ...current].slice(0, 4));
    setChordSnapshots((current) => {
      const snapshot: ChordSnapshot = {
        id: `${Date.now()}-${pendingChord.name}-${pendingNotes.join("-")}`,
        chordText: pendingChordText,
        degreeLabel: pendingChordDegreeLabel,
        notes: pendingNotes,
        suggestions: nextSuggestions
      };
      return [snapshot, ...current].slice(0, 4);
    });
  }

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const previousNotes = previousActiveNotesRef.current;

    setViewportNotes((current) => {
      if (!current.length || !previousNotes.length) {
        return effectiveActiveNotes;
      }

      const minCurrent = Math.min(...current);
      const maxCurrent = Math.max(...current);
      const minNext = Math.min(...effectiveActiveNotes);
      const maxNext = Math.max(...effectiveActiveNotes);

      if (minNext < minCurrent || maxNext > maxCurrent) {
        return effectiveActiveNotes;
      }

      return current;
    });

    const previousSet = new Set(previousNotes);
    const newNotes = effectiveActiveNotes.filter((note) => !previousSet.has(note));
    const releasedNotes = previousNotes.filter((note) => !effectiveActiveNotes.includes(note));
    const now = Date.now();

    if (newNotes.length || releasedNotes.length) {
      setReleasedOverlayNoteTimes((current) => {
        const next = { ...current };
        newNotes.forEach((note) => {
          delete next[note];
        });
        const releasedAtNow = Date.now();
        const committedSet = new Set(committedVoicingAnchorRef.current);
        releasedNotes.forEach((note) => {
          if (!committedSet.has(note)) {
            next[note] = releasedAtNow;
          }
        });
        return next;
      });
    }

    if (newNotes.length) {
      const shouldStartNewGroup =
        noteGroupStartedAtRef.current === null ||
        now - noteGroupStartedAtRef.current > CHORD_GROUP_WINDOW_MS;

      if (shouldStartNewGroup) {
        noteGroupStartedAtRef.current = now;
        noteGroupNotesRef.current = [...effectiveActiveNotes].sort((a, b) => a - b);
      } else {
        noteGroupNotesRef.current = Array.from(new Set([...noteGroupNotesRef.current, ...effectiveActiveNotes])).sort(
          (a, b) => a - b
        );
      }

      if (noteGroupTimerRef.current !== null) {
        window.clearTimeout(noteGroupTimerRef.current);
      }

      const groupStartedAt = noteGroupStartedAtRef.current;
      const remainingMs = groupStartedAt === null ? CHORD_GROUP_WINDOW_MS : Math.max(0, CHORD_GROUP_WINDOW_MS - (now - groupStartedAt));
      noteGroupTimerRef.current = window.setTimeout(() => {
        const groupedNotes = [...noteGroupNotesRef.current];
        noteGroupTimerRef.current = null;
        noteGroupStartedAtRef.current = null;
        noteGroupNotesRef.current = [];

        if (groupedNotes.length >= 3) {
          commitGroupedNotes(groupedNotes);
        }
      }, remainingMs);

      if (now - lastPulseAtRef.current >= PULSE_COOLDOWN_MS) {
        lastPulseAtRef.current = now;
        setPulseToken((current) => current + 1);
      }
    }

    previousActiveNotesRef.current = effectiveActiveNotes;
  }, [effectiveActiveNotes, isPaused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isEditable) {
        return;
      }

      event.preventDefault();
      setIsPaused((current) => {
        const next = !current;
        if (!current) {
          setPausedNotes(activeNotes);
          if (noteGroupTimerRef.current !== null) {
            window.clearTimeout(noteGroupTimerRef.current);
            noteGroupTimerRef.current = null;
          }
          noteGroupStartedAtRef.current = null;
          noteGroupNotesRef.current = [];
        } else {
          previousActiveNotesRef.current = activeNotes;
          setReleasedOverlayNoteTimes({});
        }
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeNotes]);

  useEffect(() => {
    if (engine === "neural") return; // Magenta effect handles suggestions in dynamic mode
    if (!committedChord) {
      setCommittedSuggestions([]);
      return;
    }

    setCommittedSuggestions(
      getChordSuggestions(committedChord, mood, {
        recentChords: recommitSuggestionHistory,
        progressionMode
      })
    );
  }, [committedChord, mood, progressionMode, recommitSuggestionHistory, engine]);

  useEffect(() => {
    if (engine !== "neural" || magentaState !== "ready" || !committedChord) return;

    let cancelled = false;
    setMagentaWorking(true);

    getMagentaSuggestions(committedChord, committedVoicingAnchor)
      .then((results) => {
        if (cancelled) return;
        if (results.length === 0) return;
        setCommittedSuggestions(results);
        // Keep the snapshot in sync so history shows the AI suggestions, not the
        // rule-based ones written at commit time.
        setChordSnapshots((current) => {
          if (!current.length) return current;
          const [latest, ...rest] = current;
          return [{ ...latest, suggestions: results }, ...rest];
        });
      })
      .catch(() => {
        // silent — keep existing suggestions as fallback
      })
      .finally(() => {
        if (!cancelled) setMagentaWorking(false);
      });

    return () => {
      cancelled = true;
      setMagentaWorking(false);
    };
  }, [committedChord, committedVoicingAnchor, engine, magentaState]);

  useEffect(() => {
    if (!Object.keys(releasedOverlayNoteTimes).length) {
      return;
    }

    const interval = window.setInterval(() => {
      const now = Date.now();
      setAnimationNow(now);
      setReleasedOverlayNoteTimes((current) => {
        const nextEntries = Object.entries(current).filter(
          ([, startedAt]) => now - startedAt < Math.max(NOTE_FADE_DURATION_MS, GLOW_FADE_DURATION_MS)
        );
        if (nextEntries.length === Object.keys(current).length) {
          return current;
        }
        return Object.fromEntries(nextEntries);
      });
    }, 80);

    return () => window.clearInterval(interval);
  }, [releasedOverlayNoteTimes]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-base px-5 py-5 text-ink">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {pulseToken > 0 ? (
          <span
            key={pulseToken}
            className="absolute left-1/2 top-1/2 block h-[24vmax] w-[24vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(57,255,20,0.12) 0%, rgba(57,255,20,0.07) 18%, rgba(57,255,20,0.025) 36%, rgba(57,255,20,0.0) 62%)",
              filter: "blur(28px)",
              animation: `screenPulse ${PULSE_DURATION_MS}ms cubic-bezier(0.08, 0.82, 0.17, 1) forwards`
            }}
          />
        ) : null}
      </div>
      <div className="relative z-10 flex min-h-[calc(100vh-2.5rem)] w-full flex-col">
        <div className="flex w-full items-center gap-3">
          <div className="relative">
            <select
              className="appearance-none rounded-md bg-panel px-3 py-2 pr-10 text-sm text-ink outline-none"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={!devices.length}
            >
              {devices.length ? (
                devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} · {device.manufacturer}
                  </option>
                ))
              ) : (
                <option value="">{midiSupported ? "Connect a MIDI device" : "Web MIDI not available"}</option>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink/70" />
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs text-muted">
            <span>{isPaused ? "▶" : "⏸"}</span>
            <span>[space]</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {engine === "linear" && (
              <>
                <label className={menuControlClassName}>
                  <span className={menuLabelClassName}>progression</span>
                  <select
                    value={progressionMode}
                    onChange={(event) => setProgressionMode(event.target.value as ProgressionMode)}
                    className={menuSelectClassName}
                  >
                    <option value="auto">auto</option>
                    <option value="major_ii_v_i">ii-V-I major</option>
                    <option value="minor_ii_v_i">iiø-V-i minor</option>
                    <option value="turnaround">turnaround</option>
                    <option value="backdoor">backdoor</option>
                    <option value="backcycling">backcycling</option>
                  </select>
                </label>

                <label className={menuControlClassName}>
                  <span className={menuLabelClassName}>mood</span>
                  <select
                    value={mood}
                    onChange={(event) => setMood(event.target.value as SuggestionMood)}
                    className={menuSelectClassName}
                  >
                    <option value="jazz">jazz</option>
                    <option value="pop">pop</option>
                    <option value="blues">blues</option>
                    <option value="gospel">gospel</option>
                  </select>
                </label>
              </>
            )}

            <label className={menuControlClassName}>
              <input
                type="checkbox"
                checked={closeVoicings}
                onChange={(event) => setCloseVoicings(event.target.checked)}
                className="h-4 w-4 accent-[#39ff14]"
              />
              close voicings
            </label>

            <label className={menuControlClassName}>
              <span className={menuLabelClassName}>engine</span>
              <select
                value={engine}
                onChange={(event) => {
                  const next = event.target.value as "linear" | "neural";
                  setEngine(next);
                  if (next === "neural") initMagenta();
                }}
                className={menuSelectClassName}
              >
                <option value="linear">linear</option>
                <option value="neural">neural</option>
              </select>
              {engine === "neural" && magentaState === "loading" && (
                <span className="animate-pulse text-xs text-warning">loading…</span>
              )}
              {engine === "neural" && magentaState === "error" && (
                <span className="text-xs text-muted/60">unavailable</span>
              )}
            </label>

            <label className={menuControlClassName}>
              <span className={menuLabelClassName}>layout</span>
              <select
                value={layoutMode}
                onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
                className={menuSelectClassName}
              >
                <option value="simple">simple</option>
                <option value="advanced">advanced</option>
              </select>
            </label>

            <button
              onClick={() => setShowInfo(true)}
              className="rounded-md p-2 text-muted transition-colors hover:text-ink"
              aria-label="About ChordFlow"
            >
              <Info className="size-4" />
            </button>
          </div>
        </div>

        <div className={`flex flex-1 justify-center ${layoutMode === "simple" ? "items-center" : "items-start"}`}>
          {layoutMode === "simple" ? (
            <div className="grid w-full max-w-[1600px] grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.95fr)]">
              <div className="flex min-w-0 flex-col justify-center py-4">
                <PianoCard
                  opacity={previousSnapshot ? 0.42 : 0.12}
                  topLabel={engine === "linear" ? (previousSnapshot?.degreeLabel ?? " ") : "previous"}
                  topLabelVisible={engine === "linear" ? !!previousSnapshot?.degreeLabel : !!previousSnapshot}
                  noteSet={previousSnapshot?.notes ?? []}
                  dimInactive={false}
                  title={previousSnapshot?.chordText ?? "placeholder"}
                  titleVisible={!!previousSnapshot}
                />
              </div>

              <div className="flex min-w-0 flex-col justify-center py-4">
                <PianoCard
                  opacity={1}
                  topLabel={engine === "linear" ? (displayedChordDegreeLabel || " ") : "current"}
                  topLabelVisible={engine === "linear" ? !!displayedChordDegreeLabel : !!displayedChordText}
                  activeNotes={observationNotes}
                  noteOpacities={observationNoteOpacities}
                  glowNotes={observationGlowNotes}
                  glowOpacities={observationGlowOpacities}
                  activeOpacity={1}
                  faded={false}
                  centerViewport
                  noteRoles={displayedChordAnalysis.noteRoles}
                  viewportNotes={observationNotes.length ? observationNotes : viewportNotes}
                  title={displayedChordText || "placeholder"}
                  titleVisible={!!displayedChordText}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-2 py-4">
                {Array.from({ length: 3 }, (_, index) => simpleSuggestions[index] ?? null).map((suggestion, index) => (
                  <SuggestionCard
                    key={suggestion?.id ?? `simple-${index}`}
                    suggestion={suggestion}
                    opacity={1}
                    isLoading={engine === "neural" && magentaWorking}
                    dimInactive
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid w-full grid-cols-4 items-start gap-5 pb-8">
              <section className="contents">
                {alignedPreviousSnapshots.map((snapshot, index) => (
                  <div
                    key={`history-slot-${index}`}
                    className="flex min-w-0 flex-col gap-4 py-4"
                  >
                    <PianoCard
                      opacity={snapshot ? [0.25, 0.5, 0.75][index] : 0.12}
                      animateOpacity={false}
                      topLabel=" "
                      topLabelVisible={false}
                      noteSet={snapshot?.notes ?? []}
                      dimInactive
                      title={snapshot?.chordText ?? "placeholder"}
                      titleVisible={!!snapshot}
                    />

                    <div className="flex flex-col gap-2">
                      {Array.from({ length: 3 }, (_, suggestionIndex) => snapshot?.suggestions[suggestionIndex] ?? null).map(
                        (suggestion, suggestionIndex) => (
                          <SuggestionCard
                            key={suggestion?.id ?? `snapshot-${index}-suggestion-${suggestionIndex}`}
                            suggestion={suggestion}
                            opacity={snapshot ? [0.25, 0.5, 0.75][index] : 0.12}
                            hideReason
                            animateOpacity={false}
                            dimInactive
                          />
                        )
                      )}
                    </div>
                  </div>
                ))}
              </section>

              <div className="flex min-w-0 flex-col gap-4 py-4">
                <div className="flex flex-col gap-4">
                  <PianoCard
                    opacity={1}
                    topLabel=" "
                    topLabelVisible={false}
                    activeNotes={observationNotes}
                    noteOpacities={observationNoteOpacities}
                    glowNotes={observationGlowNotes}
                    glowOpacities={observationGlowOpacities}
                    activeOpacity={1}
                    faded={false}
                    centerViewport
                    noteRoles={displayedChordAnalysis.noteRoles}
                    viewportNotes={observationNotes.length ? observationNotes : viewportNotes}
                    title={displayedChordText || "placeholder"}
                    titleVisible={!!displayedChordText}
                  />

                  <div className="flex flex-col gap-2">
                    {advancedSuggestions.map((suggestion, index) => (
                      <SuggestionCard
                        key={suggestion?.id ?? `vertical-${index}`}
                        suggestion={suggestion}
                        opacity={1}
                        isLoading={engine === "neural" && magentaWorking}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="relative mx-5 w-full max-w-md rounded-[24px] bg-panel px-8 py-8 text-ink shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInfo(false)}
              className="absolute right-5 top-5 rounded-md p-1 text-muted transition-colors hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <h2 className="font-body text-xl font-semibold text-ink">ChordFlow</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Connect a MIDI keyboard. Play a chord. ChordFlow detects it and suggests what to play next.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The <span className="text-ink">linear</span> engine uses hand-written jazz harmony rules — cadences, borrowed chords, voice leading. The <span className="text-ink">neural</span> engine uses{" "}
              <a
                href="https://magenta.tensorflow.org/js"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                Magenta.js
              </a>
              , a neural network from Google that runs entirely in the browser. It generates melodic continuations from your input and analyses the pitch content to propose chords.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              No backend. No account. Audio never leaves your device.
            </p>

            <p className="mt-3 text-sm leading-relaxed text-muted">
              Code 99% generated with Claude Code.
            </p>
            <div className="mt-6 flex items-center gap-4 border-t border-white/10 pt-5">
              <a
                href="https://github.com/itymarcel/chordflow"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted underline underline-offset-2 hover:text-ink"
              >
                GitHub
              </a>
              <a
                href="https://magenta.tensorflow.org/js"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted underline underline-offset-2 hover:text-ink"
              >
                Magenta.js
              </a>
              <a
                href="https://www.hypersuper.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-sm text-muted underline underline-offset-2 hover:text-ink"
              >
                © hypersuper
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
