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
const riftbeastMoves = { regular: 'laser', special: 'flame', status: 'shout' };
const bossPace = {
  camera: { firstLaser: 7000, slowLaser: 6600, fastLaser: 3650, flamePause: 1000, openingFlame: 0, comboOdds: [.15, .40, .75, 1] },
  keyboard: { firstLaser: 5000, slowLaser: 4900, fastLaser: 3200, flamePause: 300, openingFlame: .35, comboOdds: [.45, .65, .90, 1] },
};
const shoutInhale = 800;
const shoutPause = 120;
const shoutTell = shoutInhale + shoutPause;
const shoutGap = 450;

export function warningDuration(round) {
  if (round.strikeKind === 'shout') return shoutTell;
  return round.strikeKind === 'flame' ? flameChargeTime : eyeWarningDuration(round);
}

export function openingStrike(mode, learning, now) {
  const pace = bossPace[mode];
  const openingFlame = !learning && pace.openingFlame > 0 && Math.random() < pace.openingFlame;
  const firstStrike = openingFlame ? flameChargeTime + pace.flamePause : pace.firstLaser;
  return {
    pace,
    strike: learning ? Infinity : now + firstStrike,
    bossMoves: riftbeastMoves,
    strikeKind: openingFlame ? riftbeastMoves.special : riftbeastMoves.regular,
    comboLaserAt: openingFlame ? undefined : Infinity,
    turnsSinceStatus: 0,
  };
}

function flamePhase(round, now) {
  if (round.strikeKind !== 'flame' || now >= round.strike) return;
  const elapsed = now - (round.strike - flameChargeTime);
  if (elapsed >= 0) return flamePhases.find(phase => elapsed < phase.until);
}

export function scheduleNextStrike(round, now, hp, maxHp) {
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
      if (!round.shaken) {
        round.afterStatus = round.strikeKind;
        round.strikeKind = status;
        round.strike = now + shoutGap + shoutTell;
        return;
      }
    }
  }
  round.warningStart = randomWarningStart();
  const { fastLaser, slowLaser, flamePause } = round.pace;
  const laserInterval = fastLaser + (slowLaser - fastLaser) * hp / maxHp;
  round.strike = now + (round.strikeKind === 'flame' ? flameChargeTime + flamePause : Math.round(laserInterval));
  if (round.strikeKind === 'flame') round.comboLaserAt = undefined;
}

export function scheduleTutorialFlame(round, now, pause, guardBreak) {
  round.warningStart = 0;
  round.strike = now + flameChargeTime + pause;
  round.comboGuardBlocked = false;
  round.comboLaserAt = guardBreak ? round.strike - comboLaserLeadTime : Infinity;
}

export function updateFlameCombo(round, now) {
  // Roll once as the charge begins, using the locks the player has already opened.
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

export function attackTell(round, now) {
  const untilStrike = round.strike - now;
  const leadTime = warningDuration(round);
  const danger = untilStrike <= leadTime;
  const warningElapsed = leadTime - untilStrike;
  const flame = flamePhase(round, now);
  const shouting = round.strikeKind === 'shout';
  const eyeElapsed = eyeWarningDuration(round) - ((flame ? round.comboLaserAt : round.strike) - now);
  const eyeWarning = !shouting && eyeElapsed >= 0;
  const flashIndex = round.warningStart + Math.floor(eyeElapsed / warningStep);
  const flash = eyeWarning && eyeElapsed % warningStep < 235 ? warningColors[flashIndex] : null;
  const inhale = shouting && danger && warningElapsed < shoutInhale ? warningElapsed / shoutInhale : null;
  return {
    danger, shouting, eyeWarning, flash, inhale,
    flame: flame && { ...flame, charge: warningElapsed / leadTime },
  };
}
