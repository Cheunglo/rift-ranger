import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFightId, rollFight } from '../boss-fights.mjs';
import { bossHit, bossLocksForOrder } from '../boss-locks.mjs';

test('a shared ID restores the body, move set, and exact gate requirements', () => {
  const fight = parseFightId(' rr1-t-lfs-pls ');
  assert.equal(fight.id, 'RR1-T-LFS-PLS');
  assert.equal(fight.body.name, 'Barkjaw');
  assert.deepEqual(fight.moves, { regular: 'laser', special: 'flame', status: 'shout' });
  const locks = bossLocksForOrder(fight.lockOrder);
  assert.deepEqual(locks.map(({ hp, move, total }) => [hp, move, total]), [
    [40, 'power', 2], [20, 'beam', 4], [10, 'basic', 6],
  ]);
  locks[0].done++;
  assert.equal(bossLocksForOrder(fight.lockOrder)[0].done, 0);
});

test('the random body roll can produce different bodies and its ID replays', () => {
  for (const [random, expected] of [[() => .12, 'Barkjaw'], [() => .23, 'Iron Beetle'], [() => .95, 'Moon Owl']]) {
    const fight = rollFight('random', random);
    assert.equal(fight.body.name, expected);
    assert.deepEqual(parseFightId(fight.id), fight);
  }
});

test('reject unsupported versions, unknown parts, and repeated lock moves', () => {
  for (const id of ['RR2-R-LFS-SPL', 'RR1-X-LFS-SPL', 'RR1-R-XYZ-SPL', 'RR1-B-LFS-SSL', 'RR1-T-LFS-SPL-x', 'RR1-B-LFS-SPL', 'RR1-T-LFS-SSPL', 'RR1-B-LFS-PSSL', 'RR1-G-LFS-SPL', 'RR1-G-LFS-SS', 'RR1-T-LFS-SP']) {
    assert.equal(parseFightId(id), null);
  }
});

test('every released body has a stable RR1 body letter', () => {
  const names = {
    R: 'The Riftbeast', T: 'Barkjaw', B: 'Iron Beetle', H: 'The Duelist',
    D: 'Rift Hound', S: 'Coilfang', G: 'Rift Slime', W: 'Tidewhale', O: 'Moon Owl',
  };
  for (const [body, name] of Object.entries(names)) {
    assert.equal(parseFightId('RR1-' + body + '-LFS-' + (body === 'B' ? 'SSPL' : body === 'G' ? 'SL' : 'SPL')).body.name, name);
  }
});

test('Iron Beetle stores the extra lock before the three standard locks', () => {
  const fight = parseFightId('RR1-B-LFS-PSPL');
  const locks = bossLocksForOrder(fight.lockOrder, fight.profile);
  assert.deepEqual(locks.map(({ hp, move, total }) => [hp, move, total]), [
    [65, 'power', 2], [40, 'basic', 2], [20, 'power', 4], [10, 'beam', 6],
  ]);
});

test('Rift Slime replays two unique locks and retains the final 10 HP gate', () => {
  const rolled = rollFight('G', () => .9);
  assert.match(rolled.id, /^RR1-G-LFS-[SPL]{2}$/);
  assert.deepEqual(parseFightId(rolled.id), rolled);
  const fight = parseFightId('RR1-G-LFS-PL');
  assert.equal(fight.profile.maxHp, 150);
  const locks = bossLocksForOrder(fight.lockOrder, fight.profile);
  assert.deepEqual(locks.map(({ hp, move, total }) => [hp, move, total]), [
    [40, 'power', 2], [10, 'beam', 6],
  ]);
  assert.equal(bossHit(locks, 150, 130, 'power').hp, 40);
  assert.equal(bossHit(locks, 40, 10, 'power').lock.done, 2);
  const nextHit = bossHit(locks, 40, 35, 'beam', 1);
  assert.equal(nextHit.hp, 10);
  assert.equal(nextHit.lock.done, 1);
});
