// Owns the round and connects input, attack rules, and presentation.
import { createCameraSession, defaultStatus } from './camera-session.mjs?v=62';
import {
  arena, burnStatus, byId, hideOverlay, lockMarkers,
  lockStatus, mobileControls, powerStock, renderAura, renderBossLabel,
  renderBossLocks, renderBossName, renderPose, renderPowerStock, renderHealth, resetHud, setBattleHudVisible,
  setMobileHud, shakenStatus, showBattleResult, showBattleWarning, showOverlay,
} from './battle-hud.mjs?v=62';
import {
  attackTell, coolFlame, openingStrike, randomWarningStart, scheduleNextStrike,
  scheduleTutorialFlame, strikeOutcome, updateFlameCombo, warningDuration,
} from './boss-attacks.mjs?v=62';
import { bindCombatInputs } from './mobile-controls.mjs?v=60';
import { lessons } from './tutorial.mjs?v=61';
import { paintBoss } from './boss-bodies.mjs?v=62';
import { parseFightId } from './boss-fights.mjs?v=62';
import { chooseFight, showFightId, showFightOptions } from './fight-picker.mjs?v=62';
import { bossHit, bossLocksForOrder, lockRequirement } from './boss-locks.mjs?v=62';
import { combatArt } from './combat-art.mjs?v=62';
import { gestures } from './controls.mjs?v=57';

const cameraBonusStatus = byId('camera-bonus-status');
const webcam = byId('webcam');
const keyboard = byId('keyboard');
const mobile = byId('mobile');
const tutorialButton = byId('tutorial');
const tutorialPanel = byId('tutorial-panel');
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
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const bossCanvas = byId('beast');
const visuals = combatArt(byId('combat-fx'), bossCanvas, reducedMotion);
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
let tutorialSelected = false;
let animation;
paintBoss(bossCanvas, defaultFight.body);
byId('camera-bonus-note').textContent =
  'Camera clears without keyboard combat earn a ' + cameraBonusPercent + '% Power Level bonus.';

function showWarning(message, incoming = false, hint = round?.mobile ? 'Hold Block through the shot.' : 'Left hand up, or hold S.', showGuardPose = true) {
  showBattleWarning(message, incoming, hint, showGuardPose);
}

function showPose(move, label, state) {
  renderPose(round?.mode === 'camera', move, label, state);
}

function setHealth(fighter, hp) {
  const maxHp = round.maxHp[fighter];
  round.hp[fighter] = Math.max(0, Math.min(hp, maxHp));
  renderHealth(fighter, round.hp[fighter], maxHp);
}

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

function healInterval() {
  // Each tick restores one HP. The interval grows with health, so the rate
  // falls as the boss heals. The minimum keeps low-HP recovery bounded.
  const { healMinInterval, healFullInterval } = battleTiming;
  return healMinInterval + (healFullInterval - healMinInterval) * round.hp.enemy / round.maxHp.enemy;
}

function healBoss(now) {
  if (isTutorial() || now < round.nextHeal || round.hp.enemy <= 0 || round.hp.enemy >= round.maxHp.enemy) return;
  setHealth('enemy', round.hp.enemy + 1);
  round.nextHeal = now + healInterval();
  renderBossLocks(round.locks);
}

function lockImpact(hit) {
  if (hit.credited && hit.lock.done === hit.lock.total) return hit.lock.hp + ' HP lock opened';
  if (hit.credited) return lockRequirement(hit.lock) + ' left';
  if (hit.lock && !hit.dealt) return 'Lock needs ' + lockRequirement(hit.lock);
  return '';
}

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

function cameraNotice(message, state, now) {
  round.cameraNotice = { message, state, until: now + 950 };
}

function confirmPose(move, label, now) {
  round.poseFeedback = { move, label, until: now + 850 };
  showPose(move, label, 'active');
}

function updateStartButtons() {
  webcam.disabled = tutorialButton.disabled = false;
  showFightOptions(!tutorialSelected);
  webcam.textContent = tutorialSelected ? 'Tutorial with camera + mic' : 'Enable camera + mic';
  keyboard.textContent = tutorialSelected ? 'Tutorial with keyboard' : 'Play with keyboard';
  mobile.textContent = tutorialSelected ? 'Tutorial on mobile' : 'Play on mobile';
  tutorialButton.textContent = tutorialSelected ? 'Back to battle' : 'Start Tutorial';
}

function showStartMenu() {
  updateStartButtons();
  if (tutorialSelected) {
    showOverlay('Guided tutorial', 'Choose camera, keyboard, or mobile to learn the moves and open the boss locks.');
  } else {
    showOverlay('Defend the city.', 'Keep your shoulders and any raised hand in view. You can play sitting or standing.');
  }
}

