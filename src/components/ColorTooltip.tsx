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

type Layout = {
  tooltipTop: number;
  tooltipLeft: number;
  bridgeTop: number;
  bridgeLeft: number;
  bridgeWidth: number;
  bridgeHeight: number;
};

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
  const [layout, setLayout] = useState<Layout | null>(null);
  const interactive = Boolean(onPick);

  // Measure after paint, then open to the right of the span (mirroring to the
  // left when the right side would overflow). Keeping the tooltip to the side
  // leaves the CSS lines above and below the color fully visible.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const fitsRight = viewportWidth - anchorRect.right - GAP >= width;
    const side: "right" | "left" = fitsRight ? "right" : "left";

    const rawLeft = side === "right" ? anchorRect.right + GAP : anchorRect.left - GAP - width;
    const tooltipLeft = Math.max(EDGE, Math.min(rawLeft, viewportWidth - width - EDGE));
    const tooltipTop = Math.max(EDGE, Math.min(anchorRect.top, viewportHeight - height - EDGE));

    // Bridge fills the horizontal gap between the span and the tooltip and spans
    // their full vertical extent, so the pointer is always over the bridge or
    // the tooltip while traveling between them and the hide timer cannot fire.
    const tooltipRight = tooltipLeft + width;
    const gapLeft = side === "right" ? anchorRect.right : tooltipRight;
    const gapRight = side === "right" ? tooltipLeft : anchorRect.left;
    const bridgeLeft = Math.min(gapLeft, gapRight) - 1;
    const bridgeWidth = Math.max(0, Math.abs(gapRight - gapLeft) + 2);
    const bridgeTop = Math.min(anchorRect.top, tooltipTop) - 1;
    const bridgeBottom = Math.max(anchorRect.bottom, tooltipTop + height) + 1;

    setLayout({
      tooltipTop,
      tooltipLeft,
      bridgeTop,
      bridgeLeft,
      bridgeWidth,
      bridgeHeight: bridgeBottom - bridgeTop,
    });
  }, [anchorRect]);

  return createPortal(
    <>
      {/* Invisible bridge; only when the tooltip is interactive (Replace mode),
          so it never interferes with editing in Highlight mode. */}
      {interactive && layout && layout.bridgeWidth > 0 ? (
        <div
          aria-hidden
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          style={{
            position: "fixed",
            top: layout.bridgeTop,
            left: layout.bridgeLeft,
            width: layout.bridgeWidth,
            height: layout.bridgeHeight,
            zIndex: 40,
          }}
        />
      ) : null}
      <div
        ref={ref}
        role="tooltip"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={{
          top: layout?.tooltipTop,
          left: layout?.tooltipLeft,
          visibility: layout ? "visible" : "hidden",
        }}
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
              isChosen ? "bg-blue-100/70 " : ""
            }${interactive ? "cursor-pointer hover:bg-gray-200/70" : ""}`;
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
        {interactive ? (
          <p className="mt-3 text-center text-xs text-gray-500">Click a match to use it for this color</p>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
