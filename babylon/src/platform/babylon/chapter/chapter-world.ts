import { Ray, TransformNode, Vector3 } from '@babylonjs/core';
import { createPlaqueFactory } from './plaque.ts';
import { SYMBOLS, runePositions } from '../../../content/locales/chapter.ts';
import { chapterWorldText } from '../../../content/locales/chapter-world.ts';
import type { Placement } from '../../../content/chapter-layout.ts';
import type { GroundRect } from '../../../game/ai/bot-navigation.ts';
import { BotNavigation, BotRoute } from '../../../game/ai/bot-navigation.ts';
import { BotAttack } from '../../../game/ai/bot-attack.ts';
import { botObstacles } from '../actors/bot-obstacles.ts';
import { loadInkApparition } from './chapter-creatures.ts';

import type { AbstractMesh, Mesh, PBRMaterial, PointLight, Scene } from '@babylonjs/core';
import type { Point3 } from '../../../content/level-geometry.ts';
import type { BoxFactory, MaterialFactory } from './chapter-geometry.ts';
import type { Checkpoint, Position } from '../../../game/chapter/chapter-progress.ts';
import type { createEnvironment } from './chapter-scenery.ts';

interface LampSpec {
  name: string;
  zone: string;
  position: Point3;
  inward?: number;
  yaw?: number;
  kind?: 'candle' | 'lantern' | 'torch';
  color: string;
  intensity: number;
  range: number;
}
export interface ChapterWorldOptions {
  box: BoxFactory;
  material: MaterialFactory;
  wood: PBRMaterial;
  brass: PBRMaterial;
  environment: Pick<ReturnType<typeof createEnvironment>, 'placeZone' | 'get' | 'parts'>;
  wallLamps: { place(spec: LampSpec): PointLight };
  onDamage?(amount: number): void;
  readHealth?(): number;
}
type Plaque = { mesh: Mesh; update(text: string): void; value?: number };
type Sign = (
  name: string,
  text: string,
  position: Point3,
  width?: number,
  height?: number,
  yaw?: number,
  zone?: string,
) => Plaque;

function runeLabel(index: number, symbol: number) {
  return chapterWorldText('sign.rune', {
    position: runePositions[index]!,
    symbol: SYMBOLS[symbol]!,
  });
}

