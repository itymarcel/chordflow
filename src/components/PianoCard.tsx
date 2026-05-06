import { ReactNode } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { NoteRole } from "../music";

interface PianoCardProps {
  opacity: number;
  animateOpacity?: boolean;
  topLabel?: ReactNode;
  topLabelVisible?: boolean;
  activeNotes?: number[];
  noteSet?: number[];
  noteRoles?: Record<number, NoteRole>;
  noteHands?: Record<number, "left" | "right">;
  noteOpacities?: Record<number, number>;
  activeOpacity?: number;
  centerViewport?: boolean;
  viewportNotes?: number[];
  dimInactive?: boolean;
  faded?: boolean;
  title?: ReactNode;
  titleVisible?: boolean;
  reason?: ReactNode;
  reasonVisible?: boolean;
  className?: string;
}

export function PianoCard({
  opacity,
  animateOpacity = true,
  topLabel = "placeholder",
  topLabelVisible = false,
  activeNotes = [],
  noteSet = [],
  noteRoles = {},
  noteHands = {},
  noteOpacities = {},
  activeOpacity = 1,
  centerViewport = false,
  viewportNotes,
  dimInactive = false,
  faded = false,
  title = "placeholder",
  titleVisible = false,
  reason = "placeholder",
  reasonVisible = false,
  className = ""
}: PianoCardProps) {
  return (
    <div
      className={`rounded-[30px] px-5 py-4 ${animateOpacity ? "transition-opacity duration-300" : ""} ${className}`}
      style={{ opacity }}
    >
      <div className="flex w-full flex-col justify-center">
        <div className="flex min-h-[26px] items-center justify-center text-center text-[11px] uppercase tracking-[0.16em] text-muted">
          <p style={{ opacity: topLabelVisible ? 1 : 0 }}>{topLabel}</p>
        </div>
        <div className="relative flex min-h-[96px] items-center">
          <PianoKeyboard
            activeNotes={activeNotes}
            miniature
            compactPadding
            noteSet={noteSet}
            noteRoles={noteRoles}
            noteHands={noteHands}
            noteOpacities={noteOpacities}
            activeOpacity={activeOpacity}
            centerViewport={centerViewport}
            viewportNotes={viewportNotes}
            dimInactive={dimInactive}
            faded={faded}
            className="w-full"
          />
        </div>
        <p className="mt-2 flex min-h-[26px] items-center justify-center text-center text-[1.15rem] text-ink">
          <span style={{ opacity: titleVisible ? 1 : 0 }} className='leading-none'>{title}</span>
        </p>
        <p className="flex min-h-[16px] max-h-[16px] items-center justify-center text-center text-sm text-ink/30">
          <span style={{ opacity: reasonVisible ? 1 : 0 }}>{reason}</span>
        </p>
      </div>
    </div>
  );
}
