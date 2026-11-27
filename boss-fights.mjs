import { bossBodies } from './boss-bodies.mjs?v=63';
import { riftbeastMoves } from './boss-attacks.mjs?v=63';
import { createBossLocks } from './boss-locks.mjs?v=63';
import { bossProfiles } from './boss-profiles.mjs?v=63';

// Codes store a literal configuration, independent of the random number generator.
// RR1 selects the body profile. An extra lock is encoded first, before the three
// standard locks. Each standard lock type must appear exactly once.
const moveSets = { LFS: riftbeastMoves };
const lockCodes = { S: 'basic', P: 'power', L: 'beam' };
const codesByMove = Object.fromEntries(Object.entries(lockCodes).map(([code, move]) => [move, code]));
const lockLetters = Object.keys(lockCodes);

export function parseFightId(input) {
  const id = input.trim().toUpperCase();
  const match = /^RR1-([A-Z])-([A-Z]{3})-([SPL]{3,4})$/.exec(id);
  if (!match) return null;
  const [, bodyCode, moveCode, lockOrder] = match;
  if (!Object.hasOwn(bossBodies, bodyCode) || !Object.hasOwn(moveSets, moveCode)) return null;
  const profile = bossProfiles[bodyCode];
  const lockCount = profile.extraLock ? 4 : 3;
  if (lockOrder.length !== lockCount || new Set(lockOrder.slice(-3)).size !== 3) return null;
  return { id, body: bossBodies[bodyCode], profile, moves: moveSets[moveCode], lockOrder: [...lockOrder].map(code => lockCodes[code]) };
}

export function rollFight(bodyCode = 'R', random = Math.random) {
  const bodies = Object.keys(bossBodies);
  const chosen = bodyCode === 'random' ? bodies[Math.floor(random() * bodies.length)] : bodyCode;
  const profile = bossProfiles[chosen];
  const extra = profile.extraLock ? lockLetters[Math.floor(random() * lockLetters.length)] : '';
  const lockOrder = createBossLocks(random).map(lock => codesByMove[lock.move]).join('');
  return parseFightId('RR1-' + chosen + '-LFS-' + extra + lockOrder);
}
