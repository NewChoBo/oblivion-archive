(() => {
  const width = innerWidth,
    height = innerHeight;
  const find = (selector) => document.querySelector(selector);
  const rect = (e) => e.getBoundingClientRect();
  const visible = (e) =>
    e && e.getClientRects().length && getComputedStyle(e).visibility === 'visible';
  const inside = (r, outer) =>
    r.left >= outer.left - 1 &&
    r.right <= outer.right + 1 &&
    r.top >= outer.top - 1 &&
    r.bottom <= outer.bottom + 1;
  const viewport = { left: 0, top: 0, right: width, bottom: height };
  const errors = [];
  let subtitle;
  const limit = find('#viewport-limit[open]');
  if (limit) {
    if (!inside(rect(limit), viewport)) errors.push('Viewport notice is clipped');
    if (!limit.contains(document.activeElement)) errors.push('Viewport notice did not take focus');
    return { width, height, surface: limit.id, errors };
  }
  const canvas = find('#game'),
    game = rect(canvas);
  if (Math.abs(game.width - width) > 1 || Math.abs(game.height - height) > 1)
    errors.push('Canvas does not fill viewport');
  // The title has no engine. Its unused canvas retains the HTML default buffer dimensions.
  if (
    window.__ROOM_DEMO__?.snapshot().meshCount > 0 &&
    Math.abs(canvas.width - (canvas.height * width) / height) > 1 + width / height
  )
    errors.push('Render buffer aspect differs from viewport');
  if (
    document.documentElement.scrollWidth > width + 1 ||
    document.documentElement.scrollHeight > height + 1
  )
    errors.push('Document overflow');
  const modal = find('#inventory[open]') ?? find('.overlay:not([hidden]) .folio');
  if (modal) {
    if (!inside(rect(modal), viewport)) errors.push('Panel outside viewport');
    const scroller = modal.querySelector('.journal-spread,.settings-layout') ?? modal;
    if (scroller.scrollWidth > scroller.clientWidth + 1) errors.push('Horizontal panel overflow');
    if (
      scroller.scrollHeight > scroller.clientHeight + 1 &&
      !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)
    )
      errors.push('Unreachable panel content');
    for (const e of modal.querySelectorAll('button,input'))
      if (visible(e)) {
        const r = rect(e),
          p = rect(modal);
        if (r.left < p.left - 1 || r.right > p.right + 1)
          errors.push('Control overflows panel: ' + (e.id || e.textContent));
      }
    if (modal.id === 'inventory' && !inside(rect(find('#inventory-close')), rect(modal)))
      errors.push('Journal close is clipped');
  } else {
    const elements = [
      ...document.querySelectorAll(
        '.mast button,#objective,#expedition-quest,#expedition-hud,#minimap,#posture-select,#interact,#weapon-hud,#controls,#nearby-label,#danger,#notice.visible,#performance-hud,#crosshair',
      ),
    ].filter(visible);
    for (const [i, a] of elements.entries()) {
      const r = rect(a),
        name = a.id || a.className || a.tagName;
      if (!inside(r, viewport)) errors.push(name + ' outside viewport');
      for (const b of elements.slice(i + 1)) {
        const s = rect(b);
        if (
          Math.min(r.right, s.right) - Math.max(r.left, s.left) > 1 &&
          Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 1
        )
          errors.push(name + ' overlaps ' + (b.id || b.tagName));
      }
    }
    const sight = rect(find('#crosshair'));
    for (const [selector, left, top] of [
      ['#objective', true, true],
      ['#minimap', false, true],
      ['#expedition-hud', true, false],
      ['#weapon-hud', false, false],
    ]) {
      const element = find(selector);
      if (!visible(element)) continue;
      const box = rect(element);
      if (
        (box.left + box.right) / 2 < width / 2 !== left ||
        (box.top + box.bottom) / 2 < height / 2 !== top
      )
        errors.push(selector + ' is outside its HUD corner');
    }
    if (
      Math.abs((sight.left + sight.right) / 2 - width / 2) > 1 ||
      Math.abs((sight.top + sight.bottom) / 2 - height / 2) > 1
    )
      errors.push('Reticle off centre');
    const notice = find('#notice.visible');
    if (visible(notice)) {
      const box = rect(notice),
        line = find('#notice-text');
      subtitle = {
        text: line.textContent,
        font: parseFloat(getComputedStyle(line).fontSize),
        bottom: box.bottom,
        top: box.top,
      };
      if (
        subtitle.font < 18 ||
        box.top < height * 0.5 ||
        box.bottom < height * 0.78 ||
        Math.abs((box.left + box.right - width) / 2) > 2
      )
        errors.push('Story subtitle is too small or outside the lower centre');
    }
  }
  return {
    width,
    height,
    surface: modal?.id || modal?.parentElement.id || 'game',
    subtitle,
    errors,
  };
})();
