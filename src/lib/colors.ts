import { wcagContrast } from "culori";

// WCAG 2.x contrast thresholds. Large text has a lower bar because larger
// and/or bolder glyphs remain legible at lower contrast.
const SMALL_TEXT_THRESHOLDS = { AA: 4.5, AAA: 7 };
const LARGE_TEXT_THRESHOLDS = { AA: 3, AAA: 4.5 };

export type Readability = {
  ratio: number;
  AA: boolean;
  AAA: boolean;
  size: "large" | "small";
};

export function readability(
  foregroundColor: string,
  backgroundColor: string,
  options?: { fontSizePt: number; bold?: boolean },
): Readability {
  // wcagContrast always divides (lighter + 0.05) / (darker + 0.05), so the
  // argument order is irrelevant; foreground/background naming is for callers.
  const ratio = wcagContrast(foregroundColor, backgroundColor);
  const roundedRatio = Math.round(ratio * 100) / 100;

  const size = textSize(options);
  const thresholds = size === "large" ? LARGE_TEXT_THRESHOLDS : SMALL_TEXT_THRESHOLDS;

  return {
    ratio: roundedRatio,
    AA: roundedRatio >= thresholds.AA,
    AAA: roundedRatio >= thresholds.AAA,
    size,
  };
}

// Per WCAG, text counts as "large" when it is at least 18pt, or at least 14pt
// when bold. bold defaults to false, so it only flips the verdict in the
// 14–18pt range.
function textSize(options?: { fontSizePt: number; bold?: boolean }): "large" | "small" {
  if (!options) {
    return "small";
  }
  const isLargeFromSize = options.fontSizePt >= 18;
  const isLargeFromBold = options.fontSizePt >= 14 && options.bold === true;
  return isLargeFromSize || isLargeFromBold ? "large" : "small";
}
