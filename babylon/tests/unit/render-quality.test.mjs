import assert from 'node:assert/strict';
import test from 'node:test';
import { createRenderQuality } from '../../src/platform/babylon/rendering/render-quality.ts';

const samplesPerPixel = (tier) => tier.samples / tier.scale ** 2;

test('fixed-MSAA rendering reduces resolution under load and recovers on the same render target format', () => {
  const changes = [];
  const quality = createRenderQuality((tier) => changes.push(tier), { fixedMsaa: true });
  for (let frame = 0; frame < 240; frame++) quality.sample(1 / 20, true);
  assert.ok(changes.at(-1).scale > 1);
  for (let frame = 0; frame < 60 * 60; frame++) quality.sample(1 / 60, true);
  assert.equal(changes.at(-1).scale, 1);
  assert.equal(new Set(changes.map((tier) => tier.samples)).size, 1);
});

test('render quality responds to sustained gameplay load and recovers gradually', () => {
  const changes = [];
  const quality = createRenderQuality((tier) => changes.push(tier));
  function render(fps, seconds, active = true) {
    for (let frame = 0; frame < fps * seconds; frame++) quality.sample(1 / fps, active);
  }

  render(20, 15, false);
  render(30, 0.5);
  assert.deepEqual(changes, []);
  render(30, 15);
  const degraded = changes.length;
  assert.ok(degraded > 0);
  assert.ok(
    changes.every(
      (tier, index) => index === 0 || samplesPerPixel(tier) < samplesPerPixel(changes[index - 1]),
    ),
  );

  const low = samplesPerPixel(changes.at(-1));
  render(60, 1);
  assert.equal(changes.length, degraded);
  render(60, 40);
  assert.ok(samplesPerPixel(changes.at(-1)) > low);
});

test('an intentional 30 FPS cap preserves quality but slow rendering still lowers it', () => {
  const changes = [];
  const quality = createRenderQuality((tier) => changes.push(tier));
  function render(fps, seconds) {
    for (let frame = 0; frame < fps * seconds; frame++) quality.sample(1 / fps, true);
  }

  quality.setFrameLimit(30);
  render(30, 10);
  assert.deepEqual(changes, []);
  render(19, 12);
  assert.ok(changes.length > 0);
  const low = samplesPerPixel(changes.at(-1));
  render(30, 40);
  const recovered = samplesPerPixel(changes.at(-1));
  assert.ok(recovered > low);

  quality.setFrameLimit(null);
  render(30, 12);
  assert.ok(samplesPerPixel(changes.at(-1)) < recovered);
});
