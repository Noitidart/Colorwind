import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from "react";
import { tokenizeColors } from "../lib/colorRegex";
import { findNearestTailwindColors } from "../lib/colorMatch";
import {
  applyReplace,
  extractVarName,
  scoreReplacement,
  tierClassName,
  type Replacement,
} from "../lib/colorReplace";
import { ColorTooltip } from "./ColorTooltip";

type Mode = "highlight" | "replace";

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

const HIDE_DELAY = 150;

type EnrichedColor = {
  seg: { kind: "color"; text: string; start: number; end: number; value: string };
  originalValue: string;
  chosenName?: string;
  percent: number;
  pickable: boolean;
  replacementIndex?: number;
};

type ActiveColor = {
  start: number;
  end: number;
  rect: DOMRect;
  originalValue: string;
  chosenName?: string;
  pickable: boolean;
  replacementIndex?: number;
};

function isVarToken(text: string): boolean {
  return /^var\(/i.test(text);
}

export function ColorEditor() {
  const [value, setValue] = useState(SAMPLE_TEXT);
  const [mode, setMode] = useState<Mode>("highlight");
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [active, setActive] = useState<ActiveColor | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const snapshotRef = useRef<string | null>(null);

  const segments = useMemo(() => tokenizeColors(value), [value]);

  const enriched = useMemo<EnrichedColor[]>(() => {
    const varCount =
      mode === "replace"
        ? segments.reduce((count, seg) => count + (seg.kind === "color" && isVarToken(seg.text) ? 1 : 0), 0)
        : 0;
    // Replacements line up with var tokens by order, so only trust them while
    // the counts match. Typing inside replace mode can break that and we then
    // fall back to treating each var token as an exact match rather than risk
    // coloring the wrong span.
    const replacementsValid = mode === "replace" && varCount === replacements.length;
    let varIndex = 0;
    const result: EnrichedColor[] = [];

    for (const seg of segments) {
      if (seg.kind !== "color") {
        continue;
      }
      const isVar = isVarToken(seg.text);
      if (mode === "replace" && isVar) {
        const index = varIndex++;
        if (replacementsValid) {
          const replacement = replacements[index];
          result.push({
            seg,
            originalValue: replacement.originalValue,
            chosenName: replacement.chosenName,
            percent: replacement.percent,
            pickable: true,
            replacementIndex: index,
          });
        } else {
          result.push({
            seg,
            originalValue: seg.value,
            chosenName: extractVarName(seg.text) ?? undefined,
            percent: 100,
            pickable: false,
          });
        }
        continue;
      }
      const top = findNearestTailwindColors(seg.value, 1)[0];
      result.push({
        seg,
        originalValue: seg.value,
        chosenName: isVar ? extractVarName(seg.text) ?? undefined : undefined,
        percent: top?.percent ?? 0,
        pickable: false,
      });
    }
    return result;
  }, [segments, mode, replacements]);

  const matches = useMemo(
    () => (active ? findNearestTailwindColors(active.originalValue, 5) : []),
    [active],
  );

  const enrichedByStart = useMemo(() => {
    const map = new Map<number, EnrichedColor>();
    for (const item of enriched) {
      map.set(item.seg.start, item);
    }
    return map;
  }, [enriched]);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  function cancelHide() {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => setActive(null), HIDE_DELAY);
  }

  function switchMode(next: Mode) {
    if (next === mode) {
      return;
    }
    cancelHide();
    setActive(null);
    if (next === "replace") {
      snapshotRef.current = value;
      const result = applyReplace(value);
      setValue(result.value);
      setReplacements(result.replacements);
    } else {
      if (snapshotRef.current != null) {
        setValue(snapshotRef.current);
        snapshotRef.current = null;
      }
      setReplacements([]);
    }
    setMode(next);
  }

  function handlePick(name: string) {
    if (!active || !active.pickable || active.replacementIndex == null) {
      return;
    }
    cancelHide();
    const insert = `var(--color-${name})`;
    const nextValue = value.slice(0, active.start) + insert + value.slice(active.end);
    const nextReplacements = replacements.slice();
    nextReplacements[active.replacementIndex] = {
      originalValue: active.originalValue,
      chosenName: name,
      percent: scoreReplacement(active.originalValue, name),
    };
    setValue(nextValue);
    setReplacements(nextReplacements);
    setActive({ ...active, end: active.start + insert.length, chosenName: name });
  }

  // The textarea sits on top of the highlight layer and owns the pointer, so to
  // know which color is hovered we test the pointer against the highlight
  // layer's span rects. Those rects are viewport-relative, matching the event's
  // clientX/clientY, and reflect exactly where each color renders.
  function findColorAtPoint(x: number, y: number): ActiveColor | null {
    const root = highlightRef.current;
    if (!root) {
      return null;
    }
    const spans = root.querySelectorAll<HTMLElement>("[data-color-original]");
    for (const span of Array.from(spans)) {
      const withinAnyLine = Array.from(span.getClientRects()).some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      );
      if (!withinAnyLine) {
        continue;
      }
      const dataset = span.dataset;
      const replacementRaw = dataset.colorReplacement;
      return {
        start: Number(dataset.colorStart),
        end: Number(dataset.colorEnd),
        rect: span.getBoundingClientRect(),
        originalValue: dataset.colorOriginal ?? "",
        chosenName: dataset.colorChosen || undefined,
        pickable: dataset.colorPickable === "1",
        replacementIndex: replacementRaw ? Number(replacementRaw) : undefined,
      };
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
      if (found) {
        cancelHide();
        setActive((current) => (current && current.start === found.start ? current : found));
      } else {
        scheduleHide();
      }
    });
  }

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    setActive(null);
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mode</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
          {(["highlight", "replace"] as const).map((option) => {
            const selected = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => switchMode(option)}
                className={`px-3 py-1 text-sm capitalize transition-colors ${
                  selected
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {mode === "replace"
            ? "Read-only — select to copy. Switch to Highlight to edit; click a tooltip entry to override a match."
            : "Hover a color to see its nearest Tailwind matches."}
        </span>
      </div>

      <div className="relative w-full">
        <div
          ref={highlightRef}
          aria-hidden
          style={{ tabSize: 4 }}
          className={`absolute inset-0 overflow-auto border-transparent text-gray-900 dark:text-gray-100 ${SHARED_TEXT_CLASS}`}
        >
          {segments.map((segment) => {
            if (segment.kind === "text") {
              return <span key={segment.start}>{segment.text}</span>;
            }
            const item = enrichedByStart.get(segment.start);
            if (!item) {
              return <span key={segment.start}>{segment.text}</span>;
            }
            return (
              <span
                key={segment.start}
                data-color-start={item.seg.start}
                data-color-end={item.seg.end}
                data-color-original={item.originalValue}
                data-color-chosen={item.chosenName ?? ""}
                data-color-pickable={item.pickable ? "1" : "0"}
                data-color-replacement={item.replacementIndex ?? ""}
                className={`cursor-pointer underline decoration-2 underline-offset-2 ${tierClassName(item.percent)}`}
              >
                {item.seg.text}
              </span>
            );
          })}
          {/* A trailing newline collapses in the highlight layer but still takes a
              line in the textarea, so pad it to keep the two the same height. */}
          {value.endsWith("\n") ? " " : null}
        </div>

        <textarea
          value={value}
          readOnly={mode === "replace"}
          onChange={(event) => {
            setValue(event.target.value);
            setActive(null);
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={scheduleHide}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{ tabSize: 4 }}
          className={`relative z-10 min-h-80 w-full resize-y rounded-lg border-gray-300 bg-transparent text-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 ${
            mode === "replace" ? "caret-transparent" : "caret-gray-900 dark:caret-gray-100"
          } ${SHARED_TEXT_CLASS}`}
        />

          {active && matches.length > 0 ? (
            <ColorTooltip
              matches={matches}
              anchorRect={active.rect}
              inputColor={active.originalValue}
              chosenName={active.chosenName}
              onPick={active.pickable ? handlePick : undefined}
              onPointerEnter={cancelHide}
              onPointerLeave={scheduleHide}
            />
          ) : null}
      </div>
    </div>
  );
}
