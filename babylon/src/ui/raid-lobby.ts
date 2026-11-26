import { raidText as t } from '../content/locales/run-and-raid.ts';
import { isRaidRoster, type DraftSeat } from '../game/raid/raid-draft.ts';
import { HERO_IDS, HEROES, type RaidHero } from '../game/raid/raid-match.ts';
import type { RoomError } from '../platform/photon/raid-room.ts';
export function createRaidLobby(
  parent: HTMLElement,
  actions: {
    connect(code: string, create: boolean): void;
    start(): void;
    leave(): void;
    pick(hero: RaidHero | null): void;
    selected(): RaidHero;
  },
) {
  const group = document.createElement('section');
  group.className = 'raid-lobby';
  parent.append(group);
  const heading = document.createElement('h2');
  heading.textContent = t('online');
  const controls = document.createElement('div');
  const code = document.createElement('input');
  code.placeholder = t('roomCode');
  code.setAttribute('aria-label', t('roomCode'));
  code.maxLength = 6;
  code.autocomplete = 'off';
  code.spellcheck = false;
  const status = document.createElement('output');
  status.setAttribute('aria-live', 'polite');
  const teams = document.createElement('ul');
  const draft = document.createElement('div');
  draft.className = 'raid-draft';
  const title = document.createElement('h3');
  title.textContent = t('pickHeading');
  const cards = document.createElement('div');
  cards.className = 'raid-pick-grid';
  const profile = document.createElement('figure');
  profile.className = 'raid-pick-profile';
  const portrait = document.createElement('img');
  portrait.alt = '';
  portrait.width = portrait.height = 240;
  const caption = document.createElement('figcaption');
  const heroName = document.createElement('strong');
  const range = document.createElement('small');
  const detail = document.createElement('p');
  const skills = document.createElement('p');
  skills.className = 'raid-pick-skills';
  caption.append(heroName, range, detail, skills);
  profile.append(portrait, caption);
  const notice = document.createElement('p');
  notice.setAttribute('aria-live', 'polite');
  const lock = document.createElement('button');
  lock.type = 'button';
  let preview: RaidHero = actions.selected();
  let seats: DraftSeat[] = [];
  let self = 0;
  const choices = HERO_IDS.map((hero) => {
    const card = document.createElement('button');
    card.type = 'button';
    const image = document.createElement('img');
    image.src = './assets/raid/portraits/' + hero + '.webp';
    image.alt = '';
    image.width = image.height = 80;
    image.loading = 'lazy';
    const name = document.createElement('span');
    name.textContent = t(hero);
    const taken = document.createElement('small');
    taken.textContent = t('pickTaken');
    card.append(image, name, taken);
    card.onclick = () => {
      preview = hero;
      paint();
    };
    cards.append(card);
    return { hero, card, taken };
  });
  function paint() {
    const mine = seats.find((s) => s.actor === self)?.hero;
    if (mine) preview = mine;
    for (const { hero, card, taken } of choices) {
      const occupied = seats.some((s) => s.hero === hero && s.actor !== self);
      card.disabled = occupied || (!!mine && hero !== mine);
      taken.hidden = !occupied;
      card.setAttribute('aria-pressed', String(hero === preview));
    }
    const imageUrl = './assets/raid/portraits/' + preview + '.webp';
    if (portrait.getAttribute('src') !== imageUrl) portrait.src = imageUrl;
    heroName.textContent = t(preview);
    range.textContent = t('reach', { range: HEROES[preview].reach });
    detail.textContent = t(`${preview}Info`);
    skills.textContent = (['Pulse', 'Bolt', 'Field', 'Fury'] as const)
      .map((s) => t(`${preview}${s}`))
      .join(' · ');
    lock.textContent = t(mine ? 'unlockPick' : 'lockPick');
    lock.disabled = !mine && seats.some((s) => s.hero === preview);
    notice.textContent = t(
      lock.disabled
        ? 'pickConflict'
        : seats.length < 2
          ? 'pickPlayers'
          : isRaidRoster(seats)
            ? 'pickReady'
            : 'pickWait',
    );
  }
  lock.onclick = () => actions.pick(seats.find((s) => s.actor === self)?.hero ? null : preview);
  draft.append(title, cards, lock, notice);
  const wide = matchMedia(
    '(min-width: 820px) and (min-height: 480px), (orientation: landscape) and (min-width: 568px) and (min-height: 320px)',
  );
  const titleCopy = document.querySelector<HTMLElement>('#overlay .title-copy')!;
  const placeProfile = () => (wide.matches ? titleCopy.append(profile) : lock.before(profile));
  placeProfile();
  wide.addEventListener('change', placeProfile);
  group.append(heading, status, teams, draft, controls);
  function button(label: string, click: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = click;
    controls.append(b);
    return b;
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const host = button(t('hostRoom'), () =>
    actions.connect(
      Array.from(
        crypto.getRandomValues(new Uint8Array(6)),
        (v) => alphabet[v % alphabet.length],
      ).join(''),
      true,
    ),
  );
  controls.append(code);
  const join = button(t('joinRoom'), () => actions.connect(code.value, false));
  code.oninput = () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
    join.disabled = code.value.length !== 6;
  };
  code.onkeydown = (e) => {
    if (e.key === 'Enter' && !join.disabled) join.click();
  };
  const start = button(t('startRound'), actions.start);
  const leave = button(t('leaveRoom'), actions.leave);
  function show(stage: 'entry' | 'connecting' | 'draft') {
    const room = stage !== 'entry';
    host.hidden = join.hidden = code.hidden = room;
    leave.hidden = !room;
    if (stage !== 'draft') start.hidden = true;
    teams.replaceChildren();
    draft.hidden = profile.hidden = stage !== 'draft';
    parent.classList.toggle('in-room', room);
    join.disabled = code.value.length !== 6;
  }
  show('entry');
  return {
    pending() {
      preview = actions.selected();
      show('connecting');
      status.textContent = t('connecting');
    },
    reset(reason?: RoomError) {
      show('entry');
      status.textContent = reason ? t(reason) : '';
    },
    room(roomCode: string, members: DraftSeat[], actor: number, isHost: boolean) {
      seats = members;
      self = actor;
      show('draft');
      paint();
      status.textContent = t('roomStatus', { code: roomCode, count: seats.length });
      for (const side of [0, 1]) {
        const item = document.createElement('li');
        const names = [seats[side], seats[side + 2]].map((s) =>
          s
            ? (s.hero ? t(s.hero) : t('picking')) + (s.actor === self ? ' (' + t('you') + ')' : '')
            : t('bot'),
        );
        item.textContent = t(side === 0 ? 'teamA' : 'teamB') + ' · ' + names.join(' / ');
        teams.append(item);
      }
      start.hidden = !isHost;
      start.disabled = !isRaidRoster(seats);
    },
  };
}
