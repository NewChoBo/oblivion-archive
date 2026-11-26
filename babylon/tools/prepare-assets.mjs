import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { equipRaidModel, raidModels } from './prepare-raid-models.mjs';
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  repo = path.join(web, '../asset-sources');
const output = path.join(web, '../public/assets');
fs.mkdirSync(output, { recursive: true });
const records = [];
function copy(source, destination, transform = (bytes) => bytes) {
  const data = transform(fs.readFileSync(path.join(repo, source)));
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  records.push({
    source,
    path: destination,
    bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  });
}
const poly = 'Assets/_Oblivion/Art/PolyHaven/';
for (const name of ['old_wooden_floor_01_diff_1k.jpg', 'old_wooden_floor_01_nor_gl_1k.jpg'])
  copy(poly + name, 'polyhaven/' + name);
copy(poly + 'CC0-1.0.txt', 'licenses/CC0-1.0.txt');
copy(poly + 'SOURCES.md', 'licenses/PolyHaven-SOURCES.md');
copy('Art/ThirdParty/KayKit/LICENSE.txt', 'licenses/KayKit-Adventurers.txt');
copy('Art/ThirdParty/KayKit/Skeletons-LICENSE.txt', 'licenses/KayKit-Skeletons.txt');
for (const [id, hero] of Object.entries(raidModels))
  copy('Art/ThirdParty/KayKit/' + hero.source + '.glb', 'raid/' + id + '.glb', (bytes) =>
    equipRaidModel(bytes, hero),
  );
for (const id of Object.keys(raidModels))
  copy('Art/RunAndRaid/portraits/' + id + '.webp', 'raid/portraits/' + id + '.webp');
for (const name of ['scorch_01', 'twirl_01', 'spark_05', 'magic_01'])
  copy('Art/ThirdParty/Kenney/ParticleSelection/' + name + '.png', 'raid/' + name + '.png');
copy('Art/ThirdParty/Kenney/ParticleSelection/License.txt', 'licenses/Kenney-Particle-Pack.txt');
copy('Art/ThirdParty/Kenney/BlasterSelection/License.txt', 'licenses/Kenney-Blaster-Kit.txt');
for (const name of ['laserSmall_000.ogg', 'laserLarge_000.ogg', 'forceField_000.ogg'])
  copy('Art/ThirdParty/Kenney/SoundSelection/' + name, 'sounds/' + name);
copy('Art/ThirdParty/Kenney/SoundSelection/License.txt', 'licenses/Kenney-Sci-Fi-Sounds.txt');
fs.copyFileSync(
  path.join(web, 'node_modules/@babylonjs/core/license.md'),
  path.join(output, 'licenses/Babylon-Core-Apache-2.0.md'),
);
fs.copyFileSync(
  path.join(web, 'node_modules/@babylonjs/loaders/license.md'),
  path.join(output, 'licenses/Babylon-Loaders-Apache-2.0.md'),
);
fs.writeFileSync(
  path.join(output, 'manifest.json'),
  JSON.stringify(
    { generatedFrom: 'local project sources; no runtime CDN', assets: records },
    null,
    2,
  ) + '\n',
);
console.log(
  `Prepared ${records.length} source files; ${records.reduce((sum, r) => sum + r.bytes, 0)} bytes.`,
);
