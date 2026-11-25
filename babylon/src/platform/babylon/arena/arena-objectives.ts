import {
  MeshBuilder,
  Ray,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
  type Material,
  type Mesh,
} from '@babylonjs/core';
import { experienceText } from '../../../content/locales/experience.ts';
import { instantiateHumanoid } from '../actors/sample-humanoid.ts';
import { HostageMotion } from '../actors/ally-motion.ts';

import type { ExperienceMatch } from '../../../game/experiences/experience-match.ts';
import type { LevelId } from '../../../content/catalogs/experiences.ts';
import type { createPlaqueFactory, MaterialFactory, Point3 } from '../chapter/plaque.ts';

interface WorldMarker {
  id: string;
  position: Point3;
  action: string;
}

export interface InteractionTarget extends WorldMarker {
  range: number;
  expedition: true;
  objective?: true;
  levelId?: LevelId | null;
  mapOnly?: false;
}

export type ExpeditionTarget = InteractionTarget | (WorldMarker & { mapOnly: true });
type ActorPosition = Pick<Vector3, 'x' | 'y' | 'z'>;

interface ArenaObjectiveOptions {
  level: {
    objectives: {
      bombSites: readonly { id: string; position: Point3 }[];
      hostage: Point3;
      extraction: Point3;
    };
  };
  match: Pick<ExperienceMatch, 'bombSite' | 'escorting'>;
  kind?: ExperienceMatch['kind'];
  material: MaterialFactory;
  sign: ReturnType<typeof createPlaqueFactory>;
  moveEscort(position: Vector3, target: ActorPosition, pace: number): boolean;
  cover: readonly AbstractMesh[];
  targets: ExpeditionTarget[];
}

export function createArenaObjectives(
  scene: Scene,
  { level, match, kind, material, sign, moveEscort, cover, targets }: ArenaObjectiveOptions,
) {
  const { bombSites, hostage: holdingCell, extraction } = level.objectives;
  const markers = new Map<string, Mesh>();
  const brass = material('objective marker brass', '#9b7646');
  const green = material('extraction marker green', '#238469');
  green.emissiveColor.set(0.07, 0.3, 0.23);
  const red = material('armed bomb indicator', '#a34e29');
  red.emissiveColor.set(0.68, 0.11, 0.03);
  let hostage: { root: TransformNode; target: InteractionTarget } | undefined;
  let motion: HostageMotion | undefined;

  function marker(id: string, [x, y, z]: Point3, surface: Material) {
    const ring = MeshBuilder.CreateTorus(
      `${id} ring`,
      { diameter: 2, thickness: 0.045, tessellation: 36 },
      scene,
    );
    ring.position.set(x, y + 0.028, z);
    ring.material = surface;
    ring.isPickable = false;
    sign(`${id} plaque`, experienceText(id), [x, y + 0.43, z], 1.25, 0.24);
  }
  function contact(id: string, position: Point3, range: number, action: string) {
    const target: InteractionTarget = {
      id,
      position,
      range,
      action: experienceText(action),
      expedition: true,
      objective: true,
    };
    targets.push(target);
    return target;
  }
  if (kind === 'bomb') {
    for (const { id, position } of bombSites) {
      marker(id, position, brass);
      contact(id, position, 1.35, `interact.${id}`);
      const device = MeshBuilder.CreateBox(
        `${id} armed bomb`,
        { width: 0.24, height: 0.13, depth: 0.17 },
        scene,
      );
      device.position.set(position[0], position[1] + 0.1, position[2]);
      device.material = red;
      device.isPickable = false;
      device.setEnabled(false);
      markers.set(id, device);
    }
  }
  if (kind === 'rescue') {
    marker('extraction', extraction, green);
    targets.push({
      id: 'extraction',
      position: extraction,
      action: experienceText('extraction'),
      mapOnly: true,
    });
    const root = new TransformNode('arena hostage', scene);
    root.position.set(...holdingCell);
    hostage = { root, target: contact('hostage', holdingCell, 1.65, 'interact.hostage') };
  }

  function clearPath(a: Vector3, b: Vector3) {
    const delta = b.subtract(a),
      length = delta.length();
    if (length < 0.01) return true;
    const ray = new Ray(a, delta.scale(1 / length), length);
    return !cover.some((mesh) => ray.intersectsMesh(mesh).hit);
  }
  const distance = (position: ActorPosition, [x, , z]: Point3) =>
    Math.hypot(position.x - x, position.z - z);

  return {
    async load() {
      if (!hostage) return;
      const escortModel = await instantiateHumanoid(scene, hostage.root, 'ally');
      motion = new HostageMotion(escortModel, hostage.root);
      for (const mesh of escortModel.meshes)
        mesh.metadata = { ...mesh.metadata, arenaHostage: true };
    },
    reset() {
      if (hostage) {
        hostage.root.position.set(...holdingCell);
        hostage.root.rotation.y = Math.PI;
        hostage.target.position = holdingCell;
        motion?.reset();
      }
      for (const device of markers.values()) device.setEnabled(false);
    },
    interacted(id: string) {
      markers.get(id)?.setEnabled(true);
    },
    available(entry: ExpeditionTarget, player: ActorPosition) {
      if (entry.mapOnly) return false;
      if (!entry.objective) return true;
      if (match.bombSite || match.escorting) return false;
      const [x, , z] = entry.position;
      return clearPath(new Vector3(player.x, 0.65, player.z), new Vector3(x, 0.65, z));
    },
    tick(
      dt: number,
      player: ActorPosition,
      enemies: readonly { root: TransformNode; stun: number }[],
    ) {
      if (hostage) {
        const direction = new Vector3(
          player.x - hostage.root.position.x,
          0,
          player.z - hostage.root.position.z,
        );
        const walking = dt > 0 && match.escorting && direction.length() > 0.72;
        // Drive the walking clip from distance the escort actually travelled around cover.
        const { x, z } = hostage.root.position;
        const moved = walking && moveEscort(hostage.root.position, player, dt * 2.5);
        if (moved)
          hostage.root.rotation.y = Math.atan2(
            hostage.root.position.x - x,
            hostage.root.position.z - z,
          );
        if (moved) hostage.target.position = hostage.root.position.asArray();
        if (dt > 0) {
          const speed = moved
            ? Math.hypot(hostage.root.position.x - x, hostage.root.position.z - z) / dt
            : 0;
          motion?.update(dt, match.escorting, speed);
        }
        return {
          extracted:
            match.escorting &&
            player.y < 2 &&
            distance(hostage.root.position, extraction) < 1.25 &&
            distance(player, extraction) < 1.8,
        };
      }
      const site = match.bombSite && bombSites.find((site) => site.id === match.bombSite);
      return {
        defusing: Boolean(
          site &&
          enemies.some(
            ({ root, stun }) =>
              root.isEnabled() && stun === 0 && distance(root.position, site.position) < 0.85,
          ),
        ),
      };
    },
  };
}
