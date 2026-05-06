import { ChordSuggestion, splitHands } from "../music";
import { PianoKeyboard } from "./PianoKeyboard";

interface SuggestionCardProps {
  suggestion: ChordSuggestion | null;
  opacity: number;
  hideReason?: boolean;
  animateOpacity?: boolean;
}

export function SuggestionCard({
  suggestion,
  opacity,
  hideReason = false,
  animateOpacity = true
}: SuggestionCardProps) {
  if (!suggestion) {
    return <div className="min-h-[248px] rounded-[30px] px-5 py-4 opacity-20" style={{ opacity }} />;
  }

  const { leftHand, rightHand } = splitHands(suggestion.notes);
  const noteHands = Object.fromEntries([
    ...leftHand.map((note) => [note, "left"] as const),
    ...rightHand.map((note) => [note, "right"] as const)
  ]);

  return (
    <div
      className={`min-h-[248px] rounded-[30px] px-5 py-4 ${animateOpacity ? "transition-opacity duration-300" : ""}`}
      style={{ opacity }}
    >
      <PianoKeyboard
        activeNotes={[]}
        miniature
        compactPadding
        noteSet={suggestion.notes}
        noteHands={noteHands}
      />
      <p className="mt-2 text-center text-[1.15rem] text-ink">{suggestion.label}</p>
      <p className="mt-1 text-center text-[13px] font-semibold uppercase tracking-[0.22em] text-ink/80">
        {suggestion.degreeLabel}
      </p>
      <p className="mt-1 min-h-[1.5rem] text-center text-sm text-muted" style={{ opacity: hideReason ? 0 : 1 }}>
        {hideReason ? "placeholder" : suggestion.reason}
      </p>
    </div>
  );
}
