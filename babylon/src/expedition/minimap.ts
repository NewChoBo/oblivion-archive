import { expeditionText } from '../content/locales/expedition.ts';
import { chapterLevel, plan } from '../content/citadel-layout.ts';
import { citadelSurvey } from '../platform/babylon/citadel/floating-citadel.ts';
import { openingForFrame } from '../levels/doorway-wall.ts';
import { wallSections } from '../levels/wall-openings.ts';
import type { AbstractMesh, TransformNode, Vector3 } from '@babylonjs/core';
import type { ExperienceMatch } from '../game/experiences/experience-match.ts';
import { requireElement } from '../ui/dom.ts';
import { EXPERIENCE_LEVELS, type LevelId } from '../content/catalogs/experiences.ts';
import { experienceText } from '../content/locales/experience.ts';

export interface MapPoints {
  targets: readonly { id: string; position: readonly number[] }[];
  enemies: readonly TransformNode[];
}
export type MapExperience = Pick<ExperienceMatch, 'kind' | 'ward' | 'bombSite'> & {
  levelId?: LevelId;
};
type Point = readonly [number, number];
type Rectangle = [Point, Point, Point, Point];
type Marker = 'active-ward' | 'portal' | 'landmark' | 'enemy';
interface MapData {
  exterior?: Path2D;
  floors: Path2D;
  walls: Path2D;
  areas: { name: string; outline: Rectangle }[];
}

const width = 176,
  height = 132;
function coordinate(values: readonly number[] | undefined, index: number): number {
  const value = values?.[index];
  if (value === undefined) throw new Error('Missing minimap coordinate');
  return value;
}
const rectangle = (left: number, right: number, south: number, north: number): Rectangle => [
  [left, south],
  [right, south],
  [right, north],
  [left, north],
];
const fromBounds = (bounds: readonly (readonly number[])[]) =>
  rectangle(
    coordinate(bounds[0], 0),
    coordinate(bounds[0], 1),
    coordinate(bounds[2], 0),
    coordinate(bounds[2], 1),
  );
