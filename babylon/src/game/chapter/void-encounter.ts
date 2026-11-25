const watchTime = 0.9;
const crossingTime = 10;

function ease(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

type Interval = readonly [number, number];
type Bounds = readonly [Interval, Interval, Interval];
interface VoidEffects {
  show(yaw: number, pitch: number, opacity: number, elapsed: number): void;
  onStart(seconds: number): void;
}

export function createVoidEncounter(lookoutBounds: Bounds, { show, onStart }: VoidEffects) {
  const [[west, east], [floor], [south, north]] = lookoutBounds;
  let state = 'waiting',
    watched = 0,
    elapsed = 0;

  function reset() {
    state = 'waiting';
    watched = elapsed = 0;
    show(-1.02, 0.26, 0, 0);
  }

  function update(
    dt: number,
    { x, y, z }: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
  ) {
    const atLookout =
      x >= west && x <= east && z >= south && z <= north && y >= floor && y < floor + 3;
    // Leaving the lookout rearms the encounter. Looking away only breaks the initial watch.
    if (state === 'seen') {
      if (!atLookout) reset();
      return;
    }
    if (state === 'waiting') {
      const lookingIntoSpace = Math.sin(yaw) * Math.cos(pitch) < -0.7;
      watched = atLookout && lookingIntoSpace ? watched + dt : 0;
      if (watched < watchTime) return;
      state = 'crossing';
      onStart(crossingTime);
    }

    elapsed = Math.min(elapsed + dt, crossingTime);
    const progress = elapsed / crossingTime;
    const opacity = ease(elapsed / 1.6) * ease((crossingTime - elapsed) / 2.8);
    show(-1.02 - progress * 0.92, 0.26 - progress * 0.08, opacity * 0.97, elapsed);
    if (elapsed >= crossingTime) state = 'seen';
  }

  return { update, reset, snapshot: () => ({ state, watched, elapsed }) };
}
