import { parse } from "culori";
import { tokenizeColors } from "./colorRegex";
import { findNearestTailwindColors, percentBetween } from "./colorMatch";
import { TAILWIND_COLORS } from "./tailwindColors";

export type Replacement = {
  originalValue: string;
  chosenName: string;
  percent: number;
};

export type ReplaceResult = {
  value: string;
  replacements: Replacement[];
};

// The chosen replacement classified by what it is — a Tailwind shade name vs a
// raw value — with no notion of where it came from. resolveCustomInput returns
// this; callers stamp on an origin before storing it.
export type ClassifiedInput =
  | { kind: "shade"; name: string }
  | { kind: "raw"; value: string };

// A stored override: a classified choice plus where it came from. `custom`
// marks picks made through the 6th card so that card knows it owns the value;
// nearest-match picks set it false so the 6th card stays dashed. A Tailwind
// shade name keeps the output in its var(--color-*) form; a raw value (hex, rgb,
// oklch, …) is emitted verbatim.
export type OverrideChoice =
  | { kind: "shade"; name: string; custom: boolean }
  | { kind: "raw"; value: string; custom: boolean };

// The same choice resolved to the CSS value and match percent the panes need to
// render a swatch and tier-color the text.
export type ResolvedChoice =
  | { kind: "shade"; name: string; value: string; percent: number }
  | { kind: "raw"; value: string; percent: number };

const COLOR_BY_NAME = new Map(TAILWIND_COLORS.map((color) => [color.name, color.value]));
const VAR_NAME_PATTERN = /var\(\s*--color-([a-z0-9-]+)\s*\)/i;

export function extractVarName(text: string): string | null {
  const match = text.match(VAR_NAME_PATTERN);
  return match ? match[1] : null;
}

// Rewrites every color in `text` as a var(--color-*) reference to its nearest
// Tailwind shade, preserving the original color for each so the replacement can
// still be scored and re-picked. Tailwind variable references already present
// in the text are left untouched and recorded as exact matches.
export function applyReplace(text: string): ReplaceResult {
  const segments = tokenizeColors(text);
  let value = "";
  const replacements: Replacement[] = [];

  for (const segment of segments) {
    if (segment.kind !== "color") {
      value += segment.text;
      continue;
    }

    const existingName = extractVarName(segment.text);
    if (existingName) {
      value += segment.text;
      replacements.push({ originalValue: segment.value, chosenName: existingName, percent: 100 });
      continue;
    }

    const top = findNearestTailwindColors(segment.value, 1)[0];
    if (!top) {
      value += segment.text;
      continue;
    }

    value += `var(--color-${top.name})`;
    replacements.push({ originalValue: segment.value, chosenName: top.name, percent: top.percent });
  }

  return { value, replacements };
}

export type Tier = "exact" | "close" | "off";

// green for a perfect match, blue for 98% or better, red below that.
export function percentToTier(percent: number): Tier {
  if (percent >= 100) {
    return "exact";
  }
  if (percent >= 98) {
    return "close";
  }
  return "off";
}

const TIER_CLASS: Record<Tier, string> = {
  exact: "text-green-600 dark:text-green-400",
  close: "text-blue-600 dark:text-blue-400",
  off: "text-red-600 dark:text-red-400",
};

export function tierClassName(percent: number): string {
  return TIER_CLASS[percentToTier(percent)];
}

// Score a manually chosen shade against the original color, for when the user
// overrides the top match by selecting a different entry in the panel. The
// shade name is resolved to its CSS value first because culori cannot parse a
// var(--color-*) reference directly.
export function scoreReplacement(originalValue: string, chosenName: string): number {
  const resolved = COLOR_BY_NAME.get(chosenName);
  if (!resolved) {
    return 0;
  }
  return percentBetween(originalValue, resolved);
}

// Classify free-form text from the custom picker into an override. An exact
// Tailwind shade name (matched case-insensitively) becomes a shade override;
// anything else culori can parse becomes a raw override emitted as typed.
// Returns null when the text is neither, so the caller can refuse to commit.
export function resolveCustomInput(text: string): ClassifiedInput | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const asShade = trimmed.toLowerCase();
  if (COLOR_BY_NAME.has(asShade)) {
    return { kind: "shade", name: asShade };
  }
  if (parse(trimmed)) {
    return { kind: "raw", value: trimmed };
  }
  return null;
}

// Score any committed choice against the original color on the same 0–100
// scale as the auto picks, so the output pane can tint it by match quality.
// Takes a ClassifiedInput so it works for both stored overrides and remembered
// custom values; the origin flag is irrelevant to scoring.
export function scoreOverride(originalValue: string, override: ClassifiedInput): number {
  return override.kind === "shade"
    ? scoreReplacement(originalValue, override.name)
    : percentBetween(originalValue, override.value);
}
