export const WAND_RELEASE = 0.09;
export const WAND_INTERVAL = 0.28;

// Sideways wrist travel, wrist height and alignment with the aimed surface.
// Both the viewmodel and the skinned character sample the same stroke.
const keys = [
  [0, 0, 0, 0],
  [0.045, 1, 1, 0],
  [WAND_RELEASE, 0, 0.3, 1],
  [0.16, -0.9, -0.45, 0.3],
  [WAND_INTERVAL, 0, 0, 0],
] as const;

export function wandStroke(age: number, direction: number) {
  for (let i = 1; i < keys.length; i++) {
    const [end, x, y, aim] = keys[i]!;
    if (age > end) continue;
    const [start, x0, y0, aim0] = keys[i - 1]!;
    const t = Math.max(0, (age - start) / (end - start));
    const weight = t * t * (3 - 2 * t);
    return {
      sweep: direction * (x0 + (x - x0) * weight),
      lift: y0 + (y - y0) * weight,
      alignment: aim0 + (aim - aim0) * weight,
    };
  }
  return { sweep: 0, lift: 0, alignment: 0 };
}
