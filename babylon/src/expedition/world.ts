import { expeditionWorldText } from '../content/locales/expedition-world.ts';
import {
  Color3,
  HemisphericLight,
  ImportMeshAsync,
  MeshBuilder,
  Ray,
  TransformNode,
  Vector3,
  type Scene,
  type AbstractMesh,
  type Material,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization.js';
import { loadInkApparition } from '../platform/babylon/chapter/chapter-creatures.ts';
import { EXPERIENCE_LEVELS, type LevelId } from '../content/catalogs/experiences.ts';
import { HUMANOID_METRICS } from '../content/catalogs/humanoids.ts';
import { experienceText } from '../content/locales/experience.ts';
import { instantiateHumanoid } from '../platform/babylon/actors/sample-humanoid.ts';
import { MiraMotion } from '../platform/babylon/actors/ally-motion.ts';
import {
  createArenaObjectives,
  type ExpeditionTarget,
  type InteractionTarget,
} from '../platform/babylon/arena/arena-objectives.ts';
import { createEnemyHealthBar } from './enemy-health-bar.ts';
import { QUARRY_ENEMY_HEALTH } from './state.ts';
import type { HitRegion } from '../game/combat/hit-region.ts';

import { BotNavigation, BotRoute, footprint, type GroundPoint } from '../game/ai/bot-navigation.ts';
import { BotAttack, type BotAttackPose } from '../game/ai/bot-attack.ts';
import { createHumanoidBotPose } from '../platform/babylon/actors/bot-pose.ts';
import { botObstacles } from '../platform/babylon/actors/bot-obstacles.ts';
import type {
  createPlaqueFactory,
  MaterialFactory,
  Point3,
} from '../platform/babylon/chapter/plaque.ts';
import type { ExperienceMatch } from '../game/experiences/experience-match.ts';

type Level = (typeof EXPERIENCE_LEVELS)[LevelId];
type Ward = Level['wards'][number];
type Sign = ReturnType<typeof createPlaqueFactory>;
type CacheLabel = ReturnType<Sign> & { opened?: boolean };
type ActorPosition = Pick<Vector3, 'x' | 'y' | 'z'>;
type EnemyHit = { killed: boolean; damage: number } | null;

interface ExpeditionState {
  readonly area: string;
  readonly visit: number;
  hasClaimed(id: string): boolean;
  enemyHealth(index: number): number;
  claim(id: string): boolean;
  talk(): string;
  enter(): boolean;
  leave(): void;
  hitPractice(index: number, damage: number, region: HitRegion): EnemyHit;
  hit(index: number, weapon: 'bow' | 'wand', power: number, region: HitRegion): EnemyHit;
  damage(amount: number): { health: number; absorbed: number };
}

interface EnemyHumanoid {
  joints: ReadonlyMap<string, TransformNode>;
  update(speed: number, backward: boolean, dt: number): void;
}

interface Enemy {
  index: number;
  root: TransformNode;
  spawn: Point3;
  pose:
    | ((stunned: boolean, speed: number, dt: number, attack: BotAttackPose, aim: Vector3) => void)
    | null;
  attack: BotAttack;
  route: BotRoute;
  muzzle?: Vector3;
  stun: number;
  setHealth?: (health: number) => void;
}

interface ExpeditionWorldOptions {
  state: ExpeditionState;
  box(
    name: string,
    position: Point3,
    size: Point3,
    material: Material,
    solid?: boolean,
  ): AbstractMesh;
  material: MaterialFactory;
  materials: { rampartStone: Material; rampartFloor: Material; rampartTrim: Material };
  environment: { parts(id: string): AbstractMesh[] } | null;
  sign: Sign;
  interactionMeshes: Map<string, AbstractMesh[]>;
  storagePosition: Point3;
  notify(message: string): void;
  navigate(next: { intent: 'expedition' | 'return' }): void;
  openStorage(): void;
  onEnemyDefeated(): void;
  onHeadshot(): void;
  onEnemyFire?(start: Vector3, end: Vector3): void;
  levelId?: LevelId | null;
  practice?: ExperienceMatch['kind'];
  tacticalMatch?: Pick<ExperienceMatch, 'bombSite' | 'escorting' | 'phase' | 'loseHostage'>;
}

export const DUNGEON_SPAWN: [number, number, number] = [0, 0.86, -6],
  CHAPTER_RETURN: [number, number, number] = [-4.5, 0.86, -1.1];
export function createExpeditionWorld(
  scene: Scene,
  {
    state,
    box,
    material,
    materials,
    environment,
    sign,
    interactionMeshes,
    storagePosition,
    notify,
    navigate,
    openStorage,
    onEnemyDefeated,
    onHeadshot,
    onEnemyFire,
    levelId,
    practice,
    tacticalMatch,
  }: ExpeditionWorldOptions,
) {
  const targets: ExpeditionTarget[] = [],
    enemies: Enemy[] = [];
  const level = levelId ? EXPERIENCE_LEVELS[levelId] : null;
  const tacticalLevel = level && 'objectives' in level ? level : null;
  const humanoidEnemies = level && 'enemyKind' in level && level.enemyKind === 'humanoid';
  let activeVisit = -1;
  let activeWard: Ward | null = null;
  const stone = materials.rampartStone;
  const brass = material('portal rim brass', '#a78451');
  brass.metallic = 0.65;
  const glow = material('quarry portal glow', '#397c81');
  glow.emissiveColor = new Color3(0.12, 0.45, 0.47);
  function target(
    id: string,
    position: Point3,
    meshes: AbstractMesh[],
    action: string,
    range = 1.9,
  ) {
    const entry: InteractionTarget = { id, position, range, action, expedition: true };
    targets.push(entry);
    interactionMeshes.set(id, meshes);
    return entry;
  }
  const caches: [id: string, parts: AbstractMesh[], label: CacheLabel][] = [];
  let npc: { root: TransformNode; sign: ReturnType<Sign> } | undefined;
  let mira: MiraMotion | undefined;
  function portal(id: 'enter-quarry' | 'leave-quarry', x: number, z: number) {
    const ring = MeshBuilder.CreateTorus(
      `${id} ring`,
      { diameter: 1.75, thickness: 0.11, tessellation: 48 },
      scene,
    );
    ring.position.set(x, 1.1, z);
    ring.rotation.x = Math.PI / 2;
    ring.material = brass;
    const membrane = MeshBuilder.CreateDisc(
      `${id} membrane`,
      { radius: 0.76, tessellation: 48, sideOrientation: 2 },
      scene,
    );
    membrane.position.set(x, 1.1, z);
    membrane.material = glow;
    const plaque = sign(
      `${id} plaque`,
      expeditionWorldText(
        id === 'enter-quarry' ? 'expedition.portal.readingSign' : 'expedition.portal.quarrySign',
      ),
      [x, 2.23, z],
      2.1,
      0.3,
    );
    const parts = [ring, membrane, plaque.mesh];
    target(
      id,
      [x, 0, z],
      parts,
      id === 'enter-quarry'
        ? expeditionWorldText('expedition.portal.enter')
        : expeditionWorldText('expedition.portal.leave'),
      2.35,
    );
  }
  if (!level) {
    if (!environment) throw new Error('Reading room environment missing');
    const supplyParts = environment.parts('reading-chest-west'),
      storageParts = environment.parts('reading-chest-east');
    target(
      'reading-supply',
      [-2.67, 0, -5.35],
      supplyParts,
      expeditionWorldText('expedition.cache.readingAction'),
    );
    target(
      'gear-storage',
      storagePosition,
      storageParts,
      expeditionWorldText('expedition.storage.action'),
    );
    caches.push([
      'reading-supply',
      supplyParts,
      sign(
        'supply chest plaque',
        expeditionWorldText('expedition.cache.readingSign'),
        [-2.67, 1.04, -5.35],
        1.45,
        0.25,
      ),
    ]);
    const [x, y, z] = storagePosition;
    sign(
      'gear storage plaque',
      expeditionWorldText('expedition.storage.sign'),
      [x, y + 1.04, z],
      1.7,
      0.25,
    );
    const root = new TransformNode('apprentice scribe Mira', scene);
    const plinthHeight = 0.05;
    root.position.set(-4.5, plinthHeight, -2.5);
    root.rotation.y = -0.4;
    const base = box(
      'Mira plinth',
      [-4.5, plinthHeight / 2, -2.5],
      [0.8, plinthHeight, 0.8],
      brass,
    );
    const npcSign = sign(
      'Mira nameplate',
      expeditionWorldText('expedition.mira.sign'),
      [-4.5, root.position.y + HUMANOID_METRICS.ally.height + 0.25, -2.5],
      1.8,
      0.28,
    );
    npc = { root, sign: npcSign };
    target(
      'guide-mira',
      [-4.5, 0, -2.5],
      [base, npcSign.mesh],
      expeditionWorldText('expedition.mira.action'),
      2.25,
    );
    portal('enter-quarry', -4.5, 0.5);
  } else if (!practice) {
    if (!environment) throw new Error('Quarry environment missing');
    portal('leave-quarry', 0, -8);
    sign(
      'quarry guide plaque',
      expeditionWorldText('expedition.quarry.sign'),
      [0, 2.9, 10.75],
      5,
      0.42,
    );
    const fieldParts = environment.parts('field-cache');
    target(
      'field-cache',
      [4.63, 0, 8.8],
      fieldParts,
      expeditionWorldText('expedition.cache.fieldAction'),
    );
    caches.push([
      'field-cache',
      fieldParts,
      sign(
        'field cache plaque',
        expeditionWorldText('expedition.cache.fieldSign'),
        [4.63, 1.02, 8.8],
        1.8,
        0.25,
      ),
    ]);
  }
  function buildWard(ward: Ward) {
    const [x, y, z] = ward.position;
    const label = experienceText(ward.id);
    box(`${ward.id} stone plinth`, [x, y + 0.24, z], [0.78, 0.48, 0.78], stone);
    box(`${ward.id} brass plate`, [x, y + 0.5, z], [0.8, 0.09, 0.8], brass);
    const rune = MeshBuilder.CreateTorus(
      `${ward.id} rune`,
      { diameter: 0.59, thickness: 0.055, tessellation: 28 },
      scene,
    );
    rune.position.set(x, y + 0.64, z);
    rune.material = brass;
    sign(`${ward.id} plaque`, label, [x, y + 1.08, z], 1.2, 0.21, 0);
    targets.push({
      id: ward.id,
      position: ward.position,
      range: 2.4,
      action: experienceText('ward.activate', { ward: label }),
      expedition: true,
      levelId,
    });
    return { ward, rune };
  }
  const cover: AbstractMesh[] = [],
    walls: AbstractMesh[] = [];
  if (level && levelId) {
    const floor = box(
      `${levelId} floor`,
      level.floor.position,
      level.floor.size,
      materials.rampartFloor,
      true,
    );
    for (const [name, position, size, modelSurface] of level.walls) {
      const wall = box(`${levelId} ${name}`, position, size, stone, true);
      walls.push(wall);
      if (modelSurface) wall.isVisible = false;
    }
    for (const [name, position, size] of level.cover)
      cover.push(box(`${levelId} ${name}`, position, size, stone, true));
    if ('model' in level && level.model)
      for (const collider of [floor, ...cover]) collider.isVisible = false;
    if (levelId === 'ink-quarry')
      for (const x of [-7.7, 7.7])
        for (const z of [-5, 1, 7]) {
          box('quarry wall buttress', [x, 1.9, z], [0.6, 3.8, 0.7], materials.rampartTrim);
          box('buttress brass band', [x, 2.5, z], [0.63, 0.12, 0.73], brass);
        }
  }
  const blockers = [...walls, ...cover];
  if (level && !practice && environment) {
    blockers.push(...environment.parts('field-cache').filter((mesh) => mesh.checkCollisions));
  }
  const navigation =
    level &&
    new BotNavigation(
      footprint(
        level.floor.position[0],
        level.floor.position[2],
        level.floor.size[0],
        level.floor.size[2],
      ),
      [
        ...botObstacles(blockers, humanoidEnemies ? HUMANOID_METRICS.enemy.height : undefined),
        ...(practice === 'ward'
          ? level.wards.map(({ position: [x, , z] }) => footprint(x, z, 0.8, 0.8))
          : []),
      ],
    );
  const escortRoute = new BotRoute();
  const objectives =
    tacticalMatch && tacticalLevel && navigation
      ? createArenaObjectives(scene, {
          level: tacticalLevel,
          match: tacticalMatch,
          kind: practice,
          material,
          sign,
          cover,
          targets,
          moveEscort: (position, target, pace) =>
            escortRoute.advance(navigation, position, target, pace) > 0,
        })
      : null;
  const wardSites = practice === 'ward' && level ? level.wards.map(buildWard) : [];
  for (const [index, spawn] of (level?.enemySpawns ?? []).entries()) {
    const root = new TransformNode(`${levelId} enemy ${index + 1}`, scene);
    root.position.set(spawn[0], spawn[1], spawn[2]);
    root.setEnabled(false);
    enemies.push({
      index,
      root,
      spawn,
      pose: null,
      stun: 0,
      route: new BotRoute(),
      attack: new BotAttack(
        tacticalMatch ? 'ranged' : 'melee',
        tacticalMatch ? 1.65 + index * 0.22 : 1.15,
      ),
    });
  }
  if (level) {
    const light = new HemisphericLight(
      'arena cool ambient fill',
      new Vector3(-0.3, 1, -0.2),
      scene,
    );
    light.intensity = 0.53;
    light.diffuse = new Color3(0.63, 0.73, 0.82);
    light.groundColor = new Color3(0.22, 0.21, 0.23);
  }
  function sync() {
    const inside = state.area === 'dungeon';
    for (const [id, parts, label] of caches) {
      const opened = state.hasClaimed(id);
      if (label.opened !== opened) {
        label.update(
          opened
            ? expeditionWorldText('expedition.cache.emptySign')
            : id === 'reading-supply'
              ? expeditionWorldText('expedition.cache.readingSign')
              : expeditionWorldText('expedition.cache.fieldSign'),
        );
        label.opened = opened;
        const lid = parts[1]!;
        lid.rotation.x = opened ? -0.48 : 0;
        lid.checkCollisions = !opened;
      }
    }
    // Routes, attack timers and stuns belong to a visit even when the enemy model is reused.
    if (activeVisit !== state.visit) {
      activeVisit = state.visit;
      for (const enemy of enemies) {
        enemy.root.position.set(...enemy.spawn);
        enemy.attack.reset(1.2);
        enemy.route.reset();
        enemy.stun = 0;
      }
    }
    for (const enemy of enemies) {
      const health = state.enemyHealth(enemy.index);
      enemy.setHealth?.(health);
      enemy.root.setEnabled(inside && health > 0);
    }
  }
  function exposed(from: Vector3, to: Vector3) {
    const aim = to.subtract(from),
      length = aim.length();
    if (length < 0.001) return true;
    const ray = new Ray(from, aim.scale(1 / length), length);
    return !blockers.some((mesh) => ray.intersectsMesh(mesh, true).hit);
  }
  async function loadArena() {
    const model = level && 'model' in level ? level.model : null;
    if (!model) return;
    const imported = await ImportMeshAsync(model.file, scene);
    const mount = new TransformNode('gothic arena model', scene);
    mount.position.set(...model.origin);
    mount.scaling.set(model.horizontalScale, 1, model.horizontalScale);
    const root = imported.meshes[0];
    if (!root) throw new Error('Arena model root missing');
    root.parent = mount;
    for (const node of imported.transformNodes) {
      const decorativePickup = /^(05[2-9])-/.test(node.name);
      if (decorativePickup) node.setEnabled(false);
    }
    for (const mesh of imported.meshes) {
      if (!mesh.getTotalVertices()) continue;
      mesh.receiveShadows = true;
    }
  }
  return {
    movingColliders: caches.map(([, parts]) => parts[1]!),
    mapPoints: { targets, enemies: enemies.map((enemy) => enemy.root) },
    resetRound() {
      activeWard = null;
      activeVisit = -1;
      escortRoute.reset();
      objectives?.reset();
      for (const { rune } of wardSites) rune.material = brass;
      sync();
    },
    useObjective(id: string) {
      objectives?.interacted(id);
    },
    advanceObjectives(
      dt: number,
      player: ActorPosition,
    ): { extracted?: boolean; defusing?: boolean } {
      return objectives?.tick(dt, player, enemies) ?? {};
    },
    activateWard(id: string) {
      for (const { ward, rune } of wardSites)
        if (ward.id === id) {
          activeWard = ward;
          rune.material = glow;
          break;
        }
    },
    wardContested() {
      if (!activeWard) return false;
      const {
        position: [x, , z],
        contestRadius,
      } = activeWard;
      return enemies.some(
        ({ root }) =>
          root.isEnabled() && Math.hypot(x - root.position.x, z - root.position.z) <= contestRadius,
      );
    },
    async load() {
      if (npc) {
        const ally = await instantiateHumanoid(scene, npc.root, 'ally');
        for (const mesh of ally.meshes) mesh.metadata = { ...mesh.metadata, expeditionNpc: true };
        interactionMeshes.set('guide-mira', [...ally.meshes, npc.sign.mesh]);
        mira = new MiraMotion(ally, npc.root);
      }
      await Promise.all([
        loadArena(),
        objectives?.load(),
        ...enemies.map(async (enemy) => {
          let barAnchor: TransformNode, barHeight: number;
          if (humanoidEnemies) {
            const actor: EnemyHumanoid = await instantiateHumanoid(scene, enemy.root, 'enemy');
            barAnchor = enemy.root;
            barHeight = HUMANOID_METRICS.enemy.height + 0.16;
            const overlay = createHumanoidBotPose(
              scene,
              enemy.root,
              actor.joints,
              Boolean(tacticalMatch),
            );
            enemy.pose = (stunned, speed, dt, attack, aim) => {
              actor.update(stunned ? 0 : speed, false, dt);
              overlay.update(attack, aim);
            };
            if (tacticalMatch) enemy.muzzle = overlay.muzzle;
          } else {
            const apparition = await loadInkApparition(scene, enemy.root);
            barAnchor = apparition.head;
            barHeight = 0.42;
            enemy.pose = (stunned, speed, dt, attack) =>
              apparition.pose(dt, stunned, speed, attack);
          }
          for (const mesh of enemy.root.getChildMeshes())
            mesh.metadata = { ...mesh.metadata, expeditionEnemy: enemy.index };
          enemy.setHealth = createEnemyHealthBar(
            scene,
            barAnchor,
            enemy.index,
            QUARRY_ENEMY_HEALTH,
            barHeight,
          );
        }),
      ]);
      sync();
    },
    inReach(player: ActorPosition) {
      return targets
        .filter(
          (entry): entry is InteractionTarget =>
            !entry.mapOnly &&
            (!entry.levelId || !activeWard) &&
            (objectives?.available(entry, player) ?? true) &&
            Math.abs(player.y - 0.86) < 1.6 &&
            Math.hypot(player.x - entry.position[0], player.z - entry.position[2]) <= entry.range,
        )
        .map((entry) =>
          entry.id.endsWith('cache') || entry.id === 'reading-supply'
            ? {
                ...entry,
                action: state.hasClaimed(entry.id)
                  ? expeditionWorldText('expedition.cache.emptyAction')
                  : entry.action,
              }
            : entry,
        );
    },
    use(id: string) {
      if (id === 'reading-supply' || id === 'field-cache') {
        notify(
          state.claim(id)
            ? expeditionWorldText('expedition.cache.claimed')
            : expeditionWorldText('expedition.cache.alreadyClaimed'),
        );
        sync();
      } else if (id === 'guide-mira') {
        mira?.talk();
        notify(state.talk());
      } else if (id === 'gear-storage') openStorage();
      else if (id === 'enter-quarry' && state.enter()) {
        navigate({ intent: 'expedition' });
      } else if (id === 'leave-quarry') {
        state.leave();
        navigate({ intent: 'return' });
      }
    },
    hit(
      mesh: AbstractMesh | null | undefined,
      event: { damage: number } | { id: 'blaster-a' | 'blaster-j'; bowPower?: number },
    ) {
      const metadata = mesh?.metadata;
      if (metadata?.arenaHostage) {
        if ('damage' in event && event.damage > 0) tacticalMatch?.loseHostage();
        return true;
      }
      const index: unknown = metadata?.expeditionEnemy;
      const enemy =
        typeof index === 'number' && Number.isInteger(index) ? enemies[index] : undefined;
      if (!enemy || metadata?.expeditionNpc || state.area !== 'dungeon') return false;
      const region = metadata.hitRegion === 'head' ? 'head' : 'body';
      const result =
        'damage' in event
          ? state.hitPractice(enemy.index, event.damage, region)
          : state.hit(
              enemy.index,
              event.id === 'blaster-j' ? 'bow' : 'wand',
              event.bowPower ?? 0,
              region,
            );
      if (!result) return true;
      enemy.stun = tacticalMatch?.phase === 'playing' ? 0.32 : 0.7;
      if (region === 'head') onHeadshot();
      if (result.killed) onEnemyDefeated();
      const outcome = result.killed
        ? practice
          ? experienceText('eliminated')
          : expeditionWorldText('expedition.combat.reward')
        : expeditionWorldText(
            humanoidEnemies ? 'expedition.combat.guardHit' : 'expedition.combat.wraithHit',
            { damage: result.damage },
          );
      notify(
        region === 'head'
          ? expeditionWorldText('expedition.combat.headshot', { outcome })
          : outcome,
      );
      sync();
      return true;
    },
    update(dt: number, player: ActorPosition, eye: ActorPosition) {
      mira?.update(dt);
      if (state.area !== 'dungeon' || !navigation) return;
      const bombSite =
        tacticalMatch?.bombSite &&
        tacticalLevel?.objectives.bombSites.find((site) => site.id === tacticalMatch.bombSite);
      const bomb = bombSite ? new Vector3(...bombSite.position) : null;
      for (const enemy of enemies) {
        if (state.enemyHealth(enemy.index) <= 0) continue;
        const stunned = enemy.stun > 0;
        enemy.stun = Math.max(0, enemy.stun - dt);
        const position = enemy.root.position;
        const distance = Math.hypot(player.x - position.x, player.z - position.z);
        const targetPoint = tacticalMatch ? eye : player;
        const aim = new Vector3(targetPoint.x, targetPoint.y, targetPoint.z);
        const origin = position.add(
          new Vector3(0, humanoidEnemies ? HUMANOID_METRICS.enemy.eyeHeight : 0.7, 0),
        );
        const safe = !practice && player.z <= -5.3;
        const ranged = Boolean(tacticalMatch);
        const visible =
          !safe &&
          distance < (ranged ? 6.2 : 1.22) &&
          (ranged || Math.abs(player.y - 0.86) < 1.5) &&
          exposed(origin, aim);
        const defuse = enemy.index === 0 ? bomb : null;
        const ward = distance > 2.7 ? activeWard : null;
        const target: GroundPoint =
          defuse ?? (ward ? { x: ward.position[0], z: ward.position[2] } : player);
        const approach = defuse
          ? Vector3.Distance(position, defuse) > 0.65
          : ward
            ? Math.hypot(target.x - position.x, target.z - position.z) > 0.8
            : ranged
              ? !visible || distance > 4.4
              : !safe && distance < 8 && (!visible || distance > 1.02);
        const impact = enemy.attack.advance(dt, Boolean(visible && !defuse), stunned);
        const oldX = position.x,
          oldZ = position.z;
        const destination = !practice
          ? { x: Math.max(-5.5, Math.min(5.4, target.x)), z: Math.max(-4.4, Math.min(9, target.z)) }
          : target;
        const moved =
          approach && !stunned && !enemy.attack.busy
            ? enemy.route.advance(navigation, position, destination, dt * 1.22)
            : 0;
        const dx = moved ? position.x - oldX : (defuse ? target : player).x - position.x;
        const dz = moved ? position.z - oldZ : (defuse ? target : player).z - position.z;
        // Humanoids face +Z at rest. The apparition asset faces the opposite direction.
        if (dx || dz) enemy.root.rotation.y = Math.atan2(dx, dz) + (humanoidEnemies ? 0 : Math.PI);
        enemy.pose?.(stunned, moved && dt ? moved / dt : 0, dt, enemy.attack.pose(), aim);
        if (!impact) continue;
        if (ranged) {
          const muzzle = enemy.muzzle ?? origin;
          if (!exposed(muzzle, aim)) continue;
          onEnemyFire?.(muzzle, aim);
          const damage = state.damage(12);
          notify(experienceText('enemy-hit', { damage: Math.round(damage.health) }));
        } else {
          const damage = state.damage(18);
          notify(
            expeditionWorldText('expedition.combat.inkHit', {
              damage: Math.round(damage.health),
              absorbed: Math.round(damage.absorbed),
            }),
          );
        }
      }
    },
    sync,
    snapshot: () => ({
      levelId,
      targets: targets.map(({ id, position, action }) => ({ id, position, action })),
      enemies: enemies.map((enemy) => ({
        index: enemy.index,
        position: enemy.root.position.asArray(),
        enabled: enemy.root.isEnabled(),
        stun: enemy.stun,
        attack: enemy.attack.pose(),
      })),
    }),
  };
}
