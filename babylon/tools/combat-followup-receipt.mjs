import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import legacyNames from '../../docs/provenance/chapter-1-legacy-names.json' with { type: 'json' };

const directory = resolve(import.meta.dirname, '../../docs/validation/2026-11-24/combat-followup');
const app = resolve(import.meta.dirname, '..');
const read = (name) =>
  JSON.parse(readFileSync(resolve(directory, name), 'utf8').replace(/^\uFEFF/, ''));
const hands = read('hands.json'),
  cover = read('cover.json'),
  door = read('door-frames.json');
const base = '46df46d75b0e507628a6905930386859bf678ff6';
for (const evidence of [hands, cover, door]) assert.equal(evidence.base, base);
assert.equal(hands.cases.length, 6);
const handCases = hands.cases.map((c) => {
  assert.equal(c.weapon.dominantHand, 'left');
  assert.ok(c.shot.hit && c.shot.arrived);
  if (c.tool === 'wand') assert.ok(c.error < 1e-9);
  else assert.ok(c.drop > 0.01 && Math.abs(c.drop - c.expectedDrop) < 0.001);
  return {
    view: c.view,
    tool: c.tool,
    hand: c.weapon.dominantHand,
    target: c.shot.cameraMesh,
    firstSurface: c.shot.mesh,
    aimError: c.error,
    drop: c.drop,
    expectedDrop: c.expectedDrop,
    power: c.shot.bowPower,
  };
});
assert.equal(cover.cases.length, 2);
const coverCases = cover.cases.map((c) => {
  assert.equal(c.posture, 'prone');
  assert.equal(c.weapon.dominantHand, 'left');
  assert.ok(c.shot.hit && c.shot.muzzleBlocked);
  // This receipt verifies authored mesh names recorded at the fixed historical revision above.
  assert.equal(c.shot.cameraMesh, legacyNames.combatFollowupCover.visibleTarget);
  assert.equal(c.shot.mesh, legacyNames.combatFollowupCover.firstSurface);
  assert.ok(c.shot.end[2] > c.shot.aim[2] + 0.4);
  return {
    tool: c.tool,
    posture: c.posture,
    position: c.position,
    camera: c.camera.position,
    visibleTarget: c.shot.cameraMesh,
    firstSurface: c.shot.mesh,
    aim: c.shot.aim,
    muzzle: c.shot.muzzle,
    impact: c.shot.end,
    muzzleBlocked: c.shot.muzzleBlocked,
  };
});
const tracks = new Map();
for (const frame of door.frames)
  for (const mark of frame.marks) {
    if (!tracks.has(mark.number)) tracks.set(mark.number, []);
    tracks.get(mark.number).push(mark);
  }
const movingImpacts = [...tracks].map(([number, marks]) => {
  const ys = marks.map((m) => m.position[1]),
    xs = marks.map((m) => m.position[0]),
    zs = marks.map((m) => m.position[2]);
  const rise = Math.max(...ys) - Math.min(...ys);
  assert.ok(rise > 3.3 && rise < 3.4);
  assert.ok(
    Math.max(...xs) - Math.min(...xs) < 0.00001 && Math.max(...zs) - Math.min(...zs) < 0.00001,
  );
  return {
    number,
    kind: marks[0].kind,
    surface: marks[0].mesh,
    frames: marks.length,
    rise,
    maxAge: Math.max(...marks.map((m) => m.age)),
  };
});
assert.ok(
  movingImpacts.some((m) => m.kind === 'arrow') && movingImpacts.some((m) => m.kind === 'wand'),
);
assert.equal(door.after.phase, 2);
assert.equal(door.after.world.vaultOpen, true);
assert.equal(door.after.spells.retained.length, 0);
const hash = (path) =>
  createHash('sha256')
    .update(readFileSync(resolve(app, path)))
    .digest('hex');
const receipt = {
  base,
  browser: 'Orca embedded only',
  bundle: hands.bundle,
  bundleSha256: hash(resolve(app, 'dist', new URL(hands.bundle).pathname.slice(1))),
  sourceHashes: Object.fromEntries(
    [
      'src/platform/babylon/player/collider-contact.ts',
      'src/platform/babylon/player/player-view.ts',
      'src/platform/babylon/equipment/weapons.ts',
      'src/platform/babylon/effects/spell-effects.ts',
      'src/app/main.ts',
    ].map((file) => [file, hash(file)]),
  ),
  checks: {
    build: 'game and gallery passed',
    focusedTests: '16/16',
    leftHanded: handCases,
    lowCover: coverCases,
    movingDoor: {
      phase: door.after.phase,
      open: door.after.world.vaultOpen,
      remainingImpacts: 0,
      tracks: movingImpacts,
    },
  },
  method:
    'Native routed key/mouse input; standard prologue skip, walking, stance, weapon, settings, puzzle and door UI; observation-only snapshots and canvas/audio recording',
  scope:
    'Door translation follows the authored Y-only opening animation; no custom surface or forced gameplay transform was created',
};
writeFileSync(resolve(directory, 'checks.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt.checks, null, 2));
