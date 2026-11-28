// Owns the round and connects input, attack rules, and presentation.
import { createCameraSession, defaultStatus } from './camera-session.mjs?v=68';
import {
  arena, burnStatus, byId, hideOverlay, lockMarkers,
  lockStatus, mobileControls, powerStock, renderAura, renderBossLabel,
  renderBossLocks, renderBossName, renderPose, renderPowerStock, renderHealth, resetHud, setBattleHudVisible,
  setMobileHud, shakenStatus, showBattleResult, showBattleWarning, showOverlay,
} from './battle-hud.mjs?v=64';
import {
  attackTell, coolFlame, moveSlot, openingStrike, randomWarningStart, scheduleNextStrike,
  scheduleTrainingStrike, scheduleTutorialFlame, strikeOutcome, updateFlameCombo, warningDuration,
} from './boss-attacks.mjs?v=71';
import { bindCombatInputs } from './mobile-controls.mjs?v=71';
import { lessons } from './tutorial.mjs?v=68';
import { bossBodies, paintBoss } from './boss-bodies.mjs?v=70';
import { parseFightId } from './boss-fights.mjs?v=71';
import { attackDamage, bossProfiles } from './boss-profiles.mjs?v=64';
import { chooseFight, showFightId, showFightOptions } from './fight-picker.mjs?v=71';
import { bossHit, bossLocksForOrder, lockRequirement } from './boss-locks.mjs?v=64';
import { combatArt } from './combat-art.mjs?v=72';
import { gestures } from './controls.mjs?v=68';
import { createTrainingControls } from './training-controls.mjs?v=71';
import { createRangerColorPicker } from './ranger-colors.mjs?v=72';

const cameraBonusStatus = byId('camera-bonus-status');
const webcam = byId('webcam');
const keyboard = byId('keyboard');
const mobile = byId('mobile');
const tutorialButton = byId('tutorial');
const tutorialPanel = byId('tutorial-panel');
const trainingButton = byId('training');
const trainingOptions = byId('training-options');
const trainingBoss = byId('training-boss');
const exit = byId('exit');
const device = byId('device');
const tutorialBadge = byId('tutorial-badge');

// All timing values are milliseconds. The animation loop uses one clock.
const battleTiming = {
  blockBonusWindow: 2400,
  healQuietTime: 1800,
  healMinInterval: 700,
  healFullInterval: 5200,
};
const attacks = {
  basic: [5, 'Energy slash'],
  power: [22, 'Power strike'],
};
const cameraBonusPercent = 20;
const startingHP = { player: 100, enemy: 100 };
const burnInterval = 1000;
// Each additional stage takes twice as long to fill as the last one.
const auraStages = [
  { level: 1, chargeMs: 800, multiplier: 1 },
  { level: 2, chargeMs: 2400, multiplier: 2 },
  { level: 3, chargeMs: 5600, multiplier: 4 },
];
const auraCapacity = auraStages.at(-1).chargeMs;
const micAuraChargeRate = 1.4;
const beamDuration = 420;
const trainingMoveGap = 900;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const bossCanvas = byId('beast');
const visuals = combatArt(byId('combat-fx'), bossCanvas, reducedMotion);
const rangerSuit = createRangerColorPicker(byId('ranger-color'), byId('ranger-color-swatch'));
const defaultFight = parseFightId('RR1-R-LFS-SPL');
const trackingHints = {
  framing: 'Move back so the camera can see your shoulders.',
  'hands-hidden': 'Show your raised hand above your shoulder. Your resting hand can be out of view.',
  neutral: 'Raise your left hand to guard, right to attack, or both for power.',
  basic: 'Right hand seen. Hold briefly to attack.',
  'guard-set': 'Left hand seen. Keep holding to guard.',
  'heal-held': 'Heal registered. Lower your arms to repeat.',
  guard: 'Left hand held above shoulder height.',
  'power-held': 'Power registered. Lower both hands to reset.',
  reset: 'Lower your right hand to attack again.',
};
let round;
let session = 'battle';
let animation;
for (const [code, body] of Object.entries(bossBodies)) {
  trainingBoss.add(new Option(body.label ?? body.name, code));
}
const trainingControls = createTrainingControls(moves => {
  if (!round?.training || round.finished || round.strike !== Infinity) return;
  round.training.pending = moves;
  advanceTrainingQueue(performance.now());
});

paintBoss(bossCanvas, defaultFight.body);
byId('camera-bonus-note').textContent =
  'Camera clears without keyboard combat earn a ' + cameraBonusPercent + '% Power Level bonus.';

// Round state and HUD feedback

/** Choose the default guard hint for the active input mode. */
function showWarning(message, incoming = false, hint = round?.mobile ? 'Hold Block through the shot.' : 'Left hand up, or hold S.', showGuardPose = true) {
  showBattleWarning(message, incoming, hint, showGuardPose);
}

