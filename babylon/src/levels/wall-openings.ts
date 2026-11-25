import type { Bounds, Opening, Point2 } from '../content/level-geometry.ts';

function isInterval(value: unknown): value is Point2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(Number.isFinite) &&
    value[0] < value[1]
  );
}

export function wallSections({
  id,
  bounds,
  openingAxis,
  openings,
}: {
  id: string;
  bounds: Bounds;
  openingAxis: string;
  openings: Opening[];
}) {
  const horizontal = openingAxis === 'x' ? 0 : 2;
  if (
    (openingAxis !== 'x' && openingAxis !== 'z') ||
    !Array.isArray(bounds) ||
    bounds.length !== 3 ||
    !bounds.every(isInterval) ||
    !Array.isArray(openings)
  ) {
    throw Error(`Wall ${id} needs x/z openingAxis, three bounds intervals, and an openings array`);
  }

  const [wallLeft, wallRight] = bounds[horizontal];
  const [wallBottom, wallTop] = bounds[1];
  let sections = [bounds];
  for (const [index, opening] of openings.entries()) {
    const { span, height } = opening ?? {};
    if (
      !isInterval(span) ||
      !isInterval(height) ||
      span[0] < wallLeft ||
      span[1] > wallRight ||
      height[0] < wallBottom ||
      height[1] > wallTop
    ) {
      throw Error(`Wall ${id} opening ${index + 1} must fit inside the wall`);
    }

    // Keep the whole thickness in every piece. Successive cuts remove the union
    // of the rectangles without making overlapping collision volumes.
    sections = sections.flatMap((section) => {
      const [left, right] = section[horizontal];
      const [bottom, top] = section[1];
      const cutLeft = Math.max(left, span[0]);
      const cutRight = Math.min(right, span[1]);
      const cutBottom = Math.max(bottom, height[0]);
      const cutTop = Math.min(top, height[1]);
      if (cutLeft >= cutRight || cutBottom >= cutTop) return [section];

      function piece(start: number, end: number, low: number, high: number) {
        const box: Bounds = [...section];
        box[horizontal] = [start, end];
        box[1] = [low, high];
        return box;
      }

      const remaining = [];
      if (left < cutLeft) remaining.push(piece(left, cutLeft, bottom, top));
      if (cutRight < right) remaining.push(piece(cutRight, right, bottom, top));
      if (bottom < cutBottom) remaining.push(piece(cutLeft, cutRight, bottom, cutBottom));
      if (cutTop < top) remaining.push(piece(cutLeft, cutRight, cutTop, top));
      return remaining;
    });
  }
  if (sections.length === 0) throw Error(`Openings remove the entire wall ${id}`);
  return sections;
}
