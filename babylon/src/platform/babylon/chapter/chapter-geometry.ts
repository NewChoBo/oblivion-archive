import type { Mesh, PBRMaterial } from '@babylonjs/core';
import type { Point3 } from '../../../content/level-geometry.ts';

export type MaterialFactory = (name: string, color: string) => PBRMaterial;
// Box centers and full dimensions use world metres along Babylon's X, Y and Z axes.
export type BoxFactory = (
  name: string,
  center: Point3,
  size: Point3,
  material?: PBRMaterial,
  solid?: boolean,
) => Mesh;