/** Render combat feedback and expose the silhouette in camera sessions. */
function showPose(move, label, state) {
  renderPose(round?.mode === 'camera', move, label, state);
}

/** Clamp combat HP and update the corresponding HUD meter. */
function setHealth(fighter, hp) {
  const maxHp = round.maxHp[fighter];
  round.hp[fighter] = Math.max(0, Math.min(hp, maxHp));
  renderHealth(fighter, round.hp[fighter], maxHp);
}

/** Resolve lock-aware damage and postpone passive recovery on a landed hit. */
function damageBoss(damage, move, now, auraStage) {
  // The move drills use the real effects. Health gates only appear in the lock lessons.
  if (isTutorial() && !lesson().lock) return { dealt: Math.min(round.hp.enemy, damage), lock: null };
  const hit = bossHit(round.locks, round.hp.enemy, damage, move, auraStage);
  if (hit.dealt) setHealth('enemy', hit.hp);
  if (hit.dealt || hit.credited) {
    round.nextHeal = now + battleTiming.healQuietTime + healInterval();
    renderBossLocks(round.locks);
  }
  return hit;
}

/** Scale passive recovery with current boss HP and its body profile. */
function healInterval() {
  // Each tick restores one HP. The interval grows with health, so the rate
  // falls as the boss heals. The minimum keeps low-HP recovery bounded.
  const { healMinInterval, healFullInterval } = battleTiming;
  const base = healMinInterval + (healFullInterval - healMinInterval) * round.hp.enemy / round.maxHp.enemy;
  return base * (round.profile.healInterval ?? 1);
}

/** Apply a due passive healing tick in a normal battle. */
function healBoss(now) {
  if (isTutorial() || round.training || now < round.nextHeal || round.hp.enemy <= 0 || round.hp.enemy >= round.maxHp.enemy) return;
  setHealth('enemy', round.hp.enemy + 1);
  round.nextHeal = now + healInterval();
  renderBossLocks(round.locks);
}

/** Describe the gate credit or missing move after a lock intercepts a hit. */
function lockImpact(hit) {
  if (hit.credited && hit.lock.done === hit.lock.total) return hit.lock.hp + ' HP lock opened';
  if (hit.credited) return lockRequirement(hit.lock) + ' left';
  if (hit.lock && !hit.dealt) return 'Lock needs ' + lockRequirement(hit.lock);
  return '';
}

/** Prioritize tracking, guard reset, and accepted pose guidance. */
function updateCameraStatus(now) {
  const move = round.cameraMove;
  if (!move || now - round.lastPose > 400) return cameraSession.showTracking('Waiting for tracking…', 'waiting');
  if (round.cameraGuardBroken) return cameraSession.showTracking('Guard broken. Lower your left hand, then raise it.', 'waiting');
  if (move.state === 'power') {
    const hint = !round.shaken && canPowerCounter() ? 'Both arms detected. Power counter ready.' :
      healBlockReason() || 'Both arms detected. Heal ready.';
    return cameraSession.showTracking(hint, 'waiting');
  }
  const notice = round.cameraNotice;
  if (notice && now < notice.until) return cameraSession.showTracking(notice.message, notice.state);
  const needsFraming = move.state === 'framing' || move.state === 'hands-hidden';
  cameraSession.showTracking(trackingHints[move.state], move.state === 'guard' ? 'accepted' : needsFraming ? 'waiting' : '');
}

/** Keep a brief camera message tied to the current action. */
function cameraNotice(message, state, now) {
  round.cameraNotice = { message, state, until: now + 950 };
}

/** Publish and retain a successful action long enough to read it. */
function confirmPose(move, label, now) {
  round.poseFeedback = { move, label, until: now + 850 };
  showPose(move, label, 'active');
}

// Menus, session lifecycle, and guided drills

/** Configure the shared start controls for the selected session type. */
function updateStartButtons() {
  webcam.disabled = tutorialButton.disabled = trainingButton.disabled = false;
  showFightOptions(session === 'battle');
  trainingOptions.hidden = session !== 'training';
  tutorialButton.hidden = session === 'training';
  trainingButton.hidden = session === 'tutorial';
  const action = session === 'training' ? 'Train' : session === 'tutorial' ? 'Tutorial' : 'Play';
  webcam.textContent = session === 'battle' ? 'Enable camera + mic' : action + ' with camera + mic';
  keyboard.textContent = action + ' with keyboard';
  mobile.textContent = action + ' on mobile';
  tutorialButton.textContent = session === 'tutorial' ? 'Back to battle' : 'Start Tutorial';
  trainingButton.textContent = session === 'training' ? 'Back to battle' : 'Training Mode';
}

/** Use the selected mode to show the relevant entry instructions. */
function showStartMenu() {
  updateStartButtons();
  if (session === 'tutorial') {
    showOverlay('Guided tutorial', 'Choose camera, keyboard, or mobile to learn the moves and open the boss locks.');
  } else if (session === 'training') {
    showOverlay('Training Mode', 'Choose a boss, then queue up to three moves to practice against.');
  } else {
    showOverlay('Defend the city.', 'Keep your shoulders and any raised hand in view. You can play sitting or standing.');
  }
}

