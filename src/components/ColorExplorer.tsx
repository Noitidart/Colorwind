import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { detectNotation, formatColorLike, type Notation } from "../lib/colorFormat";
import type { ColorMatch } from "../lib/colorMatch";
import { rgbDistanceBetween, deltaEBetween } from "../lib/colorMatch";
import { resolveCustomInput, type ClassifiedInput, type ResolvedChoice } from "../lib/colorReplace";
import type { PaletteBundle } from "../lib/tailwindColors";

type Props = {
  matches: ColorMatch[];
  inputColor: string;
  chosenName?: string;
  selectedIndex: number;
  // True while the input textarea is focused ("edit mode"), where h/l must type
  // instead of navigating. The hint and empty-state reflect this live.
  inputFocused: boolean;
  // User-chosen display format override (from f/x/r/s/c/b hotkeys). When null,
  // the notation is auto-detected from the hovered input color.
  displayNotation?: Notation | null;
  palette: PaletteBundle;
  // The remembered custom value for the active color (from customValues, which
  // nearest picks never clear). Present ⇒ the 6th card renders solid showing it;
  // absent ⇒ dashed.
  customValue?: ClassifiedInput;
  // That remembered custom value resolved to CSS + match percent, for the card's
  // swatch, formatted code, and percent line.
  customResolved?: ResolvedChoice;
  // True when the custom value is also the active choice (output uses it). The
  // card turns blue like a chosen nearest card; false leaves it solid-but-gray
  // while a nearest card is the active pick.
  customChosen: boolean;
  // Imperative handle to the custom card's input so ColorEditor's global Enter
  // (when the cursor lands on the 6th card) can focus it.
  customInputRef: RefObject<HTMLInputElement | null>;
  // True when a color is pinned in the output pane.
  pinned: boolean;
  onCommitCustom: (classified: ClassifiedInput) => void;
};

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[0.7rem] font-semibold text-slate-600 dark:border-gray-600 dark:bg-gray-800 dark:text-slate-300">
      {children}
    </kbd>
  );
}

// A single bar split in two: the original color on the left, the candidate on
// the right, so they read as one side by side comparison. Solid halves (rather
// than a gradient string) keep it safe for color values that contain commas.
function SplitSwatch({ left, right }: { left: string; right: string }) {
  return (
    <span aria-hidden className="inline-flex h-8 w-full overflow-hidden rounded-sm border border-black/10">
      <span className="h-full w-1/2" style={{ background: left }} />
      <span className="h-full w-1/2" style={{ background: right }} />
    </span>
  );
}

// Placeholder for the uncommitted custom card — same footprint as SplitSwatch.
function EmptySwatch() {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-full rounded-sm border border-dashed border-gray-300 dark:border-gray-600"
    />
  );
}

const MAX_SUGGESTIONS = 12;

