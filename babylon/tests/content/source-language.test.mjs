import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('Korean runtime text stays in the Korean presentation catalogs', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url));
  const sourceExtensions = new Set([
    '.ts',
    '.js',
    '.json',
    '.css',
    '.html',
    '.glsl',
    '.wgsl',
    '.vert',
    '.frag',
  ]);
  const violations = [];
  for (const file of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !sourceExtensions.has(extname(file.name))) continue;
    const path = join(file.parentPath, file.name);
    const name = relative(root, path).split(sep).join('/');
    if (name.startsWith('content/locales/ko/')) continue;
    const lines = readFileSync(path, 'utf8').split('\n');
    const index = lines.findIndex((line) => /\p{Script=Hangul}/u.test(line));
    if (index >= 0) violations.push(`src/${name}:${index + 1}`);
  }
  assert.deepEqual(
    violations.sort(),
    [],
    'Move Korean display text into the ko catalog and use English for internal names and comments.',
  );
});
