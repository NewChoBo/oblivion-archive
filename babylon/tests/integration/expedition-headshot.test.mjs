import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { createServer } from 'vite';
import { createExpeditionState } from '../../src/expedition/state.ts';

test('only confirmed enemy head impacts trigger the marker, including the killing shot', async (t) => {
  // The world imports the skybox artwork. Resolve its asset URLs through the game bundler.
  const vite = await createServer({
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true },
  });
  t.after(() => vite.close());
  const { createExpeditionWorld } = await vite.ssrLoadModule('/src/expedition/world.ts');
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const material = (name) => new PBRMaterial(name, scene);
  const stone = material('stone');
  const state = createExpeditionState();
  state.beginPractice();
  const cues = [],
    notices = [];
  const world = createExpeditionWorld(scene, {
    levelId: 'gothic-arena',
    practice: 'elimination',
    state,
    box: (name) => new Mesh(name, scene),
    material,
    materials: { rampartStone: stone, rampartFloor: stone, rampartTrim: stone },
    tacticalMatch: { phase: 'playing', loseHostage: () => cues.push('hostage') },
    onHeadshot: () => cues.push('head'),
    onEnemyDefeated: () => cues.push('kill'),
    notify: (text) => notices.push(text),
  });
  const surface = new Mesh('impacted surface', scene);
  function fire(metadata, damage) {
    surface.metadata = metadata;
    return world.hit(surface, { damage });
  }
  for (const metadata of [
    { hitRegion: 'head' },
    { hitRegion: 'head', expeditionNpc: true },
    { hitRegion: 'head', expeditionEnemy: '0' },
  ])
    assert.equal(fire(metadata, 12), false);
  assert.ok(fire({ arenaHostage: true, hitRegion: 'head' }, 12));
  assert.deepEqual(cues, ['hostage']);
  assert.deepEqual(notices, []);
  assert.equal(state.enemyHealth(0), 72);

  assert.ok(fire({ expeditionEnemy: 0, hitRegion: 'helmet' }, 12));
  assert.equal(state.enemyHealth(0), 60);
  assert.doesNotMatch(notices.at(-1), /headshot/i);
  const head = { expeditionEnemy: 0, hitRegion: 'head' };
  assert.ok(fire(head, 15));
  assert.equal(state.enemyHealth(0), 30);
  assert.match(notices.at(-1), /headshot.*30/i);
  assert.ok(fire(head, 15));
  assert.match(notices.at(-1), /headshot.*eliminat/i);
  assert.ok(fire(head, 15));
  assert.deepEqual(cues, ['hostage', 'head', 'head', 'kill']);
  assert.equal(notices.length, 3);

  const { setLocale } = await vite.ssrLoadModule('/src/content/locales/locale.ts');
  setLocale('ko');
  surface.metadata = { expeditionEnemy: 1, hitRegion: 'head' };
  assert.ok(world.hit(surface, { id: 'blaster-a' }));
  assert.equal(state.enemyHealth(1), 20);
  assert.match(notices.at(-1), /헤드샷.*52/);
  assert.ok(world.hit(surface, { id: 'blaster-j', bowPower: 0.2 }));
  assert.equal(state.enemyHealth(1), 0);
  assert.match(notices.at(-1), /헤드샷.*처치/);
  assert.deepEqual(cues.slice(4), ['head', 'head', 'kill']);
});