function fromBox(position?: readonly number[], size?: readonly number[]) {
  const x = coordinate(position, 0),
    z = coordinate(position, 2),
    w = coordinate(size, 0),
    d = coordinate(size, 2);
  return rectangle(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
}

function path(polygons: readonly (readonly Point[])[]) {
  const result = new Path2D();
  for (const [first, ...points] of polygons) {
    if (!first) continue;
    result.moveTo(...first);
    for (const [px, pz] of points) result.lineTo(px, pz);
    result.closePath();
  }
  return result;
}

function chapterMap(): MapData {
  const dx = coordinate(plan.chapterJoin.offset, 0),
    dz = coordinate(plan.chapterJoin.offset, 2);
  const { bridge, west, stairs, disc } = citadelSurvey();
  const exterior: (readonly (readonly number[])[])[] = [
    disc,
    ...[plan.arrival, plan.court, plan.terrace, plan.bindery, plan.freight].map(
      (site) => site.outline,
    ),
  ];
  const routes: readonly (readonly (readonly Vector3[])[])[] = [bridge, west, stairs];
  for (const route of routes) {
    exterior.push([
      ...route.map((row) => [row[0]!.x, row[0]!.z]),
      ...route.map((row) => [row[1]!.x, row[1]!.z]).reverse(),
    ]);
  }
  const floors: Rectangle[] = [],
    walls: Rectangle[] = [],
    areas: MapData['areas'] = [];
  const frames: Readonly<
    Record<string, (typeof chapterLevel.doorFrames)[keyof typeof chapterLevel.doorFrames]>
  > = chapterLevel.doorFrames;
  for (const zone of ['readingRoom', 'corridor', 'vault', 'shortcut'] as const) {
    const name = expeditionText(`area.${zone}`);
    for (const entry of chapterLevel.zones[zone]) {
      if (entry.prefab.endsWith('-floor')) {
        const outline = entry.bounds
          ? fromBounds(entry.bounds)
          : fromBox(entry.position, entry.size);
        floors.push(outline);
        areas.push({ name, outline });
      }
      if (!entry.bounds || !entry.prefab.endsWith('-wall')) continue;
      const frame = entry.frame && frames[entry.frame];
      let sections = [entry.bounds];
      if (frame || entry.openings) {
        if (!entry.openingAxis) throw Error(`Wall ${entry.id} needs an opening axis`);
        const wall = { id: entry.id, bounds: entry.bounds, openingAxis: entry.openingAxis };
        sections = wallSections({
          ...wall,
          openings: frame ? [openingForFrame(wall, frame)] : entry.openings!,
        });
      }
      for (const bounds of sections) {
        if (coordinate(bounds[1], 0) <= 0.85 && coordinate(bounds[1], 1) > 0.85)
          walls.push(fromBounds(bounds));
      }
    }
  }
  return {
    exterior: path(
      exterior.map((outline) =>
        outline.map((point) => [coordinate(point, 0) + dx, coordinate(point, 1) + dz]),
      ),
    ),
    floors: path(floors),
    walls: path(walls),
    areas,
  };
}

export function createMinimap(
  panel: HTMLElement,
  { targets, enemies }: MapPoints,
  doors: readonly AbstractMesh[],
  levelId?: LevelId | null,
) {
  const hostage = targets.find((target) => target.id === 'hostage');
  const canvas = requireElement(panel, 'canvas', HTMLCanvasElement);
  const caption = requireElement(panel, 'figcaption', HTMLElement);
  canvas.width = width * 2;
  canvas.height = height * 2;
  const drawing = canvas.getContext('2d');
  if (!drawing) return { update() {} };
  const context = drawing;
  context.scale(2, 2);
  const level = levelId && EXPERIENCE_LEVELS[levelId];
  const data: MapData = level
    ? {
        areas: [],
        floors: path([fromBox(level.floor.position, level.floor.size)]),
        walls: path(
          [...level.walls, ...level.cover].map(([, position, size]) => fromBox(position, size)),
        ),
      }
    : chapterMap();
  const seals = doors.map((mesh) => {
    mesh.computeWorldMatrix(true);
    const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
    return { mesh, shape: path([rectangle(min.x, max.x, min.z, max.z)]) };
  });
  let previous: string | undefined;

  function marker(x: number, y: number, kind: Marker) {
    if (x < 5 || y < 5 || x > width - 5 || y > height - 5) return;
    context.beginPath();
    if (kind === 'portal' || kind === 'active-ward') {
      context.arc(x, y, 3.7, 0, 2 * Math.PI);
      context.strokeStyle = kind === 'portal' ? '#9fe5d6' : '#fff3d6';
      context.lineWidth = 1.7;
      context.stroke();
      return;
    }
    if (kind === 'enemy') {
      context.moveTo(x, y - 3.8);
      context.lineTo(x + 3.8, y);
      context.lineTo(x, y + 3.8);
      context.lineTo(x - 3.8, y);
      context.closePath();
      context.fillStyle = '#ff9a86';
    } else {
      context.rect(x - 2.8, y - 2.8, 5.6, 5.6);
      context.fillStyle = '#f3d291';
    }
    context.fill();
  }

  return {
    update(
      visible: boolean,
      position: { x: number; z: number },
      yaw: number,
      dungeon: boolean,
      experience?: MapExperience | null,
    ) {
      if (panel.hidden === visible) panel.hidden = !visible;
      if (!visible) return;
      // Snap movement to twelfths of a metre so subpixel motion can reuse the previous drawing.
      const x = Math.round(position.x * 12) / 12,
        z = Math.round(position.z * 12) / 12;
      const direction = Math.round(yaw * 36) / 36;
      const key = [
        dungeon,
        x,
        z,
        direction,
        levelId,
        experience?.kind,
        experience?.ward,
        experience?.bombSite,
      ];
      if (dungeon) {
        for (const enemy of enemies)
          key.push(
            enemy.isEnabled(),
            Math.round(enemy.position.x * 12),
            Math.round(enemy.position.z * 12),
          );
        if (hostage)
          key.push(
            Math.round(coordinate(hostage.position, 0) * 12),
            Math.round(coordinate(hostage.position, 2) * 12),
          );
      } else {
        for (const { mesh } of seals) key.push(mesh.checkCollisions);
      }
      const signature = key.join('|');
      if (previous === signature) return;
      previous = signature;

      const area =
        level && levelId
          ? experienceText(levelId)
          : (data.areas.find(
              ({ outline: [[left, south], , [right, north]] }) =>
                x >= left && x <= right && z >= south && z <= north,
            )?.name ?? expeditionText('area.ramparts'));
      if (caption.textContent !== area) caption.textContent = area;
      const scale = dungeon ? 5.7 : 5;
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(width / 2 - x * scale, height / 2 + z * scale);
      context.scale(scale, -scale);
      context.lineWidth = 0.14;
      if (data.exterior) {
        context.fillStyle = '#25343c';
        context.fill(data.exterior);
        context.strokeStyle = '#526875';
        context.stroke(data.exterior);
      }
      context.fillStyle = '#484039';
      context.fill(data.floors);
      context.strokeStyle = '#807362';
      context.stroke(data.floors);
      context.fillStyle = '#b09b7c';
      context.fill(data.walls);
      if (!dungeon) {
        context.fillStyle = '#e2b479';
        for (const { mesh, shape } of seals) if (mesh.checkCollisions) context.fill(shape);
      }
      context.restore();

      const pin = (px: number, pz: number, kind: Marker) =>
        marker(width / 2 + (px - x) * scale, height / 2 - (pz - z) * scale, kind);
      for (const target of targets) {
        const px = coordinate(target.position, 0),
          pz = coordinate(target.position, 2);
        const active = target.id === experience?.ward || target.id === experience?.bombSite;
        const portal = target.id === 'extraction' || target.id.endsWith('-quarry');
        pin(px, pz, active ? 'active-ward' : portal ? 'portal' : 'landmark');
      }
      if (dungeon)
        for (const enemy of enemies) {
          if (enemy.isEnabled()) pin(enemy.position.x, enemy.position.z, 'enemy');
        }
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(direction);
      context.beginPath();
      context.arc(0, 0, 4.4, 0, 2 * Math.PI);
      context.fillStyle = '#fff3d6';
      context.fill();
      context.strokeStyle = '#12171e';
      context.lineWidth = 1.8;
      context.stroke();
      context.fillRect(-1.1, -9, 2.2, 4.5);
      context.restore();
    },
  };
}
