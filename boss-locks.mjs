// Health gates are checked from highest HP to lowest. Each gate stores its own
// lifetime progress, independent of the boss's current health.
export const baseLockThresholds = [40, 20, 10];
const laserCredits = [0, 1, 2, 4];
export const lockMoves = {
  basic: ['slash', 'slashes'],
  power: ['power wave', 'power waves'],
  beam: ['laser credit', 'laser credits'],
};

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createBossLocks(random = Math.random) {
  // Every move gets one gate. The laser gate counts credits from any charge stage.
  return bossLocksForOrder(shuffle(Object.keys(lockMoves), random));
}

export function bossLocksForOrder(moves, { extraLock, lockThresholds = baseLockThresholds } = {}) {
  const offset = extraLock ? 1 : 0;
  const locks = lockThresholds.map((hp, i) => ({
    // A skipped lock does not change the later gate's normal requirement.
    hp, move: moves[i + offset], total: (baseLockThresholds.indexOf(hp) + 1) * 2, done: 0, engaged: false,
  }));
  if (extraLock) locks.unshift({ ...extraLock, move: moves[0], done: 0, engaged: false });
  return locks;
}

export function nextBossLock(locks) {
  return locks.find(lock => lock.done < lock.total);
}

export function bossHit(locks, hp, damage, move, auraStage) {
  const lock = nextBossLock(locks);
  const floor = lock?.hp ?? 0;
  // The next unopened lock is a hard HP floor. Reaching it opens the challenge;
  // after that, healing above the floor does not turn off the challenge.
  const next = Math.max(floor, hp - damage);
  if (lock && next === floor) lock.engaged = true;
  const credits = move === 'beam' ? laserCredits[auraStage] ?? 0 : 1;
  const credited = Boolean(lock?.engaged && lock.move === move && credits > 0);
  // Spend credits only on the lock that caught this hit.
  if (credited) lock.done = Math.min(lock.total, lock.done + credits);
  return { hp: next, dealt: hp - next, lock: lock?.engaged ? lock : null, credited };
}

export function lockRequirement(lock) {
  const remaining = lock.total - lock.done;
  return remaining + ' ' + lockMoves[lock.move][remaining === 1 ? 0 : 1];
}
