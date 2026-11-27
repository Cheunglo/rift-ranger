import { bindCombatInputs } from './mobile-controls.mjs?v=46';
// Owns the match state, connects input to moves, and updates the HUD and arena.
import { lessons } from './tutorial.mjs?v=45';
import { paintBeast } from './beast.mjs';
import { bossHit, createBossLocks, lockMoves, nextBossLock } from './boss-locks.mjs?v=42';
import { combatArt } from './combat-art.mjs?v=50';
import { gestures, listen, loadTracker, posePoint, stopTracks, wristPoint } from './controls.mjs?v=37';

const byId = id => document.getElementById(id);
const arena = byId('arena');
const camera = byId('camera');
const cameraFrame = byId('camera-frame');
const tracking = byId('tracking');
const trackingPoints = byId('tracking-points');
const poseContext = trackingPoints.getContext('2d');
const overlay = byId('overlay');
const battleResult = byId('battle-result');
const cameraBonusStatus = byId('camera-bonus-status');
const webcam = byId('webcam');
const keyboard = byId('keyboard');
const mobile = byId('mobile');
const mobileControls = byId('mobile-controls');
const mobileStatus = byId('mobile-status');
const mobileDetails = byId('mobile-details');
const tutorialButton = byId('tutorial');
const tutorialPanel = byId('tutorial-panel');
const micStatus = byId('mic-status');
const micLevel = byId('mic-level');
const exit = byId('exit');
const device = byId('device');
const prompt = byId('prompt');
const bossPanel = byId('boss-panel');
const bossPanelLabel = byId('boss-panel-label');
const warningPose = byId('warning-pose');
const warningHint = byId('warning-hint');
const cameraPosePreview = byId('camera-pose');
const poseArt = byId('pose-art');
const poseIcon = poseArt.ownerSVGElement;
const moveNotice = byId('move-notice');
const battleFeedback = byId('battle-feedback');
const auraStatus = byId('aura-status');
const auraButtonCaption = byId('aura-button-caption');
const player = byId('player');
const burnStatus = byId('burn-status');
const enemy = byId('enemy');
const lockMarkers = byId('lock-markers');
const lockStatus = byId('lock-status');
const lockTitle = byId('lock-title');
const lockRemaining = byId('lock-remaining');
const lockInstruction = byId('lock-instruction');
const tutorialBadge = byId('tutorial-badge');
const auraCaption = byId('aura-caption');
const bossPanelHome = bossPanel.parentElement;
const lockStatusHome = lockStatus.parentElement;

function setMobileHud(enabled) {
  mobileStatus.hidden = !enabled;
  document.body.classList.remove('mobile-details');
  mobileDetails.setAttribute('aria-expanded', 'false');
  mobileDetails.textContent = 'Show details';
  (enabled ? mobileStatus : bossPanelHome).append(bossPanel);
  (enabled ? mobileStatus : lockStatusHome).append(lockStatus);
}
mobileDetails.addEventListener('click', () => {
  const expanded = document.body.classList.toggle('mobile-details');
  mobileDetails.setAttribute('aria-expanded', String(expanded));
  mobileDetails.textContent = expanded ? 'Hide details' : 'Show details';
});
// All timing values are milliseconds. The animation loop uses one clock.
const battleTiming = {
  firstStrike: 7000,
  slowestStrikeInterval: 6600,
  fastestStrikeInterval: 3650,
  warningStep: 1000,
  counterWindow: 2400,
  healQuietTime: 1800,
  healMinInterval: 700,
  healFullInterval: 5200,
};
const attacks = {
  basic: [5, 'Energy slash'],
  power: [22, 'Power strike'],
};
const cameraBonusPercent = 20;
const warningColors = ['green', 'yellow', 'red'];
const randomWarningStart = () => Math.floor(Math.random() * warningColors.length);
const eyeWarningDuration = () => (warningColors.length - round.warningStart) * battleTiming.warningStep;
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
const comboChanceByLocksOpened = [.15, .40, .75, 1];
const burnInterval = 1000;
const warningDuration = () => round.strikeKind === 'flame' ? flameChargeTime : eyeWarningDuration();
const lockInstructions = {
  basic: 'Right hand up · A',
  power: 'Block, then both up · D',
  beam: 'Stages 1–3 earn 1, 2, 4',
};
// Each additional stage takes twice as long to fill as the last one.
const auraStages = [
  { level: 1, chargeMs: 800, multiplier: 1 },
  { level: 2, chargeMs: 2400, multiplier: 2 },
  { level: 3, chargeMs: 5600, multiplier: 4 },
];
const auraCapacity = auraStages.at(-1).chargeMs;
const beamDuration = 420;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const visuals = combatArt(byId('combat-fx'), byId('beast'), reducedMotion);
const armLines = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
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
const audioHints = {
  calibrating: 'Calibrating mic · stay quiet briefly.',
  beam: 'Beam input · hum again after firing.',
  quiet: 'Mic on · hum close to the mic.',
  sound: 'Sound heard · try a steady note.',
  note: 'Note heard · keep humming.',
  humming: 'Hum detected · charging aura.',
};

