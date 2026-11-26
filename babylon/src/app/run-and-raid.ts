import { raidText } from '../content/locales/run-and-raid.ts';
import { RaidMatch, RAID_HZ, type Skill, type RaidTarget } from '../game/raid/raid-match.ts';
import { driveRaidBots, type RaidOrder } from '../game/raid/raid-bots.ts';
import { createRaidFeature } from '../game/raid/raid-feature.ts';
import { GameSession } from '../game/session/game-session.ts';
import { createRaidCourse } from '../platform/babylon/raid/raid-course.ts';
import { createRenderer } from '../platform/babylon/rendering/renderer.ts';
import { playUrl } from '../platform/browser/play-url.ts';
import { createPreferences, keyLabel } from '../platform/browser/preferences.ts';
import { createRaidHud } from '../ui/raid-hud.ts';
import { playableViewport } from '../ui/viewport-limit.ts';

export async function prepareRaid() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const engine = await createRenderer(canvas, new URLSearchParams(location.search));
  let course: Awaited<ReturnType<typeof createRaidCourse>>;
  try {
    course = await createRaidCourse(engine, canvas);
  } catch (error) {
    engine.dispose();
    throw error;
  }
  const preferences = createPreferences().get();
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
  const send: RaidOrder = (slot, action, payload) => {
    session.dispatch(String(slot), { kind: 'raid.' + action, payload });
  };
  function move() {
    const actions = [...pressed.values()];
    send(0, 'move', {
      side: Number(actions.includes('right')) - Number(actions.includes('left')),
      walk: actions.includes('walk'),
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
    const options: RaidTarget[] = [
      'wagon',
      ...match.runners.filter((r) => r.team === 1 && !r.respawn).map((r) => r.slot),
    ];
    const next = (options.indexOf(match.runners[0]!.target) + 1) % options.length;
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
    move();
    aiming = false;
    state = 'paused';
    hud.showPanel(null);
    canvas.inert = true;
  }
  function begin() {
    if (!playableViewport.matches) return;
    match = new RaidMatch(hud.selected());
    session = new GameSession([createRaidFeature(match)]);
    for (const r of match.runners) session.addPlayer(String(r.slot), { slot: r.slot });
    pressed.clear();
    aiming = false;
    carry = 0;
    lastHud = -1;
    document.getElementById('overlay')!.hidden = true;
    hud.update(match, false);
    resume();
  }
  const { left, right, back, jump } = preferences.bindings;
  function drop(skill: Skill, event: PointerEvent) {
    if (state !== 'playing') return;
    const shield = skill === 0 && match.runners[0]!.hero === 'jade';
    const hit = course.pick(event, skill === 2, shield);
    if (!hit) return;
    if (shield && typeof hit.target === 'number') send(0, 'cast', { skill, ally: hit.target });
    else if (skill === 2) send(0, 'cast', { skill, ...hit.point });
    else if (
      hit.target !== undefined &&
      session.dispatch('0', { kind: 'raid.lock', payload: hit.target }).ok
    )
      send(0, 'cast', { skill });
    aiming = false;
    hud.update(match, false);
  }
  const hud = createRaidHud(
    {
      held,
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
    },
    { left: keyLabel(left), right: keyLabel(right), walk: keyLabel(back), jump: keyLabel(jump) },
  );
  start.addEventListener('click', begin);
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing' || e.button !== 0) return;
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
  window.addEventListener('resize', () => engine.resize());
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
