import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ColorMatch } from "../lib/colorMatch";

type Props = {
  matches: ColorMatch[];
  anchorRect: DOMRect;
  inputColor: string;
  chosenName?: string;
  onPick?: (name: string) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

const GAP = 8;
const EDGE = 8;

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-8 w-8 shrink-0 rounded-sm border border-black/10"
      style={{ background: color }}
    />
  );
}

// A single bar split in two: the original color on the left, the candidate on
// the right, so they read as one side-by-side comparison. Solid halves (rather
// than a gradient string) keep it safe for color values that contain commas.
// No inner divider so the seam between the two colors is visible as-is.
function SplitSwatch({ left, right }: { left: string; right: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-24 shrink-0 overflow-hidden rounded-sm border border-black/10"
    >
      <span className="h-full w-1/2" style={{ background: left }} />
      <span className="h-full w-1/2" style={{ background: right }} />
    </span>
  );
}

export function ColorTooltip({
  matches,
  anchorRect,
  inputColor,
  chosenName,
  onPick,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const interactive = Boolean(onPick);

  // Measure after paint so the tooltip can flip above the anchor when it would
  // run off the bottom of the viewport and clamp horizontally to stay on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const fitsBelow = viewportHeight - anchorRect.bottom >= height + GAP;
    const fitsAbove = anchorRect.top >= height + GAP;
    const top = fitsBelow || !fitsAbove ? anchorRect.bottom + GAP : anchorRect.top - height - GAP;
    const left = Math.max(EDGE, Math.min(anchorRect.left, viewportWidth - width - EDGE));

    setPosition({ top, left });
  }, [anchorRect]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ top: position?.top, left: position?.left, visibility: position ? "visible" : "hidden" }}
      className="fixed z-50 w-[28rem] rounded-lg border border-gray-200 bg-gray-50 p-5 shadow-lg"
    >
      <p className="mb-4 text-lg font-medium text-slate-800">Top 5 nearest Tailwind colors:</p>

      {/* The original color the user typed, shown once up top for reference and
          repeated as the left swatch on every row below for side-by-side compare. */}
      <div className="mb-4 flex items-center gap-3 rounded bg-white/70 px-3 py-2">
        <Swatch color={inputColor} />
        <span className="font-mono text-base text-gray-700">{inputColor}</span>
      </div>

      <ol className="space-y-2">
        {matches.map((match, index) => {
          const isChosen = match.name === chosenName;
          const rowClass = `flex w-full items-center gap-4 rounded px-2 py-1.5 text-lg ${
            isChosen ? "bg-blue-100/70" : ""
          }`;;;
          const nameClass = `font-medium text-blue-600 ${isChosen ? "underline" : ""}`;
          const inner = (
            <>
              <span className="w-3 text-gray-400">{index + 1}.</span>
              <SplitSwatch left={inputColor} right={match.value} />
              <span className={nameClass}>{match.name}</span>
              <span className="ml-auto text-gray-500">{match.percent}% match</span>
            </>
          );
          return (
            <li key={match.name}>
              {interactive ? (
                <button type="button" onClick={() => onPick?.(match.name)} className={rowClass}>
                  {inner}
                </button>
              ) : (
                <div className={rowClass}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>,
    document.body,
  );
}
