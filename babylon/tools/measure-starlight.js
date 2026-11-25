// Sample local peaks in an unobstructed patch of sky at a fixed native camera angle.
(async () => {
  const game = document.getElementById('game');
  const sample = document.createElement('canvas');
  sample.width = 320;
  sample.height = 128;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  const pose = () => {
    const s = window.__ROOM_DEMO__.snapshot();
    return [...s.position, s.yaw, s.pitch];
  };
  const start = pose(),
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stars = [],
    sky = [];
  for (let frame = 0; frame < 26; frame++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    ctx.drawImage(
      game,
      game.width * 0.24,
      game.height * 0.12,
      game.width * 0.38,
      game.height * 0.25,
      0,
      0,
      320,
      128,
    );
    const pixels = ctx.getImageData(0, 0, 320, 128).data;
    const level = (i) => (pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2]) / 3;
    if (!frame)
      for (let y = 2; y < 126; y++)
        for (let x = 2; x < 318; x++) {
          const i = y * 320 + x,
            v = level(i);
          if (v > 25 && [-321, -320, -319, -1, 1, 319, 320, 321].every((d) => v > level(i + d))) {
            if (stars.every((s) => Math.hypot(s.x - x, s.y - y) > 4))
              stars.push({ i, x, y, min: v, max: v });
          } else if (x % 23 === 0 && y % 19 === 0 && v < 12) sky.push({ i, min: v, max: v });
        }
    for (const item of [...stars, ...sky]) {
      const v = level(item.i);
      item.min = Math.min(item.min, v);
      item.max = Math.max(item.max, v);
    }
  }
  if (JSON.stringify(start) !== JSON.stringify(pose()))
    throw Error('Camera moved during starlight sample');
  const span = (p) => p.max - p.min;
  return {
    seconds: 5.2,
    reduced,
    stars: stars.length,
    changing: stars.filter((p) => span(p) >= 7).length,
    largestChange: Math.round(Math.max(0, ...stars.map(span))),
    backgroundSamples: sky.length,
    medianBackgroundChange: sky.map(span).sort((a, b) => a - b)[Math.floor(sky.length / 2)],
  };
})();
