import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const folder = resolve(import.meta.dirname, '../../docs/validation/2026-11-24/motion-combat');
const app = resolve(import.meta.dirname, '..');
const read = (name) =>
  JSON.parse(readFileSync(resolve(folder, name), 'utf8').replace(/^\uFEFF/, ''));
const beforeStand = read('before/slope-stand-attempt.json'),
  afterStand = read('after/slope-stand-attempt.json');
assert.equal(beforeStand.movement.posture, 'crouch');
assert.equal(afterStand.movement.posture, 'standing');
const beforeTorch = read('before/torch-down.json');
assert.equal(beforeTorch.weapon.modelPosition[0] / 0.32, 0.001);
const torchCaptures = [
  'torch-up',
  'torch-down',
  'torch-crouched-lower',
  'torch-crouched-upper',
].map((name) => {
  const s = read(`after/${name}.json`),
    scale = s.weapon.modelPosition[0] / 0.32;
  assert.ok(scale > 0.99, `${name} scale ${scale}`);
  return { name, posture: s.movement.posture, position: s.position, scale };
});
const frames = read('after/frames.json'),
  torchFrames = frames.filter((frame) => frame.tool === 'torch');
const torchScale = Math.min(...torchFrames.map((frame) => frame.model[0] / 0.32));
assert.ok(torchScale > 0.99);
const aim = read('after/aim-impacts.json');
for (const view of ['first', 'left', 'right']) {
  const shot = aim.cases.find((p) => p.view === view && p.kind === 'wand');
  assert.ok(shot && shot.aimError < 0.0001 && shot.shot.hit && !shot.shot.muzzleBlocked);
}
const tap = read('after/tap-shot.json');
assert.ok(tap.bowPower < 0.3 && tap.hit && tap.arrived);
const full = aim.cases.find((p) => p.kind === 'bow' && p.shot.bowPower === 1);
assert.ok(full && full.shot.hit);
const retained = read('after/retained-arrow.json').spells.retained;
assert.ok(retained.some((p) => p.kind === 'arrow' && p.age > 1 && p.life === 18));
const sourceHashes = Object.fromEntries(
  [
    'src/platform/babylon/player/collider-contact.ts',
    'src/platform/babylon/player/player-view.ts',
    'src/platform/babylon/equipment/weapons.ts',
    'src/platform/babylon/effects/spell-effects.ts',
  ].map((file) => [
    file,
    createHash('sha256')
      .update(readFileSync(resolve(app, file)))
      .digest('hex'),
  ]),
);
const receipt = {
  base: 'be31dcf2bb8cc2732b7def9d7166c652f2b823ba',
  codeCommits: ['e6c61bc', '5e8d738'],
  browser: 'Orca embedded',
  bundle: readFileSync(resolve(folder, 'after/bundle.txt'), 'utf8').trim(),
  checks: {
    tests: '88/88',
    build: 'game and gallery passed',
    standingBefore: beforeStand.movement.posture,
    standingAfter: afterStand.movement.posture,
    collapsedTorchBefore: 0.001,
    minimumOpenStairTorchScaleAfter: torchScale,
    torchFrames: torchFrames.length,
    torchCaptures,
    wand: aim.cases
      .filter((p) => p.kind === 'wand')
      .map((p) => ({ view: p.view, error: p.aimError, mesh: p.shot.mesh })),
    arrowTapPower: tap.bowPower,
    arrowFullPower: full.shot.bowPower,
    retainedArrowAges: retained.filter((p) => p.kind === 'arrow').map((p) => p.age),
  },
  sourceHashes,
  notBrowserVerified: [
    'moving/rotating/scaling impact attachment (NullEngine tests passed)',
    'all low-cover/eye-to-tip edge cases and draw strengths (NullEngine tests passed)',
    'left-handed full combat matrix',
    'pointer lock and OS input (explicit free-look only)',
  ],
};
writeFileSync(resolve(folder, 'checks.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt.checks, null, 2));
