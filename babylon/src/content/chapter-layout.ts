import type { Bounds, DoorFrame, Opening, Point3 } from './level-geometry.ts';

export interface ModelPlacement {
  yawDegrees?: number;
  scale?: Point3;
}
export interface Placement {
  // The ID groups a placement's meshes and colliders. Mesh names can repeat across placements.
  id: string;
  name: string;
  prefab: string;
  bounds?: Bounds;
  position?: Point3;
  size?: Point3;
  heading?: number;
  model?: ModelPlacement;
  frame?: string;
  openingAxis?: 'x' | 'z';
  openings?: Opening[];
  exteriorFace?: { axis: 'x' | 'z'; side: 'min' | 'max'; material: string };
  exteriorLight?: {
    name: string;
    sourceOffset: Point3;
    angle: number;
    range: number;
    intensity: number;
    color: string;
  };
  lightTiles?: { x?: number; z?: number };
  galleryCutaway?: boolean;
  castShadow?: boolean;
  wallFixture?: boolean;
  lampYaw?: number;
  // Shelf signs resolve localized subjects by placement ID, with this English text as the fallback.
  label?: string;
}

export interface LevelLayout {
  zones: Record<string, Placement[]>;
  doorFrames?: Record<string, DoorFrame>;
}
