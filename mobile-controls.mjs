const rangerKeys = {
  s: 'guard',
  d: 'power',
  ' ': 'aura',
  j: 'beam',
  k: 'basic',
};

// Track each finger and physical key independently so simultaneous holds are safe.
export function bindCombatInputs(panel, { active, press, release }, target = window, doc = document) {
  const held = new Map();
  const buttons = [...panel.querySelectorAll('[data-action]')];
  const holding = action => [...held.values()].includes(action);
  function paint() {
    for (const button of buttons) button.classList.toggle('is-held', holding(button.dataset.action));
  }
  function down(source, action, fromButton = false) {
    if (!active() || held.has(source)) return;
    const alreadyHeld = holding(action);
    held.set(source, action);
    paint();
    if (!alreadyHeld || (action !== 'guard' && action !== 'aura')) press(action, fromButton);
  }
  function up(source) {
    const action = held.get(source);
    if (!action) return;
    held.delete(source);
    if (!holding(action)) release(action);
    paint();
  }
  function reset() {
    for (const source of [...held.keys()]) up(source);
  }
  for (const button of buttons) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !active() || panel.hidden) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      down(event.pointerId, button.dataset.action, true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => up(event.pointerId));
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
      up('button-Enter');
    });
    button.addEventListener('click', event => {
      if (event.detail !== 0 || !active() || holding(button.dataset.action)) return;
      down('activate', button.dataset.action, true);
      up('activate');
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