let round;
let tutorialSelected = false;
let animation;
let tracker;
let cameraStream;
let micStream;
let pendingCameraMic;
let context;
let audioInput;
// Stale permission or model requests must not reopen a device after you exit.
let requestId = 0;
const defaultStatus = 'Camera and mic stay on your device.';
const videoInputOptions = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
const audioInputOptions = { autoGainControl: false, noiseSuppression: false, echoCancellation: true };
const micUnavailable = 'Microphone unavailable. Check browser permission, or use F and G.';
paintBeast(byId('beast'));
byId('camera-bonus-note').textContent =
  'Camera clears without keyboard combat earn a ' + cameraBonusPercent + '% Power Level bonus.';

function showWarning(message, incoming = false, hint = round?.mobile ? 'Hold Block through the shot.' : 'Left hand up, or hold S.') {
  if (prompt.textContent !== message) prompt.textContent = message;
  const state = incoming ? 'danger' : '';
  if (bossPanel.dataset.state !== state) bossPanel.dataset.state = state;
  warningPose.toggleAttribute('hidden', !incoming);
  warningHint.hidden = !incoming;
  if (incoming && warningHint.textContent !== hint) warningHint.textContent = hint;
}

function setHealth(bar, value) {
  bar.value = value;
  byId(bar.id + '-hp').textContent = bar.value + ' / ' + bar.max + ' HP';
}

function resetHud() {
  setHealth(player, player.max);
  setHealth(enemy, enemy.max);
  burnStatus.hidden = true;
  arena.dataset.auraStage = mobileControls.dataset.auraStage = '0';
  auraCaption.textContent = 'Aura · charge to 1';
  auraButtonCaption.textContent = 'Hold to charge';
  for (const marker of lockMarkers.children) marker.dataset.state = 'closed';
}

// The HUD previews the next gate and keeps an engaged lock highlighted if the boss heals.
function showBossLocks() {
  const next = nextBossLock(round.locks);
  const active = Boolean(next?.engaged);
  for (const lock of round.locks) {
    byId('lock-' + lock.hp).dataset.state = lock.done === lock.total ? 'open' :
      lock === next && active ? 'active' : 'closed';
  }
  let title = 'All three locks opened';
  if (next) {
    title = active ? next.hp + ' HP lock' : 'Next lock · ' + next.hp + ' HP';
  }
  const remaining = next ? lockRequirement(next) + ' left' : '';
  const instruction = active ? lockInstructions[next.move] : '';
  if (lockTitle.textContent !== title) lockTitle.textContent = title;
  if (lockRemaining.textContent !== remaining) lockRemaining.textContent = remaining;
  if (lockInstruction.textContent !== instruction) lockInstruction.textContent = instruction;
  lockRemaining.hidden = !remaining;
  lockInstruction.hidden = !instruction;
  lockStatus.dataset.active = String(active);
}

function lockRequirement(lock) {
  const remaining = lock.total - lock.done;
  return remaining + ' ' + lockMoves[lock.move][remaining === 1 ? 0 : 1];
}

function damageBoss(damage, move, now, auraStage) {
  // The move drills use the real effects. Health gates only appear in the lock lessons.
  if (isTutorial() && !lesson().lock) return { dealt: Math.min(enemy.value, damage), lock: null };
  const hit = bossHit(round.locks, enemy.value, damage, move, auraStage);
  if (hit.dealt) setHealth(enemy, hit.hp);
  if (hit.dealt || hit.credited) {
    round.nextHeal = now + battleTiming.healQuietTime + healInterval();
    showBossLocks();
  }
  return hit;
}

function healInterval() {
  // Each tick restores one HP. The interval grows with health, so the rate
  // falls as the boss heals. The minimum keeps low-HP recovery bounded.
  const { healMinInterval, healFullInterval } = battleTiming;
  return healMinInterval + (healFullInterval - healMinInterval) * enemy.value / enemy.max;
}

function healBoss(now) {
  if (isTutorial() || now < round.nextHeal || enemy.value <= 0 || enemy.value >= enemy.max) return;
  setHealth(enemy, enemy.value + 1);
  round.nextHeal = now + healInterval();
  showBossLocks();
}

function lockImpact(hit) {
  if (hit.credited && hit.lock.done === hit.lock.total) return hit.lock.hp + ' HP lock opened';
  if (hit.credited) return lockRequirement(hit.lock) + ' left';
  if (hit.lock && !hit.dealt) return 'Lock needs ' + lockRequirement(hit.lock);
  return '';
}

function cameraStatus(message, state = '') {
  const text = 'Camera: ' + message;
  if (tracking.textContent !== text) tracking.textContent = text;
  if (tracking.dataset.state !== state) tracking.dataset.state = state;
}

function drawTracking(points) {
  // The overlay shares the video dimensions; CSS mirrors both together.
  const { videoWidth: width, videoHeight: height } = camera;
  if (!width || !height) return;
  if (trackingPoints.width !== width || trackingPoints.height !== height) {
    trackingPoints.width = width;
    trackingPoints.height = height;
  }
  poseContext.clearRect(0, 0, width, height);
  poseContext.lineWidth = width * .005;
  poseContext.strokeStyle = '#e8ff75';
  poseContext.fillStyle = '#e8ff75';
  const visibleJoint = (point, index) => index === 15 || index === 16 ? wristPoint(point) : posePoint(point);
  for (const [start, end] of armLines) {
    const from = points?.[start];
    const to = points?.[end];
    if (!visibleJoint(from, start) || !visibleJoint(to, end)) continue;
    poseContext.beginPath();
    poseContext.moveTo(from.x * width, from.y * height);
    poseContext.lineTo(to.x * width, to.y * height);
    poseContext.stroke();
  }
  for (const index of [0, 11, 12, 13, 14, 15, 16]) {
    const point = points?.[index];
    if (!visibleJoint(point, index)) continue;
    poseContext.beginPath();
    poseContext.arc(point.x * width, point.y * height, width * .009, 0, 2 * Math.PI);
    poseContext.fill();
  }
}

