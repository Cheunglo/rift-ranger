import { attackGapOffset, bossProfiles } from './boss-profiles.mjs?v=64';

// Owns boss attack timing, tells, and charge changes. The round applies hits and effects.
const warningStep = 1000;
const warningColors = ['green', 'yellow', 'red'];
export const randomWarningStart = () => Math.floor(Math.random() * warningColors.length);
const eyeWarningDuration = round => (warningColors.length - round.warningStart) * warningStep;
// Each phase stores its exclusive end time and the warning shown during it.
const flamePhases = [
  { until: 1400, name: 'red', color: '#ff352d', hint: 'Slash or laser to interrupt' },
  { until: 2800, name: 'orange', color: '#ff8b28', hint: 'Cool it · Stage 1+ laser cancels' },
  { until: 4200, name: 'yellow', color: '#ffdd39', hint: 'Cool it · Stage 2+ laser cancels' },
  { until: 6600, name: 'blue', color: '#43a8ff', hint: 'Cool it · Stage 3 laser cancels' },
  { until: 7100, name: 'white', color: '#ffffff', halo: '#43a8ff', hint: 'White-hot · guard now' },
];
const flameChargeTime = flamePhases.at(-1).until;
const comboLaserLeadTime = 2300;
// Slots are distinct from attack IDs so scheduling can be shared by future bosses.
export const riftbeastMoves = { regular: 'laser', special: 'flame', status: 'shout' };
const bossPace = {
  camera: { firstLaser: 7000, slowLaser: 6600, fastLaser: 3650, flamePause: 1000, openingFlame: 0, comboOdds: [.15, .40, .75, 1] },
  keyboard: { firstLaser: 5000, slowLaser: 4900, fastLaser: 3200, flamePause: 300, openingFlame: .35, comboOdds: [.45, .65, .90, 1] },
};
const shoutInhale = 800;
const shoutPause = 120;
const shoutTell = shoutInhale + shoutPause;
const shoutGap = 450;

// A move supplies scheduling, warning presentation and its hit outcome. The
// rotation chooses a slot without knowing how the move in it works.
const attacks = {
  laser: {
    firstDelay: pace => pace.firstLaser,
    delay: ({ fastLaser, slowLaser }, hpRatio) => Math.round(fastLaser + (slowLaser - fastLaser) * hpRatio),
    warningDuration: eyeWarningDuration,
    tell: readLaserTell,
    hit: { type: 'guardable', effect: 'laser', damage: 19, name: 'Laser' },
  },
  flame: {
    firstDelay: flameDelay,
    delay: flameDelay,
    warningDuration: () => flameChargeTime,
    tell: readFlameTell,
    rollCombo: true,
    hit: { type: 'guardable', effect: 'flame', damage: 10, name: 'Flame', burns: true },
  },
  shout: {
    delay: () => shoutGap + shoutTell,
    warningDuration: () => shoutTell,
    tell: readShoutTell,
    canSchedule: round => !round.shaken,
    randomizeWarning: false,
    hit: { type: 'shout', effect: 'shout' },
  },
};

const currentAttack = round => attacks[round.strikeKind];
export function moveSlot(moves, kind) {
  if (kind === moves.special) return 'special';
  return kind === moves.status ? 'status' : 'regular';
}
function flameDelay(pace) {
  return flameChargeTime + pace.flamePause;
}

export const warningDuration = round => currentAttack(round).warningDuration(round);
export const strikeOutcome = round => currentAttack(round).hit;

export function openingStrike(mode, learning, now, bossMoves = riftbeastMoves, profile = bossProfiles.R) {
  const pace = bossPace[mode];
  const openingSpecial = !learning && pace.openingFlame > 0 && Math.random() < pace.openingFlame;
  const strikeKind = openingSpecial ? bossMoves.special : bossMoves.regular;
  const move = attacks[strikeKind];
  const delay = move.firstDelay(pace) + attackGapOffset(profile, null, moveSlot(bossMoves, strikeKind));
  // The first eye warning has up to three steps. Recovery modifiers never cut a tell.
  const minimumTell = openingSpecial ? move.warningDuration() : warningColors.length * warningStep;
  return {
    pace,
    strike: learning ? Infinity : now + Math.max(minimumTell, delay),
    profile,
    bossMoves,
    strikeKind,
    comboLaserAt: move.rollCombo ? undefined : Infinity,
    turnsSinceStatus: 0,
  };
}

function flamePhase(round, now) {
  if (round.strikeKind !== 'flame' || now >= round.strike) return;
  const elapsed = now - (round.strike - flameChargeTime);
  if (elapsed >= 0) return flamePhases.find(phase => elapsed < phase.until);
}

