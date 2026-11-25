import type { DoorFrame, Point2, Point3 } from './level-geometry.ts';
import type { Placement } from './chapter-layout.ts';
import authored from '../../../shared/levels/citadel-construction.json' with { type: 'json' };
import exterior from '../../../shared/levels/fortress-exterior.json' with { type: 'json' };
import chapter from '../../../shared/levels/chapter-1.json' with { type: 'json' };
import work from '../../../asset-sources/Art/Chapter1/work-layout.json' with { type: 'json' };

// This source reference is also consumed by the drawing/export tools. Do not
// copy the work-plan dimensions back into the original placement schedules.
if (authored.workLayout !== 'asset-sources/Art/Chapter1/work-layout.json')
  throw Error('Unknown citadel work-layout source');
type District = { height: number; outline: Point2[]; openEdges?: number[] };
type Workshop = District & { building: [number, number, number, number]; entrance: Point2 };
export type Walkway = { width: number; stations: Point3[] };
type ExteriorPlan = Omit<
  typeof exterior,
  | 'arrival'
  | 'bridge'
  | 'westWalk'
  | 'stairs'
  | 'court'
  | 'terrace'
  | 'bindery'
  | 'freight'
  | 'lookout'
  | 'eastWingPassages'
  | 'chapterJoin'
  | 'gate'
> & {
  chapterJoin: { offset: Point3 };
  gate: Omit<typeof exterior.gate, 'center'> & { center: Point2 };
  arrival: District & { spawn: Point3; landingEdge: number; bridgeEdge: number };
  bridge: Walkway & { arches: number };
  westWalk: Walkway;
  stairs: Walkway;
  court: District & { orrery: Point2; openEdges: number[] };
  terrace: District & { core: Point2; openEdges: number[] };
  bindery: Workshop;
  freight: Workshop & { crane: Point2 };
  lookout: { height: number; radius: number; center: Point2 };
  eastWingPassages: { return: Point2; transept: Point2 };
};
type WorkPlan = Omit<typeof work, 'freight' | 'bindery'> & {
  freight: Omit<typeof work.freight, 'mast' | 'load' | 'crates'> & {
    mast: Point2;
    load: Point3;
    crates: Point3[];
  };
  bindery: Omit<
    typeof work.bindery,
    'benchSize' | 'frameSize' | 'shelfSize' | 'sewing' | 'stool' | 'pressTable' | 'press' | 'shelf'
  > & {
    benchSize: Point3;
    frameSize: Point3;
    shelfSize: Point3;
    sewing: Point2;
    stool: Point2;
    pressTable: Point2;
    press: Point2;
    shelf: Point2;
  };
};
export interface ParapetSpec {
  width: number;
  height: number;
  edgeBevel: number;
  turnRadius: number;
  maxTrimFraction: number;
  maxArcDegrees: number;
  merlonPitch: number;
  merlon: Point3;
}
type Furniture = [name: string, size: Point3, material: string, origin: string];
type OriginalKind = keyof typeof authored.furniture;
export type FurnitureKind =
  OriginalKind | 'sewing' | 'stool' | 'shelf' | 'readingDesk' | 'readingBench';
type PlacementRow = [FurnitureKind, ...Point3];
type Group = 'bindery' | 'freight' | 'eastLibrary' | 'westLibrary';
type Chapter = Omit<typeof chapter, 'doorFrames' | 'zones'> & {
  doorFrames: Record<keyof typeof chapter.doorFrames, DoorFrame>;
  zones: Record<keyof typeof chapter.zones, Placement[]>;
};
export const workLayout = work as WorkPlan;
const source = structuredClone(authored);
type AuthoredRow = [string, ...Point3];
const originalFurniture = source.furniture as Record<OriginalKind, Furniture> & {
  bench?: Furniture;
  rack?: Furniture;
};
const originalRows = source.placements as Record<keyof typeof source.placements, AuthoredRow[]>;
const { freight: f, bindery: b, reading: r, corridor: c } = workLayout;
delete originalFurniture.bench;
delete originalFurniture.rack;
const furniture: Record<FurnitureKind, Furniture> = {
  ...originalFurniture,
  sewing: [
    'sewing frame',
    [b.benchSize[0], b.benchSize[1] + b.frameSize[1], b.benchSize[2]],
    'wood',
    'floor below the center of the tabletop',
  ],
  stool: [
    'bindery stool',
    [b.stoolRadius * 2, b.seatTop, b.stoolRadius * 2],
    'wood',
    'floor below the center of the seat',
  ],
  shelf: ['gathering storage shelf', b.shelfSize, 'wood', 'floor below the center of the shelf'],
  readingDesk: [
    'reading desk',
    [2.4, r.deskTop, r.deskDepth],
    'wood',
    'floor below the center of the tabletop',
  ],
  readingBench: [
    'reading bench',
    [2.16, r.backHeight, r.seatDepth],
    'wood',
    'floor below the center of the seat',
  ],
};
const placements: Record<Group, PlacementRow[]> = {
  westLibrary: originalRows.westLibrary.map(([kind, ...p]) => [
    kind === 'table' ? 'readingDesk' : kind === 'bench' ? 'readingBench' : (kind as FurnitureKind),
    ...p,
  ]),
  eastLibrary: originalRows.eastLibrary as PlacementRow[],
  bindery: [
    ['table', b.pressTable[0], 0, b.pressTable[1]],
    ['sewing', b.sewing[0], 0, b.sewing[1]],
    ['press', b.press[0], furniture.table[1][1], b.press[1]],
    ['shelf', b.shelf[0], 0, b.shelf[1]],
    ['stool', b.stool[0], 0, b.stool[1]],
  ],
  freight: f.crates.map((p) => ['crate', ...p]),
};
export const construction = { ...source, wall: source.wall as ParapetSpec, furniture, placements };
export const plan = structuredClone(exterior) as ExteriorPlan;
export const chapterLevel = structuredClone(chapter) as Chapter;
plan.freight.crane = f.mast;
for (const placement of chapterLevel.zones.corridor) {
  if (placement.prefab === 'rune-plinth' && placement.position)
    placement.position[2] += c.plinthShiftZ;
}
for (const placement of chapterLevel.zones.readingRoom) {
  if (placement.exteriorLight) placement.exteriorLight.intensity *= 0.18;
}
