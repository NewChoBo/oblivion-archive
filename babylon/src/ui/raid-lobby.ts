import { raidText as t } from '../content/locales/run-and-raid.ts';
import type { RaidSeat } from '../game/raid/raid-round.ts';
import type { RoomError } from '../platform/photon/raid-room.ts';
export function createRaidLobby(
  parent: HTMLElement,
  actions: { connect(code: string, create: boolean): void; start(): void; leave(): void },
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
  group.append(heading, controls, status, teams);
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
  function show(room: boolean) {
    host.hidden = join.hidden = code.hidden = room;
    leave.hidden = !room;
    start.hidden = true;
    teams.replaceChildren();
    join.disabled = code.value.length !== 6;
  }
  show(false);
  return {
    pending() {
      show(true);
      status.textContent = t('connecting');
    },
    reset(reason?: RoomError) {
      show(false);
      status.textContent = reason ? t(reason) : '';
    },
    room(roomCode: string, seats: RaidSeat[], self: number, isHost: boolean) {
      show(true);
      status.textContent = t('roomStatus', { code: roomCode, count: seats.length });
      for (const side of [0, 1]) {
        const item = document.createElement('li');
        const names = [seats[side], seats[side + 2]].map((s) =>
          s ? t(s.hero) + (s.actor === self ? ' (' + t('you') + ')' : '') : t('bot'),
        );
        item.textContent = t(side === 0 ? 'teamA' : 'teamB') + ' · ' + names.join(' / ');
        teams.append(item);
      }
      start.hidden = !isHost;
      start.disabled = seats.length < 2;
    },
  };
}