function updateCameraStatus(now) {
  const move = round.cameraMove;
  if (!move || now - round.lastPose > 400) return cameraStatus('Waiting for tracking…', 'waiting');
  if (round.cameraGuardBroken) return cameraStatus('Guard broken. Lower your left hand, then raise it.', 'waiting');
  if (move.state === 'power') {
    const hint = canPowerCounter(now) ? 'Both arms detected. Power counter ready.' :
      healBlockReason(now) || 'Both arms detected. Heal ready.';
    return cameraStatus(hint, 'waiting');
  }
  const notice = round.cameraNotice;
  if (notice && now < notice.until) return cameraStatus(notice.message, notice.state);
  const needsFraming = move.state === 'framing' || move.state === 'hands-hidden';
  cameraStatus(trackingHints[move.state], move.state === 'guard' ? 'accepted' : needsFraming ? 'waiting' : '');
}

function cameraNotice(message, state, now) {
  round.cameraNotice = { message, state, until: now + 950 };
}

// The character shows successful moves; only explain blocked moves in text.
function showPose(move, label = '', state = '') {
  cameraPosePreview.hidden = round?.mode !== 'camera';
  poseIcon.toggleAttribute('hidden', !move);
  if (move) poseArt.setAttribute('href', './poses.svg?v=7#' + move);
  cameraPosePreview.setAttribute('aria-label', label || 'Recognized camera pose');
  moveNotice.hidden = state !== 'locked';
  if (state === 'locked' && moveNotice.textContent !== label) moveNotice.textContent = label;
}

function confirmPose(move, label, now) {
  round.poseFeedback = { move, label, until: now + 850 };
  showPose(move, label, 'active');
}

function showOverlay(title, copy) {
  battleResult.hidden = true;
  byId('overlay-title').textContent = title;
  byId('overlay-copy').textContent = copy;
  overlay.hidden = false;
}

