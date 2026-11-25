import { Vector3 } from '@babylonjs/core';
import { plan } from '../src/content/citadel-layout.ts';
import { citadelSurvey } from '../src/platform/babylon/citadel/floating-citadel.ts';

const { bridge, west, stairs, disc, edgesOf } = citadelSurvey();
const outline = (corners) =>
  edgesOf(corners).flatMap((run) => run.slice(0, -1).map((p) => [p.x, p.z]));
const contours = {};
for (const key of ['arrival', 'court', 'terrace', 'bindery', 'freight', 'lookout']) {
  const district = plan[key],
    rim = district.outline ?? disc;
  contours[key] = [outline(rim.map(([x, z]) => new Vector3(x, district.height, z)))];
}
for (const [key, rows] of Object.entries({ bridge, westWalk: west, stairs })) {
  contours[key] = rows.slice(1).map(([c, d], i) => outline([rows[i][0], rows[i][1], d, c]));
}
process.stdout.write(JSON.stringify(contours));