tutorialButton.addEventListener('click', () => {
  tutorialSelected = !tutorialSelected;
  showStartMenu();
  (tutorialSelected ? webcam : tutorialButton).focus({ preventScroll: true });
});

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
  arena.removeAttribute('data-tutorial');
  tutorialBadge.hidden = true;
  lockMarkers.hidden = lockStatus.hidden = true;
  updateStartButtons();
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode, learning, mobileMode = false, fight = defaultFight) {
  combatInputs.reset();
  mobileControls.hidden = !mobileMode;
  setMobileHud(mobileMode);
  document.body.classList.toggle('mobile-play', mobileMode);
  const now = performance.now();
  round = {
    ...openingStrike(mode, learning, now, fight.moves),
    fight,
    mode, mobile: mobileMode, lessonIndex: learning ? 0 : null, startedAt: now,
    hp: { ...startingHP },
    maxHp: { ...startingHP },
    cameraBonusEligible: mode === 'camera' && !learning,
    powerCharges: 0, blockBonusUntil: 0, nextPower: now,
    keyboardGuard: false, shaken: false,
    readGesture: gestures(), hitUntil: 0, auraMs: 0, damageTaken: 0, lastTick: now,
    locks: learning ? [] : bossLocksForOrder(fight.lockOrder), nextHeal: now + battleTiming.healQuietTime + battleTiming.healFullInterval,
    warningStart: randomWarningStart(), burnTickAt: Infinity,
  };
  paintBoss(bossCanvas, fight.body);
  renderBossName(fight.body.name);
  showFightId(learning ? '' : fight.id);
  resetHud(round.maxHp);
  updatePowerStock();
  powerStock.hidden = false;
  cameraBonusStatus.hidden = !round.cameraBonusEligible;
  cameraBonusStatus.dataset.earned = 'true';
  cameraBonusStatus.textContent = '+' + cameraBonusPercent + '% camera bonus active';
  arena.toggleAttribute('data-tutorial', learning);
  if (learning) showLesson(now);
  else {
    lockMarkers.hidden = lockStatus.hidden = false;
    renderBossLocks(round.locks);
  }
  tutorialBadge.hidden = !learning;
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

function isTutorial() {
  return round.lessonIndex !== null;
}

function lesson() {
  return lessons[round.lessonIndex];
}

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

function advanceLesson(now) {
  if (round.lessonIndex + 1 === lessons.length) {
    round.finished = { tutorial: true, until: now + 650 };
    return;
  }
  round.lessonIndex++;
  showLesson(now);
}

function completeTutorial() {
  tutorialSelected = false;
  resetRound();
  arena.dataset.state = 'ready';
  showOverlay('Tutorial complete', 'You learned every move and opened all three locks. In battle, lock moves are shuffled and the boss can heal.');
  resetHud(startingHP);
  webcam.focus({ preventScroll: true });
}

function forfeitCameraBonus(reason) {
  if (!round?.cameraBonusEligible || round.finished) return;
  round.cameraBonusEligible = false;
  cameraBonusStatus.dataset.earned = 'false';
  cameraBonusStatus.textContent = reason + ' · no camera bonus';
}

function endRound(won) {
  // Use the frame that landed the final hit, excluding the victory animation.
  const elapsed = won ? Math.round(round.finished.at - round.startedAt) / 1000 : 0;
  const damage = round.damageTaken;
  const maxHealth = round.maxHp.player;
  const { id: fightId, body } = round.fight;
  const cameraBonusEligible = round.cameraBonusEligible;
  resetRound();
  showFightId(fightId);
  arena.dataset.state = won ? 'win' : 'ready';
  showOverlay(won ? 'City saved!' : 'Ranger down',
    won ? body.name + ' has fallen.' : 'Raise your right arm to attack and your left arm to guard.');
  if (won) {
    showBattleResult(elapsed, damage, maxHealth, cameraBonusEligible, cameraBonusPercent);
  }
  webcam.focus({ preventScroll: true });
}

function canPowerCounter() {
  return round.powerCharges > 0;
}

function updatePowerStock(charges = round.powerCharges) {
  round.powerCharges = charges;
  renderPowerStock(charges);
}

function bankPowerCounter(now, kind) {
  updatePowerStock(round.powerCharges + 1);
  round.blockBonusUntil = isTutorial() && kind === 'laser' ? Infinity : now + battleTiming.blockBonusWindow;
}

function playerDamageScale(move) {
  const minimum = move === 'power' ? .16 : .55;
  return minimum + (1 - minimum) * round.hp.enemy / round.maxHp.enemy;
}

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
    const damage = hurtPlayer(19, now);
    round.strikeNotice = 'Eye laser hit · −' + damage + ' HP';
    round.strikeNoticeUntil = now + 1000;
  }
}

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

