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
import { type Notation } from "../lib/colorFormat";
import { findNearestTailwindColors } from "../lib/colorMatch";
import { scoreOverride, tierClassName, type ClassifiedInput, type OverrideChoice, type ResolvedChoice } from "../lib/colorReplace";
import { getPaletteForVersion, type Version, type PaletteBundle } from "../lib/tailwindColors";
import { ColorExplorer } from "./ColorExplorer";

const SAMPLE_TEXT = `Colorwind

Use this to:
1. Migrate a hardcoded-color theme to Tailwind shades
2. Find the nearest match for a single color code
3. Match colors inside JSON theme tokens — no CSS syntax needed
4. See which of your colors are already close to a Tailwind shade
5. Lock a specific shade or raw value per color (custom card)

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

// The pinned-line highlight — amber to distinguish from the blue hover.
const PINNED_ROW_CLASS = "bg-amber-200/70 dark:bg-amber-500/25";

function resolveClassified(
  originalValue: string,
  classified: ClassifiedInput,
  palette: PaletteBundle,
): ResolvedChoice {
  const percent = scoreOverride(originalValue, classified, palette);
  return classified.kind === "shade"
    ? {
        kind: "shade",
        name: classified.name,
        // resolveCustomInput only produces a shade for names in this table, so
        // the lookup is guaranteed to hit; the fallback is just for type safety.
        value: palette.byName.get(classified.name) ?? classified.name,
        percent,
      }
    : { kind: "raw", value: classified.value, percent };
}

type Choice = ResolvedChoice;

// The color currently driving the explorer/picker. Only set by the mouse
// hovering a color — the row highlight itself is tracked separately so it can
// follow the text caret too.
type ActiveColor = {
  originalValue: string;
};

export function ColorEditor() {
  const [value, setValue] = useState(SAMPLE_TEXT);
  const [overrides, setOverrides] = useState<Map<string, OverrideChoice>>(() => new Map());
  // Remembered custom values per original color, separate from the active
  // override. The 6th card keeps showing its value (solid) from here even after
  // the user picks a nearest card — selecting nearest only changes the active
  // choice, it never discards a custom the user typed.
  const [customValues, setCustomValues] = useState<Map<string, ClassifiedInput>>(() => new Map());
  const [hoverActive, setHoverActive] = useState<ActiveColor | null>(null);
  const [pinnedValue, setPinnedValue] = useState<string | null>(null);
  const [pinnedLine, setPinnedLine] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [displayNotation, setDisplayNotation] = useState<Notation | null>(null);
  const [version, setVersion] = useState<Version>("v4");
  const palette = useMemo(() => getPaletteForVersion(version), [version]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  // When pinned, the bottom panel stays locked to the pinned color. Hover
  // highlights rows visually but never overrides the explorer content.
  const active: ActiveColor | null = pinnedValue != null
    ? { originalValue: pinnedValue }
    : hoverActive;

  const segments = useMemo(() => tokenizeColors(value, palette), [value, palette]);

  // Both panes render line-by-line from this so the hovered line can be tinted
  // in lockstep on each side. Each line is tokenized on its own.
  const outputLines = useMemo(
    () => value.split("\n").map((line) => ({ line, segments: tokenizeColors(line, palette) })),
    [value, palette],
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
        map.set(segment.value, resolveClassified(segment.value, override, palette));
        continue;
      }
      const top = findNearestTailwindColors(segment.value, 1, palette)[0];
      if (top) {
        map.set(segment.value, { kind: "shade", name: top.name, value: top.value, percent: top.percent });
      }
    }
    return map;
  }, [segments, overrides, palette]);

  const matches = useMemo(
    () => (active ? findNearestTailwindColors(active.originalValue, 5, palette) : []),
    [active, palette],
  );

  // The chosen shade for the active color comes from choiceByValue (the live
  // source of truth) so it updates the instant Enter records a pick.
  const activeChoice = active ? choiceByValue.get(active.originalValue) : undefined;
  const activeChosenName = activeChoice?.kind === "shade" ? activeChoice.name : undefined;
  // The 6th card is the active/chosen one (blue) only when the current override
  // came from that card (custom: true); a nearest pick makes the nearest card
  // chosen instead, leaving the 6th showing its remembered value but not blue.
  const activeOverride = active ? overrides.get(active.originalValue) : undefined;
  const customChosen = activeOverride?.custom === true;
  // The remembered custom value for the active color and its resolved form for
  // display. Sourced from customValues (which nearest picks never touch), so the
  // card keeps rendering it until the user re-picks custom or clears it.
  const activeCustomValue = active ? customValues.get(active.originalValue) : undefined;
  const activeCustomResolved =
    active && activeCustomValue ? resolveClassified(active.originalValue, activeCustomValue, palette) : undefined;

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

  // When the text changes, the pinned color may have shifted to a different
  // line (content added/removed above it) or been deleted entirely. Track it
  // by scanning the new output for the pinned color value.
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (pinnedValue == null) {
      prevValueRef.current = value;
      return;
    }
    // If the text didn't change (e.g. a state-only update), skip.
    if (value === prevValueRef.current) {
      return;
    }
    prevValueRef.current = value;
    const newLines = value.split("\n");
    for (let i = 0; i < newLines.length; i++) {
      const lineSegments = tokenizeColors(newLines[i], palette);
      if (lineSegments.some((seg) => seg.kind === "color" && seg.value === pinnedValue)) {
        setPinnedLine(i);
        return;
      }
    }
    // Pinned color no longer exists in the text — unpin.
    setPinnedValue(null);
    setPinnedLine(null);
  }, [value, pinnedValue, palette]);

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
  // Returns null when the textarea isn't focused so nothing gets highlighted.
  function readCaretLine(): number | null {
    const textarea = inputRef.current;
    if (!textarea || !inputFocused) {
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
  // a color and nothing is pinned, which lights up the explorer). Last event
  // wins: a mousemove here overrides a caret-driven highlight until the caret
  // moves again.
  function scheduleHover(root: HTMLElement | null, x: number, y: number) {
    if (frameRef.current != null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const line = findRowAtPoint(root, x, y);
      setHoveredLine(line ?? readCaretLine());
      if (line === null) {
        setHoverActive(null);
        return;
      }
      // hoverActive always tracks the live cursor; it has no visible effect
      // while pinned (active uses pinnedValue) but stays fresh so the moment
      // the user unpins, the panel reflects what's truly under the cursor.
      const color = colorOnLine(line);
      setHoverActive(color ? { originalValue: color } : null);
    });
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLTextAreaElement>) {
    scheduleHover(highlightRef.current, event.clientX, event.clientY);
  }

  function handleOutputMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    scheduleHover(outputRef.current, event.clientX, event.clientY);
  }

  // Leaving a pane clears the row highlight (or reverts to the caret's line
  // when the textarea is focused) and clears the mouse-driven explorer.
  function handleMouseLeave() {
    setHoveredLine(readCaretLine());
    setHoverActive(null);
  }

  function handleKeyUp() {
    syncCaretLine();
  }

  // Clicking a color row pins it (or unpins if already pinned). Only one pin
  // at a time — clicking a different row switches the pin.
  function handleRowClick(lineIndex: number) {
    const color = colorOnLine(lineIndex);
    if (!color) {
      return;
    }
    if (lineIndex === pinnedLine && pinnedValue != null) {
      setPinnedValue(null);
      setPinnedLine(null);
    } else {
      setPinnedValue(color);
      setPinnedLine(lineIndex);
    }
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
      // The custom-color card's own input handles arrow/Enter/Esc while focused,
      // so the global h/l/Enter handler must leave its keystrokes alone. Using
      // event.target (not document.activeElement) is what makes Enter-after-commit
      // stick: the input's handler commits and blurs synchronously, but by the
      // time this window listener runs activeElement is already the body — target
      // still points at the input, so we bail instead of re-focusing it.
      if (event.target === customInputRef.current) {
        return;
      }
      // The card list is the 5 matches plus the custom card at the end.
      const len = matches.length + 1;
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
      } else if (key === "f") {
        event.preventDefault();
        setDisplayNotation((prev) => {
          const cycle: Notation[] = ["hex", "rgb", "hsl", "oklch", "oklab"];
          const idx = prev ? cycle.indexOf(prev) : -1;
          return cycle[(idx + 1) % cycle.length];
        });
      } else if (key === "x") {
        event.preventDefault();
        setDisplayNotation("hex");
      } else if (key === "r") {
        event.preventDefault();
        setDisplayNotation("rgb");
      } else if (key === "s") {
        event.preventDefault();
        setDisplayNotation("hsl");
      } else if (key === "c") {
        event.preventDefault();
        setDisplayNotation("oklch");
      } else if (key === "b") {
        event.preventDefault();
        setDisplayNotation("oklab");
      } else if (event.key === "Enter") {
        event.preventDefault();
        // Cursor on the custom card: activate its input instead of committing.
        if (selectedIndex >= matches.length) {
          customInputRef.current?.focus();
          return;
        }
        const name = matches[selectedIndex].name;
        const originalValue = active.originalValue;
        setOverrides((prev) => {
          const next = new Map(prev);
          next.set(originalValue, { kind: "shade", name, custom: false });
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, matches, selectedIndex]);

  // p toggles pin on the currently hovered color. Works independently of the
  // match navigation keys above — no guard on active or matches.length.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (document.activeElement === inputRef.current) {
        return;
      }
      if (event.target === customInputRef.current) {
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key !== "p") {
        return;
      }
      event.preventDefault();
      if (pinnedValue != null) {
        setPinnedValue(null);
        setPinnedLine(null);
      } else if (hoverActive) {
        setPinnedValue(hoverActive.originalValue);
        setPinnedLine(hoveredLine);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hoverActive, pinnedValue, hoveredLine]);

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
    setHoverActive(null);
  }

  function handleOutputScroll(event: UIEvent<HTMLDivElement>) {
    syncScrollTo(event.currentTarget, [inputRef.current, highlightRef.current]);
    setHoverActive(null);
  }

  function handleCopy() {
    const replacedText = outputLines
      .map((entry) =>
        entry.segments
          .map((segment) => {
            if (segment.kind === "text") return segment.text;
            const choice = choiceByValue.get(segment.value);
            if (!choice) return segment.text;
            return choice.kind === "shade" ? `var(--color-${choice.name})` : choice.value;
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
          <header className="flex h-10 shrink-0 items-center border-b border-gray-200 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
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
                    pinnedLine === lineIndex && pinnedValue != null ? PINNED_ROW_CLASS
                    : lineIndex === hoveredLine ? HOVER_ROW_CLASS
                    : ""
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
              onBlur={() => {
                setInputFocused(false);
                setHoveredLine(null);
              }}
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
          <header className="flex h-10 shrink-0 items-center border-b border-gray-200 px-4 dark:border-gray-700">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Replaced output
            </span>
            <div className="ml-3 inline-flex rounded-md shadow-sm" role="group">
              <button
                onClick={() => setVersion("v3")}
                className={`cursor-pointer rounded-l-md border px-2 py-0.5 text-xs font-medium ${
                  version === "v3"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                v3
              </button>
              <button
                onClick={() => setVersion("v4")}
                className={`-ml-px cursor-pointer rounded-r-md border px-2 py-0.5 text-xs font-medium ${
                  version === "v4"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                v4
              </button>
            </div>
            <button
              onClick={handleCopy}
              className="ml-auto cursor-pointer rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
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
              const isPinned = pinnedLine === lineIndex && pinnedValue != null;
              return (
                <div
                  key={lineIndex}
                  data-line={lineIndex}
                  onClick={() => handleRowClick(lineIndex)}
                  className={`flex items-start gap-2 cursor-pointer ${
                    isPinned ? PINNED_ROW_CLASS
                    : lineIndex === hoveredLine ? HOVER_ROW_CLASS
                    : ""
                  }`}
                >
                  <span className="inline-flex h-6 w-10 shrink-0 items-center gap-1">
                    {isPinned && (
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.708l-.8-.8-3.535 3.535c.268.59.408 1.236.408 1.9 0 .94-.28 1.87-.828 2.672l-.172.243a.5.5 0 0 1-.756.05L5.17 9.556l-3.536 3.536a.5.5 0 0 1-.707-.708L4.464 8.85.646 5.032a.5.5 0 0 1 .05-.756l.243-.172A4.5 4.5 0 0 1 3.6 3.28c.664 0 1.31.14 1.9.408L9.035 .152l-.8-.8a.5.5 0 0 1 .146-.354l1.447.724Z" />
                      </svg>
                    )}
                    {firstColor && firstChoice ? (
                      <span
                        aria-hidden
                        className="inline-flex h-4 w-8 overflow-hidden rounded-sm border border-black/10"
                      >
                        <span className="h-full w-1/2" style={{ background: firstColor.value }} />
                        <span
                          className="h-full w-1/2"
                          style={{ background: firstChoice.value }}
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
                      const replaced = choice.kind === "shade" ? `var(--color-${choice.name})` : choice.value;
                      return (
                        <span key={segment.start} className={tierClassName(choice.percent)}>
                          {replaced}
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
          mouse is over (or the pinned color). h/l and Enter drive picking;
          p or clicking a row pins; moving the mouse off a color dismisses it
          unless pinned. */}
      <section className="h-72 shrink-0 overflow-hidden border-t border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950">
        <ColorExplorer
          matches={matches}
          inputColor={active?.originalValue ?? ""}
          chosenName={activeChosenName}
          selectedIndex={selectedIndex}
          inputFocused={inputFocused}
          displayNotation={displayNotation}
          palette={palette}
          customValue={activeCustomValue}
          customResolved={activeCustomResolved}
          customChosen={customChosen}
          customInputRef={customInputRef}
          pinned={pinnedValue != null}
          onCommitCustom={(classified) => {
            if (!active) {
              return;
            }
            const originalValue = active.originalValue;
            // Committing via the 6th card both activates the custom choice (so
            // the output uses it and the card turns blue) and remembers it
            // (so it survives a later nearest pick).
            setOverrides((prev) => {
              const next = new Map(prev);
              next.set(originalValue, { ...classified, custom: true });
              return next;
            });
            setCustomValues((prev) => {
              const next = new Map(prev);
              next.set(originalValue, classified);
              return next;
            });
          }}
        />
      </section>
    </div>
  );
}
