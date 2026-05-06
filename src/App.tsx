import { useEffect, useMemo, useRef, useState } from "react";
import { PianoKeyboard } from "./components/PianoKeyboard";
import { SuggestionCard } from "./components/SuggestionCard";
import { useMidiInputs } from "./hooks";
import { analyzeChordNotes, ChordSuggestion, detectChord, DetectedChord, getChordSuggestions, ProgressionMode, SuggestionMood } from "./music";

const CHORD_FADE_DURATION_MS = 5000;
const NOTE_FADE_DURATION_MS = 900;
const PULSE_DURATION_MS = 7500;
const PULSE_COOLDOWN_MS = 120;
const CHORD_CAPTURE_DELAY_MS = 50;

interface ChordSnapshot {
  id: string;
  chordText: string;
  notes: number[];
  suggestions: ChordSuggestion[];
}

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
  const [closeVoicings, setCloseVoicings] = useState(false);
  const [mood, setMood] = useState<SuggestionMood>("jazz");
  const [progressionMode, setProgressionMode] = useState<ProgressionMode>("auto");
  const [releasedAt, setReleasedAt] = useState<number | null>(null);
  const [fadeOpacity, setFadeOpacity] = useState(1);
  const [committedSuggestions, setCommittedSuggestions] = useState<ChordSuggestion[]>([]);
  const [committedChord, setCommittedChord] = useState<DetectedChord | null>(null);
  const [committedChordHistory, setCommittedChordHistory] = useState<DetectedChord[]>([]);
  const [chordSnapshots, setChordSnapshots] = useState<ChordSnapshot[]>([]);
  const [committedChordText, setCommittedChordText] = useState("");
  const [committedVoicingAnchor, setCommittedVoicingAnchor] = useState<number[]>([]);
  const [viewportNotes, setViewportNotes] = useState<number[]>([]);
  const [pulseToken, setPulseToken] = useState(0);
  const [releasedNoteTimes, setReleasedNoteTimes] = useState<Record<number, number>>({});
  const [animationNow, setAnimationNow] = useState(() => Date.now());
  const previousActiveNotesRef = useRef<number[]>([]);
  const lastPulseAtRef = useRef(0);
  const commitTimerRef = useRef<number | null>(null);
  const pendingCommitNotesRef = useRef<number[]>([]);
  const committedChordHistoryRef = useRef<DetectedChord[]>([]);
  const moodRef = useRef<SuggestionMood>(mood);
  const progressionModeRef = useRef<ProgressionMode>(progressionMode);
  const effectiveActiveNotes = isPaused ? pausedNotes : activeNotes;

  const displayedCommittedSuggestions = useMemo(() => {
    const unique = committedSuggestions.filter((suggestion, index, all) => {
      return all.findIndex((entry) => entry.id === suggestion.id) === index;
    });

    return unique.slice(0, 4);
  }, [committedSuggestions]);
  const displayedNotes = useMemo(() => {
    const noteSet = new Set(effectiveActiveNotes);
    Object.keys(releasedNoteTimes).forEach((note) => noteSet.add(Number(note)));
    return Array.from(noteSet).sort((a, b) => a - b);
  }, [effectiveActiveNotes, releasedNoteTimes]);
  const displayedNoteOpacities = useMemo(() => {
    const opacities: Record<number, number> = {};

    effectiveActiveNotes.forEach((note) => {
      opacities[note] = 1;
    });

    Object.entries(releasedNoteTimes).forEach(([note, startedAt]) => {
      const opacity = Math.max(0, 1 - (animationNow - startedAt) / NOTE_FADE_DURATION_MS);
      if (opacity > 0) {
        opacities[Number(note)] = opacity;
      }
    });

    return opacities;
  }, [effectiveActiveNotes, animationNow, releasedNoteTimes]);
  const displayedChordText = committedChordText;
  const displayedChordAnalysis = useMemo(
    () => analyzeChordNotes(committedChord, displayedNotes.length ? displayedNotes : committedVoicingAnchor),
    [committedChord, committedVoicingAnchor, displayedNotes]
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
  const alignedPreviousSnapshots = useMemo(() => {
    const slots: Array<ChordSnapshot | null> = [null, null, null];
    previousSnapshots.forEach((snapshot, index) => {
      const targetIndex = 2 - (previousSnapshots.length - 1 - index);
      slots[targetIndex] = snapshot;
    });
    return slots;
  }, [previousSnapshots]);

  useEffect(() => {
    committedChordHistoryRef.current = committedChordHistory;
  }, [committedChordHistory]);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    progressionModeRef.current = progressionMode;
  }, [progressionMode]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const previousNotes = previousActiveNotesRef.current;

    if (!effectiveActiveNotes.length) {
      if (previousNotes.length) {
        const releasedAtNow = Date.now();
        setReleasedNoteTimes((current) => {
          const next = { ...current };
          previousNotes.forEach((note) => {
            next[note] = releasedAtNow;
          });
          return next;
        });
        setReleasedAt(Date.now());
      }
      previousActiveNotesRef.current = [];
      return;
    }

    setReleasedAt(null);
    setFadeOpacity(1);

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

    if (newNotes.length || releasedNotes.length) {
      setReleasedNoteTimes((current) => {
        const next = { ...current };
        newNotes.forEach((note) => {
          delete next[note];
        });
        const releasedAtNow = Date.now();
        releasedNotes.forEach((note) => {
          next[note] = releasedAtNow;
        });
        return next;
      });
    }

    if (newNotes.length) {
      pendingCommitNotesRef.current = Array.from(
        new Set([...pendingCommitNotesRef.current, ...effectiveActiveNotes])
      ).sort((a, b) => a - b);

      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
      }

      commitTimerRef.current = window.setTimeout(() => {
        const pendingNotes = [...pendingCommitNotesRef.current].sort((a, b) => a - b);
        pendingCommitNotesRef.current = [];
        commitTimerRef.current = null;

        const pendingChord = detectChord(pendingNotes);
        if (!pendingChord) {
          return;
        }

        const pendingChordText = [pendingChord.name, ...pendingChord.aliases].join(" or ");
        const nextSuggestions = getChordSuggestions(pendingChord, moodRef.current, {
          recentChords: committedChordHistoryRef.current,
          progressionMode: progressionModeRef.current
        })
          .filter((suggestion, index, all) => all.findIndex((entry) => entry.id === suggestion.id) === index)
          .slice(0, 4);

        setCommittedChord(pendingChord);
        setCommittedSuggestions(nextSuggestions);
        setCommittedChordText(pendingChordText);
        setCommittedVoicingAnchor(pendingNotes);
        setCommittedChordHistory((current) => [pendingChord, ...current].slice(0, 4));
        setChordSnapshots((current) => {
          const snapshot: ChordSnapshot = {
            id: `${Date.now()}-${pendingChord.name}-${pendingNotes.join("-")}`,
            chordText: pendingChordText,
            notes: pendingNotes,
            suggestions: nextSuggestions
          };
          return [snapshot, ...current].slice(0, 4);
        });
      }, CHORD_CAPTURE_DELAY_MS);

      const now = Date.now();
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
          if (commitTimerRef.current !== null) {
            window.clearTimeout(commitTimerRef.current);
            commitTimerRef.current = null;
          }
          pendingCommitNotesRef.current = [];
        } else {
          previousActiveNotesRef.current = activeNotes;
          setReleasedNoteTimes({});
          setReleasedAt(null);
          setFadeOpacity(1);
        }
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeNotes]);

  useEffect(() => {
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
  }, [committedChord, mood, progressionMode, recommitSuggestionHistory]);

  useEffect(() => {
    if (releasedAt === null) {
      return;
    }

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - releasedAt;
      const nextOpacity = Math.max(0, 1 - elapsed / CHORD_FADE_DURATION_MS);
      setFadeOpacity(nextOpacity);

      if (nextOpacity <= 0) {
        window.clearInterval(interval);
      }
    }, 80);

    return () => window.clearInterval(interval);
  }, [releasedAt]);

  useEffect(() => {
    if (!Object.keys(releasedNoteTimes).length) {
      return;
    }

    const interval = window.setInterval(() => {
      const now = Date.now();
      setAnimationNow(now);
      setReleasedNoteTimes((current) => {
        const nextEntries = Object.entries(current).filter(([, startedAt]) => now - startedAt < NOTE_FADE_DURATION_MS);
        if (nextEntries.length === Object.keys(current).length) {
          return current;
        }
        return Object.fromEntries(nextEntries);
      });
    }, 80);

    return () => window.clearInterval(interval);
  }, [releasedNoteTimes]);

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
        <div className="absolute right-0 top-0 flex items-center gap-2 px-1 py-1 text-sm text-muted">
          <span className="text-base text-ink">{isPaused ? "▶" : "⏸"}</span>
          <span>{isPaused ? "play" : "pause"} (space bar)</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <select
            className="min-w-[260px] bg-panel px-3 py-2 text-sm text-ink outline-none"
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

          <label className="flex items-center gap-2 bg-panel px-3 py-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={closeVoicings}
              onChange={(event) => setCloseVoicings(event.target.checked)}
              className="h-4 w-4 accent-[#39ff14]"
            />
            close voicings
          </label>

          <label className="flex items-center gap-2 bg-panel px-3 py-2 text-sm text-ink">
            <span>mood</span>
            <select
              value={mood}
              onChange={(event) => setMood(event.target.value as SuggestionMood)}
              className="bg-transparent text-sm text-ink outline-none"
            >
              <option value="jazz">jazz</option>
              <option value="pop">pop</option>
              <option value="blues">blues</option>
              <option value="gospel">gospel</option>
            </select>
          </label>

          <label className="flex items-center gap-2 bg-panel px-3 py-2 text-sm text-ink">
            <span>progression</span>
            <select
              value={progressionMode}
              onChange={(event) => setProgressionMode(event.target.value as ProgressionMode)}
              className="bg-transparent text-sm text-ink outline-none"
            >
              <option value="auto">auto</option>
              <option value="major_ii_v_i">ii-V-I major</option>
              <option value="minor_ii_v_i">iiø-V-i minor</option>
              <option value="turnaround">turnaround</option>
              <option value="backdoor">backdoor</option>
              <option value="backcycling">backcycling</option>
            </select>
          </label>
        </div>

        <div className="flex flex-1 items-start justify-center pt-8">
          <div className="grid w-full grid-cols-4 items-start gap-5 pb-8">
            <section className="contents">
              {alignedPreviousSnapshots.map((snapshot, index) => (
                <div
                  key={`history-slot-${index}`}
                  className="flex min-w-0 flex-col gap-4"
                >
                  <div
                    className="min-h-[188px] rounded-[30px] px-4 py-4"
                    style={{ opacity: snapshot ? [0.25, 0.5, 0.75][index] : 0.12 }}
                  >
                    <div className="grid min-h-[188px] w-full grid-rows-[26px_96px_42px] items-start">
                      <div className="flex items-start justify-center text-center text-[11px] uppercase tracking-[0.16em] text-muted">
                        <p className="opacity-0">{snapshot ? "previous" : " "}</p>
                      </div>
                      <div className="relative w-full min-h-[96px]">
                        <PianoKeyboard
                          activeNotes={[]}
                          miniature
                          compactPadding
                          noteSet={snapshot?.notes ?? []}
                          className="w-full"
                        />
                      </div>
                      <p className="flex min-h-[42px] items-start justify-center pt-2 text-center font-body text-lg text-ink">
                        {snapshot?.chordText ?? " "}
                      </p>
                    </div>
                  </div>

                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }, (_, suggestionIndex) => snapshot?.suggestions[suggestionIndex] ?? null).map(
                    (suggestion, suggestionIndex) => (
                        <SuggestionCard
                          key={suggestion?.id ?? `snapshot-${index}-suggestion-${suggestionIndex}`}
                          suggestion={suggestion}
                          opacity={snapshot ? [0.25, 0.5, 0.75][index] : 0.12}
                          hideReason
                          animateOpacity={false}
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </section>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-3">
                <div className="min-h-[188px] rounded-[30px] px-5 py-4">
                  <div className="grid min-h-[188px] w-full grid-rows-[26px_96px_42px] items-start">
                    <div className="flex items-start justify-center text-center text-[11px] uppercase tracking-[0.16em] text-muted">
                      <p className="opacity-0">placeholder</p>
                    </div>
                    <div className="relative w-full min-h-[96px]">
                      <PianoKeyboard
                        activeNotes={displayedNotes}
                        activeOpacity={effectiveActiveNotes.length ? 1 : fadeOpacity}
                        faded={false}
                        miniature
                        compactPadding
                        centerViewport
                        noteRoles={displayedChordAnalysis.noteRoles}
                        noteOpacities={displayedNoteOpacities}
                        viewportNotes={viewportNotes}
                        className="w-full"
                      />
                    </div>
                    <p
                      className="flex min-h-[42px] items-start justify-center pt-2 text-center font-body text-lg text-ink transition-opacity duration-100 sm:text-xl"
                      style={{ opacity: effectiveActiveNotes.length ? 1 : fadeOpacity }}
                    >
                      {displayedChordText}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {verticalSuggestions.map((suggestion, index) => (
                    <SuggestionCard key={suggestion?.id ?? `vertical-${index}`} suggestion={suggestion} opacity={1} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