function updateStartButtons() {
  webcam.disabled = tutorialButton.disabled = false;
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

function stopCamera() {
  cancelCameraMic();
  stopMic();
  stopTracks(cameraStream);
  cameraStream = null;
  camera.srcObject = null;
  cameraFrame.hidden = true;
  tracking.hidden = true;
  poseContext.clearRect(0, 0, trackingPoints.width, trackingPoints.height);
  tracker?.close();
  tracker = null;
}

function beginCameraMic() {
  if (micStream || pendingCameraMic) return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  try {
    const audioContext = new Audio();
    // Begin resuming inside the click gesture, before the permission prompt.
    const ready = audioContext.resume().then(() => true, () => false);
    pendingCameraMic = { audioContext, ready };
    return pendingCameraMic;
  } catch {
    return null;
  }
}

function cancelCameraMic() {
  if (!pendingCameraMic) return;
  const { audioContext, stream } = pendingCameraMic;
  pendingCameraMic = null;
  stopTracks(stream);
  void audioContext.close().catch(() => {});
}

function activateMic(stream, audioContext) {
  const read = listen(audioContext, stream);
  micStream = stream;
  context = audioContext;
  audioInput = read;
  stream.getAudioTracks()[0].addEventListener('ended', () => {
    if (micStream !== stream) return;
    stopMic();
    setMicMessage('Mic disconnected. F and G still work.');
    device.textContent = defaultStatus;
  });
  setMicMessage('Mic on. Hum to charge, then clap once to fire.');
  micLevel.hidden = false;
}

function stopMic() {
  stopTracks(micStream);
  micStream = null;
  audioInput = null;
  if (round) {
    round.micHumming = false;
  }
  if (context && context.state !== 'closed') void context.close().catch(() => {});
  context = null;
  setMicMessage('');
  micLevel.value = 0;
  micLevel.hidden = true;
}

function setMicMessage(message) {
  if (micStatus.textContent !== message) micStatus.textContent = message;
  delete micStatus.dataset.state;
  micStatus.hidden = !message;
}

function showMicInput(state, level) {
  const hint = audioHints[state];
  if (micStatus.textContent !== hint) micStatus.textContent = hint;
  micStatus.dataset.state = state;
  micLevel.value = level;
}

function resetRound() {
  // Cancel the frame loop and release both devices before showing the menu.
  requestId++;
  cancelAnimationFrame(animation);
  stopCamera();
  combatInputs.reset();
  mobileControls.hidden = true;
  setMobileHud(false);
  document.body.classList.remove('mobile-play');
  round = null;
  burnStatus.hidden = true;
  cameraBonusStatus.hidden = true;
  visuals.clear();
  cameraPosePreview.hidden = battleFeedback.hidden = auraStatus.hidden = true;
  bossPanel.hidden = true;
  tutorialPanel.hidden = true;
  arena.removeAttribute('data-tutorial');
  tutorialBadge.hidden = true;
  lockMarkers.hidden = lockStatus.hidden = true;
  updateStartButtons();
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode, learning, mobileMode = false) {
  combatInputs.reset();
  mobileControls.hidden = !mobileMode;
  setMobileHud(mobileMode);
  document.body.classList.toggle('mobile-play', mobileMode);
  const now = performance.now();
  round = {
    mode, mobile: mobileMode, lessonIndex: learning ? 0 : null, startedAt: now, strike: learning ? Infinity : now + battleTiming.firstStrike,
    cameraBonusEligible: mode === 'camera' && !learning,
    nextPower: now, nextAudioPoll: now, nextPosePoll: now, videoTime: -1,
    keyboardGuard: false,
    readGesture: gestures(), hitUntil: 0, auraMs: 0, damageTaken: 0, lastTick: now,
    locks: learning ? [] : createBossLocks(), nextHeal: now + battleTiming.healQuietTime + battleTiming.healFullInterval,
    warningStart: randomWarningStart(), strikeKind: 'laser', comboLaserAt: Infinity, burnTickAt: Infinity,
  };
  resetHud();
  cameraBonusStatus.hidden = !round.cameraBonusEligible;
  cameraBonusStatus.dataset.earned = 'true';
  cameraBonusStatus.textContent = '+' + cameraBonusPercent + '% camera bonus active';
  arena.toggleAttribute('data-tutorial', learning);
  if (learning) showLesson(now);
  else {
    lockMarkers.hidden = lockStatus.hidden = false;
    showBossLocks();
  }
  tutorialBadge.hidden = !learning;
  arena.dataset.state = 'ready';
  overlay.hidden = true;
  showPose();
  showWarning('No attack incoming');
  battleFeedback.hidden = auraStatus.hidden = false;
  bossPanel.hidden = false;
  tracking.hidden = mode !== 'camera';
  if (mode === 'camera') cameraStatus('Waiting for tracking…', 'waiting');
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
  if (current.id === 'heal') setHealth(player, 80);
  tutorialPanel.hidden = false;
  byId('tutorial-step').textContent = 'Tutorial · ' + (round.lessonIndex + 1) + ' / ' + lessons.length;
  byId('tutorial-title').textContent = current.title;
  byId('tutorial-instruction').textContent = round.mobile ? current.hint
    .replace('Raise your right hand above your shoulder, or press A', 'Tap Slash')
    .replace('hold your left hand up or hold S', 'hold Block')
    .replaceAll('raise both hands or press D', 'tap Powerwave / Heal')
    .replace('Hum a steady note or hold G', 'Hold Aura')
    .replace('Clap once or press F', 'Tap Laser')
    .replace('Lower and raise your left hand, or release and re-press S,', 'Release and re-press Block') : current.hint;
  round.strike = Infinity;
  round.comboLaserAt = Infinity;
  round.strikeKind = current.id === 'flame' || current.id === 'guard-break' ? 'flame' : 'laser';
  if (current.id !== 'counter') {
    round.counterUntil = 0;
    round.powerCounterAvailable = false;
  }
  if (current.id === 'block' || current.id === 'power-lock') {
    round.warningStart = 0;
    round.strike = now + warningDuration() + 1000;
  }
  if (round.strikeKind === 'flame') scheduleTutorialFlame(now, 1000);
  lockMarkers.hidden = lockStatus.hidden = !current.lock;
  if (current.lock) {
    // Retain earlier tutorial gates so their markers stay open in the HUD.
    round.locks.push({ ...current.lock, done: 0, engaged: false });
    setHealth(enemy, current.startHp);
    showBossLocks();
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
  resetHud();
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
  const cameraBonusEligible = round.cameraBonusEligible;
  resetRound();
  arena.dataset.state = won ? 'win' : 'ready';
  showOverlay(won ? 'City saved!' : 'Ranger down',
    won ? 'The Riftbeast has fallen.' : 'Raise your right arm to attack and your left arm to guard.');
  if (won) {
    const speedMax = 6000;
    const healthMax = 4000;
    const referenceSeconds = 60;
    const timeBonus = Math.round(speedMax * referenceSeconds / (referenceSeconds + elapsed));
    const healthBonus = Math.round(healthMax * Math.max(0, player.max - damage) / player.max);
    const baseScore = timeBonus + healthBonus;
    const cameraBonus = cameraBonusEligible ? Math.round(baseScore * cameraBonusPercent / 100) : 0;
    const seconds = Math.floor(elapsed);
    const points = value => value.toLocaleString();
    byId('result-score').textContent = points(baseScore + cameraBonus);
    byId('result-time').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    byId('result-damage').textContent = damage + ' HP';
    byId('result-speed-formula').textContent =
      points(speedMax) + ' × ' + referenceSeconds + ' ÷ (' + referenceSeconds + ' + ' + points(elapsed) +
      ') ≈ ' + points(timeBonus) + ' pts';
    byId('result-health-formula').textContent =
      points(healthMax) + ' × max(0, ' + player.max + ' − ' + damage + ') ÷ ' + player.max +
      ' = ' + points(healthBonus) + ' pts';
    byId('result-camera-bonus').hidden = !cameraBonusEligible;
    byId('result-camera-formula').textContent =
      points(baseScore) + ' × ' + cameraBonusPercent + '% ≈ +' + points(cameraBonus) + ' pts';
    battleResult.hidden = false;
  }
  webcam.focus({ preventScroll: true });
}

function canPowerCounter(now) {
  return round.powerCounterAvailable && now < round.counterUntil;
}

function playerDamageScale(move) {
  const minimum = move === 'power' ? .16 : .55;
  return minimum + (1 - minimum) * enemy.value / enemy.max;
}

function flamePhase(now) {
  if (round.strikeKind !== 'flame' || now >= round.strike) return;
  const elapsed = now - (round.strike - flameChargeTime);
  if (elapsed >= 0) return flamePhases.find(phase => elapsed < phase.until);
}

function scheduleNextStrike(now) {
  round.comboLaserAt = Infinity;
  if (isTutorial()) {
    round.strike = Infinity;
    return;
  }
  round.strikeKind = round.strikeKind === 'laser' ? 'flame' : 'laser';
  round.warningStart = randomWarningStart();
  const interval = battleTiming.fastestStrikeInterval +
    (battleTiming.slowestStrikeInterval - battleTiming.fastestStrikeInterval) * enemy.value / enemy.max;
  // A faster boss still gives players the full flamethrower warning.
  round.strike = now + Math.max(Math.round(interval), round.strikeKind === 'flame' ? flameChargeTime + 1000 : 0);
  if (round.strikeKind === 'flame') round.comboLaserAt = undefined;
}

function scheduleTutorialFlame(now, pause) {
  round.warningStart = 0;
  round.strike = now + flameChargeTime + pause;
  round.comboGuardBlocked = false;
  round.comboLaserAt = lesson().id === 'guard-break' ? round.strike - comboLaserLeadTime : Infinity;
}

function updateFlameCombo(now) {
  // Roll once as the charge begins, using the locks the player has already opened.
  if (round.comboLaserAt !== undefined || now < round.strike - flameChargeTime) return;
  const opened = round.locks.filter(lock => lock.done === lock.total).length;
  round.comboLaserAt = Math.random() < comboChanceByLocksOpened[opened]
    ? round.strike - comboLaserLeadTime : Infinity;
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
    return;
  }
  if (!isTutorial()) {
    const damage = hurtPlayer(19, now);
    round.strikeNotice = 'Eye laser hit · −' + damage + ' HP';
    round.strikeNoticeUntil = now + 1000;
  }
}

function hitFlameCharge(move, now, stage) {
  const phase = flamePhase(now);
  if (!phase || phase.name === 'white') return '';
  const drop = move === 'basic' ? 1 : move === 'beam' && stage > 0 ? stage + 1 : 0;
  if (!drop) return '';
  const priorIndex = flamePhases.indexOf(phase) - drop;
  if (priorIndex >= 0) {
    const priorStart = flamePhases[priorIndex - 1]?.until ?? 0;
    round.strike = now + flameChargeTime - priorStart;
    // Move a pending combo with the charge. A laser that fired stays spent.
    if (round.comboLaserAt < Infinity) round.comboLaserAt = round.strike - comboLaserLeadTime;
    return 'Fireball cooled to ' + flamePhases[priorIndex].name;
  }
  scheduleNextStrike(now);
  round.strikeNotice = 'Flamethrower interrupted!';
  round.strikeNoticeUntil = now + 1400;
  if (isTutorial() && lesson().id === 'flame') advanceLesson(now);
  return 'Flamethrower interrupted!';
}

function hurtPlayer(amount, now) {
  const damage = Math.min(player.value, amount);
  round.damageTaken += damage;
  setHealth(player, player.value - damage);
  if (player.value === 0) round.finished = { won: false, until: now + 400 };
  return damage;
}

function attack(move, now, fromCamera = false) {
  if (!round || round.finished) return;
  if (move === 'power' && !canPowerCounter(now)) return healPlayer(now, fromCamera);
  const current = isTutorial() ? lesson() : null;
  if (current && !current.lock && !(((current.id === 'slash' || current.id === 'flame') && move === 'basic') ||
      (current.id === 'counter' && move === 'power'))) return;
  const [damage, label] = attacks[move];
  if (move === 'power' && now < round.nextPower) return;
  const bonus = now < (round.counterUntil ?? 0);
  const counterDamage = move === 'basic' ? 2 : 5;
  const scaledDamage = Math.max(1, Math.round((damage + (bonus ? counterDamage : 0)) * playerDamageScale(move)));
  const hit = damageBoss(scaledDamage, move, now);
  if (move === 'power') {
    round.nextPower = now + 580;
    round.powerCounterAvailable = false;
  }
  round.attackPose = { move, until: now + 360 };
  visuals.play(move, now);
  const flameOutcome = hitFlameCharge(move, now);
  if (hit.dealt || hit.credited) round.hitUntil = now + 170;
  const damageText = isTutorial() ? hit.dealt + ' damage' : '−' + hit.dealt + ' HP';
  const outcome = flameOutcome || lockImpact(hit) || label + (bonus ? ' counter' : '') + ' · ' + damageText;
  confirmPose(move, outcome, now);
  if (fromCamera) cameraNotice(outcome, !flameOutcome && hit.lock && !hit.credited && !hit.dealt ? 'waiting' : 'accepted', now);
  if (current && (current.id === 'slash' || current.id === 'counter' ||
      (hit.credited && hit.lock.done === hit.lock.total))) advanceLesson(now);
  else if (enemy.value === 0) round.finished = { won: true, at: now, until: now + (move === 'power' ? 800 : 510) };
  return true;
}

function readyAuraStage() {
  return auraStages.findLast(stage => round.auraMs >= stage.chargeMs);
}

function healBlockReason(now) {
  if (isTutorial() && lesson().id !== 'heal') return 'Follow the current lesson.';
  if (canPowerCounter(now)) return 'Heal after the power counter window.';
  if (player.value >= player.max && round.burnTickAt === Infinity) {
    return 'Health is full. Block a strike to unlock a power counter.';
  }
  if (!readyAuraStage()) return 'Charge aura to Stage 1 to heal.';
  return '';
}

function healPlayer(now, fromCamera = false) {
  if (!round || round.finished) return false;
  const blocked = healBlockReason(now);
  if (blocked) {
    if (!fromCamera) round.poseFeedback = { move: 'heal', label: blocked, state: 'locked', until: now + 1000 };
    return false;
  }
  const restored = Math.min(player.max - player.value, readyAuraStage().multiplier * 5);
  const burned = round.burnTickAt !== Infinity;
  round.burnTickAt = Infinity;
  burnStatus.hidden = true;
  round.auraMs = 0;
  showAura();
  setHealth(player, player.value + restored);
  round.attackPose = { move: 'heal', until: now + 750 };
  visuals.play('heal', now);
  const outcome = 'Healed +' + restored + ' HP' + (burned ? ' · Burn cleared' : '');
  confirmPose('heal', outcome, now);
  if (fromCamera) cameraNotice(outcome, 'accepted', now);
  if (isTutorial()) {
    setHealth(player, player.max);
    advanceLesson(now);
  }
  return true;
}

function fireBeam(now) {
  if (!round || round.finished) return;
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
  round.beamFlash = { until: now + beamDuration, strength: stage.multiplier / 4 };
  showAura();
  const baseDamage = now < (round.counterUntil ?? 0) ? 8 : 6;
  const damage = Math.max(1, Math.round(baseDamage * playerDamageScale())) * stage.multiplier;
  const hit = damageBoss(damage, 'beam', now, stage.level);
  const flameOutcome = hitFlameCharge('beam', now, stage.level);
  if (hit.dealt || hit.credited) round.hitUntil = now + 170;
  const outcome = flameOutcome || lockImpact(hit) || stage.multiplier + '× laser · ' +
    (isTutorial() ? hit.dealt + ' damage' : '−' + hit.dealt + ' HP');
  confirmPose('clap', outcome, now);
  if (current === 'beam' || (current === 'beam-lock' && hit.credited && hit.lock.done === hit.lock.total)) {
    advanceLesson(now);
  } else if (enemy.value === 0) {
    round.finished = { won: true, at: now, until: now + beamDuration };
  }
}

function showAura() {
  const ready = readyAuraStage();
  const index = ready?.level ?? 0;
  arena.dataset.auraStage = mobileControls.dataset.auraStage = String(index);
  const caption = ready ? 'Aura ' + index + ' · ' + ready.multiplier + '×' : 'Aura · charge to 1';
  const buttonCaption = ready ? 'Stage ' + index + ' · ' + ready.multiplier + '×' : 'Hold to charge';
  if (auraCaption.textContent !== caption) auraCaption.textContent = caption;
  if (auraButtonCaption.textContent !== buttonCaption) auraButtonCaption.textContent = buttonCaption;
}

function updateAura(now, delta, humming) {
  const current = isTutorial() ? lesson().id : null;
  if (humming && (!current || current === 'hum' || current === 'heal' || current === 'beam' ||
      current === 'beam-lock' || current === 'flame')) {
    round.auraMs = Math.min(auraCapacity, round.auraMs + delta);
    if (current === 'hum' && readyAuraStage()) advanceLesson(now);
  }
  showAura();
}

function drawBattle(now, guard, flash = null, flame = null) {
  const tracked = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const attack = now < round.attackPose?.until ? round.attackPose.move : null;
  const bothArms = attack === 'power' || attack === 'heal';
  const beamStrength = now < round.beamFlash?.until ? round.beamFlash.strength : 0;
  visuals.render(now, {
    left: Boolean(tracked?.left || guard || bothArms),
    right: Boolean(tracked?.right || attack === 'basic' || bothArms),
    guard, aura: round.auraMs / auraCapacity, auraStage: readyAuraStage()?.level ?? 0, flash, beamStrength, flame,
    burning: round.burnTickAt !== Infinity,
  });
}

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
  if (tracker && camera.readyState >= 2 && now >= round.nextPosePoll && camera.currentTime !== round.videoTime) {
    round.videoTime = camera.currentTime;
    round.nextPosePoll = now + 55;
    let pose;
    try {
      pose = tracker.detectForVideo(camera, now).landmarks[0];
    } catch {
      stopCamera();
      forfeitCameraBonus('Camera tracking stopped');
      round.mode = 'keyboard';
      device.textContent = 'Tracking stopped. You can finish with the keyboard.';
    }
    const move = round.readGesture(pose, now);
    drawTracking(pose);
    round.lastPose = now;
    round.cameraMove = move;
    if (!move.left && move.state !== 'framing') round.cameraGuardBroken = false;
    const healing = move.attack === 'power' && !canPowerCounter(now);
    if (move.attack && attack(move.attack, now, true)) move.consume?.(healing ? 'heal-held' : undefined);
    if (!round) return;
  }

  if (audioInput && now >= round.nextAudioPoll) {
    round.nextAudioPoll = now + 20;
    const suppressHum = now < (round.humBlockedUntil ?? 0);
    const { clap, humming, level, state } = audioInput(now, suppressHum);
    showMicInput(state, level);
    round.micHumming = humming;
    if (clap) fireBeam(now);
  }
  if (round.finished) {
    animation = requestAnimationFrame(tick);
    return;
  }
  const humming = round.keyboardHum || (now >= (round.humBlockedUntil ?? 0) && round.micHumming);
  updateAura(now, delta, humming);
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
  updateFlameCombo(now);
  if (now >= round.comboLaserAt) {
    resolveComboLaser(now, guard, Boolean(cameraMove?.left));
    guard = false;
    if (round.finished) {
      animation = requestAnimationFrame(tick);
      return;
    }
  }
  if (now >= round.strike) {
    const kind = round.strikeKind;
    const guardDrill = isTutorial() && lesson().id === 'guard-break';
    const guardDrillDone = guardDrill && guard && round.comboGuardBlocked;
    visuals.play(kind, now, guard);
    scheduleNextStrike(now);
    round.strikeNotice = 'Strike finished';
    if (guard) {
      round.counterUntil = isTutorial() && kind === 'laser' ? Infinity : now + battleTiming.counterWindow;
      round.powerCounterAvailable = true;
      confirmPose('guard', 'Blocked! Power counter ready.', now);
      if (cameraGuard) cameraNotice('Guard blocked the strike.', 'accepted', now);
      if (isTutorial() && lesson().id === 'block') advanceLesson(now);
      if (isTutorial() && kind === 'flame') round.strikeNotice = 'Blocked · interrupt the next charge';
    } else if (isTutorial()) {
      round.strikeNotice = kind === 'flame' ? 'Flame hit · interrupt the next charge' : 'Missed block · try the next shot';
    } else {
      const damage = hurtPlayer(kind === 'flame' ? 10 : 19, now);
      round.strikeNotice = (kind === 'flame' ? 'Flame hit' : 'Laser hit') + ' · −' + damage + ' HP';
      if (kind === 'flame' && !round.finished && round.burnTickAt === Infinity) {
        round.burnTickAt = now + burnInterval;
        burnStatus.hidden = false;
      }
    }
    if (guardDrillDone) {
      advanceLesson(now);
      round.strikeNotice = 'Both attacks blocked!';
    } else if (guardDrill) {
      scheduleTutorialFlame(now, 1300);
      round.strikeNotice = 'Block both attacks · try again';
    } else if (isTutorial() && kind === 'flame') {
      scheduleTutorialFlame(now, 1300);
    } else if (isTutorial() && !guard) {
      round.warningStart = 0;
      round.strike = now + warningDuration() + 1300;
    }
    round.strikeNoticeUntil = now + 1000;
  }

  if (round.mode === 'camera') updateCameraStatus(now);
  const cameraPose = cameraMove?.state;
  const untilStrike = round.strike - now;
  const leadTime = warningDuration();
  const danger = untilStrike <= leadTime;
  const warningElapsed = leadTime - untilStrike;
  const flame = flamePhase(now);
  const eyeElapsed = eyeWarningDuration() - ((flame ? round.comboLaserAt : round.strike) - now);
  const eyeWarning = eyeElapsed >= 0;
  const flashIndex = round.warningStart + Math.floor(eyeElapsed / battleTiming.warningStep);
  const flash = eyeWarning && eyeElapsed % battleTiming.warningStep < 235 ? warningColors[flashIndex] : null;
  const guardBroken = round.keyboardGuardBroken || (round.mode === 'camera' && round.cameraGuardBroken);
  const used = round.poseFeedback;
  const recentAction = used && now < used.until;
  if (guardBroken) showPose('guard', 'Guard broken · release to reset', 'locked');
  else if (now < round.guardBreakNoticeUntil && !guard) showPose('guard', 'Raise guard again', 'locked');
  else if (cameraPose === 'power') {
    const counter = canPowerCounter(now);
    showPose('heal', healBlockReason(now), counter || !healBlockReason(now) ? '' : 'locked');
  }
  else if (recentAction && used.move === 'guard') showPose(used.move, used.label, 'active');
  else if (guard) showPose('guard', 'Guard detected', 'active');
  else if (recentAction) showPose(used.move, used.label, used.state ?? 'active');
  else if (cameraPose === 'heal-held') showPose('heal', 'Heal registered', 'active');
  else if (cameraPose === 'power-held') showPose('power', 'Power registered', 'active');
  else if (cameraPose === 'basic') showPose('basic', 'Right hand seen · hold briefly');
  else if (cameraPose === 'reset' && round.cameraMove.right) showPose('basic', 'Lower right hand to slash again');
  else showPose();
  arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
  const bossLabel = flame ? eyeWarning ? 'Flame + eye lasers' : 'Flamethrower' : 'Boss warning';
  if (bossPanelLabel.textContent !== bossLabel) bossPanelLabel.textContent = bossLabel;
  if (flame) {
    const incomingHint = eyeWarning ? 'Guard the eye lasers first.' :
      guardBroken ? 'Release, then guard again.' :
        now < round.strikeNoticeUntil && round.strikeNotice.startsWith('Eye laser hit') ? round.strikeNotice : undefined;
    const drill = isTutorial() && lesson().id === 'guard-break';
    const message = drill ? (round.comboLaserAt < Infinity ? 'Guard twice' : 'Guard the flames') : flame.hint;
    showWarning(message, true, incomingHint);
  }
  else if (danger) showWarning('Incoming eye lasers', true);
  else if (now < round.strikeNoticeUntil) showWarning(round.strikeNotice);
  else showWarning('No attack incoming');
  drawBattle(now, guard, flash, flame && {
    color: flame.color, halo: flame.halo, charge: warningElapsed / leadTime,
  });
  animation = requestAnimationFrame(tick);
}

