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
