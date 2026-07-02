import { useMemo, useRef, useState, type UIEvent } from "react";
import { tokenizeColors } from "../lib/colorRegex";

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

export function ColorEditor() {
  const [value, setValue] = useState(SAMPLE_TEXT);
  const highlightRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => tokenizeColors(value), [value]);

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
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
        onChange={(event) => setValue(event.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ tabSize: 4 }}
        className={`relative z-10 min-h-80 w-full resize-y rounded-lg border-gray-300 bg-transparent text-transparent caret-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:caret-gray-100 ${SHARED_TEXT_CLASS}`}
      />
    </div>
  );
}
