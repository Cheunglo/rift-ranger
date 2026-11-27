import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackTell, coolFlame, openingStrike, scheduleNextStrike } from '../boss-attacks.mjs';

function battle() {
  return { ...openingStrike('camera', false, 0), warningStart: 0, lessonIndex: null, shaken: false };
}

test('status fits between regular and special turns and preserves the rotation', () => {
  const round = battle();
  for (const expected of ['flame', 'laser', 'flame', 'shout', 'laser']) {
    scheduleNextStrike(round, round.strike, 100, 100);
    assert.equal(round.strikeKind, expected);
  }
  assert.equal(round.turnsSinceStatus, 0);
});

test('low health moves the status up, but a shaken Ranger skips that turn', () => {
  const round = battle();
  for (let turn = 0; turn < 3; turn++) scheduleNextStrike(round, round.strike, 40, 100);
  assert.equal(round.strikeKind, 'shout');
  assert.equal(attackTell(round, round.strike - 900).eyeWarning, false);
  assert.equal(attackTell(round, round.strike - 900).inhale, .025);
  assert.equal(attackTell(round, round.strike - 100).inhale, null);
  round.shaken = true;
  scheduleNextStrike(round, round.strike, 40, 100);
  for (let turn = 0; turn < 3; turn++) scheduleNextStrike(round, round.strike, 40, 100);
  assert.equal(round.strikeKind, 'laser');
  assert.equal(round.turnsSinceStatus, 0);
});

test('cooling a flame shifts a pending guard break with it', () => {
  const round = battle();
  scheduleNextStrike(round, 7000, 100, 100);
  round.comboLaserAt = round.strike - 2300;
  const blue = round.strike - 7100 + 4500;
  assert.deepEqual(coolFlame(round, 'basic', blue), { cooledTo: 'yellow' });
  assert.equal(round.comboLaserAt, round.strike - 2300);
});
