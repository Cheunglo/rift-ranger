import { bossBodies } from './boss-bodies.mjs?v=62';
import { riftbeastMoves } from './boss-attacks.mjs?v=62';
import { createBossLocks } from './boss-locks.mjs?v=62';

// RR1 codes name a body, a move set, and the lock order. Codes are literal
// configurations so they survive changes to the random number generator.
const moveSets = { LFS: riftbeastMoves };
const lockCodes = { S: 'basic', P: 'power', L: 'beam' };

export function parseFightId(input) {
  const id = input.trim().toUpperCase();
  const match = /^RR1-([A-Z])-([A-Z]{3})-([SPL]{3})$/.exec(id);
  if (!match) return null;
  const [, bodyCode, moveCode, lockOrder] = match;
  if (!Object.hasOwn(bossBodies, bodyCode) || !Object.hasOwn(moveSets, moveCode) || new Set(lockOrder).size !== 3) return null;
  return { id, body: bossBodies[bodyCode], moves: moveSets[moveCode], lockOrder: [...lockOrder].map(code => lockCodes[code]) };
}

export function rollFight(bodyCode = 'R', random = Math.random) {
  const bodies = Object.keys(bossBodies);
  const chosen = bodyCode === 'random' ? bodies[Math.floor(random() * bodies.length)] : bodyCode;
  const codesByMove = Object.fromEntries(Object.entries(lockCodes).map(([code, move]) => [move, code]));
  const lockOrder = createBossLocks(random).map(lock => codesByMove[lock.move]).join('');
  return parseFightId('RR1-' + chosen + '-LFS-' + lockOrder);
}
