// Track each finger and physical key independently so simultaneous holds are safe.
export function bindCombatInputs(panel, { active, press, release }, target = window, doc = document) {
  const held = new Map();
  const buttons = [...panel.querySelectorAll('[data-key]')];
  const valid = new Set(['a', 's', 'd', 'f', 'g']);
  const holding = key => [...held.values()].some(input => input.key === key);
  function paint() {
    for (const button of buttons) button.classList.toggle('is-held', holding(button.dataset.key));
  }
  function down(source, key, button) {
    if (!active() || held.has(source)) return;
    const alreadyHeld = holding(key);
    held.set(source, { key, button });
    paint();
    if (!alreadyHeld || (key !== 's' && key !== 'g')) press(key, !!button);
  }
  function up(source) {
    const input = held.get(source);
    if (!input) return;
    held.delete(source);
    if (!holding(input.key)) release(input.key);
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
      down(event.pointerId, button.dataset.key, button);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, event => up(event.pointerId));
    }
    button.addEventListener('contextmenu', event => event.preventDefault());
    // Keyboard and assistive-technology activation of the visible buttons.
    button.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      down('button-' + event.key, button.dataset.key, button);
    });
    button.addEventListener('keyup', event => up('button-' + event.key));
    button.addEventListener('blur', () => {
      up('button- ');
      up('button-Enter');
    });
    button.addEventListener('click', event => {
      if (event.detail !== 0 || !active() || holding(button.dataset.key)) return;
      down('activate', button.dataset.key, button);
      up('activate');
    });
  }
  target.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!active() || !valid.has(key) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    down('key-' + key, key);
  });
  target.addEventListener('keyup', event => up('key-' + event.key.toLowerCase()));
  target.addEventListener('blur', reset);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) reset(); });
  return { reset };
}
