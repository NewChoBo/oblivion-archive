import { raidText as t } from '../content/locales/run-and-raid.ts';
import type { Skill } from '../game/raid/raid-match.ts';

export type AimPoint = Pick<PointerEvent, 'clientX' | 'clientY'>;
export interface RaidAimActions {
  preview(skill: Skill, point: AimPoint): boolean;
  clearPreview(): void;
  drop(skill: Skill, point: AimPoint): boolean;
}

/** Touch coordinates move an independent screen cursor. Lifting after a swipe lets the thumb reposition. */
export class RaidAimPad {
  readonly #layer = document.createElement('div');
  readonly #surface = document.createElement('button');
  readonly #cursor = document.createElement('i');
  readonly #actions: RaidAimActions;
  #slot: Skill | null = null;
  #point = { clientX: 0, clientY: 0 };
  #contact: { id: number; x: number; y: number; moved: boolean; confirm: boolean } | null = null;

  constructor(root: HTMLElement, actions: RaidAimActions) {
    this.#actions = actions;
    this.#layer.className = 'raid-aim';
    this.#layer.hidden = true;
    const cancel = document.createElement('button');
    cancel.className = 'raid-aim-cancel';
    cancel.textContent = t('cancelAim');
    cancel.onclick = () => this.close();
    // A second thumb does not produce a compatibility click while steering is held.
    cancel.onpointerup = (e) => {
      if (e.button === 0 && document.elementFromPoint(e.clientX, e.clientY) === cancel)
        this.close();
    };
    this.#surface.className = 'raid-aim-pad';
    this.#surface.type = cancel.type = 'button';
    this.#cursor.className = 'raid-aim-cursor';
    this.#cursor.setAttribute('aria-hidden', 'true');
    this.#layer.append(this.#surface, this.#cursor, cancel);
    root.append(this.#layer);
    this.#surface.onpointerdown = (e) => this.#start(e, true);
    this.#surface.onpointermove = (e) => this.#move(e);
    this.#surface.onpointerup = (e) => {
      const contact = this.#contact;
      if (contact?.id !== e.pointerId) return;
      this.#move(e);
      this.#release();
      if (contact.confirm && !contact.moved) this.#confirm();
    };
    this.#surface.onpointercancel = this.#surface.onlostpointercapture = (e) => {
      if (this.#contact?.id === e.pointerId) this.close();
    };
    this.#surface.onclick = (e) => {
      if (e.detail === 0) this.#confirm();
    };
  }

  get skill() {
    return this.#slot;
  }

  open(slot: Skill, name: string, event: PointerEvent) {
    if (this.#slot !== null) return;
    this.#slot = slot;
    this.#layer.hidden = false;
    const bounds = this.#layer.getBoundingClientRect();
    this.#point = {
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    this.#surface.textContent = t('touchAim', { skill: name });
    this.#start(event, false);
    this.refresh();
  }

  #start(e: PointerEvent, confirm: boolean) {
    if (this.#contact || e.button !== 0 || this.#slot === null) return;
    e.preventDefault();
    this.#contact = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, confirm };
    this.#surface.setPointerCapture(e.pointerId);
  }

  #move(e: PointerEvent) {
    const c = this.#contact;
    if (!c || c.id !== e.pointerId) return;
    const dx = e.clientX - c.x,
      dy = e.clientY - c.y;
    if ((!c.moved && Math.hypot(dx, dy) <= 5) || (!dx && !dy)) return;
    c.moved = true;
    c.x = e.clientX;
    c.y = e.clientY;
    const bounds = this.#layer.getBoundingClientRect();
    this.#point.clientX = Math.max(
      bounds.left,
      Math.min(bounds.right - 1, this.#point.clientX + dx),
    );
    this.#point.clientY = Math.max(
      bounds.top,
      Math.min(bounds.bottom - 1, this.#point.clientY + dy),
    );
    this.refresh();
  }

  refresh() {
    if (this.#slot === null) return;
    const valid = this.#actions.preview(this.#slot, this.#point);
    this.#cursor.classList.toggle('valid', valid);
    this.#cursor.style.left = this.#point.clientX + 'px';
    this.#cursor.style.top = this.#point.clientY + 'px';
  }

  #confirm() {
    if (this.#slot !== null && this.#actions.drop(this.#slot, this.#point)) this.close();
  }

  #release() {
    const id = this.#contact?.id;
    this.#contact = null;
    if (id !== undefined && this.#surface.hasPointerCapture(id))
      this.#surface.releasePointerCapture(id);
  }

  close() {
    if (this.#slot === null) return;
    this.#slot = null;
    this.#release();
    this.#layer.hidden = true;
    this.#actions.clearPreview();
  }
}
