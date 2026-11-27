// Health gates are checked from highest HP to lowest. Each gate stores its own
// lifetime progress, independent of the boss's current health.
const thresholds = [40, 20, 10];
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
  const moves = shuffle(Object.keys(lockMoves), random);
  return thresholds.map((hp, i) => ({
    hp, move: moves[i], total: (i + 1) * 2, done: 0, engaged: false,
  }));
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
