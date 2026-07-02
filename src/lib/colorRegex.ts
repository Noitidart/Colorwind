import { parse } from "culori";
import { TAILWIND_COLORS } from "./tailwindColors";

export type Segment =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "color"; text: string; start: number; end: number; value: string };

// Hex values (3, 4, 6, or 8 digits), the color functions we support, and
// Tailwind variable references such as var(--color-red-500). Longest
// alternatives come first where it matters, and a trailing negative lookahead
// keeps hex from stopping mid-run. The whole pattern is case-insensitive
// because CSS color syntax is. Named colors such as "red" are intentionally not
// matched: they collide with ordinary prose and with Tailwind variable names
// like var(--color-red), which produced false positives.
const HEX_SOURCE = "#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])";
const FUNCTION_SOURCE = "(?:oklab|oklch|rgba?|hsla?)\\s*\\(\\s*[^)]*?\\)";
// Capture group 1 holds the shade name (for example "red-500").
const VAR_SOURCE = "var\\(\\s*--color-([a-z0-9-]+)\\s*\\)";

const COLOR_BY_NAME = new Map(TAILWIND_COLORS.map((color) => [color.name, color.value]));

const COLOR_PATTERN_SOURCE = `(?:${HEX_SOURCE}|${FUNCTION_SOURCE}|${VAR_SOURCE})`;

export function tokenizeColors(text: string): Segment[] {
  const pattern = new RegExp(COLOR_PATTERN_SOURCE, "gi");
  const raw: Segment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (start > cursor) {
      raw.push({ kind: "text", text: text.slice(cursor, start), start: cursor, end: start });
    }

    // CSS color syntax is case-insensitive, but culori only parses lowercase
    // function names, so validate and store a lowercased copy. The original
    // casing is kept in `text` for display; `value` is what matching consumes.
    // A var(--color-*) match resolves to its Tailwind value via the lookup
    // table rather than culori, since culori does not understand CSS variables.
    const varName = match[1];
    if (varName) {
      const resolved = COLOR_BY_NAME.get(varName);
      if (resolved) {
        raw.push({ kind: "color", text: match[0], start, end, value: resolved });
      } else {
        raw.push({ kind: "text", text: match[0], start, end });
      }
    } else {
      const value = match[0].toLowerCase();
      if (parse(value)) {
        raw.push({ kind: "color", text: match[0], start, end, value });
      } else {
        raw.push({ kind: "text", text: match[0], start, end });
      }
    }
    cursor = end;
  }

  if (cursor < text.length) {
    raw.push({ kind: "text", text: text.slice(cursor), start: cursor, end: text.length });
  }

  return mergeTextSegments(raw);
}

function mergeTextSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (segment.kind === "text" && last && last.kind === "text") {
      last.text += segment.text;
      last.end = segment.end;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}
