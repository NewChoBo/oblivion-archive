import type { Mesh, TransformNode, Vector3 } from '@babylonjs/core';
import type { Point2 } from '../../../content/level-geometry.ts';

export type Face = [polygon: Vector3[], outward?: Vector3, uv?: Point2[]];
export interface CitadelGeometry {
  box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    id: string,
    yaw?: number,
    solid?: boolean,
  ): Mesh;
  drum(
    name: string,
    x: number,
    y: number,
    z: number,
    base: number,
    top: number,
    height: number,
    id: string,
    sides?: number,
    solid?: boolean,
  ): Mesh;
  beam(name: string, a: Vector3, b: Vector3, w: number, h: number, id: string): Mesh;
  arch(
    a: Vector3,
    b: Vector3,
    base: number,
    spring: number,
    rise: number,
    thickness: number,
    depth: number,
    id?: string,
    spandrelTop?: number,
    solid?: boolean,
  ): void;
  surfaces(name: string, faces: Face[], id: string, solid?: boolean): Mesh;
  /** Open edges are polygon indices where the island joins another platform without a wall. */
  island(
    name: string,
    polygon: Point2[],
    height: number,
    open: number[],
    depth: number,
    core?: Point2,
  ): void;
  rig(name: string, origin: Vector3, parts: Mesh[]): TransformNode;
  begin(name: string): void;
  finish(): void;
}