tutorialButton.addEventListener('click', () => {
  session = session === 'tutorial' ? 'battle' : 'tutorial';
  showStartMenu();
  (session === 'tutorial' ? webcam : tutorialButton).focus({ preventScroll: true });
});

trainingButton.addEventListener('click', () => {
  session = session === 'training' ? 'battle' : 'training';
  showStartMenu();
  (session === 'training' ? trainingBoss : trainingButton).focus({ preventScroll: true });
});

/** Schedule the next requested move once the current one clears. */
function advanceTrainingQueue(startAt) {
  if (round.strike === Infinity && round.training.pending.length && !round.finished) {
    scheduleTrainingStrike(round, round.training.pending.shift(), startAt);
  }
  trainingControls.setRunning(round.strike !== Infinity || Boolean(round.finished));
}

/** Stop the frame loop, release devices and controls, and clear the battle HUD. */
function resetRound() {
  // Cancel the frame loop and release both devices before showing the menu.
  cancelAnimationFrame(animation);
  cameraSession.stop();
  combatInputs.reset();
  mobileControls.hidden = true;
  setMobileHud(false);
  document.body.classList.remove('mobile-play');
  round = null;
  showFightId();
  burnStatus.hidden = shakenStatus.hidden = powerStock.hidden = true;
  cameraBonusStatus.hidden = true;
  visuals.clear();
  setBattleHudVisible(false);
  tutorialPanel.hidden = true;
  trainingControls.show(false);
  arena.removeAttribute('data-tutorial');
  tutorialBadge.hidden = true;
  lockMarkers.hidden = lockStatus.hidden = true;
  updateStartButtons();
  exit.hidden = true;
  device.textContent = defaultStatus;
}

/** Initialize the selected battle, tutorial, or training session and start its frame loop. */
function startRound(mode, startingSession, mobileMode, fight) {
  const learning = startingSession === 'tutorial';
  const training = startingSession === 'training';
  combatInputs.reset();
  mobileControls.hidden = !mobileMode;
  setMobileHud(mobileMode);
  document.body.classList.toggle('mobile-play', mobileMode);
  const now = performance.now();
  const maxHp = { ...startingHP, enemy: fight.profile.maxHp ?? startingHP.enemy };
  round = {
    ...openingStrike(mode, learning || training, now, fight.moves, fight.profile),
    fight, training: training ? { pending: [] } : null,
    mode, mobile: mobileMode, lessonIndex: learning ? 0 : null, startedAt: now,
    hp: { ...maxHp },
    maxHp,
    cameraBonusEligible: mode === 'camera' && !learning && !training,
    powerCharges: 0, blockBonusUntil: 0, nextPower: now,
    keyboardGuard: false, shaken: false,
    readGesture: gestures(), hitUntil: 0, auraMs: 0, damageTaken: 0, lastTick: now,
    locks: learning || training ? [] : bossLocksForOrder(fight.lockOrder, fight.profile),
    nextHeal: now + battleTiming.healQuietTime + battleTiming.healFullInterval,
    warningStart: randomWarningStart(), burnTickAt: Infinity,
  };
  paintBoss(bossCanvas, fight.body);
  renderBossName(fight.body.name);
  showFightId(learning || training ? '' : fight.id);
  resetHud(round.maxHp, learning ? undefined : round.locks.map(lock => lock.hp));
  updatePowerStock();
  powerStock.hidden = false;
  cameraBonusStatus.hidden = !round.cameraBonusEligible;
  cameraBonusStatus.dataset.earned = 'true';
  cameraBonusStatus.textContent = '+' + cameraBonusPercent + '% camera bonus active';
  arena.toggleAttribute('data-tutorial', learning);
  if (learning) showLesson(now);
  else if (!training) {
    lockMarkers.hidden = lockStatus.hidden = false;
    renderBossLocks(round.locks);
  }
  tutorialBadge.hidden = !learning;
  trainingControls.show(training);
  arena.dataset.state = 'ready';
  hideOverlay();
  showPose();
  showWarning('No attack incoming');
  setBattleHudVisible(true);
  cameraSession.setTrackingVisible(mode === 'camera');
  exit.hidden = false;
  animation = requestAnimationFrame(tick);
  if (mobileMode) arena.scrollIntoView({ block: 'start' });
}

/** Detect tutorial sessions from their active lesson index. */
function isTutorial() {
  return round.lessonIndex !== null;
}

/** Read the current lesson's rules and instructions. */
function lesson() {
  return lessons[round.lessonIndex];
}

