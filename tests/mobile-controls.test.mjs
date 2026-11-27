import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCombatInputs } from '../mobile-controls.mjs';
function setup() {
  const target = new EventTarget();
  const doc = new EventTarget();
  const buttons = Object.fromEntries(['a', 's', 'd', 'f', 'g'].map(key => {
    const button = new EventTarget();
    button.dataset = { key };
    button.classList = { toggle() {} };
    button.setPointerCapture = () => {};
    return [key, button];
  }));
  const log = [];
  const panel = { querySelectorAll: () => Object.values(buttons) };
  const inputs = bindCombatInputs(panel, {
    active: () => true,
    press: key => log.push('+' + key),
    release: key => log.push('-' + key),
  }, target, doc);
  const send = (element, type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    element.dispatchEvent(event);
  };
  const down = (key, pointerId) => send(buttons[key], 'pointerdown', { button: 0, pointerId });
  const up = (key, pointerId, type = 'pointerup') => send(buttons[key], type, { pointerId });
  return { target, doc, log, inputs, send, down, up };
}
test('hold block and aura while tapping attacks; release independently', () => {
  const { down, up, log } = setup();
  down('s', 1); down('g', 2); down('a', 3); up('a', 3); up('g', 2); up('s', 1);
  assert.deepEqual(log, ['+s', '+g', '+a', '-a', '-g', '-s']);
});
test('keyboard and two fingers share a hold until all sources release', () => {
  const { down, up, send, target, log } = setup();
  send(target, 'keydown', { key: 's' }); down('s', 1); down('s', 2);
  send(target, 'keyup', { key: 's' }); up('s', 1);
  assert.deepEqual(log, ['+s']);
  up('s', 2); down('s', 3);
  assert.deepEqual(log, ['+s', '-s', '+s']);
});
test('cancellation, lost capture, focus loss, and hidden page release holds', () => {
  const { down, up, send, target, doc, log, inputs } = setup();
  down('s', 1); up('s', 1, 'pointercancel'); up('s', 1, 'lostpointercapture');
  down('g', 2); send(target, 'blur');
  down('s', 3); doc.hidden = true; send(doc, 'visibilitychange');
  down('g', 4); inputs.reset();
  assert.deepEqual(log, ['+s', '-s', '+g', '-g', '+s', '-s', '+g', '-g']);
});
test('power and laser fire once per press, with repeat keydown ignored', () => {
  const { down, up, send, target, log } = setup();
  down('d', 1); up('d', 1); down('f', 2); up('f', 2);
  send(target, 'keydown', { key: 'a' });
  send(target, 'keydown', { key: 'a', repeat: true });
  send(target, 'keyup', { key: 'a' });
  assert.deepEqual(log, ['+d', '-d', '+f', '-f', '+a', '-a']);
});
