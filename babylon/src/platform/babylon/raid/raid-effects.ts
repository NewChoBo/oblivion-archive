import { appearance } from './hero-appearance.ts';
import { raidProjectileProfile } from '../../../game/raid/heroes/hero-catalog.ts';
import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  Vector3,
  type LinesMesh,
  type Scene,
} from '@babylonjs/core';
import {
  HERO_IDS,
  raidAimKind,
  raidGroundPointAfter,
  type RaidAction,
  type RaidHero,
  type RaidView,
} from '../../../game/raid/raid-match.ts';
import { raidColors } from './raid-material.ts';

const lifetime = (cue: RaidAction) =>
  cue.skill !== 'basic' && raidAimKind(cue.hero, cue.skill) === 'field'
    ? 36
    : cue.skill === 3
      ? 28
      : cue.skill === 'basic'
        ? 10
        : 18;
const tau = Math.PI * 2;

/** Effects sample match ticks, so pausing, catching up and starting a rematch have no independent timers. */
export function createRaidEffects(scene: Scene) {
  const materials = new Map<RaidHero, { sigil: StandardMaterial; light: StandardMaterial }>();
  for (const hero of HERO_IDS) {
    const color = Color3.FromHexString(raidColors[hero]);
    const light = new StandardMaterial(hero + ' impact light', scene);
    light.disableLighting = true;
    light.emissiveColor = color;
    const sigil = light.clone(hero + ' particle ink')!;
    const mask = new Texture('./assets/raid/' + appearance[hero].sprite + '.png', scene);
    // The artist's PNGs store intensity in RGB on an opaque black background.
    mask.getAlphaFromRGB = true;
    sigil.opacityTexture = mask;
    sigil.backFaceCulling = false;
    sigil.disableDepthWrite = true;
    materials.set(hero, { sigil, light });
  }
  function allocate() {
    const stamp = MeshBuilder.CreatePlane('raid ground sigil', { size: 1 }, scene);
    stamp.rotation.x = Math.PI / 2;
    const flare = MeshBuilder.CreatePlane('raid impact flash', { size: 1 }, scene);
    flare.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const ring = MeshBuilder.CreateTorus(
      'raid impact rim',
      { diameter: 2, thickness: 0.037, tessellation: 40 },
      scene,
    );
    const shards = Array.from({ length: 6 }, () =>
      MeshBuilder.CreateCylinder(
        'raid tracer',
        {
          diameterTop: 0,
          diameterBottom: 0.13,
          height: 1,
          tessellation: 4,
        },
        scene,
      ),
    );
    let sector: LinesMesh | undefined;
    let sectorAngle: number | undefined;
    const parts = [stamp, flare, ring, ...shards];
    function hide() {
      for (const part of parts) part.setEnabled(false);
      sector?.setEnabled(false);
    }
    for (const part of parts) part.isPickable = false;
    hide();
    function draw(cue: RaidAction, age: number) {
      const { hero, skill } = cue;
      const art = appearance[hero];
      const kind = skill === 'basic' ? null : raidAimKind(hero, skill);
      const roadMotion = cue.phase === 'dash' || cue.phase === 'spin';
      const from = roadMotion ? raidGroundPointAfter(cue.from, age) : cue.from;
      const to =
        roadMotion || kind === 'field' || kind === 'leap'
          ? raidGroundPointAfter(cue.to, age)
          : cue.to;
      const t = age / lifetime(cue);
      const { sigil, light } = materials.get(hero)!;
      const area = kind === 'field' || kind === 'leap' || kind === 'pulse';
      const healing = kind === 'ward';
      const impactTime = area || healing || art.particles === 'heavy' ? 0 : 0.48;
      const burst = Math.max(0, (t - impactTime) / (1 - impactTime));
      const strength = skill === 3 ? 1.75 : skill === 'basic' ? 0.65 : 1;
      const radius = cue.footprint?.radius ?? strength;
      const halfAngle = cue.footprint?.halfAngle;
      const ringSize = radius * Math.min(1, 0.18 + burst * 4);
      const fade = Math.min(1, (1 - t) * 4);
      const angle = tau * t;
      stamp.setEnabled(halfAngle === undefined && (area || skill === 3));
      stamp.material = flare.material = sigil;
      stamp.position.set(to.x, 0.08, to.z);
      stamp.rotation.y = art.particles === 'vortex' ? angle : cue.slot * 0.7;
      stamp.scaling.setAll(2 * ringSize * fade);
      ring.material = light;
      ring.setEnabled(halfAngle === undefined && (area || healing || skill === 3));
      if (halfAngle !== undefined) {
        if (!sector || sectorAngle !== halfAngle) {
          sector?.dispose();
          const points = Array.from({ length: 33 }, (_, i) => {
            const angle = halfAngle * (i / 16 - 1);
            return new Vector3(Math.sin(angle), 0, Math.cos(angle));
          });
          sector = MeshBuilder.CreateLines(
            'skill sector rim',
            { points: [Vector3.Zero(), ...points, Vector3.Zero()] },
            scene,
          );
          sector.isPickable = false;
          sectorAngle = halfAngle;
        }
        sector.color = light.emissiveColor;
        sector.position.set(from.x, 0.1, from.z);
        sector.scaling.setAll(ringSize * fade);
        sector.setEnabled(true);
      } else sector?.setEnabled(false);
      ring.position.set(to.x, healing ? 0.25 + t * 1.6 : 0.1 + 0.04 * Math.sin(angle), to.z);
      ring.scaling.set(ringSize * fade, 1, ringSize * fade);
      flare.setEnabled(true);
      const travel = impactTime ? Math.min(1, t / impactTime) : 1;
      const x = from.x + (to.x - from.x) * travel;
      const z = from.z + (to.z - from.z) * travel;
      const y = cue.fromY + (cue.toY - cue.fromY) * travel;
      flare.position.set(x, area ? 0.4 : y, z);
      flare.scaling.setAll((0.5 + Math.sin(Math.PI * t) * 1.8) * strength * fade);
      for (const [i, shard] of shards.entries()) {
        const a = (tau * i) / shards.length + cue.slot;
        const phase = (age / 15 + i * 0.19) % 1;
        shard.material = light;
        shard.setEnabled(true);
        if (art.particles === 'arrows' && skill === 2) {
          const spread = radius * (i % 2 ? 0.42 : 0.76);
          shard.position.set(
            to.x + Math.cos(a) * spread,
            0.2 + (1 - phase) * 3.4,
            to.z + Math.sin(a) * spread - (1 - phase),
          );
          shard.rotation.set(Math.PI - 0.27, 0, 0);
          shard.scaling.set(0.75, 0.85, 0.75).scaleInPlace(fade);
        } else if (art.particles === 'arrows' && !area && travel < 1) {
          shard.setEnabled(i === 0);
          shard.position.set(x, y, z);
          shard.rotation.set(Math.PI / 2, Math.atan2(to.x - from.x, to.z - from.z), 0);
          shard.scaling.set(1.2, 1.48 * strength, 1.2);
        } else {
          const spiral = art.particles === 'vortex' || art.particles === 'spiral';
          const sweep =
            halfAngle === undefined
              ? a + (spiral ? angle : 0)
              : Math.PI / 2 + halfAngle * ((2 * i) / (shards.length - 1) - 1);
          const spread = (area ? ringSize * 0.78 : 0.65 * strength) * (0.25 + t * 0.75);
          shard.position.set(
            x + Math.cos(sweep) * spread,
            (area ? 0.13 : y) + (spiral ? phase : Math.sin(Math.PI * t)) * strength,
            z + Math.sin(sweep) * spread,
          );
          shard.rotation.set(0, -sweep, art.particles === 'heavy' ? -1.2 : -0.48);
          shard.scaling.set(strength, (area ? 0.72 : 0.39) * strength, strength).scaleInPlace(fade);
        }
      }
    }
    return { draw, hide };
  }
  const active = new Map<number, ReturnType<typeof allocate>>();
  const pool: ReturnType<typeof allocate>[] = [];
  const bolts: Mesh[] = [];
  const crossBlades: Mesh[] = [];
  let match: RaidView | undefined;
  return (view: RaidView, subtick: number) => {
    const now = view.tick + subtick;
    for (let i = 0; i < Math.max(bolts.length, view.projectiles.length); i++) {
      const p = view.projectiles[i];
      if (!p) {
        bolts[i]!.setEnabled(false);
        crossBlades[i]?.setEnabled(false);
        continue;
      }
      const bolt = (bolts[i] ??= MeshBuilder.CreateSphere(
        'raid projectile',
        { diameter: 1, segments: 8 },
        scene,
      ));
      bolt.isPickable = false;
      bolt.setEnabled(true);
      const advance = Math.min(p.remaining, p.metersPerTick * subtick);
      const form = appearance[p.hero].projectile?.[p.skill];
      const crescent = form === 'horizontal';
      bolt.position.set(p.x + p.dx * advance, crescent ? 0.36 : 1, p.z + p.dz * advance);
      bolt.rotation.y = Math.atan2(p.dx, p.dz);
      bolt.scaling.set(0.14, 0.14, p.skill === 3 ? 1.25 : 0.78);
      if (crescent || form === 'cross') bolt.scaling.set(2.35, 0.1, 0.38);
      if (form === 'upright') bolt.scaling.set(0.16, 1.85, 0.46);
      bolt.material = materials.get(p.hero)!.light;
      if (form === 'cross') {
        const upright = (crossBlades[i] ??= MeshBuilder.CreateSphere(
          'cross slash upright',
          { diameter: 1, segments: 8 },
          scene,
        ));
        upright.isPickable = false;
        upright.setEnabled(true);
        upright.position.copyFrom(bolt.position);
        upright.rotation.y = bolt.rotation.y;
        upright.scaling.set(0.11, 1.95, 0.38);
        upright.material = bolt.material;
      } else crossBlades[i]?.setEnabled(false);
    }
    const visible = view.actions.filter(
      (cue) =>
        now - cue.tick < lifetime(cue) &&
        !(
          cue.skill !== 'basic' &&
          appearance[cue.hero].spinClip === (['pulse', 'bolt', 'field', 'fury'] as const)[cue.skill]
        ) &&
        !(cue.phase === 'dash' && appearance[cue.hero].dashClip) &&
        (cue.skill === 'basic' || !raidProjectileProfile(cue.hero, cue.skill)),
    );
    for (const [id, fx] of active) {
      if (match === view && visible.some((cue) => cue.id === id)) continue;
      fx.hide();
      pool.push(fx);
      active.delete(id);
    }
    match = view;
    for (const cue of visible) {
      const fx = active.get(cue.id) ?? pool.pop() ?? allocate();
      active.set(cue.id, fx);
      fx.draw(cue, now - cue.tick);
    }
  };
}
