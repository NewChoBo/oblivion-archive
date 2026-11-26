import { raidText as t } from '../content/locales/run-and-raid.ts';
import {
  HEROES,
  HERO_IDS,
  RAID_HZ,
  ROUND_TICKS,
  WAGON_HP,
  type RaidHero,
  type RaidView,
  type Skill,
} from '../game/raid/raid-match.ts';
import './styles/raid.css';

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
interface RaidActions {
  skill(slot: Skill): void;
  target(): void;
  pause(): void;
  resume(): void;
  retry(): void;
  leave(): void;
  held(code: string, pressed: boolean, source: string): void;
  jump(): void;
  drop(skill: Skill, event: PointerEvent): void;
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
  element('small', setup, t('controls', bindings));
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
  const deck = element('div', root);
  deck.className = 'raid-deck';
  const vitals = element('div', deck);
  vitals.className = 'raid-vitals';
  const hp = element('span', vitals);
  const rage = element('span', vitals);
  const lock = button(vitals, '', actions.target);
  const rack = element('div', deck);
  rack.className = 'raid-skills';
  const buttons = skills.map((key, i) => {
    const b = button(rack, '');
    element('kbd', b, String(i + 1));
    const name = element('span', b, t(key));
    const charge = element('small', b);
    let origin: { x: number; y: number } | null = null;
    let dropped = false;
    b.onpointerdown = (e) => {
      dropped = false;
      origin = { x: e.clientX, y: e.clientY };
      b.setPointerCapture(e.pointerId);
    };
    b.onpointerup = (e) => {
      dropped =
        !!origin &&
        (i !== 0 || selected() === 'jade') &&
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 12;
      if (dropped) actions.drop(i as Skill, e);
      origin = null;
    };
    b.onpointercancel = () => {
      origin = null;
      dropped = false;
    };
    b.onclick = (e) => {
      if (!dropped || e.detail === 0) actions.skill(i as Skill);
      dropped = false;
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
      side.value.textContent = t('boss') + ' ' + Math.floor((dmg / WAGON_HP) * 100) + '%';
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
      charge.textContent = cd ? cd + 's' : waiting ? runner.rage + '%' : '';
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
  }
  function showPanel(view: RaidView | null) {
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
      : t('controls', bindings);
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
    selected,
    update,
    showPanel,
    play() {
      panel.hidden = true;
      root.hidden = false;
    },
  };
}
