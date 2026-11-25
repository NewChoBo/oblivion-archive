export const pointedSegments = 30;
/** Sample one side from spring to crown. An exact zero at the crown lets mirrored halves meet. */
export function pointedStep(span: number, spring: number, rise: number, i: number) {
  const angle = (i * Math.PI) / (3 * pointedSegments);
  return {
    angle,
    x: i === pointedSegments ? 0 : span * (Math.cos(angle) - 0.5),
    y: spring + (rise * Math.sin(angle)) / Math.sin(Math.PI / 3),
  };
}