/** Reset move-specific state and schedule the current tutorial drill. */
function showLesson(now) {
  const current = lesson();
  if (current.id === 'heal') setHealth('player', 80);
  tutorialPanel.hidden = false;
  byId('tutorial-step').textContent = 'Tutorial · ' + (round.lessonIndex + 1) + ' / ' + lessons.length;
  byId('tutorial-title').textContent = current.title;
  byId('tutorial-instruction').textContent = round.mobile ? current.mobileHint ?? current.hint : current.hint;
  round.strike = Infinity;
  round.comboLaserAt = Infinity;
  round.strikeKind = current.id === 'flame' || current.id === 'guard-break' ? 'flame' : 'laser';
  if (current.id !== 'counter') {
    round.blockBonusUntil = 0;
    updatePowerStock(0);
  }
  if (current.id === 'block' || current.id === 'power-lock') {
    round.warningStart = 0;
    round.strike = now + warningDuration(round) + 1000;
  }
  if (round.strikeKind === 'flame') scheduleTutorialFlame(round, now, 1000, current.id === 'guard-break');
  lockMarkers.hidden = lockStatus.hidden = !current.lock;
  if (current.lock) {
    // Retain earlier tutorial gates so their markers stay open in the HUD.
    round.locks.push({ ...current.lock, done: 0, engaged: false });
    setHealth('enemy', current.startHp);
    renderBossLocks(round.locks);
  }
}

/** Start the next drill or wait for the final tutorial animation. */
function advanceLesson(now) {
  if (round.lessonIndex + 1 === lessons.length) {
    round.finished = { tutorial: true, until: now + 650 };
    return;
  }
  round.lessonIndex++;
  showLesson(now);
}

/** Tear down the lesson session and return to the normal start menu. */
function completeTutorial() {
  session = 'battle';
  resetRound();
  arena.dataset.state = 'ready';
  showOverlay('Tutorial complete', 'You learned every move and opened all three locks. In battle, lock moves are shuffled and the boss can heal.');
  resetHud(startingHP);
  webcam.focus({ preventScroll: true });
}

/** Remove score eligibility once a qualifying camera session switches input. */
function forfeitCameraBonus(reason) {
  if (!round?.cameraBonusEligible || round.finished) return;
  round.cameraBonusEligible = false;
  cameraBonusStatus.dataset.earned = 'false';
  cameraBonusStatus.textContent = reason + ' · no camera bonus';
}

/** Finalize a battle or training session after its result animation. */
function endRound(won) {
  // Use the frame that landed the final hit, excluding the victory animation.
  const elapsed = won ? Math.round(round.finished.at - round.startedAt) / 1000 : 0;
  const damage = round.damageTaken;
  const maxHealth = round.maxHp.player;
  const { id: fightId, body } = round.fight;
  const training = round.training;
  const cameraBonusEligible = round.cameraBonusEligible;
  resetRound();
  showFightId(fightId);
  arena.dataset.state = won ? 'win' : 'ready';
  if (training) {
    showOverlay(won ? 'Training complete' : 'Ranger down',
      won ? body.name + ' has fallen. Start another session to keep practicing.' : 'Start another session to try a different counter.');
    webcam.focus({ preventScroll: true });
    return;
  }
  showOverlay(won ? 'City saved!' : 'Ranger down',
    won ? body.name + ' has fallen.' : 'Raise your right arm to attack and your left arm to guard.');
  if (won) {
    showBattleResult(elapsed, damage, maxHealth, cameraBonusEligible, cameraBonusPercent);
  }
  webcam.focus({ preventScroll: true });
}

// Actions, resources, and attack outcomes

/** Check whether a banked Powerwave is available to spend. */
function canPowerCounter() {
  return round.powerCharges > 0;
}

/** Synchronize the round's banked Powerwaves and their HUD count. */
function updatePowerStock(charges = round.powerCharges) {
  round.powerCharges = charges;
  renderPowerStock(charges);
}

/** Earn a Powerwave and start the brief post-block damage bonus. */
function bankPowerCounter(now, kind) {
  updatePowerStock(round.powerCharges + 1);
  round.blockBonusUntil = isTutorial() && kind === 'laser' ? Infinity : now + battleTiming.blockBonusWindow;
}

/** Reduce attack damage as boss HP falls, using the move's minimum multiplier. */
function playerDamageScale(move) {
  const minimum = move === 'power' ? .16 : .55;
  return minimum + (1 - minimum) * round.hp.enemy / round.maxHp.enemy;
}

/** Absorb Shout with gold Aura or apply Shaken, then advance the boss turn. */
function resolveShout(outcome, now) {
  const protectedByAura = readyAuraStage()?.level === 3;
  visuals.play(outcome.effect, now, protectedByAura);
  if (protectedByAura) {
    round.auraMs = auraStages[1].chargeMs;
    renderAura(readyAuraStage());
    round.strikeNotice = 'Gold Aura absorbed the shout';
  } else {
    round.shaken = true;
    shakenStatus.hidden = false;
    round.attackPose = null;
    round.poseFeedback = null;
    round.strikeNotice = 'Shaken · Heal to attack again';
  }
  round.strikeNoticeUntil = now + 1300;
  scheduleNextStrike(round, now, round.hp.enemy, round.maxHp.enemy);
}

