const rangerKeys = {
  s: 'guard',
  d: 'power',
  ' ': 'aura',
  j: 'beam',
  k: 'basic',
};

/** Map physical keys and pointer sources onto the same combat actions. */
export function bindCombatInputs(panel, { active, press, release, cancel }, target = window, doc = document) {
  const held = new Map();
  const buttons = [...panel.querySelectorAll('[data-action]')];
  /** Check whether any tracked input still holds the given action. */
  const holding = action => [...held.values()].includes(action);
  /** Mirror the held state on the touch controls. */
  function paint() {
    for (const button of buttons) button.classList.toggle('is-held', holding(button.dataset.action));
  }
  /** Record a new input source and deliver its press without repeating a shared hold. */
  function down(source, action, fromButton = false) {
    if (!active() || held.has(source)) return;
    const alreadyHeld = holding(action);
    held.set(source, action);
    paint();
    if (!alreadyHeld) press(action, fromButton, true);
  }
  /** Release a source and end the action only when no other source holds it. */
  function up(source, cancelled = false) {
    const action = held.get(source);
    if (!action) return;
    held.delete(source);
    if (!holding(action)) release(action, cancelled);
    paint();
  }
  /** Release tracked input when the session or its focus is lost. */
  function reset() {
    for (const source of [...held.keys()]) up(source, true);
    cancel?.();
  }
  for (const button of buttons) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !active() || panel.hidden) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      down(event.pointerId, button.dataset.action, true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => up(event.pointerId, type !== 'pointerup'));
    }
    button.addEventListener('contextmenu', event => event.preventDefault());
    // Keyboard and assistive-technology activation of the visible buttons.
    button.addEventListener('keydown', event => {
      // Space is reserved for Aura during combat, even on a focused button.
      if (event.key !== 'Enter' || !active()) return;
      event.preventDefault();
      down('button-' + event.key, button.dataset.action, true);
    });
    button.addEventListener('keyup', event => up('button-' + event.key));
    button.addEventListener('blur', () => {
      up('button-Enter', true);
    });
    button.addEventListener('click', event => {
      if (event.detail !== 0 || !active() || holding(button.dataset.action)) return;
      // Assistive activation has no physical hold to measure.
      press(button.dataset.action, true, false);
      release(button.dataset.action, false);
    });
  }
  target.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!active() || event.target?.tagName === 'SELECT' || !Object.hasOwn(rangerKeys, key) ||
        event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat) down('key-' + key, rangerKeys[key]);
  });
  target.addEventListener('keyup', event => {
    const source = 'key-' + event.key.toLowerCase();
    if (event.key === ' ' && held.has(source)) event.preventDefault();
    up(source);
  });
  target.addEventListener('blur', reset);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) reset(); });
  return { reset };
}
