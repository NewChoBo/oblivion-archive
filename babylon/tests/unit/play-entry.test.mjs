import assert from 'node:assert/strict';
import test from 'node:test';
import { readPlayEntry, writePlayEntry } from '../../src/app/play-entry.ts';

test('mode selection opens only a supported level and main menu clears the play entry', () => {
  const params = new URLSearchParams('capture=1&play=arena&mode=ward-defense&level=made-up');
  assert.equal(readPlayEntry(params), null);
  const arena = { intent: 'arena', mode: 'ward-defense', level: 'gothic-arena' };
  writePlayEntry(params, arena);
  assert.deepEqual(readPlayEntry(params), arena);
  writePlayEntry(params, { intent: 'expedition' });
  assert.deepEqual(readPlayEntry(params), { intent: 'expedition' });
  assert.equal(params.has('mode'), false);
  assert.equal(params.has('level'), false);
  writePlayEntry(params, null);
  assert.equal(readPlayEntry(params), null);
  assert.equal(params.get('capture'), '1');
});