function hurtPlayer(amount, now) {
  const damage = Math.min(round.hp.player, amount);
  round.damageTaken += damage;
  setHealth('player', round.hp.player - damage);
  if (round.hp.player === 0) round.finished = { won: false, until: now + 400 };
  return damage;
}

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

function readyAuraStage() {
  return auraStages.findLast(stage => round.auraMs >= stage.chargeMs);
}

function healBlockReason() {
  if (isTutorial() && lesson().id !== 'heal') return 'Follow the current lesson.';
  if (!round.shaken && round.hp.player >= round.maxHp.player && round.burnTickAt === Infinity) {
    return 'Health is full. Block a strike to unlock a power counter.';
  }
  if (!readyAuraStage()) return 'Charge aura to Stage 1 to heal.';
  return '';
}

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

function fireBeam(now) {
  if (!round || round.finished || round.shaken) return;
  const current = isTutorial() ? lesson().id : null;
  if (current && current !== 'beam' && current !== 'beam-lock' && current !== 'flame') return;
  const stage = readyAuraStage();
  if (!stage) {
    round.poseFeedback = { move: 'clap', label: 'Charge aura to Stage 1 first', state: 'locked', until: now + 1000 };
    return;
  }

  // A clap spends the meter and fires one shot at the highest completed stage.
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

function updateAura(now, chargeMs) {
  const current = isTutorial() ? lesson().id : null;
  if (chargeMs > 0 && (!current || current === 'hum' || current === 'heal' || current === 'beam' ||
      current === 'beam-lock' || current === 'flame')) {
    round.auraMs = Math.min(auraCapacity, round.auraMs + chargeMs);
    if (current === 'hum' && readyAuraStage()) advanceLesson(now);
  }
  renderAura(readyAuraStage());
}

function drawBattle(now, guard, flash = null, flame = null, inhale = null) {
  const tracked = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const attack = now < round.attackPose?.until ? round.attackPose.move : null;
  const bothArms = attack === 'power' || attack === 'heal';
  const beamStrength = now < round.beamFlash?.until ? round.beamFlash.strength : 0;
  visuals.render(now, {
    left: Boolean(tracked?.left || guard || bothArms),
    right: !round.shaken && Boolean(tracked?.right || attack === 'basic' || bothArms),
    guard, aura: round.auraMs / auraCapacity, auraStage: readyAuraStage()?.level ?? 0, flash, beamStrength, beamStage: round.beamFlash?.stage, flame, inhale, shaken: round.shaken,
    burning: round.burnTickAt !== Infinity, anchors: round.fight.body.anchors,
  });
}

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
    const damage = hurtPlayer(outcome.damage, now);
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

function tick(now) {
  // Sample devices at their own rates, resolve moves and the boss strike,
  // then render. Keyboard input uses the same move and damage functions.
  if (!round) return;
  if (round.finished) {
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
    if (audio.clap) fireBeam(now);
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
  animation = requestAnimationFrame(tick);
}

const cameraSession = createCameraSession({
  onLost(reason, message) {
    forfeitCameraBonus(reason);
    if (round) round.mode = 'keyboard';
    device.textContent = message;
  },
  onMicStopped() {
    if (round) round.micHumming = false;
  },
});

webcam.addEventListener('click', () => {
  const learning = tutorialSelected;
  const fight = learning ? defaultFight : chooseFight();
  if (fight) void cameraSession.start(() => startRound('camera', learning, false, fight));
});

function startManual(mobileMode) {
  const fight = tutorialSelected ? defaultFight : chooseFight();
  if (!fight) return;
  cameraSession.stop();
  updateStartButtons();
  device.textContent = mobileMode ? 'Hold Block to guard and Aura to charge. Tap the other moves.' : defaultStatus;
  startRound('keyboard', tutorialSelected, mobileMode, fight);
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
  active: () => !!round && !round.finished,
  press(action, touch) {
    forfeitCameraBonus(touch ? 'Touch controls used' : 'Keyboard used');
    if (action === 'guard') round.keyboardGuard = true;
    else if (action === 'aura') round.keyboardHum = true;
    else if (action === 'beam') fireBeam(performance.now());
    else attack(action, performance.now());
  },
  release(action) {
    if (!round) return;
    if (action === 'guard') round.keyboardGuard = round.keyboardGuardBroken = false;
    if (action === 'aura') round.keyboardHum = false;
  },
});
window.addEventListener('pagehide', () => {
  if (round || !exit.hidden) exit.click();
});