/** Resolve the optional eye shot and require a fresh guard if it shatters the shield. */
function resolveComboLaser(now, guarded, cameraLeftHeld) {
  round.comboLaserAt = Infinity;
  visuals.play(guarded ? 'guard-break' : 'laser', now);
  if (guarded) {
    // The laser spends the shield. Each held input must be released to rearm.
    round.keyboardGuardBroken = round.keyboardGuard;
    round.cameraGuardBroken = cameraLeftHeld;
    round.guardBreakNoticeUntil = now + 900;
    round.comboGuardBlocked = true;
    if (!isTutorial()) bankPowerCounter(now, 'laser');
    return;
  }
  if (!isTutorial()) {
    const damage = hurtPlayer(attackDamage(round.profile, 19, 'regular'), now);
    round.strikeNotice = 'Eye laser hit · −' + damage + ' HP';
    round.strikeNoticeUntil = now + 1000;
  }
}

/** Apply a successful cooling hit and advance a fully interrupted flame turn. */
function hitFlameCharge(move, now, stage) {
  const result = coolFlame(round, move, now, stage);
  if (!result) return '';
  if (!result.interrupted) return 'Fireball cooled to ' + result.cooledTo;
  scheduleNextStrike(round, now, round.hp.enemy, round.maxHp.enemy);
  round.strikeNotice = 'Flamethrower interrupted!';
  round.strikeNoticeUntil = now + 1400;
  if (isTutorial() && lesson().id === 'flame') advanceLesson(now);
  return 'Flamethrower interrupted!';
}

/** Record actual damage for scoring and finish the round when HP reaches zero. */
function hurtPlayer(amount, now) {
  const damage = Math.min(round.hp.player, amount);
  round.damageTaken += damage;
  setHealth('player', round.hp.player - damage);
  if (round.hp.player === 0) round.finished = { won: false, until: now + 400 };
  return damage;
}

/** Resolve Slash or Powerwave and report whether to latch a camera gesture. */
function attack(move, now, fromCamera = false) {
  if (!round || round.finished) return;
  if (round.shaken) return move === 'power' ? healPlayer(now, fromCamera) : false;
  if (move === 'power' && !canPowerCounter()) return healPlayer(now, fromCamera);
  const current = isTutorial() ? lesson() : null;
  if (current && !current.lock && !(((current.id === 'slash' || current.id === 'flame') && move === 'basic') ||
      (current.id === 'counter' && move === 'power'))) return;
  const [damage, label] = attacks[move];
  if (move === 'power' && now < round.nextPower) return;
  const bonus = now < round.blockBonusUntil;
  const counterDamage = move === 'basic' ? 2 : 5;
  const scaledDamage = Math.max(1, Math.round((damage + (bonus ? counterDamage : 0)) * playerDamageScale(move)));
  const hit = damageBoss(scaledDamage, move, now);
  if (move === 'power') {
    round.nextPower = now + 580;
    updatePowerStock(round.powerCharges - 1);
  }
  round.attackPose = { move, until: now + 360 };
  visuals.play(move, now);
  const flameOutcome = hitFlameCharge(move, now);
  if (hit.dealt || hit.credited) round.hitUntil = now + 170;
  const damageText = isTutorial() ? hit.dealt + ' damage' : '−' + hit.dealt + ' HP';
  const waveOutcome = flameOutcome || lockImpact(hit) || label + (bonus ? ' counter' : '') + ' · ' + damageText;
  const healOutcome = move === 'power' && !current && !healBlockReason() ? applyAuraHeal(now) : '';
  const outcome = healOutcome ? waveOutcome + ' · ' + healOutcome : waveOutcome;
  confirmPose(move, outcome, now);
  if (fromCamera) cameraNotice(outcome, !flameOutcome && hit.lock && !hit.credited && !hit.dealt ? 'waiting' : 'accepted', now);
  if (current && (current.id === 'slash' || current.id === 'counter' ||
      (hit.credited && hit.lock.done === hit.lock.total))) advanceLesson(now);
  else if (round.hp.enemy === 0) round.finished = { won: true, at: now, until: now + (move === 'power' ? 800 : 510) };
  return true;
}

/** Find the highest completed Aura stage available to spend. */
function readyAuraStage() {
  return auraStages.findLast(stage => round.auraMs >= stage.chargeMs);
}

/** Explain why Heal is unavailable, or return an empty message when it can run. */
function healBlockReason() {
  if (isTutorial() && lesson().id !== 'heal') return 'Follow the current lesson.';
  if (!round.shaken && round.hp.player >= round.maxHp.player && round.burnTickAt === Infinity) {
    return 'Health is full. Block a strike to unlock a power counter.';
  }
  if (!readyAuraStage()) return 'Charge aura to Stage 1 to heal.';
  return '';
}

