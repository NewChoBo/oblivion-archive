import fs from 'node:fs';

const [trace, output, bundle, version] = process.argv.slice(2);
const frames = JSON.parse(fs.readFileSync(trace, 'utf8')).map(
  ([time, speed, position, feet, phase, clip, verticalSpeed, supportFoot, yaw]) => ({
    time,
    speed,
    position,
    feet,
    phase,
    clip,
    verticalSpeed,
    supportFoot,
    yaw,
  }),
);
// Same middle-of-stance windows for both versions, independent of the IK flag.
const windows = {
  Walking_A: [0.14, 0.31, 0],
  Walking_Backwards: [0.14, 0.31, 1],
  Running_A: [0.135, 0.225, 0],
  Running_Strafe_Left: [0.135, 0.225, 0],
};
function floorPoint(f, foot) {
  const [x, , z] = f.feet[foot];
  return [
    f.position[0] + Math.cos(f.yaw) * x + Math.sin(f.yaw) * z,
    f.position[2] - Math.sin(f.yaw) * x + Math.cos(f.yaw) * z,
  ];
}
const yBot = frames.some((f) => f.clip?.startsWith('YBot_'));
const runningClip = yBot ? 'YBot_Run' : 'Running_A';
const clips = {},
  slip = {},
  landings = [];
for (const [i, frame] of frames.entries()) {
  clips[frame.clip] = (clips[frame.clip] || 0) + 1;
  const previous = frames[i - 1];
  if (!previous) continue;
  if (previous.verticalSpeed < 0 && frame.verticalSpeed === 0) {
    const nextRun = frame.speed > 3.4 && frames.slice(i).find((f) => f.clip === runningClip);
    landings.push({
      speed: frame.speed,
      firstGroundPose: frame.clip,
      runDelayMs: nextRun ? Math.round(nextRun.time - frame.time) : null,
    });
  }
  const window = windows[frame.clip];
  const dt = (frame.time - previous.time) / 1000;
  const phase = frame.phase % 0.5;
  if (previous.clip !== frame.clip || !(dt > 0.002 && dt < 0.05)) continue;
  let side;
  if (yBot) {
    if (frame.supportFoot == null || frame.supportFoot !== previous.supportFoot) continue;
    side = frame.supportFoot;
  } else {
    if (
      !window ||
      phase <= window[0] ||
      phase >= window[1] ||
      Math.floor(frame.phase * 2) !== Math.floor(previous.phase * 2)
    )
      continue;
    side = (Math.floor(frame.phase * 2) + window[2]) % 2;
  }
  const a = floorPoint(previous, side),
    b = floorPoint(frame, side);
  const values = (slip[frame.clip] ??= { samples: 0, distance: 0, seconds: 0 });
  values.samples++;
  values.distance += Math.hypot(a[0] - b[0], a[1] - b[1]);
  values.seconds += dt;
}
const plantedAnkle = Object.fromEntries(
  Object.entries(slip).map(([name, v]) => [
    name,
    { samples: v.samples, meanMetersPerSecond: +(v.distance / v.seconds).toFixed(3) },
  ]),
);
const report = { browser: 'Orca', bundle, frames: frames.length, clips, landings, plantedAnkle };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
if (
  version === 'after' &&
  (landings.length !== 2 ||
    landings[0].runDelayMs !== 0 ||
    (yBot
      ? landings[1].firstGroundPose !== 'YBot_Idle'
      : !clips.Jump_Start || landings[1].firstGroundPose !== 'Jump_Land') ||
    (yBot ? ['YBot_Walk', 'YBot_Run', 'YBot_LeftStrafeWalk'] : Object.keys(windows)).some(
      (clip) => !(plantedAnkle[clip]?.samples >= 5),
    ) ||
    plantedAnkle[yBot ? 'YBot_Walk' : 'Walking_A'].meanMetersPerSecond >= 1)
)
  throw Error('Incomplete gait or landing coverage; see ' + output);
