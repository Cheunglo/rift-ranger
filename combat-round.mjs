// Owns combat state and outcomes for one session. The view receives feedback
// synchronously so input and timer-driven actions update the same HUD.
import {
  coolFlame, moveSlot, openingStrike, randomWarningStart, scheduleNextStrike,
  scheduleTutorialFlame, strikeOutcome, takeDueComboLaser, updateFlameCombo, warningDuration,
} from './boss-attacks.mjs?v=74';
import { bossHit, bossLocksForOrder, lockRequirement } from './boss-locks.mjs?v=64';
import { attackDamage } from './boss-profiles.mjs?v=64';
import { gestures } from './controls.mjs?v=68';
import { createTrainingDrill, createTutorialDrill } from './round-drills.mjs?v=74';

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
export const startingHP = { player: 100, enemy: 100 };
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

/** Create the session state and the actions that can update it. */
export function createCombatRound({ mode, session, mobile: mobileMode, fight, now }, feedback) {
  const learning = session === 'tutorial';
  const training = session === 'training';
  const maxHp = { ...startingHP, enemy: fight.profile.maxHp ?? startingHP.enemy };
  const round = {
    ...openingStrike(mode, learning || training, now, fight.moves, fight.profile),
    fight, training,
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

  const { isTutorial, lesson, showLesson, advanceLesson } = createTutorialDrill(
    round, feedback, { setHealth, updatePowerStock },
  );
  const { busy, enqueue, continueTraining } = createTrainingDrill(round);

  // Health, resources, and strike resolution

  /** Clamp combat HP and update the corresponding HUD meter. */
  function setHealth(fighter, hp) {
    const maxHp = round.maxHp[fighter];
    round.hp[fighter] = Math.max(0, Math.min(hp, maxHp));
    feedback.health(fighter, round.hp[fighter], maxHp);
  }

  /** Resolve lock-aware damage and postpone passive recovery on a landed hit. */
  function damageBoss(damage, move, now, auraStage) {
    // The move drills use the real effects. Health gates only appear in the lock lessons.
    if (isTutorial() && !lesson().lock) return { dealt: Math.min(round.hp.enemy, damage), lock: null };
    const hit = bossHit(round.locks, round.hp.enemy, damage, move, auraStage);
    if (hit.dealt) setHealth('enemy', hit.hp);
    if (hit.dealt || hit.credited) {
      round.nextHeal = now + battleTiming.healQuietTime + healInterval();
      feedback.locks(round.locks);
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
    feedback.locks(round.locks);
  }

  /** Describe the gate credit or missing move after a lock intercepts a hit. */
  function lockImpact(hit) {
    if (hit.credited && hit.lock.done === hit.lock.total) return hit.lock.hp + ' HP lock opened';
    if (hit.credited) return lockRequirement(hit.lock) + ' left';
    if (hit.lock && !hit.dealt) return 'Lock needs ' + lockRequirement(hit.lock);
    return '';
  }

  /** Keep a brief camera message tied to the current action. */
  function cameraNotice(message, state, now) {
    round.cameraNotice = { message, state, until: now + 950 };
  }

  /** Publish and retain a successful action long enough to read it. */
  function confirmPose(move, label, now) {
    round.poseFeedback = { move, label, until: now + 850 };
    feedback.pose(round.mode, move, label, 'active');
  }

  /** Check whether a banked Powerwave is available to spend. */
  function canPowerCounter() {
    return round.powerCharges > 0;
  }

  /** Synchronize the round's banked Powerwaves and their HUD count. */
  function updatePowerStock(charges = round.powerCharges) {
    round.powerCharges = charges;
    feedback.stock(charges);
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
    feedback.effect(outcome.effect, now, protectedByAura);
    if (protectedByAura) {
      round.auraMs = auraStages[1].chargeMs;
      feedback.aura(readyAuraStage());
      round.strikeNotice = 'Gold Aura absorbed the shout';
    } else {
      round.shaken = true;
      feedback.shaken(true);
      round.attackPose = null;
      round.poseFeedback = null;
      round.strikeNotice = 'Shaken · Heal to attack again';
    }
    round.strikeNoticeUntil = now + 1300;
    scheduleNextStrike(round, now, round.hp.enemy, round.maxHp.enemy);
  }

  /** Resolve the optional eye shot and require a fresh guard if it shatters the shield. */
  function resolveComboLaser(now, guarded, cameraLeftHeld) {
    feedback.effect(guarded ? 'guard-break' : 'laser', now);
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
    if (round.finished) return;
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
    feedback.effect(move, now);
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
    if (round.finished) return false;
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
    feedback.shaken(false);
    if (wasShaken && round.strikeNotice === 'Shaken · Heal to attack again') round.strikeNoticeUntil = now;
    round.burnTickAt = Infinity;
    feedback.burning(false);
    round.auraMs = 0;
    feedback.aura(readyAuraStage());
    setHealth('player', round.hp.player + restored);
    feedback.effect('heal', now);
    return (wasShaken && !restored ? 'Shaken cleared' : 'Healed +' + restored + ' HP' + (wasShaken ? ' · Shaken cleared' : '')) +
      (burned ? ' · Burn cleared' : '');
  }

  /** Spend Aura on one Laser, resolve damage and cooling, and check the result. */
  function fireBeam(now) {
    if (round.finished || round.shaken) return;
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
    feedback.aura(readyAuraStage());
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
    feedback.aura(readyAuraStage());
  }

  /** Resolve a block or a direct hit and apply the corresponding drill or status outcome. */
  function resolveGuardableStrike(outcome, now, guard, cameraGuard) {
    const kind = round.strikeKind;
    const guardDrill = isTutorial() && lesson().id === 'guard-break';
    const guardDrillDone = guardDrill && guard && round.comboGuardBlocked;
    feedback.effect(outcome.effect, now, guard);
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
        feedback.burning(true);
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

  /** Initialize resource displays and prepare the first drill when learning. */
  function initialize() {
    updatePowerStock();
    if (learning) showLesson(now);
  }

  /** Return a recent camera pose while camera combat is active. */
  function cameraPoseAt(now) {
    return round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  }

  /** Resolve newly detected poses and latch the actions the round accepts. */
  function applyPose(poseFrame, now) {
    if (!poseFrame) return;
    const move = round.readGesture(poseFrame.points, now);
    round.lastPose = now;
    round.cameraMove = move;
    if (!move.left && move.state !== 'framing') round.cameraGuardBroken = false;
    const healing = move.attack === 'power' && (round.shaken || !canPowerCounter());
    if (move.attack && attack(move.attack, now, true)) move.consume?.(healing ? 'heal-held' : undefined);
  }

  /** Resolve a detected click and measure charge from the microphone's sampling interval. */
  function readMicCharge(media, now) {
    const audio = media.readAudio(now, now < (round.humBlockedUntil ?? 0));
    if (!audio) return 0;
    // Use the sampled interval so a slow render frame does not slow the mic down.
    const charge = audio.humming && round.micHumming ? Math.min(audio.elapsed, 350) * micAuraChargeRate : 0;
    round.micHumming = audio.humming;
    if (audio.fireLaser) fireBeam(now);
    return charge;
  }

  /** Apply all Burn ticks that became due since the last frame. */
  function applyBurn(now) {
    if (now < round.burnTickAt) return;
    const ticks = 1 + Math.floor((now - round.burnTickAt) / burnInterval);
    round.burnTickAt += ticks * burnInterval;
    hurtPlayer(ticks, now);
  }

  /** Resolve one frame of device input, resource updates, and due boss attacks. */
  function step(now, media) {
    const delta = Math.min(70, now - round.lastTick);
    round.lastTick = now;
    applyPose(media.readPose(now), now);
    const micCharge = readMicCharge(media, now);
    if (round.finished) return null;
    updateAura(now, round.keyboardHum ? delta : micCharge);
    healBoss(now);
    applyBurn(now);
    if (round.finished) return null;

    const cameraMove = cameraPoseAt(now);
    const cameraGuard = cameraMove?.guard && !round.cameraGuardBroken;
    let guard = (round.keyboardGuard && !round.keyboardGuardBroken) || cameraGuard;
    updateFlameCombo(round, now);
    if (takeDueComboLaser(round, now)) {
      resolveComboLaser(now, guard, Boolean(cameraMove?.left));
      guard = false;
      if (round.finished) return null;
    }
    if (now >= round.strike) {
      const outcome = strikeOutcome(round);
      strikeResolvers[outcome.type](outcome, now, guard, cameraGuard);
    }
    return { guard, cameraMove };
  }

  /** Format the current charge for the renderer without exposing Aura thresholds. */
  function auraForDraw() {
    return { aura: round.auraMs / auraCapacity, auraStage: readyAuraStage()?.level ?? 0 };
  }

  /** Record manual input or immediately resolve a newly pressed action. */
  function press(action, now) {
    if (action === 'guard') round.keyboardGuard = true;
    else if (action === 'aura') round.keyboardHum = true;
    else if (action === 'beam') fireBeam(now);
    else attack(action, now);
  }

  /** Clear held guard or Aura when its last input is released. */
  function release(action) {
    if (action === 'guard') round.keyboardGuard = round.keyboardGuardBroken = false;
    if (action === 'aura') round.keyboardHum = false;
  }

  /** Continue the active round with manual inputs after camera disconnection. */
  function useKeyboard() {
    round.mode = 'keyboard';
  }

  /** Clear the sustained-sound latch when its input stream ends. */
  function stopMic() {
    round.micHumming = false;
  }

  /** Remove score eligibility once and report whether the view needs to update. */
  function forfeitCameraBonus() {
    if (!round.cameraBonusEligible || round.finished) return false;
    round.cameraBonusEligible = false;
    return true;
  }

  return {
    /** Report whether the training queue is busy and should stay locked. */
    get trainingBusy() { return busy(); },
    state: round, initialize, step, press, release, useKeyboard, stopMic,
    enqueue, continueTraining, forfeitCameraBonus,
    cameraPoseAt, auraForDraw, healBlockReason,
  };
}