/** Validate a standalone Heal and advance the corresponding tutorial drill. */
function healPlayer(now, fromCamera = false) {
  if (!round || round.finished) return false;
  const blocked = healBlockReason();
  if (blocked) {
    if (!fromCamera) round.poseFeedback = { move: 'heal', label: blocked, state: 'locked', until: now + 1000 };
    return false;
  }
  const outcome = applyAuraHeal(now);
  round.attackPose = { move: 'heal', until: now + 750 };
  confirmPose('heal', outcome, now);
  if (fromCamera) cameraNotice(outcome, 'accepted', now);
  if (isTutorial()) {
    setHealth('player', round.maxHp.player);
    advanceLesson(now);
  }
  return true;
}

/** Spend Aura to restore HP and clear Burn or Shaken, including at full HP. */
function applyAuraHeal(now) {
  const restored = Math.min(round.maxHp.player - round.hp.player, readyAuraStage().multiplier * 5);
  const burned = round.burnTickAt !== Infinity;
  const wasShaken = round.shaken;
  round.shaken = false;
  shakenStatus.hidden = true;
  if (wasShaken && round.strikeNotice === 'Shaken · Heal to attack again') round.strikeNoticeUntil = now;
  round.burnTickAt = Infinity;
  burnStatus.hidden = true;
  round.auraMs = 0;
  renderAura(readyAuraStage());
  setHealth('player', round.hp.player + restored);
  visuals.play('heal', now);
  return (wasShaken && !restored ? 'Shaken cleared' : 'Healed +' + restored + ' HP' + (wasShaken ? ' · Shaken cleared' : '')) +
    (burned ? ' · Burn cleared' : '');
}

/** Spend Aura on one Laser, resolve damage and cooling, and check the result. */
function fireBeam(now) {
  if (!round || round.finished || round.shaken) return;
  const current = isTutorial() ? lesson().id : null;
  if (current && current !== 'beam' && current !== 'beam-lock' && current !== 'flame') return;
  const stage = readyAuraStage();
  if (!stage) {
    round.poseFeedback = { move: 'clap', label: 'Charge aura to Stage 1 first', state: 'locked', until: now + 1000 };
    return;
  }

  // A firing input spends the meter and fires one shot at the highest completed stage.
  // Higher stages deal more damage and can earn multiple laser lock credits.
  round.auraMs = 0;
  round.humBlockedUntil = now + beamDuration + 200;
  round.beamFlash = { until: now + beamDuration, strength: stage.multiplier / 4, stage: stage.level };
  renderAura(readyAuraStage());
  const baseDamage = now < round.blockBonusUntil ? 8 : 6;
  const damage = Math.max(1, Math.round(baseDamage * playerDamageScale())) * stage.multiplier;
  const hit = damageBoss(damage, 'beam', now, stage.level);
  const flameOutcome = hitFlameCharge('beam', now, stage.level);
  if (hit.dealt || hit.credited) round.hitUntil = now + 170;
  const outcome = flameOutcome || lockImpact(hit) || stage.multiplier + '× laser · ' +
    (isTutorial() ? hit.dealt + ' damage' : '−' + hit.dealt + ' HP');
  confirmPose('clap', outcome, now);
  if (current === 'beam' || (current === 'beam-lock' && hit.credited && hit.lock.done === hit.lock.total)) {
    advanceLesson(now);
  } else if (round.hp.enemy === 0) {
    round.finished = { won: true, at: now, until: now + beamDuration };
  }
}

/** Accumulate permitted charge and update the HUD at the completed stage. */
function updateAura(now, chargeMs) {
  const current = isTutorial() ? lesson().id : null;
  if (chargeMs > 0 && (!current || current === 'hum' || current === 'heal' || current === 'beam' ||
      current === 'beam-lock' || current === 'flame')) {
    round.auraMs = Math.min(auraCapacity, round.auraMs + chargeMs);
    if (current === 'hum' && readyAuraStage()) advanceLesson(now);
  }
  renderAura(readyAuraStage());
}

/** Build renderer inputs from the current poses, charge, boss cues, and effects. */
function drawBattle(now, guard, flash = null, flame = null, inhale = null) {
  const tracked = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const attack = now < round.attackPose?.until ? round.attackPose.move : null;
  const bothArms = attack === 'power' || attack === 'heal';
  const beamStrength = now < round.beamFlash?.until ? round.beamFlash.strength : 0;
  visuals.render(now, {
    left: Boolean(tracked?.left || guard || bothArms),
    right: !round.shaken && Boolean(tracked?.right || attack === 'basic' || bothArms),
    guard, aura: round.auraMs / auraCapacity, auraStage: readyAuraStage()?.level ?? 0, flash, beamStrength, beamStage: round.beamFlash?.stage, flame, inhale, shaken: round.shaken,
    suit: rangerSuit(), burning: round.burnTickAt !== Infinity, anchors: round.fight.body.anchors,
  });
}

