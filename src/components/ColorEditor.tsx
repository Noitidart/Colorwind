import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from "react";
import { tokenizeColors } from "../lib/colorRegex";
import { findNearestTailwindColors } from "../lib/colorMatch";
import { scoreReplacement, tierClassName } from "../lib/colorReplace";
import { TAILWIND_COLORS } from "../lib/tailwindColors";
import { ColorExplorer } from "./ColorExplorer";

const SAMPLE_TEXT = `Paste or type CSS colors to find their nearest Tailwind match.

--color-brand: oklch(63.7% 0.237 25.331);
--color-link: #2563eb;
--color-danger: rgb(220 38 38);
--color-success: hsl(142 71% 45%);
--color-faint: #fff;
`;

// Shared typography for the transparent input textarea, its mirrored highlight
// layer, and the replaced-output pane. Monospace keeps wrapping identical
// between a form control and a block element so the two panes stay aligned.
const SHARED_TEXT_CLASS =
  "box-border m-0 p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words";

// The hovered-line highlight, shared by both top panes. Saturated enough to read
// against the output pane's gray background, not just white.
const HOVER_ROW_CLASS = "bg-blue-200/70 dark:bg-blue-500/25";

// Resolve a chosen Tailwind shade name to its CSS value so the replaced output
// can show a swatch of the color each var(--color-*) will actually produce.
const COLOR_VALUE_BY_NAME = new Map(TAILWIND_COLORS.map((color) => [color.name, color.value]));

type Choice = { name: string; percent: number };

// The color currently driving the explorer/picker. Only set by the mouse
// hovering a color — the row highlight itself is tracked separately so it can
// follow the text caret too.
type ActiveColor = {
  originalValue: string;
};

