import { RaidRound } from '../game/raid/raid-round.ts';
import type { RaidRoom, RoomError } from '../platform/photon/raid-room.ts';
import { createRaidLobby } from '../ui/raid-lobby.ts';
import { raidText } from '../content/locales/run-and-raid.ts';
import {
  WAGON,
  RaidMatch,
  RAID_HZ,
  RAID_SKILL_RANGE,
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
import { RAID_AIM_RADIUS, type AimPoint, type RaidAimFeedback } from '../ui/raid-aim-pad.ts';
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
  let slot = 0;
  let room: RaidRoom | undefined;
  let round: RaidRound | undefined;
  let attempt = 0;
  let timer: number | undefined;
  let onlineStart = 0;
  let receivedAt = 0;
  let onlineRespawning = false;
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
  const order = (action: Parameters<RaidOrder>[1], payload?: unknown) =>
    room
      ? room.order(action, payload)
      : session.dispatch(String(slot), { kind: 'raid.' + action, payload }).ok;
  const send: RaidOrder = (slot, action, payload) => {
    session.dispatch(String(slot), { kind: 'raid.' + action, payload });
  };
  function move() {
    const actions = [...pressed.values()];
    const side = padSide + Number(actions.includes('right')) - Number(actions.includes('left'));
    order('move', {
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
    const r = match.runners[slot]!;
    const kind = raidAimKind(r.hero, skill);
    if (kind !== 'pulse') {
      aiming = aiming !== skill && canUseRaidSkill(r, skill) ? skill : null;
    } else {
      aiming = null;
      order('cast', { skill });
    }
    hud.update(match, aiming, slot);
    if (aiming !== null) refreshKeyboardAim();
  }
  function cycle() {
    if (state !== 'playing') return;
    const options = (['wagon', ...match.runners.map((r) => r.slot)] as RaidTarget[]).filter(
      (target) => match.canTarget(slot, target),
    );
    if (!options.length) return;
    const current = match.runners[slot]!.target;
    const next = current === null ? 0 : (options.indexOf(current) + 1) % options.length;
    order('lock', options[next]!);
    hud.update(match, aiming, slot);
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
    if (round) countdownMs = Math.max(0, onlineStart - previous);
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
    hud.showPanel(null, slot, !!round);
    canvas.inert = true;
  }
  function begin() {
    if (room || !playableViewport.matches || (state !== 'setup' && state !== 'finished')) return;
    slot = 0;
    match = new RaidMatch(hud.selected(), course.viewAspect);
    session = new GameSession([createRaidFeature(match)]);
    for (const r of match.runners) session.addPlayer(String(r.slot), { slot: r.slot });
    launch();
  }
  function launch() {
    pressed.clear();
    padSide = 0;
    padBrake = 0;
    aiming = null;
    carry = 0;
    lastHud = -1;
    countdownMs = 3000;
    document.getElementById('overlay')!.hidden = true;
    hud.update(match, null, slot);
    course.render(match, 0, 0, slot);
    if (playableViewport.matches) resume();
    else {
      state = 'paused';
      hud.showPanel(null, slot, !!round);
    }
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
  function pickSkill(skill: Skill, event: AimPoint): RaidAimFeedback {
    const runner = match.runners[slot]!;
    const kind = raidAimKind(runner.hero, skill);
    if (kind === 'direction') return match.previewSkill(slot, skill, course.directionPoint(event));
    const shield = kind === 'ward';
    if (kind === 'field' || kind === 'leap') {
      const { point, limitedCursor } = course.placement(event, runner, RAID_SKILL_RANGE[kind]);
      return { ...match.previewSkill(slot, skill, point), limitedCursor };
    }
    if (kind === 'pulse') return match.previewSkill(slot, skill, null);
    const position = (id: RaidTarget) => (id === 'wagon' ? WAGON : match.runners[id]!);
    const eligible = (id: RaidTarget) =>
      shield
        ? typeof id === 'number' && match.canShield(slot, id)
        : match.canTarget(slot, id) && inRaidCastRange(runner, position(id), skill);
    const hit = course.pickTarget(event, shield, RAID_AIM_RADIUS, eligible);
    return match.previewSkill(slot, skill, hit.point, hit.target);
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
    if (!order('cast', payload)) return;
    aiming = null;
    hud.update(match, null, slot);
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
        hud.update(match, null, slot);
      },
      preview: previewSkill,
      jump: () => {
        if (state === 'playing') order('jump');
      },
      drop,
      skill: cast,
      target: cycle,
      pause,
      resume,
      retry: () => (round ? resetLobby() : begin()),
      leave: () => location.assign(playUrl(location.href, null)),
      setSkillSize: (size) => device.set({ ...device.get(), raidSkillSize: size }),
    },
    canvas,
    { ...RAID_SKILL_SIZE, value: preferences.raidSkillSize },
  );
  start.textContent = raidText('solo');
  let preferredHero = hud.selected();
  const lobby = createRaidLobby(hud.setup, {
    connect: (code, create) => void connect(code, create),
    start: () => room?.start(),
    leave: () => resetLobby(),
  });
  function resetLobby(reason?: RoomError) {
    attempt++;
    clearInterval(timer);
    room?.close();
    room = undefined;
    round = undefined;
    state = 'setup';
    slot = 0;
    aiming = null;
    pressed.clear();
    hud.reset();
    course.showAim(null);
    hud.selectHero(preferredHero);
    hud.select.disabled = false;
    start.hidden = false;
    canvas.inert = true;
    document.getElementById('overlay')!.hidden = false;
    lobby.reset(reason);
  }
  async function connect(code: string, create: boolean) {
    if (state !== 'setup' || room) return;
    const token = ++attempt;
    preferredHero = hud.selected();
    hud.select.disabled = true;
    start.hidden = true;
    lobby.pending();
    try {
      const id = import.meta.env.VITE_PHOTON_APP_ID;
      if (!id) throw new Error('Missing Photon App ID');
      const { RaidRoom } = await import('../platform/photon/raid-room.ts');
      if (token !== attempt) return;
      room = new RaidRoom(id, code, create, hud.selected(), {
        lobby(seats, self, host) {
          const seat = seats.find((seat) => seat.actor === self);
          if (seat) hud.selectHero(seat.hero);
          lobby.room(code, seats, self, host);
        },
        start(seats, self, host) {
          round = new RaidRound(seats);
          slot = round.slot(self)!;
          match = round.match;
          onlineStart = performance.now() + 3000;
          receivedAt = onlineStart;
          onlineRespawning = false;
          launch();
          // Keep the authoritative clock independent of rendering, focus and local menus.
          timer = window.setInterval(() => {
            if (!room || !round || match.result) {
              clearInterval(timer);
              if (match.result && state === 'paused') {
                state = 'finished';
                hud.showPanel(match, slot, true);
              }
              return;
            }
            const now = performance.now();
            if (!host) {
              if (now - receivedAt > 20000) room.fail('connectError');
              return;
            }
            const due = Math.floor(((now - onlineStart) * RAID_HZ) / 1000) - match.tick;
            let ticks = Math.min(due, RAID_HZ * 2);
            while (ticks > 0 && !match.result) {
              const n = Math.min(6, ticks);
              room.frames(round.advance(n));
              ticks -= n;
            }
          }, 1000 / RAID_HZ);
        },
        intent(sender, data) {
          if (performance.now() >= onlineStart) round?.enqueue(sender, data);
        },
        frames(data) {
          receivedAt = performance.now();
          if (!round?.replay(data)) room?.fail('syncError');
        },
        closed(reason) {
          if (round?.match.result) {
            clearInterval(timer);
            return;
          }
          resetLobby(reason);
        },
      });
    } catch {
      if (token === attempt) resetLobby('connectError');
    }
  }
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    if (room || hud.select.disabled) resetLobby();
  });
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
        raid: state !== 'setup' &&
          match && {
            tick: match.tick,
            slot,
            online: !!round,
            hero: match.runners[slot]!.hero,
            health: match.runners.map((r) => r.hp),
            damage: [...match.damage],
            position: {
              x: match.runners[slot]!.x,
              z: match.runners[slot]!.z,
              height: raidRunnerHeight(match.runners[slot]!),
            },
            movement: { side: match.runners[slot]!.side, brake: match.runners[slot]!.brake },
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
    const { target } = course.pickTarget(e, false, RAID_AIM_RADIUS, (id) =>
      match.canTarget(slot, id),
    );
    if (target !== undefined) order('lock', target);
    hud.update(match, aiming, slot);
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
        hud.update(match, null, slot);
      } else pause();
    } else if (e.code === jump) order('jump');
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
        course.render(match, Math.min(elapsed / 1000, 0.1), 0, slot);
        return;
      }
      // Only the part of this frame after the start signal advances the match.
      elapsed -= waiting;
      enterCourse();
    }
    const dt = elapsed / 1000;
    // Catch up the match clock in fixed ticks, even if a foreground frame takes longer to render.
    if (!round) carry += dt * RAID_HZ;
    const wasRespawning = match.runners[slot]!.respawn > 0;
    while (!round && carry >= 1 && !match.result) {
      const wasOut = match.runners[slot]!.respawn > 0;
      driveRaidBots(match, send);
      match.step();
      carry--;
      if (wasOut && !match.runners[slot]!.respawn) move();
    }
    const respawning = match.runners[slot]!.respawn > 0;
    if (round) {
      if (onlineRespawning && !respawning) move();
      onlineRespawning = respawning;
    }
    if (aiming !== null && (respawning || match.runners[slot]!.silenced)) {
      aiming = null;
      course.showAim(null);
    }
    course.render(match, Math.min(dt, 0.1), match.result ? 0 : carry, slot);
    if (Math.floor(match.tick / 3) !== lastHud || wasRespawning !== respawning) {
      hud.update(match, aiming, slot);
      lastHud = Math.floor(match.tick / 3);
    }
    if (aiming !== null) refreshKeyboardAim();
    else hud.aimPad.refresh();
    if (match.result) {
      state = 'finished';
      pressed.clear();
      canvas.inert = true;
      hud.showPanel(match, slot, !!round);
    }
  });
}
