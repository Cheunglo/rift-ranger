import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCombatRound } from '../combat-round.mjs';
import { riftbeastMoves } from '../boss-attacks.mjs';
import { bossProfiles } from '../boss-profiles.mjs';
import { createManualWindUp } from '../manual-wind-up.mjs';

test('a manual attack previews, cancels early, and commits once at its deadline', () => {
  const committed = [];
  const windUp = createManualWindUp(action => committed.push(action));

  windUp.start('basic', 10, true);
  assert(windUp.isPending('basic'));
  windUp.release('basic', 209, false);
  windUp.advance(210);
  assert.deepEqual(committed, []);
  assert(!windUp.isPending('basic'));

  windUp.start('beam', 300, true);
  windUp.advance(499);
  assert.deepEqual(committed, []);
  windUp.advance(500);
  windUp.release('beam', 520, false);
  windUp.advance(800);
  assert.deepEqual(committed, ['beam']);
});

test('completed holds can commit on release and focus resets discard pending actions', () => {
  const committed = [];
  const windUp = createManualWindUp(action => committed.push(action));
  windUp.start('power', 0, true);
  windUp.release('power', 201, false);
  windUp.start('beam', 300, true);
  windUp.release('beam', 501, true);
  windUp.start('basic', 600, false);
  windUp.release('basic', 600, false);
  windUp.advance(800);
  windUp.start('guard', 900, true);
  windUp.cancel();
  windUp.advance(1100);
  assert.deepEqual(committed, ['power', 'basic']);
});

/** Ignore presentation events while checking the combat state directly. */
function ignore() {}

test('a Block feint only shows the wind-up and a held Block protects after 200 ms', () => {
  const fight = { moves: riftbeastMoves, profile: bossProfiles.R };
  const round = createCombatRound({ mode: 'keyboard', session: 'training', fight, now: 0 }, {
    aura: ignore, health: ignore, stock: ignore, pose: ignore, effect: ignore,
  });
  const media = { readPose: ignore, readAudio: ignore };
  round.enqueue(['laser'], 0);
  round.press('guard', 2600);
  round.step(2700, media);
  assert(round.windUpForDraw().left);
  assert(!round.state.keyboardGuard);
  round.release('guard', 2750);
  assert(!round.windUpForDraw().left);
  round.step(3000, media);
  assert.equal(round.state.hp.player, 81);
  assert.equal(round.state.powerCharges, 0);

  round.enqueue(['laser'], 3100);
  round.press('guard', 5900);
  round.step(6099, media);
  assert(!round.state.keyboardGuard);
  round.step(6100, media);
  assert(round.state.keyboardGuard);
  assert.equal(round.state.hp.player, 81);
  assert.equal(round.state.powerCharges, 1);
  round.release('guard', 6120);
  assert(!round.state.keyboardGuard);
});
