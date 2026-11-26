import { raidText as t } from '../content/locales/run-and-raid.ts';
import {
  HEROES,
  HERO_IDS,
  RAID_HZ,
  ROUND_TICKS,
  SKILL_COOLDOWNS,
  WAGON_HP,
  type RaidHero,
  type RaidView,
  type Skill,
} from '../game/raid/raid-match.ts';
import { createTouchPad, type PadAxis } from './touch-pad.ts';
import { RaidAimPad, type RaidAimActions } from './raid-aim-pad.ts';
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
interface RaidActions extends RaidAimActions {
  skill(slot: Skill): void;
  target(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  leave(): void;
  held(code: string, pressed: boolean, source: string): void;
  jump(): void;
  steer(side: PadAxis, walk: boolean): void;
  beginTouchAim(): void;
}
export function createRaidHud(
  actions: RaidActions,
  bindings: Record<'left' | 'right' | 'jump' | 'walk', string>,
) {
  const setup = document.createElement('div');
  setup.className = 'raid-setup';
  const start = document.querySelector<HTMLButtonElement>('#start')!;
  start.before(setup);
  element('p', setup, t('rules'));
  const label = element('label', setup, t('hero'));
  const select = element('select', label);
  for (const hero of HERO_IDS) select.add(new Option(t(hero), hero));
  const detail = element('small', setup);
  const selected = () => select.value as RaidHero;
  const heroInfo = {
    hammer: 'hammerInfo',
    abyss: 'abyssInfo',
    longshot: 'longshotInfo',
    jade: 'jadeInfo',
  } as const;
  select.onchange = () => {
    detail.textContent = t(heroInfo[selected()]);
  };
  detail.textContent = t(heroInfo[selected()]);
  const touch = matchMedia('(any-pointer: coarse)');
  const instructions = () => (touch.matches ? t('touchControls') : t('controls', bindings));
  const guide = element('small', setup, instructions());
  const compact = matchMedia(
    '(any-pointer: coarse) and (orientation: landscape) and (max-height: 319px)',
  );
  const titleCopy = document.querySelector<HTMLElement>('#overlay .title-copy')!;
  const placeGuide = () => (compact.matches ? titleCopy : setup).append(guide);
  placeGuide();
  compact.addEventListener('change', placeGuide);
  touch.addEventListener('change', () => {
    guide.textContent = instructions();
  });
  const home = button(start.parentElement!, t('leave'), actions.leave);
  home.className = 'subtle';
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
    return { value, bar };
  }
  const blue = team('blue');
  const clock = element('time', score);
  clock.setAttribute('aria-label', t('time'));
  const red = team('red');
  const pauseButton = button(root, 'Ⅱ', actions.pause);
  pauseButton.className = 'raid-pause';
  pauseButton.setAttribute('aria-label', t('pause'));
  const hint = element('output', root);
  hint.className = 'raid-hint';
  const movement = element('div', root);
  movement.className = 'raid-move';
  for (const [code, text, name] of [
    ['left', '◀', t('left')],
    ['right', '▶', t('right')],
    ['walk', t('walk'), t('walk')],
  ] as const) {
    const b = button(movement, text);
    b.setAttribute('aria-label', name);
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      actions.held(code, true, 'touch' + e.pointerId);
    };
    b.onlostpointercapture = (e) => actions.held(code, false, 'touch' + e.pointerId);
  }
  button(movement, t('jump'), actions.jump);
  const stick = createTouchPad(
    t('steer'),
    { shape: 'semicircle', brakeLabel: t('walk') },
    (side, y) => actions.steer(side, y > 0),
  );
  root.append(stick.pad);
  const deck = element('div', root);
  deck.className = 'raid-deck';
  const vitals = element('div', deck);
  vitals.className = 'raid-vitals';
  const hp = element('span', vitals);
  const rage = element('span', vitals);
  const lock = button(vitals, '', actions.target);
  const jump = button(deck, t('jump'), actions.jump);
  jump.className = 'raid-jump';
  const rack = element('div', deck);
  rack.className = 'raid-skills';
  const aimPad = new RaidAimPad(root, actions);
  const onCourse = (e: PointerEvent) =>
    document.elementFromPoint(e.clientX, e.clientY)?.id === 'game';
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
    current.button.classList.remove('dragging');
    if (current.button.hasPointerCapture(current.id))
      current.button.releasePointerCapture(current.id);
    actions.clearPreview();
  }
  const buttons = skills.map((key, i) => {
    const slot = i as Skill;
    const b = button(rack, '');
    b.dataset.skill = key;
    element('kbd', b, String(i + 1));
    element('i', b).setAttribute('aria-hidden', 'true');
    const name = element('span', b, t(key));
    const charge = element('small', b);
    b.onpointerdown = (e) => {
      if (gesture || aimPad.skill !== null || e.button !== 0 || b.disabled) return;
      e.preventDefault();
      if (e.pointerType === 'touch' && (slot !== 0 || selected() === 'jade')) {
        actions.beginTouchAim();
        aimPad.open(slot, name.textContent ?? '', e);
        return;
      }
      gesture = { id: e.pointerId, slot, x: e.clientX, y: e.clientY, dragged: false, button: b };
      b.setPointerCapture(e.pointerId);
    };
    function track(e: PointerEvent) {
      if (!gesture || gesture.id !== e.pointerId || gesture.slot !== slot) return;
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 12) gesture.dragged = true;
    }
    b.onpointermove = (e) => {
      track(e);
      if (gesture?.id !== e.pointerId || !gesture.dragged) return;
      b.classList.add('dragging');
      if (!onCourse(e)) actions.clearPreview();
      else if (slot !== 0 || selected() === 'jade') actions.preview(slot, e);
    };
    b.onpointerup = (e) => {
      if (gesture?.id !== e.pointerId || gesture.slot !== slot) return;
      track(e);
      const dragged = gesture.dragged;
      endGesture();
      if (b.disabled) return;
      if (!dragged) actions.skill(slot);
      else if (onCourse(e) && (slot !== 0 || selected() === 'jade')) actions.drop(slot, e);
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
  const totals = element('p', card);
  const records = element('table', card);
  const resume = button(card, t('resume'), actions.resume);
  const retry = button(card, t('retry'), actions.retry);
  button(card, t('leave'), actions.leave);
  function update(view: RaidView, aiming: boolean) {
    const runner = view.runners[0]!;
    const seconds = Math.ceil((ROUND_TICKS - view.tick) / RAID_HZ);
    clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    [blue, red].forEach((side, i) => {
      const dmg = Math.min(WAGON_HP, view.damage[i]!);
      side.bar.value = dmg;
      side.value.textContent =
        (touch.matches ? '' : t('boss') + ' ') + Math.floor((dmg / WAGON_HP) * 100) + '%';
    });
    hp.textContent = t('hp') + ' ' + runner.hp + '/' + HEROES[runner.hero].hp;
    rage.textContent = t('rage') + ' ' + runner.rage + '%';
    const target = runner.target === 'wagon' ? 'wagon' : view.runners[runner.target]!.hero;
    lock.textContent = t('target') + ' · ' + t(target);
    buttons.forEach(({ b, charge, name }, i) => {
      name.textContent = t(i === 0 && runner.hero === 'jade' ? 'shield' : skills[i]!);
      const cd = Math.ceil(runner.cooldowns[i]! / RAID_HZ);
      const waiting = i === 3 && runner.rage < 100;
      b.disabled = !!runner.respawn || !!runner.silenced || cd > 0 || waiting;
      if (b.disabled && gesture?.slot === i) endGesture();
      if (b.disabled && aimPad.skill === i) aimPad.close();
      const fraction = cd
        ? runner.cooldowns[i]! / SKILL_COOLDOWNS[i as Skill]
        : waiting
          ? 1 - runner.rage / 100
          : 0;
      b.style.setProperty('--cooldown', Math.round(fraction * 360) + 'deg');
      charge.textContent = cd ? cd + 's' : waiting ? runner.rage + '%' : '';
      b.setAttribute(
        'aria-label',
        name.textContent + (charge.textContent ? ' · ' + charge.textContent : ''),
      );
      b.classList.toggle('armed', i === 2 && aiming);
    });
    hint.textContent = runner.respawn
      ? t('respawn', { seconds: Math.ceil(runner.respawn / RAID_HZ) })
      : runner.silenced
        ? t('silence')
        : aiming
          ? t('aim')
          : '';
    hint.hidden = !hint.textContent;
    aimPad.refresh();
  }
  function showPanel(view: RaidView | null) {
    stick.reset();
    aimPad.close();
    endGesture();
    actions.clearPreview();
    root.hidden = true;
    panel.hidden = false;
    resume.hidden = !!view;
    retry.hidden = !view;
    const result = view?.result;
    title.textContent = result
      ? t(result.winner === 'draw' ? 'draw' : result.winner === 0 ? 'win' : 'lose')
      : t('paused');
    reason.textContent = result
      ? t(result.reason === 'time' ? 'timeUp' : 'destruction')
      : instructions();
    totals.hidden = !view;
    records.hidden = !view;
    if (view) {
      records.replaceChildren();
      element('caption', records, t('kda'));
      for (const r of view.runners) {
        const row = element('tr', records);
        element('th', row, t(r.team === 0 ? 'blue' : 'red') + ' · ' + t(r.hero));
        element('td', row, [r.kills, r.deaths, r.assists].join(' / '));
      }
      const kos = (team: number) =>
        view.runners.filter((r) => r.team === team).reduce((n, r) => n + r.kills, 0);
      totals.textContent =
        t('boss') +
        '  ' +
        view.damage.map((n) => Math.min(n, WAGON_HP)).join(' / ') +
        '   ·   ' +
        t('kos') +
        '  ' +
        kos(0) +
        ' / ' +
        kos(1);
    }
    (view ? retry : resume).focus({ preventScroll: true });
  }
  return {
    aimPad,
    selected,
    update,
    showPanel,
    play() {
      panel.hidden = true;
      root.hidden = false;
    },
  };
}