/** Resolve a block or a direct hit and apply the corresponding drill or status outcome. */
function resolveGuardableStrike(outcome, now, guard, cameraGuard) {
  const kind = round.strikeKind;
  const guardDrill = isTutorial() && lesson().id === 'guard-break';
  const guardDrillDone = guardDrill && guard && round.comboGuardBlocked;
  visuals.play(outcome.effect, now, guard);
  scheduleNextStrike(round, now, round.hp.enemy, round.maxHp.enemy);
  round.strikeNotice = 'Strike finished';
  if (guard) {
    bankPowerCounter(now, kind);
    round.strikeNotice = 'Blocked · Powerwave banked';
    confirmPose('guard', round.strikeNotice, now);
    if (cameraGuard) cameraNotice('Guard blocked the strike.', 'accepted', now);
    if (isTutorial() && lesson().id === 'block') advanceLesson(now);
    if (isTutorial() && kind === 'flame') round.strikeNotice = 'Blocked · interrupt the next charge';
  } else if (isTutorial()) {
    round.strikeNotice = kind === 'flame' ? 'Flame hit · interrupt the next charge' : 'Missed block · try the next shot';
  } else {
    const damage = hurtPlayer(attackDamage(round.profile, outcome.damage, moveSlot(round.bossMoves, kind)), now);
    round.strikeNotice = outcome.name + ' hit · −' + damage + ' HP';
    if (outcome.burns && !round.finished && round.burnTickAt === Infinity) {
      round.burnTickAt = now + burnInterval;
      burnStatus.hidden = false;
    }
  }
  if (guardDrillDone) {
    advanceLesson(now);
    round.strikeNotice = 'Both attacks blocked!';
  } else if (guardDrill) {
    scheduleTutorialFlame(round, now, 1300, guardDrill);
    round.strikeNotice = 'Block both attacks · try again';
  } else if (isTutorial() && kind === 'flame') {
    scheduleTutorialFlame(round, now, 1300, guardDrill);
  } else if (isTutorial() && !guard) {
    round.warningStart = 0;
    round.strike = now + warningDuration(round) + 1300;
  }
  round.strikeNoticeUntil = now + 1000;
}

const strikeResolvers = {
  guardable: resolveGuardableStrike,
  shout: resolveShout,
};

// Frame loop and device wiring

/** Read input, resolve timed combat, and render one frame using the same clock. */
function tick(now) {
  // Device sampling is throttled separately. Manual and camera inputs share
  // move and damage resolvers so they apply the same combat rules.
  if (!round) return;
  if (round.finished) {
    if (round.training) trainingControls.setRunning(true);
    if (now >= round.finished.until) return round.finished.tutorial ? completeTutorial() : endRound(round.finished.won);
    drawBattle(now, false);
    animation = requestAnimationFrame(tick);
    return;
  }
  const delta = Math.min(70, now - round.lastTick);
  round.lastTick = now;
  const poseFrame = cameraSession.readPose(now);
  if (poseFrame) {
    const { points: pose } = poseFrame;
    const move = round.readGesture(pose, now);
    round.lastPose = now;
    round.cameraMove = move;
    if (!move.left && move.state !== 'framing') round.cameraGuardBroken = false;
    const healing = move.attack === 'power' && (round.shaken || !canPowerCounter());
    if (move.attack && attack(move.attack, now, true)) move.consume?.(healing ? 'heal-held' : undefined);
    if (!round) return;
  }

  let micCharge = 0;
  const audio = cameraSession.readAudio(now, now < (round.humBlockedUntil ?? 0));
  if (audio) {
    // Use the sampled interval so a slow render frame does not slow the mic down.
    if (audio.humming && round.micHumming) micCharge = Math.min(audio.elapsed, 350) * micAuraChargeRate;
    round.micHumming = audio.humming;
    if (audio.fireLaser) fireBeam(now);
  }
  if (round.finished) {
    animation = requestAnimationFrame(tick);
    return;
  }
  updateAura(now, round.keyboardHum ? delta : micCharge);
  healBoss(now);

  if (now >= round.burnTickAt) {
    const ticks = 1 + Math.floor((now - round.burnTickAt) / burnInterval);
    round.burnTickAt += ticks * burnInterval;
    hurtPlayer(ticks, now);
    if (round.finished) {
      animation = requestAnimationFrame(tick);
      return;
    }
  }

  const cameraMove = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const cameraGuard = cameraMove?.guard && !round.cameraGuardBroken;
  let guard = (round.keyboardGuard && !round.keyboardGuardBroken) || cameraGuard;
  updateFlameCombo(round, now);
  if (now >= round.comboLaserAt) {
    resolveComboLaser(now, guard, Boolean(cameraMove?.left));
    guard = false;
    if (round.finished) {
      animation = requestAnimationFrame(tick);
      return;
    }
  }
  if (now >= round.strike) {
    const outcome = strikeOutcome(round);
    strikeResolvers[outcome.type](outcome, now, guard, cameraGuard);
  }

  if (round.mode === 'camera') updateCameraStatus(now);
  const cameraPose = cameraMove?.state;
  const guardBroken = round.keyboardGuardBroken || (round.mode === 'camera' && round.cameraGuardBroken);
  const used = round.poseFeedback;
  const recentAction = used && now < used.until;
  if (guardBroken) showPose('guard', 'Guard broken · release to reset', 'locked');
  else if (now < round.guardBreakNoticeUntil && !guard) showPose('guard', 'Raise guard again', 'locked');
  else if (cameraPose === 'power') {
    const counter = !round.shaken && canPowerCounter();
    showPose('heal', healBlockReason(), counter || !healBlockReason() ? '' : 'locked');
  }
  else if (recentAction && used.move === 'guard') showPose(used.move, used.label, 'active');
  else if (guard) showPose('guard', 'Guard detected', 'active');
  else if (recentAction) showPose(used.move, used.label, used.state ?? 'active');
  else if (cameraPose === 'heal-held') showPose('heal', 'Heal registered', 'active');
  else if (cameraPose === 'power-held') showPose('power', 'Power registered', 'active');
  else if (cameraPose === 'basic') showPose('basic', 'Right hand seen · hold briefly');
  else if (cameraPose === 'reset' && round.cameraMove.right) showPose('basic', 'Lower right hand to slash again');
  else showPose();
  const { danger, flame, flash, inhale, warning } = attackTell(round, now, {
    guardBroken,
    guardBreakDrill: isTutorial() && lesson().id === 'guard-break',
  });
  arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
  renderBossLabel(warning?.label ?? 'Boss warning');
  if (warning) showWarning(warning.message, true, warning.hint, warning.showGuardPose);
  else if (now < round.strikeNoticeUntil) showWarning(round.strikeNotice);
  else showWarning('No attack incoming');
  drawBattle(now, guard, flash, flame, inhale);
  if (round.training) advanceTrainingQueue(now + trainingMoveGap);
  animation = requestAnimationFrame(tick);
}

