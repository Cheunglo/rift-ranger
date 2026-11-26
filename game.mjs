// Owns the match state, connects input to moves, and updates the HUD and arena.
import { lessons } from './tutorial.mjs?v=33';
import { paintBeast } from './beast.mjs';
import { bossHit, createBossLocks, lockMoves, nextBossLock } from './boss-locks.mjs?v=33';
import { combatArt } from './combat-art.mjs?v=26';
import { gestures, listen, loadTracker, posePoint, stopTracks } from './controls.mjs?v=26';

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
const tutorialButton = byId('tutorial');
const tutorialPanel = byId('tutorial-panel');
const micStatus = byId('mic-status');
const micLevel = byId('mic-level');
const exit = byId('exit');
const device = byId('device');
const prompt = byId('prompt');
const bossPanel = byId('boss-panel');
const warningPose = byId('warning-pose');
const warningHint = byId('warning-hint');
const poseCard = byId('ranger-pose');
const poseArt = byId('pose-art');
const poseIcon = poseArt.ownerSVGElement;
const poseLabel = byId('pose-label');
const player = byId('player');
const enemy = byId('enemy');
const lockMarkers = byId('lock-markers');
const lockStatus = byId('lock-status');
const lockTitle = byId('lock-title');
const lockRemaining = byId('lock-remaining');
const lockInstruction = byId('lock-instruction');
const tutorialBadge = byId('tutorial-badge');
const auraMeter = byId('aura');
const auraCaption = byId('aura-caption');
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
const warningDuration = () => (warningColors.length - round.warningStart) * battleTiming.warningStep;
const lockInstructions = {
  basic: 'Right hand up · A',
  power: 'Block, then both up · D',
  beam: 'Hum, then clap · G / F',
};
// Each additional stage takes twice as long to fill as the last one.
const auraStages = [
  { chargeMs: 800, multiplier: 1 },
  { chargeMs: 2400, multiplier: 2 },
  { chargeMs: 5600, multiplier: 4 },
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
let poseAnimation;
// Stale permission or model requests must not reopen a device after you exit.
let requestId = 0;
const defaultStatus = 'Camera and mic stay on your device.';
const videoInputOptions = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
const audioInputOptions = { autoGainControl: false, noiseSuppression: false, echoCancellation: true };
const micUnavailable = 'Microphone unavailable. Check browser permission, or use F and G.';
paintBeast(byId('beast'));
byId('camera-bonus-note').textContent =
  'Camera clears without keyboard combat earn a ' + cameraBonusPercent + '% Power Level bonus.';

function showWarning(message, incoming = false) {
  if (prompt.textContent !== message) prompt.textContent = message;
  const state = incoming ? 'danger' : '';
  if (bossPanel.dataset.state !== state) bossPanel.dataset.state = state;
  warningPose.toggleAttribute('hidden', !incoming);
  warningHint.hidden = !incoming;
}

function setHealth(bar, value) {
  bar.value = value;
  byId(bar.id + '-hp').textContent = bar.value + ' / ' + bar.max + ' HP';
}

function resetHud() {
  setHealth(player, player.max);
  setHealth(enemy, enemy.max);
  auraMeter.value = 0;
  auraCaption.textContent = 'Aura';
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
  const instruction = next && active ? lockInstructions[next.move] : '';
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

function damageBoss(damage, move, now) {
  // The move drills use the real effects. Health gates only appear in the lock lessons.
  if (isTutorial() && !lesson().lock) return { dealt: Math.min(enemy.value, damage), lock: null };
  const hit = bossHit(round.locks, enemy.value, damage, move);
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
  const visibleJoint = (point, index) => posePoint(point, index === 15 || index === 16 ? .45 : .55);
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
  if (move.state === 'power') {
    const hint = canPowerCounter(now) ? 'Both arms detected. Attack cooling down.' :
      'Both arms detected. Block a strike first to unlock power.';
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

function showPose(move, label = 'No action detected', state = '') {
  poseIcon.toggleAttribute('hidden', !move);
  if (move) {
    const href = './poses.svg?v=7#' + move;
    if (poseArt.getAttribute('href') !== href) poseArt.setAttribute('href', href);
  }
  if (poseLabel.textContent !== label) poseLabel.textContent = label;
  if (poseCard.dataset.state !== state) poseCard.dataset.state = state;
}

function confirmPose(move, label, now) {
  round.poseFeedback = { move, label, until: now + 850 };
  showPose(move, label, 'active');
  poseAnimation?.cancel();
  if (!reducedMotion.matches) {
    poseAnimation = poseIcon.animate(
      [{ transform: 'scale(.88)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
      { duration: 350, easing: 'ease-out' },
    );
  }
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
  tutorialButton.textContent = tutorialSelected ? 'Back to battle' : 'Start Tutorial';
}

function showStartMenu() {
  updateStartButtons();
  if (tutorialSelected) {
    showOverlay('Guided tutorial', 'Choose camera or keyboard to learn the moves and open the boss locks.');
  } else {
    showOverlay('Defend the city.', 'Keep your shoulders and any raised hand in view. You can play sitting or standing.');
  }
}

tutorialButton.addEventListener('click', () => {
  tutorialSelected = !tutorialSelected;
  showStartMenu();
  (tutorialSelected ? webcam : tutorialButton).focus();
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
  round = null;
  cameraBonusStatus.hidden = true;
  visuals.clear();
  poseAnimation?.cancel();
  poseCard.hidden = true;
  bossPanel.hidden = true;
  tutorialPanel.hidden = true;
  tutorialBadge.hidden = true;
  lockMarkers.hidden = lockStatus.hidden = true;
  updateStartButtons();
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode, learning) {
  const now = performance.now();
  round = {
    mode, lessonIndex: learning ? 0 : null, startedAt: now, strike: learning ? Infinity : now + battleTiming.firstStrike,
    cameraBonusEligible: mode === 'camera' && !learning,
    nextPower: now, nextAudioPoll: now, nextPosePoll: now, videoTime: -1,
    keyboardGuard: false,
    readGesture: gestures(), hitUntil: 0, auraMs: 0, lastTick: now,
    locks: learning ? [] : createBossLocks(), nextHeal: now + battleTiming.healQuietTime + battleTiming.healFullInterval,
    warningStart: randomWarningStart(),
  };
  resetHud();
  cameraBonusStatus.hidden = !round.cameraBonusEligible;
  cameraBonusStatus.dataset.earned = 'true';
  cameraBonusStatus.textContent = '+' + cameraBonusPercent + '% camera bonus active';
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
  poseCard.hidden = false;
  bossPanel.hidden = false;
  tracking.hidden = mode !== 'camera';
  if (mode === 'camera') cameraStatus('Waiting for tracking…', 'waiting');
  exit.hidden = false;
  animation = requestAnimationFrame(tick);
}

function isTutorial() {
  return round.lessonIndex !== null;
}

function lesson() {
  return lessons[round.lessonIndex];
}

function showLesson(now) {
  const current = lesson();
  tutorialPanel.hidden = false;
  byId('tutorial-step').textContent = 'Tutorial · ' + (round.lessonIndex + 1) + ' / ' + lessons.length;
  byId('tutorial-title').textContent = current.title;
  byId('tutorial-instruction').textContent = current.hint;
  round.strike = Infinity;
  if (current.id !== 'counter') {
    round.counterUntil = 0;
    round.powerCounterAvailable = false;
  }
  if (current.id === 'block' || current.id === 'power-lock') {
    round.warningStart = 0;
    round.strike = now + warningDuration() + 1000;
  }
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
  webcam.focus();
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
  const damage = player.max - player.value;
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
    const healthBonus = Math.round(healthMax * (player.max - damage) / player.max);
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
      points(healthMax) + ' × (' + player.max + ' − ' + damage + ') ÷ ' + player.max +
      ' = ' + points(healthBonus) + ' pts';
    byId('result-camera-bonus').hidden = !cameraBonusEligible;
    byId('result-camera-formula').textContent =
      points(baseScore) + ' × ' + cameraBonusPercent + '% ≈ +' + points(cameraBonus) + ' pts';
    battleResult.hidden = false;
  }
  webcam.focus();
}

function canPowerCounter(now) {
  return round.powerCounterAvailable && now < round.counterUntil;
}

function playerDamageScale(move) {
  const minimum = move === 'power' ? .16 : .55;
  return minimum + (1 - minimum) * enemy.value / enemy.max;
}

function attack(move, now, fromCamera = false) {
  if (!round || round.finished) return;
  const current = isTutorial() ? lesson() : null;
  if (current && !current.lock && !((current.id === 'slash' && move === 'basic') ||
      (current.id === 'counter' && move === 'power'))) return;
  const [damage, label] = attacks[move];
  if (move === 'power' && !canPowerCounter(now)) {
    if (!fromCamera) {
      round.poseFeedback = { move, label: 'Block a strike first to unlock power', state: 'locked', until: now + 1000 };
    }
    return;
  }
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
  if (hit.dealt || hit.credited) round.hitUntil = now + 170;
  const damageText = isTutorial() ? hit.dealt + ' damage' : '−' + hit.dealt + ' HP';
  const outcome = lockImpact(hit) || label + (bonus ? ' counter' : '') + ' · ' + damageText;
  confirmPose(move, outcome, now);
  if (fromCamera) cameraNotice(outcome, hit.lock && !hit.credited && !hit.dealt ? 'waiting' : 'accepted', now);
  if (current && (current.id === 'slash' || current.id === 'counter' ||
      (hit.credited && hit.lock.done === hit.lock.total))) advanceLesson(now);
  else if (enemy.value === 0) round.finished = { won: true, at: now, until: now + (move === 'power' ? 800 : 510) };
  return true;
}

function readyAuraStage() {
  return auraStages.findLast(stage => round.auraMs >= stage.chargeMs);
}

function fireBeam(now) {
  if (!round || round.finished) return;
  const current = isTutorial() ? lesson().id : null;
  if (current && current !== 'beam' && current !== 'beam-lock') return;
  const stage = readyAuraStage();
  if (!stage) {
    round.poseFeedback = { move: 'clap', label: 'Charge aura to Stage 1 first', state: 'locked', until: now + 1000 };
    return;
  }

  // A clap spends the meter and fires one shot at the highest completed stage.
  // Strength changes HP damage, but each shot earns at most one lock credit.
  round.auraMs = 0;
  round.humBlockedUntil = now + beamDuration + 200;
  round.beamFlash = { until: now + beamDuration, strength: stage.multiplier / 4 };
  showAura();
  const baseDamage = now < (round.counterUntil ?? 0) ? 8 : 6;
  const damage = Math.max(1, Math.round(baseDamage * playerDamageScale())) * stage.multiplier;
  const hit = damageBoss(damage, 'beam', now);
  if (hit.dealt || hit.credited) round.hitUntil = now + 170;
  const outcome = lockImpact(hit) || stage.multiplier + '× laser · ' +
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
  const index = ready ? auraStages.indexOf(ready) + 1 : 0;
  const bottom = ready?.chargeMs ?? 0;
  const next = auraStages[index];
  const percent = next ? Math.floor((round.auraMs - bottom) / (next.chargeMs - bottom) * 100) : 100;
  if (auraMeter.value !== percent) auraMeter.value = percent;
  const caption = ready ? 'Aura ' + index + ' · ' + ready.multiplier + '×' : 'Aura · charge to 1';
  if (auraCaption.textContent !== caption) auraCaption.textContent = caption;
}

function updateAura(now, delta, humming) {
  const current = isTutorial() ? lesson().id : null;
  if (humming && (!current || current === 'hum' || current === 'beam' || current === 'beam-lock')) {
    round.auraMs = Math.min(auraCapacity, round.auraMs + delta);
    if (current === 'hum' && readyAuraStage()) advanceLesson(now);
  }
  showAura();
}

function drawBattle(now, guard, flash = null) {
  const tracked = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const attack = now < round.attackPose?.until ? round.attackPose.move : null;
  const beamStrength = now < round.beamFlash?.until ? round.beamFlash.strength : 0;
  visuals.render(now, {
    left: Boolean(tracked?.left || guard || attack === 'power'),
    right: Boolean(tracked?.right || attack === 'basic' || attack === 'power'),
    guard, aura: round.auraMs / auraCapacity, flash, beamStrength,
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
    if (move.attack && attack(move.attack, now, true)) move.consume?.();
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

  const cameraGuard = round.mode === 'camera' && round.cameraMove?.guard && now - round.lastPose < 260;
  const guard = round.keyboardGuard || cameraGuard;
  if (now >= round.strike) {
    visuals.play('laser', now, guard);
    round.warningStart = randomWarningStart();
    const interval = battleTiming.fastestStrikeInterval +
      (battleTiming.slowestStrikeInterval - battleTiming.fastestStrikeInterval) * enemy.value / enemy.max;
    round.strike = isTutorial() ? Infinity :
      now + Math.round(interval);
    round.strikeNotice = 'Strike finished';
    if (guard) {
      round.counterUntil = isTutorial() ? Infinity : now + battleTiming.counterWindow;
      round.powerCounterAvailable = true;
      confirmPose('guard', 'Blocked! Power counter ready.', now);
      if (cameraGuard) cameraNotice('Guard blocked the strike.', 'accepted', now);
      if (isTutorial() && lesson().id === 'block') advanceLesson(now);
    } else {
      const damage = Math.min(player.value, 19);
      if (!isTutorial()) setHealth(player, player.value - damage);
      round.strikeNotice = isTutorial() ? 'Missed block · try the next shot' : 'Laser hit · −' + damage + ' HP';
      if (isTutorial()) {
        round.warningStart = 0;
        round.strike = now + warningDuration() + 1300;
      }
      if (player.value === 0) round.finished = { won: false, until: now + 400 };
    }
    round.strikeNoticeUntil = now + 1000;
  }

  if (round.mode === 'camera') updateCameraStatus(now);
  const cameraPose = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove?.state : null;
  const untilStrike = round.strike - now;
  const leadTime = warningDuration();
  const danger = untilStrike <= leadTime;
  const warningElapsed = leadTime - untilStrike;
  const flashIndex = round.warningStart + Math.floor(warningElapsed / battleTiming.warningStep);
  const flash = danger && warningElapsed % battleTiming.warningStep < 235 ? warningColors[flashIndex] : null;
  const used = round.poseFeedback;
  const recentAction = used && now < used.until;
  if (cameraPose === 'power') showPose('power', 'Both arms detected', canPowerCounter(now) ? '' : 'locked');
  else if (recentAction && used.move === 'guard') showPose(used.move, used.label, 'active');
  else if (guard) showPose('guard', 'Guard detected', 'active');
  else if (recentAction) showPose(used.move, used.label, used.state ?? 'active');
  else if (cameraPose === 'power-held') showPose('power', 'Power registered', 'active');
  else if (cameraPose === 'basic') showPose('basic', 'Right hand seen');
  else showPose();
  arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
  if (danger) showWarning('Incoming eye lasers', true);
  else if (now < round.strikeNoticeUntil) showWarning(round.strikeNotice);
  else showWarning('No attack incoming');
  drawBattle(now, guard, flash);
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

keyboard.addEventListener('click', () => {
  requestId++;
  stopCamera();
  updateStartButtons();
  device.textContent = defaultStatus;
  startRound('keyboard', tutorialSelected);
});

exit.addEventListener('click', () => {
  resetRound();
  arena.dataset.state = 'ready';
  showStartMenu();
  resetHud();
  webcam.focus();
});

const keys = { a: 'basic', d: 'power' };
window.addEventListener('keydown', event => {
  if (!round || round.finished || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (!Object.hasOwn(keys, key) && key !== 's' && key !== 'g' && key !== 'f') return;
  forfeitCameraBonus('Keyboard used');
  if (key === 's') round.keyboardGuard = true;
  else if (key === 'g') round.keyboardHum = true;
  else if (key === 'f') fireBeam(performance.now());
  else attack(keys[key], performance.now());
});
window.addEventListener('keyup', event => {
  if (!round) return;
  const key = event.key.toLowerCase();
  if (key === 's') round.keyboardGuard = false;
  if (key === 'g') round.keyboardHum = false;
});
window.addEventListener('blur', () => {
  if (round) round.keyboardGuard = round.keyboardHum = false;
});
window.addEventListener('pagehide', () => {
  if (round || !exit.hidden) exit.click();
});
