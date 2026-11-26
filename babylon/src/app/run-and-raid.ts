import { raidText } from '../content/locales/run-and-raid.ts';
import {
  HEROES,
  WAGON,
  RaidMatch,
  RAID_HZ,
  inRaidCastRange,
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
import type { AimPoint } from '../ui/raid-aim-pad.ts';
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
  let state: 'setup' | 'playing' | 'paused' | 'finished' = 'setup';
  let aiming = false,
    carry = 0,
    previous = 0,
    lastHud = -1;
  const pressed = new Map<string, string>();
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
    hud.aimPad.close();
    if (skill === 2) {
      const r = match.runners[0]!;
      aiming = !aiming && !r.respawn && !r.cooldowns[2];
    } else {
      aiming = false;
      send(0, 'cast', { skill });
    }
    hud.update(match, aiming);
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
  function resume() {
    if (!playableViewport.matches) return;
    state = 'playing';
    previous = performance.now();
    hud.play();
    canvas.inert = false;
    canvas.focus({ preventScroll: true });
  }
  function pause() {
    if (state !== 'playing') return;
    pressed.clear();
    padSide = 0;
    padBrake = 0;
    move();
    aiming = false;
    state = 'paused';
    hud.showPanel(null);
    canvas.inert = true;
  }
  function begin() {
    if (!playableViewport.matches) return;
    match = new RaidMatch(hud.selected(), course.viewAspect);
    session = new GameSession([createRaidFeature(match)]);
    for (const r of match.runners) session.addPlayer(String(r.slot), { slot: r.slot });
    pressed.clear();
    padSide = 0;
    padBrake = 0;
    aiming = false;
    carry = 0;
    lastHud = -1;
    document.getElementById('overlay')!.hidden = true;
    hud.update(match, false);
    resume();
  }
  const { left, right, back, jump } = preferences.bindings;
  function pickSkill(skill: Skill, event: AimPoint) {
    if (state !== 'playing') return null;
    const runner = match.runners[0]!;
    const shield = skill === 0 && runner.hero === 'jade';
    const hit = course.pick(event, skill === 2, shield);
    if (!hit) return null;
    if (skill === 2)
      return {
        ...hit,
        radius: HEROES[runner.hero].radius + 0.6,
        valid: match.canAimGround(0, hit.point),
      };
    if (hit.target === undefined) return null;
    const point = hit.target === 'wagon' ? WAGON : match.runners[hit.target]!;
    const valid = shield
      ? typeof hit.target === 'number' && match.canShield(0, hit.target)
      : match.canTarget(0, hit.target) && inRaidCastRange(runner, point, skill);
    return { ...hit, point, radius: 0.85, valid };
  }
  function drop(skill: Skill, event: AimPoint) {
    const hit = pickSkill(skill, event);
    if (!hit?.valid) return;
    const payload =
      skill === 2
        ? { skill, ...hit.point }
        : skill === 0
          ? { skill, ally: hit.target }
          : { skill, target: hit.target };
    if (!session.dispatch('0', { kind: 'raid.cast', payload }).ok) return;
    aiming = false;
    hud.update(match, false);
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
        aiming = false;
        hud.update(match, false);
      },
      preview(skill, event) {
        const aim = pickSkill(skill, event);
        course.showAim(aim?.point ?? null, aim?.radius, aim?.valid);
        return aim?.valid ?? false;
      },
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
          movement: { side: match.runners[0]!.side, brake: match.runners[0]!.brake },
        },
      }),
    }),
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing' || e.defaultPrevented || hud.aimPad.skill !== null || e.button !== 0)
      return;
    const hit = course.pick(e, aiming);
    if (!hit) return;
    if (aiming) {
      const accepted = session.dispatch('0', {
        kind: 'raid.cast',
        payload: { skill: 2, ...hit.point },
      });
      if (accepted.ok) aiming = false;
    } else if (hit.target !== undefined) send(0, 'lock', hit.target);
    hud.update(match, aiming);
  });
  const moves = new Map([
    [left, 'left'],
    [right, 'right'],
    [back, 'walk'],
  ]);
  window.addEventListener('keydown', (e) => {
    if (state !== 'playing' && !(state === 'paused' && e.code === 'Escape')) return;
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
      else if (aiming) {
        aiming = false;
        hud.update(match, false);
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
  engine.onResizeObservable.add(() => hud.aimPad.close());
  engine.runRenderLoop(() => {
    if (state !== 'playing') return;
    const now = performance.now(),
      dt = (now - previous) / 1000;
    previous = now;
    // Catch up the match clock in fixed ticks, even if a foreground frame takes longer to render.
    carry += dt * RAID_HZ;
    while (carry >= 1 && !match.result) {
      const wasOut = match.runners[0]!.respawn > 0;
      driveRaidBots(match, send);
      match.step();
      carry--;
      if (wasOut && !match.runners[0]!.respawn) move();
    }
    if (match.runners[0]!.respawn) aiming = false;
    course.render(match, Math.min(dt, 0.1), match.result ? 0 : carry);
    if (Math.floor(match.tick / 3) !== lastHud) {
      hud.update(match, aiming);
      lastHud = Math.floor(match.tick / 3);
    }
    if (match.result) {
      state = 'finished';
      pressed.clear();
      canvas.inert = true;
      hud.showPanel(match);
    }
  });
}
