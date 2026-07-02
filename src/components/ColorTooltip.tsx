import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ColorMatch } from "../lib/colorMatch";

type Props = {
  matches: ColorMatch[];
  anchorRect: DOMRect;
};

const GAP = 8;
const EDGE = 8;

export function ColorTooltip({ matches, anchorRect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

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
      style={{ top: position?.top, left: position?.left, visibility: position ? "visible" : "hidden" }}
      className="fixed z-50 w-72 rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-lg"
    >
      <p className="mb-2 text-sm font-medium text-slate-800">Top 5 nearest Tailwind colors:</p>
      <ol className="space-y-1">
        {matches.map((match, index) => (
          <li key={match.name} className="flex items-center gap-2 text-sm">
            <span className="w-3 text-gray-400">{index + 1}.</span>
            <span
              className="inline-block h-4 w-4 shrink-0 rounded-sm border border-black/10"
              style={{ background: match.value }}
              aria-hidden
            />
            <span className="font-medium text-blue-600">{match.name}</span>
            <span className="ml-auto text-gray-500">{match.percent}% match</span>
          </li>
        ))}
      </ol>
    </div>,
    document.body,
  );
}
