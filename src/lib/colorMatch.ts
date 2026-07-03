import { parse, differenceCiede2000, converter, type Color } from "culori";
import { TAILWIND_COLORS } from "./tailwindColors";

export type ColorMatch = {
  name: string;
  value: string;
  distance: number;
  percent: number;
};

type ReferenceColor = {
  name: string;
  value: string;
  color: Color;
};

const toRgb = converter("rgb");

// Euclidean distance in RGB space (0–442 max, since sqrt(255² × 3) ≈ 441.67).
export function rgbDistanceBetween(a: string, b: string): number {
  const colorA = parse(a);
  const colorB = parse(b);
  if (!colorA || !colorB) return 0;
  const rgbA = toRgb(colorA);
  const rgbB = toRgb(colorB);
  const dr = (rgbA.r ?? 0) - (rgbB.r ?? 0);
  const dg = (rgbA.g ?? 0) - (rgbB.g ?? 0);
  const db = (rgbA.b ?? 0) - (rgbB.b ?? 0);
  return Math.round(Math.sqrt(dr * dr + dg * dg + db * db) * 100) / 100;
}

// CIEDE2000 reports 0 for identical colors and roughly 100 for opposites such
// as black versus white, so subtracting the distance from 100 maps a perfect
// match to 100% and an unrelated color toward 0%.
const DELTA_E_FULL_SCALE = 100;

let referenceColors: ReferenceColor[] | null = null;

function getReferenceColors(): ReferenceColor[] {
  if (referenceColors) {
    return referenceColors;
  }
  referenceColors = TAILWIND_COLORS.flatMap((entry) => {
    const color = parse(entry.value);
    return color ? [{ name: entry.name, value: entry.value, color }] : [];
  });
  return referenceColors;
}

export function findNearestTailwindColors(input: string, limit = 5): ColorMatch[] {
  const inputColor = parse(input);
  if (!inputColor) {
    return [];
  }

  const deltaE = differenceCiede2000();

  return getReferenceColors()
    .map((reference) => ({
      name: reference.name,
      value: reference.value,
      distance: deltaE(inputColor, reference.color),
    }))
    .sort((nearest, next) => nearest.distance - next.distance)
    .slice(0, limit)
    .map((match) => ({
      ...match,
      percent: distanceToPercent(match.distance),
    }));
}

function distanceToPercent(distance: number): number {
  const percent = Math.round(DELTA_E_FULL_SCALE - distance);
  return Math.max(0, Math.min(DELTA_E_FULL_SCALE, percent));
}

// Similarity between two arbitrary colors, on the same 0–100 scale as the
// nearest-match percents. Used to score a manually chosen replacement against
// the original color the user had before replacing it.
export function percentBetween(first: string, second: string): number {
  const a = parse(first);
  const b = parse(second);
  if (!a || !b) {
    return 0;
  }
  const deltaE = differenceCiede2000();
  return distanceToPercent(deltaE(a, b));
}

// Raw Delta E (CIEDE2000) distance between two colors (0–100 scale).
export function deltaEBetween(first: string, second: string): number {
  const a = parse(first);
  const b = parse(second);
  if (!a || !b) {
    return 0;
  }
  const deltaE = differenceCiede2000();
  return Math.round(deltaE(a, b) * 100) / 100;
}
