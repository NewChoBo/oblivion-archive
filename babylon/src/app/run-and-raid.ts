import { raidText } from '../content/locales/run-and-raid.ts';
import {
  WAGON,
  RaidMatch,
  RAID_HZ,
  inRaidCastRange,
  canUseRaidSkill,
  raidAimKind,
  raidRunnerHeight,
  type Skill,
  type RaidTarget,
} from '../game/raid/raid-match.ts';
import { driveRaidBots, type RaidOrder } from '../game/raid/raid-bots.ts';
import { createRaidFeature } from '../game/raid/raid-feature.ts';
import { GameSession } from '../game/session/game-session.ts';
import { createRaidCourse } from '../platform/babylon/raid/raid-course.ts';
import { createRenderer } from '../platform/babylon/rendering/renderer.ts';
import { playUrl } from '../platform/browser/play-url.ts';
import { createPreferences, RAID_SKILL_SIZE } from '../platform/browser/preferences.ts';
import { createRaidHud } from '../ui/raid-hud.ts';
import { RAID_AIM_RADIUS, type AimPoint } from '../ui/raid-aim-pad.ts';
import { playableViewport } from '../ui/viewport-limit.ts';

export async function prepareRaid() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const engine = await createRenderer(canvas, new URLSearchParams(location.search));
  // Fullscreen, rotation and layout can resize the canvas while the course is still loading.
  const resizeObserver = new ResizeObserver(() => engine.resize());
  resizeObserver.observe(canvas);
  engine.onDisposeObservable.addOnce(() => resizeObserver.disconnect());
  let course: Awaited<ReturnType<typeof createRaidCourse>>;
  try {
    course = await createRaidCourse(engine, canvas);
  } catch (error) {
    engine.dispose();
    throw error;
  }
  const device = createPreferences();
  const preferences = device.get();
  engine.maxFPS = preferences.fpsLimit ?? undefined;
  const start = document.querySelector<HTMLButtonElement>('#start')!;
  document.getElementById('settings-open')!.hidden = true;
  document.body.classList.add('raid-mode');
  canvas.setAttribute('aria-label', raidText('canvas'));
  let match: RaidMatch, session: GameSession<{ slot: number }>;
  let state: 'setup' | 'countdown' | 'playing' | 'paused' | 'finished' = 'setup';
  let countdownMs = 0;
  let aiming: Skill | null = null;
  let carry = 0,
    previous = 0,
    lastHud = -1;
  const pressed = new Map<string, string>();
  let keyboardAimPoint: AimPoint | null = null;
  let padSide = 0,
    padBrake = 0;
  const send: RaidOrder = (slot, action, payload) => {
    session.dispatch(String(slot), { kind: 'raid.' + action, payload });
  };
  function move() {
    const actions = [...pressed.values()];
    const side = padSide + Number(actions.includes('right')) - Number(actions.includes('left'));
    send(0, 'move', {
      side: Math.max(-1, Math.min(1, side)),
      brake: actions.includes('walk') ? 1 : padBrake,
    });
  }
  function held(action: string, down: boolean, source: string) {
    if (state !== 'playing') return;
    if (down) pressed.set(source, action);
    else pressed.delete(source);
    move();
  }
  function cast(skill: Skill) {
    if (state !== 'playing') return;
    aimPointer = null;
    hud.aimPad.close();
    course.showAim(null);
    const r = match.runners[0]!;
    const kind = raidAimKind(r.hero, skill);
    if (kind !== 'pulse') {
      aiming = aiming !== skill && canUseRaidSkill(r, skill) ? skill : null;
    } else {
      aiming = null;
      send(0, 'cast', { skill });
    }
    hud.update(match, aiming);
    if (aiming !== null) refreshKeyboardAim();
  }
  function cycle() {
    if (state !== 'playing') return;
    const options = (['wagon', ...match.runners.map((r) => r.slot)] as RaidTarget[]).filter(
      (target) => match.canTarget(0, target),
    );
    if (!options.length) return;
    const current = match.runners[0]!.target;
    const next = current === null ? 0 : (options.indexOf(current) + 1) % options.length;
    send(0, 'lock', options[next]!);
    hud.update(match, aiming);
  }
  function enterCourse() {
    state = countdownMs > 0 ? 'countdown' : 'playing';
    hud.play(Math.ceil(countdownMs / 1000));
    canvas.inert = countdownMs > 0;
    if (!canvas.inert) canvas.focus({ preventScroll: true });
  }
  function resume() {
    if (!playableViewport.matches) return;
    previous = performance.now();
    enterCourse();
  }
  function pause() {
    if (state !== 'playing' && state !== 'countdown') return;
    pressed.clear();
    padSide = 0;
    padBrake = 0;
    if (state === 'countdown')
      countdownMs = Math.max(0, countdownMs - (performance.now() - previous));
    else move();
    aiming = null;
    state = 'paused';
    hud.showPanel(null);
    canvas.inert = true;
  }
  function begin() {
    if (!playableViewport.matches || (state !== 'setup' && state !== 'finished')) return;
    match = new RaidMatch(hud.selected(), course.viewAspect);
    session = new GameSession([createRaidFeature(match)]);
    for (const r of match.runners) session.addPlayer(String(r.slot), { slot: r.slot });
    pressed.clear();
    padSide = 0;
    padBrake = 0;
    aiming = null;
    carry = 0;
    lastHud = -1;
    countdownMs = 3000;
    document.getElementById('overlay')!.hidden = true;
    hud.update(match, null);
    course.render(match, 0, 0);
    resume();
  }
  const { left, right, back, jump } = preferences.bindings;
  function refreshKeyboardAim() {
    const pointer = keyboardAimPoint ?? {
      clientX: canvas.clientWidth / 2,
      clientY: canvas.clientHeight / 2,
    };
    if (aiming === null) return;
    hud.showSkillAim(previewSkill(aiming, pointer));
  }
  function pickSkill(skill: Skill, event: AimPoint) {
    const runner = match.runners[0]!;
    const kind = raidAimKind(runner.hero, skill);
    if (kind === 'direction') return match.previewSkill(0, skill, course.directionPoint(event));
    const shield = kind === 'ward';
    if (kind === 'field' || kind === 'leap')
      return match.previewSkill(0, skill, course.placement(event));
    if (kind === 'pulse') return match.previewSkill(0, skill, null);
    const position = (id: RaidTarget) => (id === 'wagon' ? WAGON : match.runners[id]!);
    const eligible = (id: RaidTarget) =>
      shield
        ? typeof id === 'number' && match.canShield(0, id)
        : match.canTarget(0, id) && inRaidCastRange(runner, position(id), skill);
    const hit = course.pickTarget(event, shield, RAID_AIM_RADIUS, eligible);
    return match.previewSkill(0, skill, hit.point, hit.target);
  }
  function drop(skill: Skill, event: AimPoint) {
    if (state !== 'playing') return;
    const hit = pickSkill(skill, event);
    if (hit.status !== 'ready') return;
    const payload =
      hit.kind === 'direction' && hit.point
        ? { skill, dx: hit.point.x - hit.origin.x, dz: hit.point.z - hit.origin.z }
        : hit.kind === 'field' || hit.kind === 'leap'
          ? { skill, ...hit.point }
          : hit.kind === 'pulse'
            ? { skill }
            : hit.kind === 'ward'
              ? { skill, ally: hit.target }
              : { skill, target: hit.target };
    if (!session.dispatch('0', { kind: 'raid.cast', payload }).ok) return;
    aiming = null;
    hud.update(match, null);
  }
  function previewSkill(skill: Skill, event: AimPoint) {
    const aim = pickSkill(skill, event);
    course.showAim(aim);
    return {
      ...aim,
      targetName: typeof aim.target === 'number' ? match.runners[aim.target]!.hero : aim.target,
    };
  }
  const hud = createRaidHud(
    {
      steer(side, brake) {
        if (state !== 'playing' || (padSide === side && padBrake === brake)) return;
        padSide = side;
        padBrake = brake;
        move();
      },
      clearPreview: () => course.showAim(null),
      beginPadAim: () => {
        aiming = null;
        hud.update(match, null);
      },
      preview: previewSkill,
      jump: () => {
        if (state === 'playing') send(0, 'jump');
      },
      drop,
      skill: cast,
      target: cycle,
      pause,
      resume,
      retry: begin,
      leave: () => location.assign(playUrl(location.href, null)),
      setSkillSize: (size) => device.set({ ...device.get(), raidSkillSize: size }),
    },
    canvas,
    { ...RAID_SKILL_SIZE, value: preferences.raidSkillSize },
  );
  start.addEventListener('click', begin);
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    keyboardAimPoint = { clientX: e.clientX, clientY: e.clientY };
    if (aiming !== null) refreshKeyboardAim();
  });
  Object.defineProperty(window, '__ROOM_DEMO__', {
    value: Object.freeze({
      snapshot: () => ({
        ready: true,
        started: state !== 'setup',
        paused: state === 'paused',
        raid: match && {
          tick: match.tick,
          health: match.runners.map((r) => r.hp),
          damage: [...match.damage],
          position: {
            x: match.runners[0]!.x,
            z: match.runners[0]!.z,
            height: raidRunnerHeight(match.runners[0]!),
          },
          movement: { side: match.runners[0]!.side, brake: match.runners[0]!.brake },
        },
      }),
    }),
  });
  let aimPointer: number | null = null;
  canvas.addEventListener('pointercancel', () => {
    aimPointer = null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (aimPointer !== e.pointerId) return;
    aimPointer = null;
    if (state !== 'playing' || aiming === null) return;
    drop(aiming, e);
    if (aiming === null) course.showAim(null);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing' || e.defaultPrevented || hud.aimPad.skill !== null || e.button !== 0)
      return;
    if (aiming !== null) {
      aimPointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const { target } = course.pickTarget(e, false, RAID_AIM_RADIUS, (id) => match.canTarget(0, id));
    if (target !== undefined) send(0, 'lock', target);
    hud.update(match, aiming);
  });
  const moves = new Map([
    [left, 'left'],
    [right, 'right'],
    [back, 'walk'],
  ]);
  window.addEventListener('keydown', (e) => {
    if (
      state !== 'playing' &&
      !((state === 'paused' || state === 'countdown') && e.code === 'Escape')
    )
      return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = moves.get(e.code);
    if (action) {
      e.preventDefault();
      if (!e.repeat) held(action, true, e.code);
      return;
    }
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    if (e.code !== jump && e.code !== 'Tab' && e.code !== 'Escape' && !keys.includes(e.code))
      return;
    // Tab cycles targets on the game canvas; focused HUD controls retain normal keyboard traversal.
    if (e.code === 'Tab' && e.target !== canvas) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (state === 'paused') resume();
      else if (hud.aimPad.skill !== null) hud.aimPad.close();
      else if (aiming !== null) {
        aiming = null;
        course.showAim(null);
        hud.update(match, null);
      } else pause();
    } else if (e.code === jump) send(0, 'jump');
    else if (e.code === 'Tab') cycle();
    else cast(keys.indexOf(e.code) as Skill);
  });
  window.addEventListener('keyup', (e) => {
    if (pressed.has(e.code)) held('', false, e.code);
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  playableViewport.addEventListener('change', () => {
    if (!playableViewport.matches) pause();
  });
  engine.onResizeObservable.add(() => {
    keyboardAimPoint = null;
    hud.aimPad.close();
  });
  engine.runRenderLoop(() => {
    if (state !== 'playing' && state !== 'countdown') return;
    const now = performance.now();
    let elapsed = now - previous;
    previous = now;
    if (state === 'countdown') {
      const waiting = Math.min(countdownMs, elapsed);
      countdownMs -= waiting;
      if (countdownMs > 0) {
        hud.showStartCountdown(Math.ceil(countdownMs / 1000));
        course.render(match, Math.min(elapsed / 1000, 0.1), 0);
        return;
      }
      // Only the part of this frame after the start signal advances the match.
      elapsed -= waiting;
      enterCourse();
    }
    const dt = elapsed / 1000;
    // Catch up the match clock in fixed ticks, even if a foreground frame takes longer to render.
    carry += dt * RAID_HZ;
    const wasRespawning = match.runners[0]!.respawn > 0;
    while (carry >= 1 && !match.result) {
      const wasOut = match.runners[0]!.respawn > 0;
      driveRaidBots(match, send);
      match.step();
      carry--;
      if (wasOut && !match.runners[0]!.respawn) move();
    }
    const respawning = match.runners[0]!.respawn > 0;
    if (aiming !== null && (respawning || match.runners[0]!.silenced)) {
      aiming = null;
      course.showAim(null);
    }
    course.render(match, Math.min(dt, 0.1), match.result ? 0 : carry);
    if (Math.floor(match.tick / 3) !== lastHud || wasRespawning !== respawning) {
      hud.update(match, aiming);
      lastHud = Math.floor(match.tick / 3);
    }
    if (aiming !== null) refreshKeyboardAim();
    else hud.aimPad.refresh();
    if (match.result) {
      state = 'finished';
      pressed.clear();
      canvas.inert = true;
      hud.showPanel(match);
    }
  });
}