export function scheduleNextStrike(round, now, hp, maxHp) {
  const previousSlot = moveSlot(round.bossMoves, round.strikeKind);
  round.comboLaserAt = Infinity;
  if (round.lessonIndex !== null) {
    round.strike = Infinity;
    return;
  }
  const { regular, special, status } = round.bossMoves;
  if (round.strikeKind === status) {
    round.strikeKind = round.afterStatus;
  } else {
    round.strikeKind = round.strikeKind === regular ? special : regular;
    round.turnsSinceStatus++;
    const statusInterval = hp <= 40 ? 3 : 4;
    if (round.turnsSinceStatus >= statusInterval) {
      round.turnsSinceStatus = 0;
      if (attacks[status].canSchedule?.(round) ?? true) {
        round.afterStatus = round.strikeKind;
        round.strikeKind = status;
      }
    }
  }
  const move = currentAttack(round);
  if (move.randomizeWarning !== false) round.warningStart = randomWarningStart();
  const delay = move.delay(round.pace, hp / maxHp);
  const gap = attackGapOffset(round.profile, previousSlot, moveSlot(round.bossMoves, round.strikeKind));
  round.strike = now + Math.max(move.warningDuration(round), delay + gap);
  if (move.rollCombo) round.comboLaserAt = undefined;
}

export function scheduleTutorialFlame(round, now, pause, guardBreak) {
  round.warningStart = 0;
  round.strike = now + flameChargeTime + pause;
  round.comboGuardBlocked = false;
  round.comboLaserAt = guardBreak ? round.strike - comboLaserLeadTime : Infinity;
}

export function updateFlameCombo(round, now) {
  // undefined means the combo roll is pending. Infinity means there is no
  // pending shot (none was rolled, it fired, or the charge was cancelled).
  // A finite value is the shot's deadline on the animation clock.
  if (round.comboLaserAt !== undefined || now < round.strike - flameChargeTime) return;
  const opened = round.locks.filter(lock => lock.done === lock.total).length;
  round.comboLaserAt = Math.random() < round.pace.comboOdds[opened]
    ? round.strike - comboLaserLeadTime : Infinity;
}

export function coolFlame(round, move, now, stage) {
  const phase = flamePhase(round, now);
  if (!phase || phase.name === 'white') return null;
  const drop = move === 'basic' ? 1 : move === 'beam' && stage > 0 ? stage + 1 : 0;
  if (!drop) return null;
  const priorIndex = flamePhases.indexOf(phase) - drop;
  if (priorIndex >= 0) {
    const priorStart = flamePhases[priorIndex - 1]?.until ?? 0;
    round.strike = now + flameChargeTime - priorStart;
    // Move a pending combo with the charge. A laser that fired stays spent.
    if (round.comboLaserAt < Infinity) round.comboLaserAt = round.strike - comboLaserLeadTime;
    return { cooledTo: flamePhases[priorIndex].name };
  }
  return { interrupted: true };
}

function readEyeFlashes(round, now, fireAt) {
  const elapsed = eyeWarningDuration(round) - (fireAt - now);
  const eyeWarning = elapsed >= 0;
  const index = round.warningStart + Math.floor(elapsed / warningStep);
  return { eyeWarning, flash: eyeWarning && elapsed % warningStep < 235 ? warningColors[index] : null };
}

function readLaserTell(round, now, timing) {
  return {
    ...readEyeFlashes(round, now, round.strike),
    warning: timing.danger ? { message: 'Incoming eye lasers' } : null,
  };
}

function readFlameTell(round, now, timing, { guardBroken, guardBreakDrill }) {
  const flame = flamePhase(round, now);
  const eyes = readEyeFlashes(round, now, flame ? round.comboLaserAt : round.strike);
  if (!flame) {
    // The charge is not visible during the pause after the preceding attack.
    return { ...eyes, warning: timing.danger ? { message: 'Incoming eye lasers' } : null };
  }
  const hint = eyes.eyeWarning ? 'Guard the eye lasers first.' :
    guardBroken ? 'Release, then guard again.' :
      now < round.strikeNoticeUntil && round.strikeNotice.startsWith('Eye laser hit') ? round.strikeNotice : undefined;
  const message = guardBreakDrill ? (round.comboLaserAt < Infinity ? 'Guard twice' : 'Guard the flames') : flame.hint;
  return {
    ...eyes,
    flame: { ...flame, charge: timing.elapsed / timing.duration },
    warning: { label: eyes.eyeWarning ? 'Flame + eye lasers' : 'Flamethrower', message, hint },
  };
}

function readShoutTell(round, now, { danger, elapsed }) {
  return {
    inhale: danger && elapsed < shoutInhale ? elapsed / shoutInhale : null,
    warning: danger ? {
      label: 'Shockwave shout', message: 'Incoming shout', hint: 'Gold Aura absorbs it.', showGuardPose: false,
    } : null,
  };
}

export function attackTell(round, now, options = {}) {
  const duration = warningDuration(round);
  const elapsed = duration - (round.strike - now);
  const timing = { danger: elapsed >= 0, duration, elapsed };
  return {
    danger: timing.danger, eyeWarning: false, flash: null, flame: null, inhale: null,
    ...currentAttack(round).tell(round, now, timing, options),
  };
}
