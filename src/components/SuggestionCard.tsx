import { Loader } from "lucide-react";
import { ChordSuggestion, splitHands } from "../music";
import { PianoCard } from "./PianoCard";

interface SuggestionCardProps {
  suggestion: ChordSuggestion | null;
  opacity: number;
  hideReason?: boolean;
  animateOpacity?: boolean;
  isLoading?: boolean;
  dimInactive?: boolean;
}

export function SuggestionCard({
  suggestion,
  opacity,
  hideReason = false,
  animateOpacity = true,
  isLoading = false,
  dimInactive = false
}: SuggestionCardProps) {
  if (!suggestion && isLoading) {
    return (
      <PianoCard
        opacity={opacity}
        animateOpacity={animateOpacity}
        dimInactive
        topLabel=" "
        title={<Loader className="inline-block size-4 animate-spin align-middle text-muted" />}
        titleVisible
      />
    );
  }

  if (!suggestion) {
    return <PianoCard opacity={opacity * 0.2} animateOpacity={animateOpacity} />;
  }

  const { leftHand, rightHand } = splitHands(suggestion.notes);
  const noteHands = Object.fromEntries([
    ...leftHand.map((note) => [note, "left"] as const),
    ...rightHand.map((note) => [note, "right"] as const)
  ]);

  return (
    <PianoCard
      opacity={opacity}
      animateOpacity={animateOpacity}
      topLabel={suggestion.degreeLabel}
      topLabelVisible
      noteSet={suggestion.notes}
      noteHands={noteHands}
      dimInactive={dimInactive}
      title={suggestion.label}
      titleVisible
      reason={hideReason ? "placeholder" : suggestion.reason}
      reasonVisible={!hideReason}
    />
  );
}