export function ColorEditor() {
  const [value, setValue] = useState(SAMPLE_TEXT);
  const [overrides, setOverrides] = useState<Map<string, string>>(() => new Map());
  const [active, setActive] = useState<ActiveColor | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const segments = useMemo(() => tokenizeColors(value), [value]);

  // Both panes render line-by-line from this so the hovered line can be tinted
  // in lockstep on each side. Each line is tokenized on its own.
  const outputLines = useMemo(
    () => value.split("\n").map((line) => ({ line, segments: tokenizeColors(line) })),
    [value],
  );

  // For each distinct input color, its chosen Tailwind shade: an explicit
  // override if the user picked one, otherwise the nearest top match. Keyed by
  // the original color string (not its position) so duplicate colors share a
  // choice and the pick survives edits — the value is the identity.
  const choiceByValue = useMemo(() => {
    const map = new Map<string, Choice>();
    for (const segment of segments) {
      if (segment.kind !== "color" || map.has(segment.value)) {
        continue;
      }
      const override = overrides.get(segment.value);
      if (override) {
        map.set(segment.value, { name: override, percent: scoreReplacement(segment.value, override) });
        continue;
      }
      const top = findNearestTailwindColors(segment.value, 1)[0];
      if (top) {
        map.set(segment.value, { name: top.name, percent: top.percent });
      }
    }
    return map;
  }, [segments, overrides]);

  const matches = useMemo(
    () => (active ? findNearestTailwindColors(active.originalValue, 5) : []),
    [active],
  );

  // The chosen shade for the active color comes from choiceByValue (the live
  // source of truth) so it updates the instant Enter records a pick.
  const activeChosenName = active ? choiceByValue.get(active.originalValue)?.name : undefined;

  // Reset the keyboard cursor onto the currently-chosen match whenever a
  // different color becomes active (so Enter keeps the status quo). Done during
  // render rather than in an effect so it lands in the same commit. Guarded by
  // the changed color so it can't loop.
  if (active && matches.length > 0 && active.originalValue !== activeKey) {
    setActiveKey(active.originalValue);
    const idx = activeChosenName ? matches.findIndex((match) => match.name === activeChosenName) : -1;
    setSelectedIndex(idx >= 0 ? idx : 0);
  }

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  // The first color token on a line, if any — used to light up the explorer when
  // the mouse lands on a line that contains a color.
  function colorOnLine(line: number): string | undefined {
    return outputLines[line]?.segments.find((segment) => segment.kind === "color")?.value;
  }

  // Which row (by line index) the pointer is over, hit-testing the line rows.
  function findRowAtPoint(root: HTMLElement | null, x: number, y: number): number | null {
    if (!root) {
      return null;
    }
    const rows = root.querySelectorAll<HTMLElement>("[data-line]");
    for (const row of Array.from(rows)) {
      const within = Array.from(row.getClientRects()).some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom,
      );
      if (within) {
        return Number(row.dataset.line);
      }
    }
    return null;
  }

  // The input textarea's caret line. Drives the row highlight when the user
  // moves the caret with the keyboard (or clicks) instead of the mouse.
  function readCaretLine(): number | null {
    const textarea = inputRef.current;
    if (!textarea) {
      return null;
    }
    const before = textarea.value.slice(0, textarea.selectionStart ?? 0);
    return (before.match(/\n/g)?.length) ?? 0;
  }

  function syncCaretLine() {
    const line = readCaretLine();
    if (line !== null) {
      setHoveredLine(line);
    }
  }

  // Resolve a hover to a row, debounced to one check per animation frame. Sets
  // both the row highlight (always) and the active color (only when the row has
  // a color, which lights up the explorer). Last event wins: a mousemove here
  // overrides a caret-driven highlight until the caret moves again.
  function scheduleHover(root: HTMLElement | null, x: number, y: number) {
    if (frameRef.current != null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const line = findRowAtPoint(root, x, y);
      if (line === null) {
        return;
      }
      setHoveredLine(line);
      const color = colorOnLine(line);
      setActive(color ? { originalValue: color } : null);
    });
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLTextAreaElement>) {
    scheduleHover(highlightRef.current, event.clientX, event.clientY);
  }

  function handleOutputMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    scheduleHover(outputRef.current, event.clientX, event.clientY);
  }

  // Leaving a pane reverts the row highlight to the caret's line (so something
  // sensible stays lit) and clears the mouse-driven explorer.
  function handleMouseLeave() {
    const line = readCaretLine();
    if (line !== null) {
      setHoveredLine(line);
    }
    setActive(null);
  }

  function handleKeyUp() {
    syncCaretLine();
  }

  // Esc exits "edit mode" (the focused input textarea) so the h/l card keys work
  // again. Scoped to the textarea's own keydown so it only acts while editing.
  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      inputRef.current?.blur();
    }
  }

  // Keyboard picking works whenever the mouse is over a color. Cards are laid
  // out horizontally so the keys are vim-style h/l (left/right) to move the
  // cursor; arrow keys are intentionally left alone so they move the text caret
  // and the row highlight follows it. Enter records the override and stays open.
  useEffect(() => {
    if (!active || matches.length === 0) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (!active) {
        return;
      }
      const len = matches.length;
      // Accept both cases so Caps Lock / Shift don't silently break navigation.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      // h/l are real characters, so when the input textarea is focused let them
      // be typed instead of moving the card cursor — only navigate when focus
      // is elsewhere (or nowhere).
      if ((key === "h" || key === "l") && document.activeElement === inputRef.current) {
        return;
      }
      if (key === "l") {
        event.preventDefault();
        setSelectedIndex((i) => (i + 1) % len);
      } else if (key === "h") {
        event.preventDefault();
        setSelectedIndex((i) => (i - 1 + len) % len);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const name = matches[selectedIndex].name;
        const originalValue = active.originalValue;
        setOverrides((prev) => {
          const next = new Map(prev);
          next.set(originalValue, name);
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, matches, selectedIndex]);

  // Programmatic scrollTop/scrollLeft assignment does not dispatch a 'scroll'
  // event, so syncing the panes to each other here cannot cause a feedback loop.
  function syncScrollTo(source: HTMLElement, targets: (HTMLElement | null)[]) {
    const { scrollTop, scrollLeft } = source;
    for (const target of targets) {
      if (target && target !== source) {
        target.scrollTop = scrollTop;
        target.scrollLeft = scrollLeft;
      }
    }
  }

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    syncScrollTo(event.currentTarget, [highlightRef.current, outputRef.current]);
    setActive(null);
  }

  function handleOutputScroll(event: UIEvent<HTMLDivElement>) {
    syncScrollTo(event.currentTarget, [inputRef.current, highlightRef.current]);
    setActive(null);
  }

  function handleCopy() {
    const replacedText = outputLines
      .map((entry) =>
        entry.segments
          .map((segment) => {
            if (segment.kind === "text") return segment.text;
            const choice = choiceByValue.get(segment.value);
            return choice ? `var(--color-${choice.name})` : segment.text;
          })
          .join(""),
      )
      .join("\n");
    navigator.clipboard.writeText(replacedText);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {/* Input (left, top): editable. The mirrored highlight layer behind it is
            rendered line-by-line so the hovered/caret line can be tinted; the
            transparent textarea on top owns the pointer and caret. */}
        <section className="flex min-w-0 flex-1 flex-col border-r border-gray-300 dark:border-gray-700">
          <header className="shrink-0 border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Input
          </header>
          <div className="relative flex-1 overflow-hidden">
            <div
              ref={highlightRef}
              aria-hidden
              style={{ tabSize: 4 }}
              className="absolute inset-0 overflow-auto p-4 font-mono text-sm leading-6 text-gray-900 dark:text-gray-100"
            >
              {outputLines.map((entry, lineIndex) => (
                <div
                  key={lineIndex}
                  data-line={lineIndex}
                  className={`min-h-6 whitespace-pre-wrap break-words ${
                    lineIndex === hoveredLine ? HOVER_ROW_CLASS : ""
                  }`}
                >
                  {entry.segments.map((segment) => {
                    if (segment.kind === "text") {
                      return <span key={segment.start}>{segment.text}</span>;
                    }
                    const choice = choiceByValue.get(segment.value);
                    return (
                      <span
                        key={segment.start}
                        className={tierClassName(choice?.percent ?? 0)}
                      >
                        {segment.text}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <textarea
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                syncCaretLine();
              }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onKeyUp={handleKeyUp}
              onKeyDown={handleInputKeyDown}
              onClick={syncCaretLine}
              onSelect={syncCaretLine}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onScroll={handleScroll}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              style={{ tabSize: 4 }}
              className={`relative z-10 h-full w-full resize-none border-0 bg-transparent text-transparent focus:outline-none caret-gray-900 dark:caret-gray-100 ${SHARED_TEXT_CLASS}`}
            />
          </div>
        </section>

        {/* Output (right, top): read-only, line-by-line. Each line that contains
            a color gets a two-swatch gutter at its start — original first, then
            the similar (chosen) shade — and the var(--color-*) text is tinted by
            match quality exactly like the input pane. Scrolling syncs to input. */}
        <section className="flex min-w-0 flex-1 flex-col bg-gray-50 dark:bg-gray-900">
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Replaced output
            </span>
            <button
              onClick={handleCopy}
              className="cursor-pointer rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              aria-label="Copy replaced output"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </header>
          <div
            ref={outputRef}
            onMouseMove={handleOutputMouseMove}
            onMouseLeave={handleMouseLeave}
            onScroll={handleOutputScroll}
            className="flex-1 select-text overflow-auto p-4 font-mono text-sm leading-6 text-gray-900 dark:text-gray-100"
          >
            {outputLines.map((entry, lineIndex) => {
              const firstColor = entry.segments.find((segment) => segment.kind === "color");
              const firstChoice = firstColor ? choiceByValue.get(firstColor.value) : undefined;
              return (
                <div
                  key={lineIndex}
                  data-line={lineIndex}
                  className={`flex items-start gap-2 ${
                    lineIndex === hoveredLine ? HOVER_ROW_CLASS : ""
                  }`}
                >
                  <span className="inline-flex h-6 w-8 shrink-0 items-center">
                    {firstColor && firstChoice ? (
                      <span
                        aria-hidden
                        className="inline-flex h-4 w-8 overflow-hidden rounded-sm border border-black/10"
                      >
                        <span className="h-full w-1/2" style={{ background: firstColor.value }} />
                        <span
                          className="h-full w-1/2"
                          style={{ background: COLOR_VALUE_BY_NAME.get(firstChoice.name) }}
                        />
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {entry.segments.map((segment) => {
                      if (segment.kind === "text") {
                        return <span key={segment.start}>{segment.text}</span>;
                      }
                      const choice = choiceByValue.get(segment.value);
                      if (!choice) {
                        return <span key={segment.start}>{segment.text}</span>;
                      }
                      return (
                        <span key={segment.start} className={tierClassName(choice.percent)}>
                          {`var(--color-${choice.name})`}
                        </span>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Explorer (bottom, full width): the matches for whichever color the
          mouse is over. h/l and Enter drive picking; moving the mouse off a
          color dismisses it. */}
      <section className="h-72 shrink-0 overflow-hidden border-t border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950">
        <ColorExplorer
          matches={matches}
          inputColor={active?.originalValue ?? ""}
          chosenName={activeChosenName}
          selectedIndex={selectedIndex}
          inputFocused={inputFocused}
        />
      </section>
    </div>
  );
}
