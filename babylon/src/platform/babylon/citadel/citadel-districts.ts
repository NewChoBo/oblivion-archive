import type { Mesh, TransformNode } from '@babylonjs/core';
import type { Bounds, Opening, Point3 } from '../../../content/level-geometry.ts';
import type { CitadelGeometry } from './citadel-geometry.ts';
import type { plan as exteriorPlan, FurnitureKind } from '../../../content/citadel-layout.ts';
import { Vector3 } from '@babylonjs/core';
import { construction, workLayout } from '../../../content/citadel-layout.ts';
import { wallSections } from '../../../levels/wall-openings.ts';

// The workshops open towards the court; the two library wings open south onto the terrace.
export function buildDistricts(
  plan: typeof exteriorPlan,
  { box, beam, drum, arch, surfaces, island, begin, finish, rig }: CitadelGeometry,
) {
  let freightRig: { boomRoot: TransformNode; leaves: Mesh[] } | undefined;
  const pt = (x: number, y: number, z: number) => new Vector3(x, y, z);
  function roof(
    name: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    eave: number,
    ridge: number,
    alongZ = true,
  ) {
    const v = (side: number, y: number, end: number) =>
      alongZ
        ? pt((x0 + x1) / 2 + (side * (x1 - x0)) / 2, y, end ? z1 : z0)
        : pt(end ? x1 : x0, y, (z0 + z1) / 2 + (side * (z1 - z0)) / 2);
    const a = v(-1, eave, 0),
      b = v(1, eave, 0),
      c = v(0, ridge, 0);
    const d = v(-1, eave, 1),
      e = v(1, eave, 1),
      f = v(0, ridge, 1);
    const front = alongZ ? pt(0, 0, -1) : pt(-1, 0, 0);
    surfaces(
      name + ' gable',
      [
        [[a, b, c], front],
        [[d, e, f], front.negate()],
      ],
      'gable',
    );
    surfaces(
      name + ' roof',
      [
        [[a, c, f, d], alongZ ? pt(-1, 1, 0) : pt(0, 1, -1)],
        [[c, b, e, f], alongZ ? pt(1, 1, 0) : pt(0, 1, 1)],
      ],
      'roof',
    );
    beam('roof ridge', c, f, 0.17, 0.18, 'trim');
  }
  const furniture = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    id = 'wood',
    solid = false,
  ) => box(name, x, y, z, w, h, d, id, 0, solid);
  function wallWithWindows(
    name: string,
    bounds: Bounds,
    axis: string,
    openings: Opening[],
    id: string,
  ) {
    for (const part of wallSections({ id: name, bounds, openingAxis: axis, openings })) {
      const center = part.map(([a, b]) => (a + b) / 2) as Point3,
        size = part.map(([a, b]) => b - a) as Point3;
      furniture(name, ...center, ...size, id, true);
    }
  }
  // The pane sits inside the cut. The sill and jambs cover its perimeter on both faces.
  function windowBay(
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    side: string,
    id: string,
  ) {
    const alongX = side === 'south' || side === 'north',
      facing = side === 'west' || side === 'south' ? -1 : 1;
    function piece(
      label: string,
      u: number,
      v: number,
      depth: number,
      w: number,
      h: number,
      d: number,
      material: string,
    ) {
      furniture(
        label,
        x + (alongX ? u : depth * facing),
        y + v,
        z + (alongX ? depth * facing : u),
        alongX ? w : d,
        h,
        alongX ? d : w,
        material,
      );
    }
    piece(name, 0, 0, 0, width, height, 0.035, id);
    // The trim projects into the aperture and covers the face of the rough cut.
    const lip = 0.012,
      jamb = 0.15,
      cap = 0.14;
    for (const u of [-1, 1])
      piece(
        'stone window jamb',
        (u * (width + jamb - lip)) / 2,
        0,
        0.04,
        jamb + lip,
        height,
        0.38,
        'trim',
      );
    piece('window sill', 0, -(height + cap - lip) / 2, 0.08, width + 0.39, cap + lip, 0.51, 'trim');
    piece('window lintel', 0, (height + cap - lip) / 2, 0.05, width + 0.3, cap + lip, 0.42, 'trim');
    piece('window mullion', 0, 0, 0.027, 0.06, height, 0.045, 'joint');
    piece('window crossbar', 0, 0.05, 0.057, width, 0.055, 0.024, 'joint');
  }
  function table(x: number, y: number, z: number) {
    const [w, h, d] = construction.furniture.table[1];
    furniture('worktable', x, y + h - 0.075, z, w, 0.15, d, 'wood', true);
    for (const dx of [-0.98, 0.98])
      for (const dz of [-0.39, 0.39])
        furniture('worktable leg', x + dx, y + 0.46, z + dz, 0.14, 0.92, 0.14, 'wood', true);
  }
  function desk(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    name = 'reading desk',
  ) {
    const t = workLayout.reading.desktopThickness;
    furniture(name, x, y + h - t / 2, z, w, t, d, 'wood', true);
    // Legs at the sides leave the front 0.45 m of knee space clear.
    for (const dx of [-1, 1])
      for (const dz of [-1, 1])
        furniture(
          name + ' leg',
          x + dx * (w / 2 - 0.12),
          y + (h - t) / 2,
          z + dz * (d / 2 - 0.11),
          0.12,
          h - t,
          0.12,
          'wood',
          true,
        );
  }
  function caseOfBooks(x: number, y: number, z: number, width: number) {
    furniture('bookcase back panel', x, y + 1.38, z, width - 0.22, 2.76, 0.24, 'wood', true);
    for (const dx of [-1, 1])
      furniture(
        'bookcase side panel',
        x + (dx * (width - 0.11)) / 2,
        y + 1.38,
        z - 0.19,
        0.11,
        2.76,
        0.65,
        'wood',
        true,
      );
    for (let row = 0; row < 3; row++) {
      furniture(
        'shelf',
        x,
        y + 0.2 + row * 0.85,
        z - 0.3175,
        width - 0.22,
        0.1,
        0.395,
        'wood',
        true,
      );
      for (let i = 0; i < 8; i++) {
        const h = 0.43 + 0.14 * Math.abs(Math.sin(i * 3 + row));
        furniture(
          'restored volumes',
          x - width * 0.37 + i * width * 0.106,
          y + 0.25 + row * 0.85 + h / 2,
          z - 0.43,
          0.15,
          h,
          0.23,
          i % 3 ? 'volumes' : 'cloth',
        );
      }
    }
  }
  const fixtures: Record<FurnitureKind, (x: number, y: number, z: number) => void> = {
    table,
    readingDesk(x, y, z) {
      desk(x, y, z, ...construction.furniture.readingDesk[1]);
    },
    readingBench(x, y, z) {
      const [w, h, d] = construction.furniture.readingBench[1],
        seat = workLayout.reading.seatTop;
      furniture('reading bench seat', x, y + seat - 0.035, z, w, 0.07, d, 'wood', true);
      furniture(
        'reading bench backrest',
        x,
        y + (h + seat) / 2,
        z + d / 2 - 0.035,
        w,
        h - seat,
        0.07,
        'wood',
        true,
      );
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          furniture(
            'reading bench leg',
            x + dx * (w / 2 - 0.12),
            y + (seat - 0.07) / 2,
            z + dz * (d / 2 - 0.07),
            0.1,
            seat - 0.07,
            0.1,
            'wood',
            true,
          );
    },
    sewing(x, y, z) {
      const b = workLayout.bindery,
        [w, h, d] = b.benchSize,
        [fw, fh, fd] = b.frameSize;
      desk(x, y, z, w, h, d, 'sewing bench');
      for (const dx of [-1, 1])
        furniture(
          'sewing frame upright',
          x + dx * (fw / 2 - 0.035),
          y + h + (fh - 0.07) / 2,
          z,
          0.07,
          fh - 0.07,
          fd,
          'wood',
          true,
        );
      furniture('sewing frame crossbar', x, y + h + fh - 0.035, z, fw, 0.07, fd, 'wood', true);
      for (const dx of [-0.22, 0, 0.22])
        beam(
          'sewing support cord',
          pt(x + dx, y + h + 0.035, z),
          pt(x + dx, y + h + fh - 0.07, z),
          0.012,
          0.012,
          'cloth',
        );
      furniture(
        'gathering on sewing frame',
        x,
        y + h + 0.035,
        z - 0.04,
        fw - 0.15,
        0.07,
        fd + 0.12,
        'sheets',
      );
    },
    stool(x, y, z) {
      const b = workLayout.bindery;
      drum(
        'bindery stool seat',
        x,
        y + b.seatTop - 0.055,
        z,
        b.stoolRadius,
        b.stoolRadius,
        0.055,
        'wood',
        16,
        true,
      );
      for (const dx of [-0.13, 0.13])
        for (const dz of [-0.13, 0.13])
          furniture(
            'bindery stool leg',
            x + dx,
            y + (b.seatTop - 0.055) / 2,
            z + dz,
            0.07,
            b.seatTop - 0.055,
            0.07,
            'wood',
            true,
          );
    },
    shelf(x, y, z) {
      const [w, h, d] = workLayout.bindery.shelfSize;
      for (const dx of [-1, 1])
        furniture(
          'gathering shelf upright',
          x + dx * (w / 2 - 0.055),
          y + h / 2,
          z,
          0.11,
          h,
          d,
          'wood',
          true,
        );
      for (const height of [0.12, 0.6, h - 0.06]) {
        furniture('gathering storage shelf', x, y + height, z, w - 0.22, 0.06, d, 'wood', true);
        for (const dx of [-1.2, 0, 1.2])
          furniture(
            'stored gathering',
            x + dx,
            y + height + 0.065,
            z,
            0.81,
            0.07,
            d - 0.08,
            'sheets',
          );
      }
    },
    case(x, y, z) {
      caseOfBooks(x, y, z, construction.furniture.case[1][0]);
    },
    press(x, y, z) {
      const [w, h, d] = construction.furniture.press[1];
      for (const dx of [-0.67, 0.67])
        furniture('book press post', x + dx, y + 0.65, z, 0.13, 1.3, 0.18, 'wood', true);
      furniture('book press frame', x, y + h - 0.07, z, w, 0.14, 0.24, 'wood', true);
      drum('press screw', x, y + 0.4, z, 0.06, 0.06, 0.83, 'gold', 12);
      furniture('press platen', x, y + 0.39, z, 1.02, 0.12, d, 'wood', true);
    },
    crate(x, y, z) {
      const [w, h, d] = construction.furniture.crate[1];
      furniture('archive transport crate', x, y + h / 2, z, w, h, d, 'wood', true);
      // Inlay the metal binding inside the top/bottom planes of the stack.
      for (const dx of [-0.32, 0.32])
        furniture('crate brass band', x + dx * w, y + h / 2, z, 0.07, h - 0.015, d + 0.018, 'gold');
    },
  };
  function furnish(group: keyof typeof construction.placements) {
    for (const [kind, x, y, z] of construction.placements[group]) fixtures[kind](x, y, z);
  }
  function tradeHall(key: 'bindery' | 'freight', name: string, wall: string) {
    const district = plan[key],
      [x0, x1, z0, z1] = district.building;
    const west = key === 'bindery',
      door = west ? x1 : x0,
      back = west ? x0 : x1,
      mid = (z0 + z1) / 2;
    const eave = west ? 3.7 : 5.1,
      span = west ? 3.2 : 4.3,
      side = (z1 - z0 - span) / 2;
    begin(name);
    island(name + ' foundation', district.outline, district.height, [0], west ? 9 : 11);
    for (const z of [z0, z1]) {
      const openings: Opening[] = [];
      for (let x = x0 + 1.3; x < x1; x += 2.5) {
        furniture(
          'exterior wall post',
          x,
          eave / 2,
          z,
          0.22,
          eave + 0.17,
          0.38,
          west ? 'brick' : 'wood',
        );
        const center = x + 0.65;
        if (center + 0.32 >= x1) continue;
        openings.push({ span: [center - 0.315, center + 0.315], height: [1.985, 2.915] });
        windowBay(
          'workshop clerestory',
          center,
          2.45,
          z,
          0.63,
          0.93,
          z === z0 ? 'south' : 'north',
          west ? 'binderyLight' : 'dockLight',
        );
      }
      wallWithWindows(
        'workshop side wall',
        [
          [x0, x1],
          [0, eave],
          [z - 0.125, z + 0.125],
        ],
        'x',
        openings,
        wall,
      );
    }
    const receiving = workLayout.freight.receivingDoor;
    if (west)
      furniture('workshop rear wall', back, eave / 2, mid, 0.26, eave, z1 - z0 - 0.25, wall, true);
    else
      wallWithWindows(
        'workshop rear wall',
        [
          [back - 0.13, back + 0.13],
          [0, eave],
          [z0 + 0.125, z1 - 0.125],
        ],
        'z',
        [
          {
            span: [receiving.z - receiving.width / 2, receiving.z + receiving.width / 2],
            height: [0, receiving.height],
          },
        ],
        wall,
      );
    for (const z of [z0 + 0.0625 + side / 2, z1 - 0.0625 - side / 2])
      furniture('workshop door jamb', door, eave / 2, z, 0.3, eave, side - 0.125, wall, true);
    furniture('entrance lintel', door, eave - 0.27, mid, 0.43, 0.54, span, 'wood', true);
    if (west) {
      roof(name, x0 - 0.23, x1 + 0.23, z0 - 0.22, z1 + 0.22, eave, eave + 1.55, false);
      furniture('glue pot chimney', x0 + 0.78, 3.9, z0 + 1, 0.83, 7.8, 0.92, 'brick', true);
      furniture('chimney cap', x0 + 0.78, 7.82, z0 + 1, 1.04, 0.29, 1.13, 'trim');
    } else {
      roof(name, x0 - 0.25, x1 + 0.28, z0 - 0.25, z1 + 0.25, eave, eave + 2.35, false);
      for (const z of [z0 + 0.4, z1 - 0.4])
        beam(
          'roof timber frame',
          pt(door - 0.2, eave, z),
          pt(door - 0.2, eave + 2.16, mid),
          0.19,
          0.19,
          'wood',
        );
      const [hx, hz] = plan.freight.crane;
      drum('hoist stone footing', hx, 0, hz, 0.86, 0.67, 0.63, 'trim', 12, true);
      furniture('hoist mast', hx, 3.25, hz, 0.56, 5.8, 0.57, 'wood', true);
      for (const [dx, dz] of [
        [-0.65, 0],
        [0, -0.65],
        [0, 0.65],
      ] as const)
        beam('fixed hoist brace', pt(hx + dx, 0.3, hz + dz), pt(hx, 2.85, hz), 0.18, 0.2, 'wood');
      const radius = workLayout.freight.radius;
      const boom = beam(
        'hoist jib',
        pt(hx - 1.25, 5.55, hz),
        pt(hx + radius + 0.23, 6.6, hz),
        0.39,
        0.42,
        'wood',
      );
      const brace = beam(
        'hoist jib brace',
        pt(hx + 0.12, 2.55, hz),
        pt(hx + radius - 0.65, 6.35, hz),
        0.32,
        0.35,
        'wood',
      );
      const pulley = drum('hoist pulley', hx + radius, 5.95, hz, 0.25, 0.25, 0.42, 'gold', 12);
      pulley.rotation.x = Math.PI / 2;
      const boomRoot = rig('rotating hoist head', pt(hx, 0, hz), [boom, brace, pulley]);
      // The north corner has only 0.275 m of wall beyond the opening, so a
      // full leaf parks south. A north-sliding leaf would pass through it.
      const leaves = [
        furniture(
          'freight receiving sliding door',
          back - 0.2,
          receiving.height / 2,
          receiving.z,
          0.1,
          receiving.height,
          receiving.width,
          'wood',
          true,
        ),
      ];
      furniture(
        'fixed freight door track',
        back - 0.21,
        receiving.height + 0.1,
        receiving.z - receiving.width / 2,
        0.16,
        0.12,
        receiving.width * 2 + 0.1,
        'gold',
      );
      freightRig = { boomRoot, leaves };
    }
    furnish(key);
    finish();
  }
  tradeHall('bindery', 'west bindery', 'brick');
  tradeHall('freight', 'east freight warehouse', 'wall');
  const wing = plan.libraryWings;
  for (const cx of wing.centers) {
    const name = cx < 0 ? 'west reading wing' : 'east folio library wing',
      w = wing.width / 2,
      z = wing.frontZ;
    const y = wing.height,
      e = wing.eaves,
      end = z + wing.depth,
      mid = (z + end) / 2,
      gap = 2.8;
    begin(name);
    furniture(
      'library wing floor',
      cx,
      y - 0.22,
      mid,
      wing.width,
      0.44,
      wing.depth,
      'paving',
      true,
    );
    furniture(
      'library plinth',
      cx,
      y - 2.2,
      mid,
      wing.width - 0.1,
      3.5,
      wing.depth - 0.1,
      'basalt',
    );
    for (const xx of [cx - w, cx + w]) {
      const gates =
        cx > 0 && xx < cx ? [plan.eastWingPassages.return, plan.eastWingPassages.transept] : [];
      const low = z + 0.38,
        high = end - 0.21;
      // Passage spans come from the chapter interior. Cut the wing in plan space
      // so its openings align when the completed citadel receives the chapter offset.
      const openings = gates.map<Opening>(([left, right], i) => ({
        span: [left - plan.chapterJoin.offset[2], right - plan.chapterJoin.offset[2]],
        height: [y, y + (i === 0 ? 3.4 : 4.2)],
      }));
      const outside = xx === cx + Math.sign(cx) * w;
      if (outside)
        for (let k = 0; k < 4; k++) {
          const wz = z + 4.6 + 5.5 * k;
          openings.push({ span: [wz - 0.91, wz + 0.91], height: [y + 2.63, y + 5.77] });
          windowBay(
            'library side window',
            xx,
            y + 4.2,
            wz,
            1.82,
            3.14,
            cx < 0 ? 'west' : 'east',
            'libraryLight',
          );
        }
      wallWithWindows(
        'library wing side wall',
        [
          [xx - 0.2, xx + 0.2],
          [y, e],
          [low, high],
        ],
        'z',
        openings,
        'wall',
      );
    }
    furniture(
      'library wing rear wall',
      cx,
      (y + e) / 2,
      end,
      wing.width + 0.4,
      e - y,
      0.42,
      'wall',
      true,
    );
    const jamb = 0.26,
      head = y + 4.25;
    const facadeOpenings: Opening[] = [
      { span: [cx - gap / 2 - jamb, cx + gap / 2 + jamb], height: [y, head] },
    ];
    for (const wx of [cx - 3.9, cx + 3.9]) {
      facadeOpenings.push({ span: [wx - 0.79, wx + 0.79], height: [y + 2.425, y + 5.675] });
      windowBay(
        'library front lancet window',
        wx,
        y + 4.05,
        z + 0.2,
        1.58,
        3.25,
        'south',
        'libraryLight',
      );
    }
    wallWithWindows(
      'library wing entrance wall',
      [
        [cx - w - 0.2, cx + w + 0.2],
        [y, e],
        [z + 0.02, z + 0.38],
      ],
      'x',
      facadeOpenings,
      'wall',
    );
    arch(
      pt(cx - gap / 2, 0, z + 0.02),
      pt(cx + gap / 2, 0, z + 0.02),
      y,
      y + 2.1,
      1.8,
      jamb,
      0.36,
      'trim',
      head,
      true,
    );
    roof(name, cx - w - 0.35, cx + w + 0.35, z - 0.35, end + 0.35, e, wing.ridge);
    const outer = cx + Math.sign(cx) * w;
    for (let k = 0; k < 4; k++) {
      const cz = z + 2.9 + 5.5 * k;
      furniture(
        'library wing buttress',
        outer,
        (e + y) / 2,
        cz,
        0.87,
        e - y + 0.6,
        0.7,
        'trim',
        true,
      );
      drum('buttress pinnacle', outer, e + 0.27, cz, 0.39, 0.03, 1.85, 'roof', 8);
    }
    furnish(cx < 0 ? 'westLibrary' : 'eastLibrary');
    finish();
  }
  if (!freightRig) throw Error('Missing freight hoist');
  return freightRig;
}
