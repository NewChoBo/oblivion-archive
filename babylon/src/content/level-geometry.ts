export type Point2 = [number, number];
export type Point3 = [number, number, number];
// Each pair is the minimum and maximum along one chapter axis, in meters.
export type Bounds = [x: Point2, y: Point2, z: Point2];

export interface Opening {
  // The horizontal interval is measured along the wall's opening axis (X or Z).
  span: Point2;
  height: Point2;
}

export interface DoorFrame {
  shape: 'flat' | 'round' | 'pointed';
  center: number;
  width: number;
  spring: number;
  rise?: number;
}