// These are the concrete rooms and moving props of chapter one.
export function createChapterWorld(
  scene: Scene,
  { box, material, wood, brass, environment, wallLamps, onDamage, readHealth }: ChapterWorldOptions,
) {
  const sign = createPlaqueFactory(scene, material) as Sign;
  const corridor = environment.placeZone('corridor');
  for (const fixture of corridor.filter(({ wallFixture }) => wallFixture)) {
    const [x, , z] = fixture.position!;
    const side = Math.sign(10.3 - z);
    wallLamps.place({
      name: `${fixture.id} wall torch`,
      zone: 'corridor',
      position: [x, 2.4, z + side * 0.095],
      inward: -side,
      yaw: Math.PI / 2,
      kind: 'torch',
      color: '#ffd39b',
      intensity: 3.1,
      range: 3.65,
    });
  }
  sign(
    'north corridor plaque',
    chapterWorldText('sign.corridor'),
    [1.6, 2.5, 10.3],
    1.8,
    0.48,
    Math.PI / 2,
    'corridor',
  );
  // Reliefs match the three positions on the plinths, rather than a HUD answer.
  const mural = new TransformNode('three-panel mural', scene);
  mural.position.set(3.6, 1.5, 12.24);
  const reliefMat = material('worn mural brass', '#a18e6a');
  for (let i = 0; i < 3; i++) {
    const slab = box('mural slab', [0, 0, 0], [0.55, 0.95, 0.08], wood);
    slab.parent = mural;
    slab.position.set((i - 1) * 0.6, 0, 0);
    const mark = box(
      ['lamp relief', 'quill relief', 'wave relief'][i]!,
      [0, 0, 0],
      [i === 1 ? 0.05 : 0.3, i === 0 ? 0.32 : 0.045, 0.04],
      reliefMat,
    );
    mark.parent = mural;
    mark.position.set((i - 1) * 0.6, 0, -0.06);
    if (i === 1) mark.rotation.z = -0.35;
  }
  const muralLabel = sign(
    'mural clue plaque',
    chapterWorldText('sign.mural'),
    [3.6, 2.3, 12.22],
    1.7,
    0.32,
    0,
    'corridor',
  );
  const runeLabels: Plaque[] = [];
  for (const [i, plinth] of corridor.filter(({ prefab }) => prefab === 'rune-plinth').entries()) {
    const [x, , z] = plinth.position!;
    runeLabels.push(
      sign(
        `rune ${i} plaque`,
        runeLabel(i, 2),
        [x - 0.29, 1.12, z],
        0.9,
        0.27,
        Math.PI / 2,
        'corridor',
      ),
    );
  }
  sign(
    'seal gate inscription',
    chapterWorldText('sign.seal'),
    [11.55, 2.6, 10.3],
    2.8,
    0.35,
    Math.PI / 2,
    'corridor',
  );
  box('shadow ward line', [8.1, 0.006, 10.3], [0.045, 0.012, 3.8], brass);
  sign(
    'ward line plaque',
    chapterWorldText('sign.ward'),
    [9.5, 2.9, 10.3],
    2.8,
    0.32,
    Math.PI / 2,
    'corridor',
  );
  const vaultDoor = environment.get('vault-gate')!;
  const vault = environment.placeZone('vault');
  const ledger = box(
    'Ian signature register',
    [15.65, 1.2, 10.3],
    [0.45, 0.08, 0.7],
    material('register paper', '#d2c3a2'),
  );
  ledger.metadata = { lightingZone: 'vault' };
  const ledgerLabel = sign(
    'signature register plaque',
    chapterWorldText('sign.register'),
    [15.81, 1.65, 10.3],
    1.7,
    0.32,
    Math.PI / 2,
    'vault',
  );
  sign(
    'east return plaque',
    chapterWorldText('sign.latch'),
    [15.4, 2.35, 7.45],
    1.7,
    0.32,
    Math.PI,
    'vault',
  );
  wallLamps.place({
    name: 'register desk wax candle',
    zone: 'vault',
    kind: 'candle',
    position: [15.49, 1.14, 9.65],
    color: '#ffd3a0',
    intensity: 1.55,
    range: 2.75,
  });
  environment.placeZone('shortcut');
  const shortcut = environment.get('vault-shortcut-door')!;
  const readingShortcut = environment.get('reading-shortcut-door')!;
  const closedDoorY = [vaultDoor, shortcut, readingShortcut].map((mesh) => mesh.position.y);
  wallLamps.place({
    name: 'vault return torch',
    zone: 'shortcut',
    position: [8.93, 2.4, 6.4],
    inward: 1,
    yaw: Math.PI / 2,
    kind: 'torch',
    color: '#ffd39b',
    intensity: 2.65,
    range: 3.7,
  });
  sign(
    'return route plaque',
    chapterWorldText('sign.shortcut'),
    [9.82, 2.65, 5.4],
    1.7,
    0.34,
    -Math.PI / 2,
    'shortcut',
  );
  const shadow = new TransformNode('ink shadow', scene);
  const route = new BotRoute(),
    attack = new BotAttack('melee', 0.8);
  function shadowArea(placements: Placement[], bounds: GroundRect) {
    const solids = placements
      .filter((p) => p.position)
      .flatMap((p) => environment.parts(p.id))
      .filter((mesh) => mesh.checkCollisions);
    return { map: new BotNavigation(bounds, botObstacles(solids), 0.3), solids };
  }
  // The seal keeps the corridor shadow west of x=7.4, including during a detour.
  const corridorArea = shadowArea(corridor, { minX: 4, maxX: 7.7, minZ: 8.3, maxZ: 12.3 });
  const vaultArea = shadowArea(vault, { minX: 12.05, maxX: 18.2, minZ: 7.3, maxZ: 13.3 });
  function moveTo(x: number, z: number, area: ReturnType<typeof shadowArea>) {
    const start = area.map.destination({ x, z });
    shadow.position.set(start.x, 0, start.z);
    route.reset();
    attack.reset();
  }
  let poseInk: Awaited<ReturnType<typeof loadInkApparition>>['pose'] | undefined;
  let health = 100,
    stun = 0,
    phaseBefore = 0,
    hits = 0,
    gate = 0,
    shortcutLevel = 0;
  moveTo(7.3, 9.15, corridorArea);
  shadow.setEnabled(false);
  function door(mesh: Mesh, open: boolean, y: number) {
    mesh.position.y = y;
    mesh.checkCollisions = !open;
    mesh.isPickable = !open;
    mesh.setEnabled(!open);
  }
  return {
    sign,
    movingColliders: [vaultDoor, shortcut, readingShortcut],
    interactionMeshes: new Map<string, AbstractMesh[]>([
      ['mural', [...mural.getChildMeshes(), muralLabel.mesh]],
      ...runeLabels.map<[string, AbstractMesh[]]>(({ mesh }, i) => [
        `rune${i}`,
        [environment.get(`corridor-rune-${i + 1}`)!, mesh],
      ]),
      ['seal', [vaultDoor]],
      ['ledger', [ledger, ledgerLabel.mesh]],
      ['shortcut', [shortcut]],
    ]),
    async load() {
      ({ pose: poseInk } = await loadInkApparition(scene, shadow));
    },
    reset() {
      health = 100;
      stun = 0;
      hits = 0;
      moveTo(7.3, 9.15, corridorArea);
      phaseBefore = 0;
    },
    hit(mesh: AbstractMesh | null | undefined, seconds: number) {
      if (mesh?.metadata?.inkThreat) {
        stun = Math.max(stun, seconds);
        hits++;
        return true;
      }
      return false;
    },
    update(dt: number, state: Pick<Checkpoint, 'phase' | 'runes'>, player: Position) {
      const phase = state.phase;
      stun = Math.max(0, stun - dt);
      for (const i of [0, 1, 2] as const) {
        const label = runeLabels[i]!,
          value = state.runes[i];
        if (label.value !== value) {
          label.update(runeLabel(i, value));
          label.value = value;
        }
      }
      gate += (Number(phase >= 2) - gate) * Math.min(1, dt * 4);
      shortcutLevel += (Number(phase >= 4) - shortcutLevel) * Math.min(1, dt * 4);
      door(vaultDoor, phase >= 2 && gate > 0.98, closedDoorY[0]! + gate * 3.4);
      door(shortcut, phase >= 4 && shortcutLevel > 0.98, closedDoorY[1]! + shortcutLevel * 3.4);
      door(
        readingShortcut,
        phase >= 4 && shortcutLevel > 0.98,
        closedDoorY[2]! + shortcutLevel * 3.4,
      );
      if (phaseBefore < 3 && phase === 3) {
        moveTo(13.8, 11.8, vaultArea);
        stun = 2.8;
      }
      phaseBefore = phase;
      const active =
        (phase === 1 && player.x > 4.3 && player.x < 11.3 && Math.abs(player.z - 10.3) < 2.05) ||
        (phase === 3 && player.x > 12.3 && player.x < 18.4 && Math.abs(player.z - 10.3) < 3.12);
      shadow.setEnabled(active);
      if (active) {
        const area = phase === 1 ? corridorArea : vaultArea;
        const delta = new Vector3(player.x - shadow.position.x, 0, player.z - shadow.position.z),
          distance = delta.length();
        const contact = distance < 0.82 && Math.abs(player.y - 0.86) < 1.5;
        const ray =
          contact && distance > 0.001
            ? new Ray(
                shadow.position.add(new Vector3(0, 0.7, 0)),
                delta.scale(1 / distance),
                distance,
              )
            : null;
        const exposed =
          contact && (!ray || !area.solids.some((mesh) => ray.intersectsMesh(mesh, true).hit));
        const impact = attack.advance(dt, exposed, stun > 0);
        const { x, z } = shadow.position;
        const pace = exposed ? Math.max(0, Math.min(dt * 0.9, distance - 0.6)) : dt * 0.9;
        const moved =
          stun === 0 && !attack.busy && route.advance(area.map, shadow.position, player, pace);
        const dx = moved ? shadow.position.x - x : player.x - shadow.position.x;
        const dz = moved ? shadow.position.z - z : player.z - shadow.position.z;
        if (dx || dz) shadow.rotation.y = Math.atan2(dx, dz) + Math.PI;
        poseInk?.(dt, stun > 0, moved && dt ? moved / dt : 0, attack.pose());
        if (impact) {
          if (onDamage) onDamage(36);
          else health = Math.max(0, health - 36);
        }
      } else {
        if (attack.busy) attack.reset();
        if (!onDamage) health = Math.min(100, health + dt * 12);
      }
      if (readHealth) health = readHealth();
      return health <= 0;
    },
    dangerLabel() {
      if (!shadow.isEnabled()) return '';
      return stun > 0
        ? chapterWorldText('shadow.stunned')
        : chapterWorldText('shadow.active', { health: Math.ceil(health) });
    },
    snapshot: () => ({
      health,
      stun,
      hits,
      active: shadow.isEnabled(),
      attack: attack.pose(),
      shadow: shadow.position.asArray(),
      vaultOpen: !vaultDoor.checkCollisions,
      shortcutOpen: !shortcut.checkCollisions,
      readingShortcutOpen: !readingShortcut.checkCollisions,
    }),
  };
}
