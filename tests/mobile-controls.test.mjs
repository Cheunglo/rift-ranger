import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCombatInputs } from '../mobile-controls.mjs';

/** Build fake event targets and capture emitted combat actions. */
function setup() {
  const target = new EventTarget();
  const doc = new EventTarget();
  const buttons = Object.fromEntries(['basic', 'guard', 'power', 'beam', 'aura'].map(action => {
    const button = new EventTarget();
    button.dataset = { action };
    button.classList = {
      /** Accept held-state styling updates without a DOM. */
      toggle() {},
    };
    /** Allow production pointer handling on this synthetic event target. */
    button.setPointerCapture = () => {};
    return [action, button];
  }));
  const log = [];
  const panel = {
    /** Expose one synthetic button for each combat action. */
    querySelectorAll: () => Object.values(buttons),
  };
  const inputs = bindCombatInputs(panel, {
    /** Keep combat active for the duration of the input test. */
    active: () => true,
    /** Append the start of an action to the event log. */
    press: action => log.push('+' + action),
    /** Append the end of an action to the event log. */
    release: action => log.push('-' + action),
  }, target, doc);
  /** Dispatch one synthetic event with the supplied pointer or keyboard data. */
  const send = (element, type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    element.dispatchEvent(event);
    return event;
  };
  /** Begin a synthetic touch on a named action. */
  const down = (action, pointerId) => send(buttons[action], 'pointerdown', { button: 0, pointerId });
  /** End or cancel a synthetic touch on a named action. */
  const up = (action, pointerId, type = 'pointerup') => send(buttons[action], type, { pointerId });
  return { target, doc, log, inputs, send, down, up };
}
test('hold block and aura while tapping attacks; release independently', () => {
  const { down, up, log } = setup();
  down('guard', 1); down('aura', 2); down('basic', 3); up('basic', 3); up('aura', 2); up('guard', 1);
  assert.deepEqual(log, ['+guard', '+aura', '+basic', '-basic', '-aura', '-guard']);
});
test('keyboard and two fingers share a hold until all sources release', () => {
  const { down, up, send, target, log } = setup();
  send(target, 'keydown', { key: 's' }); down('guard', 1); down('guard', 2);
  send(target, 'keyup', { key: 's' }); up('guard', 1);
  assert.deepEqual(log, ['+guard']);
  up('guard', 2); down('guard', 3);
  assert.deepEqual(log, ['+guard', '-guard', '+guard']);
});
test('cancellation, lost capture, focus loss, and hidden page release holds', () => {
  const { down, up, send, target, doc, log, inputs } = setup();
  down('guard', 1); up('guard', 1, 'pointercancel'); up('guard', 1, 'lostpointercapture');
  down('aura', 2); send(target, 'blur');
  down('guard', 3); doc.hidden = true; send(doc, 'visibilitychange');
  down('aura', 4); inputs.reset();
  assert.deepEqual(log, ['+guard', '-guard', '+aura', '-aura', '+guard', '-guard', '+aura', '-aura']);
});
test('power and laser fire once per press, with repeat keydown ignored', () => {
  const { down, up, send, target, log } = setup();
  down('power', 1); up('power', 1); down('beam', 2); up('beam', 2);
  send(target, 'keydown', { key: 'k' });
  send(target, 'keydown', { key: 'k', repeat: true });
  send(target, 'keyup', { key: 'k' });
  assert.deepEqual(log, ['+power', '-power', '+beam', '-beam', '+basic', '-basic']);
});

test('space holds Aura and suppresses native actions even on key repeat', () => {
  const { send, target, log } = setup();
  assert.equal(send(target, 'keydown', { key: ' ' }).defaultPrevented, true);
  assert.equal(send(target, 'keydown', { key: ' ', repeat: true }).defaultPrevented, true);
  assert.equal(send(target, 'keyup', { key: ' ' }).defaultPrevented, true);
  assert.deepEqual(log, ['+aura', '-aura']);
});

test('right-hand keys fire Laser and Slash, with the old bindings inactive', () => {
  const { send, target, log } = setup();
  for (const key of ['a', 'f', 'g', 'j', 'k']) {
    send(target, 'keydown', { key });
    send(target, 'keyup', { key });
  }
  assert.deepEqual(log, ['+beam', '-beam', '+basic', '-basic']);
});