export function ColorExplorer({
  matches,
  inputColor,
  chosenName,
  selectedIndex,
  inputFocused,
  displayNotation,
  palette,
  customValue,
  customResolved,
  customChosen,
  customInputRef,
  pinned,
  onCommitCustom,
}: Props) {
  const notation = displayNotation ?? detectNotation(inputColor);
  const formatted = useMemo(
    () => matches.map((match) => formatColorLike(match.value, notation, match.name)),
    [matches, notation],
  );

  if (inputFocused) {
    return (
      <div className="flex h-full flex-col justify-center gap-1.5 p-6">
        <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">Edit mode</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Press <Kbd>Esc</Kbd> to exit the input, then <Kbd>h</Kbd>/<Kbd>l</Kbd> moves between matches.
        </p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-1.5 p-6">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          Hover a color to see its nearest Tailwind matches
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <Kbd>h</Kbd>/<Kbd>l</Kbd> moves, <Kbd>Enter</Kbd> picks, <Kbd>p</Kbd> pins — focusing in the left pane input pauses and enters edit mode.
          {" "}<Kbd>f</Kbd> cycle format, <Kbd>x</Kbd> hex, <Kbd>r</Kbd> rgb, <Kbd>s</Kbd> hsl, <Kbd>c</Kbd> oklch, <Kbd>b</Kbd> oklab.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        {pinned ? (
          <>
            <svg
              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.708l-.8-.8-3.535 3.535c.268.59.408 1.236.408 1.9 0 .94-.28 1.87-.828 2.672l-.172.243a.5.5 0 0 1-.756.05L5.17 9.556l-3.536 3.536a.5.5 0 0 1-.707-.708L4.464 8.85.646 5.032a.5.5 0 0 1 .05-.756l.243-.172A4.5 4.5 0 0 1 3.6 3.28c.664 0 1.31.14 1.9.408L9.035 .152l-.8-.8a.5.5 0 0 1 .146-.354l1.447.724Z" />
            </svg>
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Pinned</span>
            <span
              aria-hidden
              className="inline-block h-6 w-6 shrink-0 rounded-sm border border-black/10"
              style={{ background: inputColor }}
            />
            <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{formatColorLike(inputColor, notation)}</span>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              h/l move, Enter pick, p unpin, f cycle, x hex, r rgb, s hsl, c oklch, b oklab
            </span>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Top 5 nearest Tailwind matches
            </h2>
            <span
              aria-hidden
              className="inline-block h-6 w-6 shrink-0 rounded-sm border border-black/10"
              style={{ background: inputColor }}
            />
            <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{formatColorLike(inputColor, notation)}</span>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              h/l move, Enter pick, p pin, f cycle, x hex, r rgb, s hsl, c oklch, b oklab
            </span>
          </>
        )}
      </div>

      <ol className="flex flex-1 gap-3 overflow-x-auto">
        {matches.map((match, index) => {
          const isChosen = match.name === chosenName;
          // isCursor is the keyboard selection (h/l). It only moves the
          // highlight, nothing is applied until Enter, so it tracks intent.
          const isCursor = index === selectedIndex;
          const cardClass = `flex w-56 shrink-0 flex-col gap-2 rounded-lg border p-3 ${
            isChosen
              ? "border-blue-400 bg-blue-50 dark:border-blue-500/60 dark:bg-blue-500/10 "
              : "border-gray-200 dark:border-gray-700 "
          }${isCursor ? "ring-2 ring-inset ring-blue-500" : ""}`;
          return (
            <li key={match.name} aria-current={isCursor ? true : undefined} className={cardClass}>
              <SplitSwatch left={inputColor} right={match.value} />
              <span
                className={`font-mono text-sm font-medium ${
                  isChosen ? "text-blue-600" : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {match.name}
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {match.percent}%
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-semibold">Delta E:</span> {match.distance.toFixed(2)}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-semibold">RGB Dist:</span> {rgbDistanceBetween(inputColor, match.value)}
              </span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{formatted[index]}</span>
            </li>
          );
        })}
        <CustomColorCard
          inputColor={inputColor}
          notation={notation}
          palette={palette}
          isActive={selectedIndex === matches.length}
          customValue={customValue}
          customResolved={customResolved}
          customChosen={customChosen}
          inputRef={customInputRef}
          onCommit={onCommitCustom}
        />
      </ol>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Delta E: &lt;1 imperceptible, &lt;5 barely perceptible · RGB Dist: lower is better
      </p>
    </div>
  );
}

function CustomColorCard({
  inputColor,
  notation,
  palette,
  isActive,
  customValue,
  customResolved,
  customChosen,
  inputRef,
  onCommit,
}: {
  inputColor: string;
  notation: Notation;
  palette: PaletteBundle;
  isActive: boolean;
  customValue: ClassifiedInput | undefined;
  customResolved: ResolvedChoice | undefined;
  customChosen: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onCommit: (classified: ClassifiedInput) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // False until the user actually edits after focusing. The menu is gated on
  // this so focusing a committed card (which seeds the draft with its value)
  // doesn't immediately pop a suggestion list for that value.
  const [dirty, setDirty] = useState(false);
  const [prevInputColor, setPrevInputColor] = useState(inputColor);
  const menuRef = useRef<HTMLUListElement>(null);

  // The exact text the user committed — a shade name or a raw value. Retained
  // verbatim (never reformatted) and re-seeded into the input on focus so the
  // user edits the existing value rather than retyping it.
  const verbatim = customValue ? (customValue.kind === "shade" ? customValue.name : customValue.value) : "";

  // Tailwind shade names whose name starts with the typed text. Hex/function
  // input (e.g. "#ff0000") prefixes no name, so the list is empty and the menu
  // never appears for it — exactly the requested "only for color names" behavior.
  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (query === "") {
      return [];
    }
    return palette.colors.filter((color) => color.name.startsWith(query)).slice(0, MAX_SUGGESTIONS);
  }, [draft, palette]);

  // Reset the half-typed draft the moment the active color changes, so stale
  // text from one color never leaks into another's picker. Done during render
  // (tracking the previous prop) rather than in an effect so it lands in the
  // same commit — the same pattern ColorEditor uses for its cursor reset.
  if (inputColor !== prevInputColor) {
    setPrevInputColor(inputColor);
    setDraft("");
    setHighlight(0);
    setDirty(false);
  }

  // Clamp the highlighted row to the current list so a shrinking suggestion set
  // (e.g. typing "red-3" after browsing all red-*) can never point past the end.
  const safeHighlight = suggestions.length === 0 ? 0 : Math.min(highlight, suggestions.length - 1);

  const committed = customValue !== undefined;
  const displayValue = customResolved?.value ?? inputColor;
  const percent = customResolved?.percent ?? 0;
  const deltaE = committed ? deltaEBetween(inputColor, displayValue) : 0;
  const rgbDist = committed ? rgbDistanceBetween(inputColor, displayValue) : 0;
  // The committed color rendered in the original color's notation, the same way
  // the 5 nearest cards render their code line.
  const formattedCode = committed
    ? formatColorLike(displayValue, notation, customValue!.kind === "shade" ? customValue!.name : undefined)
    : "";
  // The input shows the verbatim text at rest and the editable draft while
  // focused (seeded with that verbatim text, so the handoff is invisible).
  const inputValue = focused ? draft : verbatim;

  // The menu floats with `position: fixed` so it escapes the panel's
  // overflow-hidden ancestors. Anchor it from the input's box whenever the menu
  // is (or becomes) visible; writing the position straight to the DOM keeps this
  // a pure layout sync rather than state. Runs before paint, so no flash.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const input = inputRef.current;
    if (!menu || !input) {
      return;
    }
    const rect = input.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  }, [focused, suggestions, inputRef]);

  function commitOverride(classified: ClassifiedInput) {
    onCommit(classified);
    setDraft("");
    setHighlight(0);
    setDirty(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (suggestions.length > 0) {
        event.preventDefault();
        setHighlight((i) => (i + 1) % suggestions.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      if (suggestions.length > 0) {
        event.preventDefault();
        setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // A highlighted suggestion wins over raw parsing, but only once the user
      // has actually edited — otherwise focusing a committed card and pressing
      // Enter would re-resolve its verbatim value needlessly.
      if (dirty && suggestions.length > 0) {
        const picked = suggestions[safeHighlight] ?? suggestions[0];
        commitOverride({ kind: "shade", name: picked.name });
        return;
      }
      const resolved = resolveCustomInput(draft, palette);
      if (resolved) {
        commitOverride(resolved);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft("");
      setHighlight(0);
      setDirty(false);
      inputRef.current?.blur();
    }
  }

  // Three visual states: chosen (the custom value is the active pick → blue like
  // a selected nearest card), committed-but-not-chosen (remembered but a nearest
  // card is currently active → solid gray), and uncommitted (dashed).
  const cardClass = `flex w-56 shrink-0 flex-col gap-2 rounded-lg border p-3 ${
    customChosen
      ? "border-blue-400 bg-blue-50 dark:border-blue-500/60 dark:bg-blue-500/10 "
      : committed
        ? "border-gray-200 dark:border-gray-700 "
        : "border-dashed border-gray-300 dark:border-gray-600 "
  }${isActive ? "ring-2 ring-inset ring-blue-500" : ""}`;
  const inputTextClass = customChosen
    ? "text-blue-600 dark:text-blue-400"
    : "text-slate-800 dark:text-slate-100";

  return (
    <li aria-current={isActive ? true : undefined} className={cardClass}>
      {committed ? <SplitSwatch left={inputColor} right={displayValue} /> : <EmptySwatch />}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
          setHighlight(0);
        }}
        onFocus={() => {
          // Seed the draft with the committed value so the user edits what's
          // there; dirty stays false so the menu doesn't flash open for it.
          setDraft(verbatim);
          setDirty(false);
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          setDraft("");
          setHighlight(0);
          setDirty(false);
        }}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="Enter custom color"
        aria-label="Custom color override"
        className={`w-full rounded px-1 font-mono text-sm font-medium bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white dark:focus:bg-gray-900 ${inputTextClass}`}
      />
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {committed ? `${percent}%` : "\u00A0"}
      </span>
      <span className="text-xs text-gray-600 dark:text-gray-300">
        {committed ? (
          <>
            <span className="font-semibold">Delta E:</span> {deltaE}
          </>
        ) : "\u00A0"}
      </span>
      <span className="text-xs text-gray-600 dark:text-gray-300">
        {committed ? (
          <>
            <span className="font-semibold">RGB Dist:</span> {rgbDist}
          </>
        ) : "\u00A0"}
      </span>
      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
        {committed ? formattedCode : "\u00A0"}
      </span>
      {focused && dirty && suggestions.length > 0 && (
        <ul
          ref={menuRef}
          className="fixed z-50 max-h-40 w-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.name}
              onMouseDown={(event) => {
                event.preventDefault();
                commitOverride({ kind: "shade", name: suggestion.name });
              }}
              onMouseEnter={() => setHighlight(index)}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1 ${
                index === safeHighlight ? "bg-blue-100 dark:bg-blue-500/20" : ""
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                style={{ background: suggestion.value }}
              />
              <span className="font-mono text-xs text-gray-800 dark:text-gray-100">{suggestion.name}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
