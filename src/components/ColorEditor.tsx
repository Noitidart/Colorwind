import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type UIEvent } from "react";
import { tokenizeColors } from "../lib/colorRegex";
import { findNearestTailwindColors } from "../lib/colorMatch";
import { ColorTooltip } from "./ColorTooltip";

const SAMPLE_TEXT = `Paste or type CSS colors to find their nearest Tailwind match.

--color-brand: oklch(63.7% 0.237 25.331);
--color-link: #2563eb;
--color-danger: rgb(220 38 38);
--color-success: hsl(142 71% 45%);
--color-faint: #fff;
`;

// Shared typography is applied to both the transparent textarea and the mirrored
// highlight layer so the two stack pixel-for-pixel. Monospace keeps wrapping
// behavior identical between a form control and a block element.
const SHARED_TEXT_CLASS =
  "box-border m-0 border p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words";

type ActiveColor = {
  value: string;
  start: number;
  end: number;
  rect: DOMRect;
};

export function ColorEditor() {
  const [value, setValue] = useState(SAMPLE_TEXT);
  const [active, setActive] = useState<ActiveColor | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const segments = useMemo(() => tokenizeColors(value), [value]);

  const matches = useMemo(
    () => (active ? findNearestTailwindColors(active.value, 5) : []),
    [active],
  );

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  // The textarea sits on top of the highlight layer and owns the pointer, so to
  // know which color is hovered we test the pointer against the highlight
  // layer's span rects. Those rects are viewport-relative, matching the event's
  // clientX/clientY, and reflect exactly where each color renders.
  function findColorAtPoint(x: number, y: number): ActiveColor | null {
    const root = highlightRef.current;
    if (!root) {
      return null;
    }
    const spans = root.querySelectorAll<HTMLElement>("[data-color-value]");
    for (const span of Array.from(spans)) {
      const withinAnyLine = Array.from(span.getClientRects()).some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      );
      if (withinAnyLine) {
        return {
          value: span.dataset.colorValue ?? "",
          start: Number(span.dataset.colorStart),
          end: Number(span.dataset.colorEnd),
          rect: span.getBoundingClientRect(),
        };
      }
    }
    return null;
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLTextAreaElement>) {
    const x = event.clientX;
    const y = event.clientY;
    if (frameRef.current != null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const found = findColorAtPoint(x, y);
      setActive((current) => {
        if (found && current && found.start === current.start) {
          return current;
        }
        return found;
      });
    });
  }

  function handleMouseLeave() {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setActive(null);
  }

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    setActive(null);
  }

  return (
    <div className="relative w-full">
      <div
        ref={highlightRef}
        aria-hidden
        style={{ tabSize: 4 }}
        className={`absolute inset-0 overflow-auto border-transparent text-gray-900 dark:text-gray-100 ${SHARED_TEXT_CLASS}`}
      >
        {segments.map((segment, index) =>
          segment.kind === "color" ? (
            <span
              key={index}
              data-color-value={segment.value}
              data-color-start={segment.start}
              data-color-end={segment.end}
              className="cursor-pointer underline decoration-2 underline-offset-2 text-blue-600 dark:text-blue-400"
            >
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
        {/* A trailing newline collapses in the highlight layer but still takes a
            line in the textarea, so pad it to keep the two the same height. */}
        {value.endsWith("\n") ? " " : null}
      </div>

      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setActive(null);
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ tabSize: 4 }}
        className={`relative z-10 min-h-80 w-full resize-y rounded-lg border-gray-300 bg-transparent text-transparent caret-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:caret-gray-100 ${SHARED_TEXT_CLASS}`}
      />

      {active && matches.length > 0 ? <ColorTooltip matches={matches} anchorRect={active.rect} /> : null}
    </div>
  );
}