const cameraSession = createCameraSession({
  /** Fall back to keyboard when the active camera disconnects. */
  onLost(reason, message) {
    forfeitCameraBonus(reason);
    if (round) round.mode = 'keyboard';
    device.textContent = message;
  },
  /** Clear the last sustained-sound state when audio input ends. */
  onMicStopped() {
    if (round) round.micHumming = false;
  },
});

/** Pick a normal fight, fixed tutorial opponent, or training body. */
function fightForSession() {
  if (session === 'tutorial') return defaultFight;
  if (session !== 'training') return chooseFight();
  const code = trainingBoss.value;
  return { body: bossBodies[code], profile: bossProfiles[code], moves: defaultFight.moves };
}

webcam.addEventListener('click', async () => {
  const startingSession = session;
  const fight = fightForSession();
  if (!fight) return;
  trainingButton.disabled = true;
  try {
    await cameraSession.start(() => startRound('camera', startingSession, false, fight));
  } finally {
    trainingButton.disabled = false;
  }
});

/** Cancel any pending camera start and begin a keyboard or touch session. */
function startManual(mobileMode) {
  const fight = fightForSession();
  if (!fight) return;
  cameraSession.stop();
  updateStartButtons();
  device.textContent = mobileMode ? 'Hold Block to guard and Aura to charge. Tap the other moves.' : defaultStatus;
  startRound('keyboard', session, mobileMode, fight);
}
// Some phones/tablets report a fine primary pointer when a mouse is connected.
keyboard.addEventListener('click', () => startManual(
  navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse), (max-width: 820px)').matches,
));
mobile.addEventListener('click', () => startManual(true));

exit.addEventListener('click', () => {
  resetRound();
  arena.dataset.state = 'ready';
  showStartMenu();
  paintBoss(bossCanvas, defaultFight.body);
  renderBossName(defaultFight.body.name);
  resetHud(startingHP);
  webcam.focus({ preventScroll: true });
});

const combatInputs = bindCombatInputs(mobileControls, {
  /** Accept combat input only while a round can still resolve actions. */
  active: () => !!round && !round.finished,
  /** Translate a named input into a held state or one immediate combat action. */
  press(action, touch) {
    forfeitCameraBonus(touch ? 'Touch controls used' : 'Keyboard used');
    if (action === 'guard') round.keyboardGuard = true;
    else if (action === 'aura') round.keyboardHum = true;
    else if (action === 'beam') fireBeam(performance.now());
    else attack(action, performance.now());
  },
  /** Clear held guard or Aura state when its last input is released. */
  release(action) {
    if (!round) return;
    if (action === 'guard') round.keyboardGuard = round.keyboardGuardBroken = false;
    if (action === 'aura') round.keyboardHum = false;
  },
});
window.addEventListener('pagehide', () => {
  if (round || !exit.hidden) exit.click();
});
