import { bossBodies } from './boss-bodies.mjs?v=70';
import { riftbeastMoves } from './boss-attacks.mjs?v=71';
import { baseLockThresholds, createBossLocks } from './boss-locks.mjs?v=64';
import { bossProfiles } from './boss-profiles.mjs?v=64';

// Codes store a literal configuration, independent of the random number generator.
// RR1 selects the body profile. Locks are encoded in HP order, with any extra
// lock first. The remaining lock types must be distinct.
const moveSets = { LFS: riftbeastMoves };
const lockCodes = { S: 'basic', P: 'power', L: 'beam' };
const codesByMove = Object.fromEntries(Object.entries(lockCodes).map(([code, move]) => [move, code]));
const lockLetters = Object.keys(lockCodes);

/** Validate a shared fight ID and resolve its body, loadout, and ordered locks. */
export function parseFightId(input) {
  const id = input.trim().toUpperCase();
  const match = /^RR1-([A-Z])-([A-Z]{3})-([SPL]{2,4})$/.exec(id);
  if (!match) return null;
  const [, bodyCode, moveCode, lockOrder] = match;
  if (!Object.hasOwn(bossBodies, bodyCode) || !Object.hasOwn(moveSets, moveCode)) return null;
  const profile = bossProfiles[bodyCode];
  const standardCount = (profile.lockThresholds ?? baseLockThresholds).length;
  const lockCount = standardCount + Number(Boolean(profile.extraLock));
  if (lockOrder.length !== lockCount || new Set(lockOrder.slice(-standardCount)).size !== standardCount) return null;
  return { id, body: bossBodies[bodyCode], profile, moves: moveSets[moveCode], lockOrder: [...lockOrder].map(code => lockCodes[code]) };
}

/** Choose a body and valid shuffled locks, then resolve them through the shared parser. */
export function rollFight(bodyCode = 'R', random = Math.random) {
  const bodies = Object.keys(bossBodies);
  const chosen = bodyCode === 'random' ? bodies[Math.floor(random() * bodies.length)] : bodyCode;
  const profile = bossProfiles[chosen];
  const extra = profile.extraLock ? lockLetters[Math.floor(random() * lockLetters.length)] : '';
  const standardCount = (profile.lockThresholds ?? baseLockThresholds).length;
  const lockOrder = createBossLocks(random).slice(0, standardCount).map(lock => codesByMove[lock.move]).join('');
  return parseFightId('RR1-' + chosen + '-LFS-' + extra + lockOrder);
}
