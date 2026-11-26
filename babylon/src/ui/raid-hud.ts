import { raidText as t } from '../content/locales/run-and-raid.ts';
import {
  HEROES,
  canUseRaidSkill,
  HERO_IDS,
  RAID_HZ,
  ROUND_TICKS,
  SKILL_COOLDOWNS,
  WAGON_HP,
  type RaidHero,
  type RaidView,
  type Skill,
} from '../game/raid/raid-match.ts';
import { createTouchPad } from './touch-pad.ts';
import {
  RaidAimPad,
  aimFeedback,
  type RaidAimActions,
  type RaidAimFeedback,
} from './raid-aim-pad.ts';
import './styles/raid.css';
import './styles/raid-touch.css';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}
function button(parent: HTMLElement, text: string, click?: () => void) {
  const b = element('button', parent, text);
  b.type = 'button';
  if (click) b.onclick = click;
  return b;
}
const skills = ['pulse', 'bolt', 'field', 'fury'] as const;
const counterLabels = {
  lane: 'counterLane',
  mortar: 'counterMortar',
  wave: 'counterWave',
} as const;
const skillNames = ['Pulse', 'Bolt', 'Field', 'Fury'] as const;
interface RaidActions extends RaidAimActions {
  repeatCast(slot: Skill): void;
  callTarget(): void;
  skill(slot: Skill): void;
  target(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  leave(): void;
  jump(): void;
  steer(side: number, brake: number): void;
  beginPadAim(): void;
  setSkillSize(percent: number): void;
}
export function createRaidHud(
  actions: RaidActions,
  course: HTMLCanvasElement,
  skillSize: { min: number; max: number; step: number; value: number },
) {
  const setup = document.createElement('div');
  setup.className = 'raid-setup';
  const start = document.querySelector<HTMLButtonElement>('#start')!;
  start.before(setup);
  element('p', setup, t('rules'));
  const label = element('label', setup, t('hero'));
  const select = element('select', label);
  for (const hero of HERO_IDS)
    select.add(new Option(t('runnerRange', { name: t(hero), range: HEROES[hero].reach }), hero));
  const detail = element('small', setup);
  const selected = () => select.value as RaidHero;
  const heroInfo = {
    hammer: 'hammerInfo',
    abyss: 'abyssInfo',
    longshot: 'longshotInfo',
    jade: 'jadeInfo',
    rend: 'rendInfo',
    bastion: 'bastionInfo',
    rime: 'rimeInfo',
  } as const;
  select.onchange = () => {
    detail.textContent = t(heroInfo[selected()]);
  };
  detail.textContent = t(heroInfo[selected()]);
  const instructions = t('controls');
  const guide = element('small', setup, instructions);
  const compact = matchMedia('(orientation: landscape) and (max-height: 319px)');
  const titleCopy = document.querySelector<HTMLElement>('#overlay .title-copy')!;
  const placeGuide = () => (compact.matches ? titleCopy : setup).append(guide);
  placeGuide();
  compact.addEventListener('change', placeGuide);
  const home = button(start.parentElement!, t('leave'), actions.leave);
  home.className = 'subtle';
  // Keep solo launch next to its hero selector, ahead of the online room controls.
  setup.append(start);
  const root = element('section', document.body);
  root.className = 'raid-hud';
  root.hidden = true;
  const score = element('header', root);
  score.className = 'raid-score';
  function team(name: 'blue' | 'red') {
    const group = element('div', score);
    group.className = 'raid-team ' + name;
    element('small', group, t(name));
    const value = element('strong', group);
    const bar = element('progress', group);
    bar.max = WAGON_HP;
    bar.setAttribute('aria-label', t(name) + ' · ' + t('boss'));
    const kills = element('small', group);
    kills.className = 'raid-kills';
    return { value, bar, kills };
  }
  const blue = team('blue');
  const clock = element('time', score);
  clock.setAttribute('aria-label', t('time'));
  const red = team('red');
  const warning = element('output', score);
  warning.className = 'raid-counter';
  warning.hidden = true;
  const callout = element('output', score);
  callout.className = 'raid-callout';
  callout.hidden = true;
  const pauseButton = button(root, 'Ⅱ', actions.pause);
  pauseButton.className = 'raid-pause';
  pauseButton.setAttribute('aria-label', t('pause'));
  const hint = element('output', root);
  let feedbackUntil = 0;
  hint.className = 'raid-hint';
  const respawn = element('div', root);
  respawn.className = 'raid-respawn';
  respawn.hidden = true;
  respawn.setAttribute('role', 'status');
  element('strong', respawn, t('defeated'));
  const countdown = element('span', respawn);
  const startCountdown = element('output', root);
  startCountdown.className = 'raid-start-countdown';
  startCountdown.setAttribute('aria-label', t('startCountdown'));
  startCountdown.hidden = true;
  const stick = createTouchPad(
    t('steer'),
    { shape: 'semicircle', brakeLabel: t('walk'), surface: course },
    actions.steer,
  );
  root.append(stick.pad);
  const deck = element('div', root);
  deck.className = 'raid-deck';
  const vitals = element('div', deck);
  vitals.className = 'raid-vitals';
  const hp = element('span', vitals);
  const rage = element('span', vitals);
  const condition = element('output', vitals);
  condition.className = 'raid-condition';
  condition.hidden = true;
  const orders = element('div', vitals);
  orders.className = 'raid-orders';
  const lock = button(orders, '', actions.target);
  const call = button(orders, t('callTarget'));
  call.setAttribute('aria-keyshortcuts', 'G');
  const jump = button(deck, t('jump'));
  // The second finger does not always generate a click while a steering finger is held.
  for (const [b, activate] of [
    [jump, actions.jump],
    [call, actions.callTarget],
  ] as const) {
    b.onpointerdown = (e) => {
      if (e.button === 0) b.setPointerCapture(e.pointerId);
    };
    b.onpointerup = (e) => {
      if (
        e.button === 0 &&
        b.hasPointerCapture(e.pointerId) &&
        b.contains(document.elementFromPoint(e.clientX, e.clientY))
      )
        activate();
    };
    b.onclick = (e) => {
      if (e.detail === 0) activate();
    };
  }
  jump.className = 'raid-jump';
  const rack = element('div', deck);
  rack.className = 'raid-skills';
  const aimPad = new RaidAimPad(root, actions);
  let gesture: {
    id: number;
    slot: Skill;
    x: number;
    y: number;
    dragged: boolean;
    button: HTMLButtonElement;
  } | null = null;
  function endGesture() {
    const current = gesture;
    gesture = null;
    if (!current) return;
    if (current.button.hasPointerCapture(current.id))
      current.button.releasePointerCapture(current.id);
    actions.clearPreview();
  }
  const buttons = skills.map((key, i) => {
    const slot = i as Skill;
    const b = button(rack, '');
    b.dataset.skill = key;
    b.setAttribute('aria-keyshortcuts', String(i + 1));
    element('i', b).setAttribute('aria-hidden', 'true');
    const name = element('span', b, t(key));
    const charge = element('small', b);
    b.onpointerdown = (e) => {
      if (gesture || aimPad.skill !== null || e.button !== 0 || b.disabled) return;
      e.preventDefault();
      gesture = { id: e.pointerId, slot, x: e.clientX, y: e.clientY, dragged: false, button: b };
      b.setPointerCapture(e.pointerId);
    };
    function track(e: PointerEvent) {
      if (!gesture || gesture.id !== e.pointerId || gesture.slot !== slot) return;
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 12) gesture.dragged = true;
    }
    b.onpointermove = track;
    b.onpointerup = (e) => {
      if (gesture?.id !== e.pointerId || gesture.slot !== slot) return;
      track(e);
      const dragged = gesture.dragged;
      endGesture();
      if (b.disabled) return;
      if (dragged) {
        if (!b.contains(document.elementFromPoint(e.clientX, e.clientY))) actions.repeatCast(slot);
        return;
      }
      actions.beginPadAim();
      aimPad.open(slot, name.textContent ?? '');
    };
    b.onpointercancel = b.onlostpointercapture = (e) => {
      if (gesture?.id === e.pointerId) endGesture();
    };
    // Keyboard and assistive activations have no preceding pointer sequence.
    b.onclick = (e) => {
      if (e.detail === 0 && !gesture) actions.skill(slot);
    };
    return { b, charge, name };
  });
  const panel = element('section', document.body);
  panel.className = 'raid-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', t('mode'));
  const card = element('div', panel);
  const title = element('h2', card);
  const reason = element('p', card);
  const sizeSetting = element('label', card);
  sizeSetting.className = 'raid-skill-size';
  element('span', sizeSetting, t('skillSize'));
  const sizeInput = element('input', sizeSetting);
  sizeInput.type = 'range';
  sizeInput.min = String(skillSize.min);
  sizeInput.max = String(skillSize.max);
  sizeInput.step = String(skillSize.step);
  sizeInput.value = String(skillSize.value);
  const sizeValue = element('span', sizeSetting);
  sizeValue.setAttribute('aria-hidden', 'true');
  const applySize = () => {
    const percent = sizeInput.valueAsNumber;
    sizeValue.textContent = percent + '%';
    sizeInput.setAttribute('aria-valuetext', sizeValue.textContent);
    root.style.setProperty('--skill-scale', String(percent / 100));
    root.classList.toggle('large-skills', percent > 100);
  };
  applySize();
  sizeInput.oninput = applySize;
  sizeInput.onchange = () => actions.setSkillSize(sizeInput.valueAsNumber);
  const totals = element('p', card);
  const records = element('table', card);
  const resume = button(card, t('resume'), actions.resume);
  const retry = button(card, t('retry'), actions.retry);
  resume.dataset.resumeRaid = retry.dataset.resumeRaid = '';
  button(card, t('leave'), actions.leave);
  function update(view: RaidView, aiming: Skill | null, slot = 0) {
    // A keyboard-armed skill can point to either half of the screen.
    if (aiming !== null && !stick.pad.hidden) stick.reset();
    stick.pad.hidden = aiming !== null;
    const runner = view.runners[slot]!;
    jump.disabled = !!runner.leap || !!runner.jumping || !!runner.respawn || !!runner.staggered;
    const request = view.calls[runner.team];
    call.disabled = !!runner.respawn || runner.target === null || !!request || !!view.result;
    const message = request
      ? t('attackRequest', {
          from: t(view.runners[request.from]!.hero),
          target: t(request.target === 'wagon' ? 'wagon' : view.runners[request.target]!.hero),
        })
      : '';
    if (callout.textContent !== message) callout.textContent = message;
    callout.hidden = !message;
    const counterText = view.hazard ? t(counterLabels[view.hazard.kind]) : '';
    if (warning.textContent !== counterText) warning.textContent = counterText;
    warning.hidden = !counterText || !!view.result;
    const conditions = [
      runner.staggered && t('stagger'),
      runner.slowed && t('slow'),
      runner.silenced && t('silence'),
    ]
      .filter(Boolean)
      .join(' · ');
    if (condition.textContent !== conditions) condition.textContent = conditions;
    condition.hidden = !conditions || !!runner.respawn;
    const seconds = Math.ceil((ROUND_TICKS - view.tick) / RAID_HZ);
    clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    [blue, red].forEach((side, i) => {
      const dmg = Math.min(WAGON_HP, view.damage[i ^ runner.team]!);
      side.bar.value = dmg;
      side.value.textContent = Math.floor((dmg / WAGON_HP) * 100) + '%';
      const kills = view.runners.reduce(
        (sum, r) => sum + (r.team === (i ^ runner.team) ? r.kills : 0),
        0,
      );
      side.kills.textContent = t('teamKills', { count: kills });
    });
    hp.textContent = t('hp') + ' ' + runner.hp + '/' + HEROES[runner.hero].hp;
    rage.textContent = t('rage') + ' ' + runner.rage + '%';
    const target =
      runner.target === null
        ? 'noTarget'
        : runner.target === 'wagon'
          ? 'wagon'
          : view.runners[runner.target]!.hero;
    lock.textContent = t('target') + ' · ' + t(target);
    buttons.forEach(({ b, charge, name }, i) => {
      name.textContent = t(`${runner.hero}${skillNames[i]!}`);
      const cd = Math.ceil(runner.cooldowns[i]! / RAID_HZ);
      b.disabled = !canUseRaidSkill(runner, i as Skill);
      if (b.disabled && gesture?.slot === i) endGesture();
      if (b.disabled && aimPad.skill === i) aimPad.close();
      if (i === 3) {
        b.style.setProperty('--rage-fill', runner.rage + '%');
        charge.textContent = runner.rage + '%';
      } else {
        const fraction = runner.cooldowns[i]! / SKILL_COOLDOWNS[i as Skill];
        b.style.setProperty('--cooldown', Math.round(fraction * 360) + 'deg');
        charge.textContent = cd ? cd + 's' : '';
      }
      b.setAttribute(
        'aria-label',
        name.textContent + (charge.textContent ? ' · ' + charge.textContent : ''),
      );
      b.classList.toggle('armed', i === aiming);
    });
    if (runner.respawn) {
      const remaining = t('respawn', { seconds: Math.ceil(runner.respawn / RAID_HZ) });
      if (countdown.textContent !== remaining) countdown.textContent = remaining;
    }
    respawn.hidden = !runner.respawn;
    if (aiming !== null || performance.now() >= feedbackUntil)
      hint.textContent = aiming !== null ? t('aim') : '';
    hint.hidden = !!runner.respawn || !hint.textContent;
  }
  function showPanel(view: RaidView | null, slot = 0, online = false) {
    stick.reset();
    aimPad.close();
    endGesture();
    actions.clearPreview();
    root.hidden = true;
    panel.hidden = false;
    sizeSetting.hidden = !!view;
    resume.hidden = !!view;
    retry.hidden = !view;
    const teamId = slot < 2 ? 0 : 1;
    const result = view?.result;
    title.textContent = result
      ? t(result.winner === 'draw' ? 'draw' : result.winner === teamId ? 'win' : 'lose')
      : t(online ? 'onlineMenu' : 'paused');
    reason.textContent = result
      ? t(result.reason === 'time' ? 'timeUp' : 'destruction')
      : instructions;
    totals.hidden = !view;
    records.hidden = !view;
    if (view) {
      records.replaceChildren();
      const columns = element('tr', records);
      for (const title of [t('runner'), t('boss'), t('kda')])
        element('th', columns, title).scope = 'col';
      for (const r of view.runners) {
        const row = element('tr', records);
        element('th', row, t(r.team === teamId ? 'blue' : 'red') + ' · ' + t(r.hero));
        element('td', row, String(r.wagonDamage));
        element('td', row, [r.kills, r.deaths, r.assists].join(' / '));
      }
      const kos = (team: number) =>
        view.runners.filter((r) => r.team === team).reduce((n, r) => n + r.kills, 0);
      totals.textContent =
        t('boss') +
        '  ' +
        [teamId, 1 - teamId].map((i) => Math.min(view.damage[i]!, WAGON_HP)).join(' / ') +
        '   ·   ' +
        t('kos') +
        '  ' +
        kos(teamId) +
        ' / ' +
        kos(1 - teamId);
    }
    (view ? retry : resume).focus({ preventScroll: true });
  }
  function showStartCountdown(seconds: number) {
    const text = seconds > 0 ? String(seconds) : '';
    if (startCountdown.textContent === text) return;
    startCountdown.hidden = seconds === 0;
    startCountdown.textContent = text;
    deck.inert = seconds > 0;
  }
  return {
    aimPad,
    selected,
    setup,
    select,
    selectHero(hero: RaidHero) {
      select.value = hero;
      detail.textContent = t(heroInfo[hero]);
    },
    reset() {
      root.hidden = panel.hidden = true;
      aimPad.close();
      stick.reset();
      endGesture();
    },
    update,
    showStartCountdown,
    showPanel,
    showSkillAim(aim: RaidAimFeedback) {
      hint.hidden = false;
      const { state, metrics } = aimFeedback(aim);
      const text = state + ' · ' + metrics;
      if (hint.textContent !== text) hint.textContent = text;
    },
    play(seconds: number) {
      feedbackUntil = 0;
      panel.hidden = true;
      root.hidden = false;
      showStartCountdown(seconds);
    },
    showFeedback(text: string) {
      hint.textContent = text;
      hint.hidden = false;
      feedbackUntil = performance.now() + 1500;
    },
  };
}
