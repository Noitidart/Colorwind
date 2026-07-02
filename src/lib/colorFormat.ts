import { converter, formatHex, formatHsl, formatRgb, parse } from "culori";

export type Notation = "hex" | "rgb" | "hsl" | "oklch" | "oklab" | "var" | "unknown";

export function detectNotation(text: string): Notation {
  const trimmed = text.trim();
  if (trimmed.startsWith("#")) {
    return "hex";
  }
  if (/^rgba?\(/i.test(trimmed)) {
    return "rgb";
  }
  if (/^hsla?\(/i.test(trimmed)) {
    return "hsl";
  }
  if (/^oklch\(/i.test(trimmed)) {
    return "oklch";
  }
  if (/^oklab\(/i.test(trimmed)) {
    return "oklab";
  }
  if (/^var\(/i.test(trimmed)) {
    return "var";
  }
  return "unknown";
}

const toOklab = converter("oklab");
const roundNum = (n: number) => Math.round(n * 10000) / 10000;

// Render `matchValue` in the same notation the user originally typed, so each
// match can be compared like-for-like against the input. oklch is returned
// as-is because the match value is already a Tailwind oklch string in the
// percentage form people type; re-rendering would produce decimals instead.
export function formatColorLike(
  matchValue: string,
  notation: Notation,
  matchName?: string,
): string {
  if (notation === "var") {
    return matchName ? `var(--color-${matchName})` : matchValue;
  }
  if (notation === "oklch") {
    return matchValue;
  }
  const parsed = parse(matchValue);
  if (!parsed) {
    return matchValue;
  }
  switch (notation) {
    case "hex":
      return formatHex(parsed);
    case "rgb":
      return formatRgb(parsed);
    case "hsl":
      return formatHsl(parsed);
    case "oklab": {
      // formatCss leaves full float precision, so round the channels ourselves.
      const c = toOklab(parsed) as { l: number; a: number; b: number };
      return `oklab(${roundNum(c.l)} ${roundNum(c.a)} ${roundNum(c.b)})`;
    }
    default:
      return formatHex(parsed);
  }
}
