type GroundContact = boolean | { pickedPoint?: { y: number } | null } | null | undefined;

export const JUMP_SPEED = 5.3;
const MAX_STEP_DOWN = 0.2;
export function createJumpMotor() {
  let velocity = 0,
    grounded = false,
    queued = false,
    jumps = 0,
    landings = 0,
    takeoff = 0,
    peak = 0,
    activeJump = false;
  return {
    request() {
      if (!grounded || queued) return false;
      queued = true;
      return true;
    },
    pause() {
      queued = false;
    },
    reset() {
      velocity = 0;
      grounded = false;
      queued = false;
      jumps = 0;
      landings = 0;
      peak = 0;
      activeJump = false;
    },
    step(
      dt: number,
      getHeight: () => number,
      move: (dy: number, verticalOnly?: boolean) => void,
      probeGround?: (extraDrop?: number) => GroundContact,
      atRest = false,
    ) {
      if (dt <= 0) return;
      const support = velocity <= 0 ? probeGround?.() : null;
      let movedHorizontally = false;
      if (support && grounded && !queued) {
        if (atRest) return;
        // Grounded movement preserves the collision skin gap on a level surface.
        const standingHeight = getHeight();
        move(0);
        movedHorizontally = true;
        // Only a previously supported walker can follow a lower tread. Jump
        // takeoff and airborne landings use the ordinary collision skin.
        const next = probeGround?.(MAX_STEP_DOWN);
        if (next) {
          const floorDelta =
            typeof support === 'object' &&
            typeof next === 'object' &&
            support.pickedPoint &&
            next.pickedPoint
              ? next.pickedPoint.y - support.pickedPoint.y
              : undefined;
          if (floorDelta === undefined) return;
          if (floorDelta >= -MAX_STEP_DOWN) {
            const adjustment = standingHeight + floorDelta - getHeight();
            if (Math.abs(adjustment) > 1e-5) {
              move(adjustment, true);
              grounded = Boolean(probeGround?.());
            }
            return;
          }
        }
        grounded = false;
      } else if (support) {
        grounded = true;
        velocity = 0;
      }
      const before = getHeight();
      if (queued && grounded) {
        queued = false;
        velocity = JUMP_SPEED;
        grounded = false;
        takeoff = before;
        peak = 0;
        activeJump = true;
        jumps++;
      }
      velocity -= 16 * dt;
      const requested = velocity * dt;
      move(requested, movedHorizontally);
      const actual = getHeight() - before;
      if (activeJump) peak = Math.max(peak, getHeight() - takeoff);
      const floorContact = probeGround ? probeGround() : actual > requested + 0.0001;
      if (velocity < 0 && floorContact) {
        if (activeJump) {
          landings++;
          activeJump = false;
        }
        velocity = 0;
        grounded = true;
      } else {
        if (velocity > 0 && actual < requested - 0.0001) velocity = 0;
        grounded = false;
      }
    },
    snapshot: () => ({ grounded, velocity, queued, jumps, landings, peak, airborne: !grounded }),
  };
}
