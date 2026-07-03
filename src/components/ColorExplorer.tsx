import { useMemo, type ReactNode } from "react";
import { detectNotation, formatColorLike } from "../lib/colorFormat";
import type { ColorMatch } from "../lib/colorMatch";

type Props = {
  matches: ColorMatch[];
  inputColor: string;
  chosenName?: string;
  selectedIndex: number;
  // True while the input textarea is focused ("edit mode"), where h/l must type
  // instead of navigating. The hint and empty-state reflect this live.
  inputFocused: boolean;
};

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-mono text-[0.7rem] font-semibold text-slate-600 dark:border-gray-600 dark:bg-gray-800 dark:text-slate-300">
      {children}
    </kbd>
  );
}

// A single bar split in two: the original color on the left, the candidate on
// the right, so they read as one side-by-side comparison. Solid halves (rather
// than a gradient string) keep it safe for color values that contain commas.
function SplitSwatch({ left, right }: { left: string; right: string }) {
  return (
    <span aria-hidden className="inline-flex h-8 w-full overflow-hidden rounded-sm border border-black/10">
      <span className="h-full w-1/2" style={{ background: left }} />
      <span className="h-full w-1/2" style={{ background: right }} />
    </span>
  );
}

export function ColorExplorer({ matches, inputColor, chosenName, selectedIndex, inputFocused }: Props) {
  const notation = useMemo(() => detectNotation(inputColor), [inputColor]);
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
          <Kbd>h</Kbd>/<Kbd>l</Kbd> moves, <Kbd>Enter</Kbd> picks — focusing in the left pane input pauses and enters edit mode.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Top 5 nearest Tailwind matches
        </h2>
        <span
          aria-hidden
          className="inline-block h-6 w-6 shrink-0 rounded-sm border border-black/10"
          style={{ background: inputColor }}
        />
        <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{inputColor}</span>
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          h/l to move, Enter to pick
        </span>
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
                  isChosen ? "text-blue-600 underline" : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {match.name}
              </span>
              <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{formatted[index]}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{match.percent}% match</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
