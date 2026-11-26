// Health gates are checked from highest HP to lowest. Each gate stores its own
// lifetime progress, independent of the boss's current health.
const thresholds = [40, 20, 10];
export const lockMoves = {
  basic: ['slash', 'slashes'],
  power: ['power wave', 'power waves'],
  beam: ['short laser', 'short lasers'],
};

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createBossLocks(random = Math.random) {
  // Every move gets one gate. Laser stages cycle in a shuffled order to keep
  // requirements varied without asking for a run of only the slowest charge.
  const moves = shuffle(Object.keys(lockMoves), random);
  return thresholds.map((hp, i) => ({
    hp, move: moves[i], total: (i + 1) * 2, done: 0, engaged: false,
    ...(moves[i] === 'beam' ? { stages: shuffle([1, 2, 3], random) } : {}),
  }));
}

export function nextBossLock(locks) {
  return locks.find(lock => lock.done < lock.total);
}

export function requiredLaserStage(lock) {
  return lock.stages?.[lock.done % lock.stages.length];
}

export function bossHit(locks, hp, damage, move, auraStage) {
  const lock = nextBossLock(locks);
  const floor = lock?.hp ?? 0;
  // The next unopened lock is a hard HP floor. Reaching it opens the challenge;
  // after that, healing above the floor does not turn off the challenge.
  const next = Math.max(floor, hp - damage);
  if (lock && next === floor) lock.engaged = true;
  // The requested laser stage is the minimum charge for one lock credit.
  const credited = Boolean(lock?.engaged && lock.move === move &&
    (move !== 'beam' || auraStage >= requiredLaserStage(lock)));
  if (credited) lock.done++;
  return { hp: next, dealt: hp - next, lock: lock?.engaged ? lock : null, credited };
}
