import { parse, differenceCiede2000, type Color } from "culori";
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
