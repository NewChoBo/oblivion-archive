interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** World-space metres. Capture the light origin once and test each receiver's bounds.
 * A query may return undefined when no wall can block the light within range.
 */
export interface WallLightOcclusion {
  (
    origin: WorldPoint,
    range?: number,
  ): ((minimum: WorldPoint, maximum: WorldPoint) => boolean) | undefined;
}