webcam.addEventListener('click', async () => {
  const request = ++requestId;
  const learning = tutorialSelected;
  webcam.disabled = tutorialButton.disabled = true;
  webcam.textContent = 'Starting camera…';
  exit.hidden = false;
  const automaticMic = beginCameraMic();
  let micFallback = !automaticMic;
  device.textContent = automaticMic ? 'Allow camera and microphone access when your browser asks.' :
    'Allow camera access when your browser asks.';
  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoInputOptions, audio: automaticMic ? audioInputOptions : false,
      });
    } catch (error) {
      if (!automaticMic || request !== requestId) throw error;
      cancelCameraMic();
      micFallback = true;
      stream = await navigator.mediaDevices.getUserMedia({ video: videoInputOptions });
    }
    if (request !== requestId) return stopTracks(stream);
    // Separate tracks so turning off the mic cannot stop the webcam preview.
    const audioTracks = stream.getAudioTracks();
    if (automaticMic && pendingCameraMic === automaticMic && audioTracks.length) {
      automaticMic.stream = new MediaStream(audioTracks);
    } else {
      audioTracks.forEach(track => track.stop());
    }
    const videoStream = new MediaStream(stream.getVideoTracks());
    cameraStream = videoStream;
    camera.srcObject = videoStream;
    await camera.play();
    if (request !== requestId) return;
    cameraFrame.hidden = false;
    device.textContent = 'Loading the pose model…';
    const model = await loadTracker();
    if (request !== requestId) return model.close();
    tracker = model;
    videoStream.getVideoTracks()[0].addEventListener('ended', () => {
      if (cameraStream !== videoStream) return;
      stopCamera();
      forfeitCameraBonus('Camera disconnected');
      if (round) round.mode = 'keyboard';
      device.textContent = 'Camera disconnected. Keyboard controls are available.';
    });
    startRound('camera', learning);
    device.textContent = 'Camera active. ' + defaultStatus;
    if (micFallback) setMicMessage(micUnavailable);
    if (pendingCameraMic && pendingCameraMic === automaticMic) {
      void automaticMic.ready.then(ready => {
        if (pendingCameraMic !== automaticMic) return;
        try {
          if (!ready || !automaticMic.stream) throw new Error('Microphone setup incomplete');
          activateMic(automaticMic.stream, automaticMic.audioContext);
          pendingCameraMic = null;
          device.textContent = 'Camera and microphone active. ' + defaultStatus;
        } catch {
          cancelCameraMic();
          setMicMessage(micUnavailable);
        }
      });
    }
  } catch (error) {
    if (request !== requestId) return;
    stopCamera();
    webcam.disabled = tutorialButton.disabled = false;
    webcam.textContent = 'Retry camera + mic';
    exit.hidden = true;
    const cameraError = error.name === 'NotAllowedError' || error.name === 'NotFoundError' ||
      error.name === 'NotReadableError' || !navigator.mediaDevices;
    device.textContent = cameraError
      ? 'Camera unavailable. Check browser permissions, or play with the keyboard.'
      : 'Could not start camera tracking. Check your connection, or play with the keyboard.';
  }
});

function startManual(mobileMode) {
  requestId++;
  stopCamera();
  updateStartButtons();
  device.textContent = mobileMode ? 'Hold Block to guard and Aura to charge. Tap the other moves.' : defaultStatus;
  startRound('keyboard', tutorialSelected, mobileMode);
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
  resetHud();
  webcam.focus({ preventScroll: true });
});

const combatInputs = bindCombatInputs(mobileControls, {
  active: () => !!round && !round.finished,
  press(key, touch) {
    forfeitCameraBonus(touch ? 'Touch controls used' : 'Keyboard used');
    if (key === 's') round.keyboardGuard = true;
    else if (key === 'g') round.keyboardHum = true;
    else if (key === 'f') fireBeam(performance.now());
    else attack(key === 'a' ? 'basic' : 'power', performance.now());
  },
  release(key) {
    if (!round) return;
    if (key === 's') round.keyboardGuard = round.keyboardGuardBroken = false;
    if (key === 'g') round.keyboardHum = false;
  },
});
window.addEventListener('pagehide', () => {
  if (round || !exit.hidden) exit.click();
});
