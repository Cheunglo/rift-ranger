const thresholds = [40, 20, 10];
export const lockMoves = {
  basic: ['slash', 'slashes'],
  power: ['power wave', 'power waves'],
  beam: ['long laser', 'long lasers'],
};

export function createBossLocks(random = Math.random) {
  const moves = Object.keys(lockMoves);
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return thresholds.map((hp, i) => ({ hp, move: moves[i], total: (i + 1) * 2, done: 0, engaged: false }));
}

export function nextBossLock(locks) {
  return locks.find(lock => lock.done < lock.total);
}

export function bossHit(locks, hp, damage, move, credit = 1) {
  const lock = nextBossLock(locks);
  const floor = lock?.hp ?? 0;
  const next = Math.max(floor, hp - damage);
  if (lock && next === floor) lock.engaged = true;
  const credited = Boolean(lock?.engaged && lock.move === move);
  if (credited) lock.done = Math.min(lock.total, lock.done + credit);
  return { hp: next, dealt: hp - next, lock: lock?.engaged ? lock : null, credited };
}
