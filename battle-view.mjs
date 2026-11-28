// Translates round state and feedback into DOM and canvas updates.
import {
  arena, burnStatus, byId, hideOverlay, lockMarkers, lockStatus, mobileControls, powerStock,
  renderAura, renderBossLabel, renderBossLocks, renderBossName, renderHealth, renderPose,
  renderPowerStock, resetHud, setBattleHudVisible, setMobileHud, shakenStatus, showBattleWarning,
} from './battle-hud.mjs?v=64';
import { attackTell } from './boss-attacks.mjs?v=74';
import { paintBoss } from './boss-bodies.mjs?v=70';
import { combatArt } from './combat-art.mjs?v=75';
import { createRangerColorPicker } from './ranger-colors.mjs?v=72';
import { lessons } from './tutorial.mjs?v=75';

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

/** Bind the battle view to the arena and the active camera session. */
export function createBattleView(cameraSession, cameraBonusPercent) {
  const tutorialPanel = byId('tutorial-panel');
  const tutorialBadge = byId('tutorial-badge');
  const cameraBonusStatus = byId('camera-bonus-status');
  const bossCanvas = byId('beast');
  const visuals = combatArt(byId('combat-fx'), bossCanvas, matchMedia('(prefers-reduced-motion: reduce)'));
  const rangerSuit = createRangerColorPicker(byId('ranger-color'), byId('ranger-color-swatch'));
  byId('camera-bonus-note').textContent =
    'Camera clears without keyboard combat earn a ' + cameraBonusPercent + '% Power Level bonus.';

  /** Show or hide both lock indicators for the active drill or battle. */
  function showLocks(visible) {
    lockMarkers.hidden = lockStatus.hidden = !visible;
  }

  const feedback = {
    health: renderHealth,
    locks: renderBossLocks,
    stock: renderPowerStock,
    aura: renderAura,
    pose: showPose,
    effect: visuals.play,
    showLocks,
    /** Synchronize the Shaken badge when the round applies or clears it. */
    shaken(active) { shakenStatus.hidden = !active; },
    /** Synchronize the Burn badge when the round applies or clears it. */
    burning(active) { burnStatus.hidden = !active; },
    /** Show the current lesson using instructions for the active controls. */
    lesson(current, step, total, mobile) {
      tutorialPanel.hidden = false;
      byId('tutorial-step').textContent = 'Tutorial · ' + step + ' / ' + total;
      byId('tutorial-title').textContent = current.title;
      byId('tutorial-instruction').textContent = mobile ? current.mobileHint ?? current.hint : current.hint;
    },
  };

  /** Set up the HUD and canvas for the selected session before starting its frame loop. */
  function start(round) {
    const { fight, mobile, mode, training } = round;
    const learning = round.lessonIndex !== null;
    mobileControls.hidden = !mobile;
    setMobileHud(mobile);
    document.body.classList.toggle('mobile-play', mobile);
    paintBoss(bossCanvas, fight.body);
    renderBossName(fight.body.name);
    resetHud(round.maxHp, learning ? undefined : round.locks.map(lock => lock.hp));
    powerStock.hidden = false;
    cameraBonusStatus.hidden = !round.cameraBonusEligible;
    cameraBonusStatus.dataset.earned = 'true';
    cameraBonusStatus.textContent = '+' + cameraBonusPercent + '% camera bonus active';
    arena.toggleAttribute('data-tutorial', learning);
    if (!learning && !training) {
      showLocks(true);
      renderBossLocks(round.locks);
    }
    tutorialBadge.hidden = !learning;
    arena.dataset.state = 'ready';
    hideOverlay();
    showPose(mode);
    showWarning(round, 'No attack incoming');
    setBattleHudVisible(true);
    cameraSession.setTrackingVisible(mode === 'camera');
    if (mobile) arena.scrollIntoView({ block: 'start' });
  }

  /** Clear the session's visual state before opening the next menu. */
  function reset() {
    mobileControls.hidden = true;
    setMobileHud(false);
    document.body.classList.remove('mobile-play');
    burnStatus.hidden = shakenStatus.hidden = powerStock.hidden = true;
    cameraBonusStatus.hidden = true;
    visuals.clear();
    setBattleHudVisible(false);
    tutorialPanel.hidden = true;
    arena.removeAttribute('data-tutorial');
    tutorialBadge.hidden = true;
    showLocks(false);
  }

  /** Paint the start-menu opponent and reset the idle arena when returning from a session. */
  function showIdle(body, maxHp) {
    paintBoss(bossCanvas, body);
    if (maxHp) {
      arena.dataset.state = 'ready';
      renderBossName(body.name);
      resetHud(maxHp);
    }
  }

  /** Set the arena treatment retained behind the result overlay. */
  function showResult(won) {
    arena.dataset.state = won ? 'win' : 'ready';
  }

  /** Display the reason a camera score bonus is no longer available. */
  function showCameraBonusLost(reason) {
    cameraBonusStatus.dataset.earned = 'false';
    cameraBonusStatus.textContent = reason + ' · no camera bonus';
  }

  /** Choose the default guard hint for the active input mode. */
  function showWarning(round, message, incoming = false, hint = round?.mobile ? 'Hold Block through the shot.' : 'Left hand up, or hold S.', showGuardPose = true) {
    showBattleWarning(message, incoming, hint, showGuardPose);
  }

  /** Render combat feedback and expose the silhouette in camera sessions. */
  function showPose(mode, move, label, state) {
    renderPose(mode === 'camera', move, label, state);
  }

  /** Prioritize tracking, guard reset, and accepted pose guidance. */
  function updateCameraStatus(now, combat) {
    const round = combat.state;
    const move = round.cameraMove;
    if (!move || now - round.lastPose > 400) return cameraSession.showTracking('Waiting for tracking…', 'waiting');
    if (round.cameraGuardBroken) return cameraSession.showTracking('Guard broken. Lower your left hand, then raise it.', 'waiting');
    if (move.state === 'power') {
      const hint = !round.shaken && round.powerCharges > 0 ? 'Both arms detected. Power counter ready.' :
        combat.healBlockReason() || 'Both arms detected. Heal ready.';
      return cameraSession.showTracking(hint, 'waiting');
    }
    const notice = round.cameraNotice;
    if (notice && now < notice.until) return cameraSession.showTracking(notice.message, notice.state);
    const needsFraming = move.state === 'framing' || move.state === 'hands-hidden';
    cameraSession.showTracking(trackingHints[move.state], move.state === 'guard' ? 'accepted' : needsFraming ? 'waiting' : '');
  }

  /** Build renderer inputs from the current poses, charge, boss cues, and effects. */
  function drawBattle(now, combat, guard, flash = null, flame = null, inhale = null) {
    const round = combat.state;
    const tracked = combat.cameraPoseAt(now);
    const attack = now < round.attackPose?.until ? round.attackPose.move : null;
    const bothArms = attack === 'power' || attack === 'heal';
    const beamStrength = now < round.beamFlash?.until ? round.beamFlash.strength : 0;
    const windUp = combat.windUpForDraw();
    visuals.render(now, {
      left: Boolean(tracked?.left || guard || bothArms || windUp.left),
      right: !round.shaken && Boolean(tracked?.right || attack === 'basic' || bothArms || windUp.right),
      guard, ...combat.auraForDraw(), flash, beamStrength, beamStage: round.beamFlash?.stage, flame, inhale, shaken: round.shaken,
      suit: rangerSuit(), beamWindUp: windUp.beam, burning: round.burnTickAt !== Infinity, anchors: round.fight.body.anchors,
    });
  }

  /** Render the current combat cues, pose feedback, and frame of animation. */
  function render(now, combat, { guard, cameraMove }) {
    const round = combat.state;
    if (round.mode === 'camera') updateCameraStatus(now, combat);
    const cameraPose = cameraMove?.state;
    const guardBroken = round.keyboardGuardBroken || (round.mode === 'camera' && round.cameraGuardBroken);
    const used = round.poseFeedback;
    const recentAction = used && now < used.until;
    if (guardBroken) showPose(round.mode, 'guard', 'Guard broken · release to reset', 'locked');
    else if (now < round.guardBreakNoticeUntil && !guard) showPose(round.mode, 'guard', 'Raise guard again', 'locked');
    else if (cameraPose === 'power') {
      const counter = !round.shaken && round.powerCharges > 0;
      const reason = combat.healBlockReason();
      showPose(round.mode, 'heal', reason, counter || !reason ? '' : 'locked');
    } else if (recentAction && used.move === 'guard') showPose(round.mode, used.move, used.label, 'active');
    else if (guard) showPose(round.mode, 'guard', 'Guard detected', 'active');
    else if (recentAction) showPose(round.mode, used.move, used.label, used.state ?? 'active');
    else if (cameraPose === 'heal-held') showPose(round.mode, 'heal', 'Heal registered', 'active');
    else if (cameraPose === 'power-held') showPose(round.mode, 'power', 'Power registered', 'active');
    else if (cameraPose === 'basic') showPose(round.mode, 'basic', 'Right hand seen · hold briefly');
    else if (cameraPose === 'reset' && round.cameraMove.right) showPose(round.mode, 'basic', 'Lower right hand to slash again');
    else showPose(round.mode);
    const { danger, flame, flash, inhale, warning } = attackTell(round, now, {
      guardBroken,
      guardBreakDrill: lessons[round.lessonIndex]?.id === 'guard-break',
    });
    arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
    renderBossLabel(warning?.label ?? 'Boss warning');
    if (warning) showWarning(round, warning.message, true, warning.hint, warning.showGuardPose);
    else if (now < round.strikeNoticeUntil) showWarning(round, round.strikeNotice);
    else showWarning(round, 'No attack incoming');
    drawBattle(now, combat, guard, flash, flame, inhale);
  }

  return { feedback, start, reset, showIdle, showResult, showCameraBonusLost, render, drawBattle };
}
