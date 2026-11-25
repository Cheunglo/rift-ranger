import { paintBeast } from './beast.mjs';
import { combatArt } from './combat-art.mjs?v=11';
import { gestures, listen, loadTracker, posePoint, stopTracks } from './controls.mjs?v=11';

const byId = id => document.getElementById(id);
const arena = byId('arena');
const camera = byId('camera');
const cameraFrame = byId('camera-frame');
const tracking = byId('tracking');
const trackingPoints = byId('tracking-points');
const poseContext = trackingPoints.getContext('2d');
const overlay = byId('overlay');
const webcam = byId('webcam');
const keyboard = byId('keyboard');
const mic = byId('mic');
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
const time = byId('time');
const auraMeter = byId('aura');
const battleTiming = {
  duration: 75_000,
  firstStrike: 7000,
  strikeInterval: 6200,
  enragedInterval: 4800,
  warning: 3000,
  counterWindow: 2400,
};
const attacks = {
  basic: [5, 'Energy slash'],
  power: [22, 'Power strike'],
  clap: [0, 'Aura beam'],
};
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
  reset: 'Lower both hands to attack again.',
};

let round;
let animation;
let tracker;
let cameraStream;
let micStream;
let context;
let audioInput;
let poseAnimation;
let requestId = 0;
let micRequestId = 0;
const defaultStatus = 'Camera and mic stay on your device.';
paintBeast(byId('beast'));

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

function setTime(milliseconds) {
  const seconds = String(Math.max(0, Math.ceil(milliseconds / 1000)));
  if (time.textContent !== seconds) time.textContent = seconds;
}

function resetHud() {
  setHealth(player, player.max);
  setHealth(enemy, enemy.max);
  setTime(battleTiming.duration);
  auraMeter.value = 0;
}

function cameraStatus(message, state = '') {
  const text = 'Camera: ' + message;
  if (tracking.textContent !== text) tracking.textContent = text;
  if (tracking.dataset.state !== state) tracking.dataset.state = state;
}

function drawTracking(points) {
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
  byId('overlay-title').textContent = title;
  byId('overlay-copy').textContent = copy;
  overlay.hidden = false;
}

function stopCamera() {
  stopTracks(cameraStream);
  cameraStream = null;
  camera.srcObject = null;
  cameraFrame.hidden = true;
  tracking.hidden = true;
  poseContext.clearRect(0, 0, trackingPoints.width, trackingPoints.height);
  tracker?.close();
  tracker = null;
}

function stopMic() {
  micRequestId++;
  stopTracks(micStream);
  micStream = null;
  audioInput = null;
  if (round) round.micHumming = false;
  if (context && context.state !== 'closed') void context.close().catch(() => {});
  context = null;
  mic.disabled = false;
  mic.textContent = 'Enable mic';
  mic.setAttribute('aria-pressed', 'false');
}

function resetRound() {
  requestId++;
  cancelAnimationFrame(animation);
  stopCamera();
  stopMic();
  round = null;
  visuals.clear();
  poseAnimation?.cancel();
  poseCard.hidden = true;
  bossPanel.hidden = true;
  webcam.disabled = false;
  webcam.textContent = 'Enable camera';
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode) {
  const now = performance.now();
  round = {
    mode, started: now, strike: now + battleTiming.firstStrike,
    nextAttack: now, nextBasic: now, nextAudioPoll: now, nextPosePoll: now, videoTime: -1,
    keyboardGuard: false,
    readGesture: gestures(), hitUntil: 0, aura: 0, lastTick: now,
  };
  resetHud();
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

function endRound(won, expired = false) {
  resetRound();
  arena.dataset.state = won ? 'win' : 'ready';
  showOverlay(won ? 'City saved!' : expired ? 'Time ran out' : 'Ranger down',
    won ? 'The Riftbeast has fallen.' : 'Raise your right arm to attack and your left arm to guard.');
  webcam.focus();
}

function canPowerCounter(now) {
  return round.powerCounterAvailable && now < round.counterUntil;
}

function attack(move, now, fromCamera = false) {
  if (!round || round.finished) return;
  const [baseDamage, label] = attacks[move];
  if (move === 'power' && !canPowerCounter(now)) {
    if (!fromCamera) {
      round.poseFeedback = { move, label: 'Block a strike first to unlock power', state: 'locked', until: now + 1000 };
    }
    return;
  }
  const charge = move === 'clap' ? round.aura : 0;
  if (move === 'clap' && charge < .06) {
    round.poseFeedback = { move, label: 'Hum first to charge the beam', state: 'locked', until: now + 1000 };
    return;
  }
  if (now < round.nextAttack || (move === 'basic' && now < round.nextBasic)) {
    if (fromCamera && move === 'basic') {
      cameraNotice('Right arm recognized. Attack cooling down.', 'waiting', now);
    }
    return;
  }
  if (move === 'clap') {
    round.aura = 0;
    auraMeter.value = 0;
  }
  const damage = move === 'clap' ? Math.round(8 + charge * 18) : baseDamage;
  const bonus = now < (round.counterUntil ?? 0);
  const counterDamage = move === 'basic' ? 2 : 5;
  const dealt = Math.min(enemy.value, bonus ? damage + counterDamage : damage);
  setHealth(enemy, enemy.value - dealt);
  round.nextAttack = now + 580;
  if (move === 'basic') round.nextBasic = now + 950;
  if (move === 'power') round.powerCounterAvailable = false;
  round.attackPose = { move, until: now + 360 };
  visuals.play(move, now, charge);
  round.hitUntil = now + 170;
  confirmPose(move, label + (bonus ? ' counter' : '') + ' · −' + dealt + ' HP', now);
  if (fromCamera) cameraNotice(label + ' landed (−' + dealt + ' HP).', 'accepted', now);
  if (enemy.value === 0) round.finished = { won: true, until: now + (move === 'power' ? 800 : 510) };
  return true;
}

function drawBattle(now, guard, flash = false) {
  const tracked = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const attack = now < round.attackPose?.until ? round.attackPose.move : null;
  visuals.render(now, {
    left: Boolean(tracked?.left || guard || attack === 'power'),
    right: Boolean(tracked?.right || attack === 'basic' || attack === 'power'),
    guard, aura: round.aura, flash,
  });
}

function tick(now) {
  if (!round) return;
  if (round.finished) {
    if (now >= round.finished.until) return endRound(round.finished.won);
    drawBattle(now, false);
    animation = requestAnimationFrame(tick);
    return;
  }
  const delta = Math.min(70, now - round.lastTick);
  round.lastTick = now;
  const remaining = battleTiming.duration - (now - round.started);
  setTime(remaining);
  if (remaining <= 0) return endRound(false, true);

  if (tracker && camera.readyState >= 2 && now >= round.nextPosePoll && camera.currentTime !== round.videoTime) {
    round.videoTime = camera.currentTime;
    round.nextPosePoll = now + 55;
    let pose;
    try {
      pose = tracker.detectForVideo(camera, now).landmarks[0];
    } catch {
      stopCamera();
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
    const { clap, humming } = audioInput(now);
    round.micHumming = humming;
    if (clap) attack('clap', now);
  }
  if (round.finished) {
    animation = requestAnimationFrame(tick);
    return;
  }
  const humming = round.keyboardHum || round.micHumming;
  if (humming && round.aura < 1) {
    round.aura = Math.min(1, round.aura + delta / 1600);
    auraMeter.value = Math.round(round.aura * 100);
  }

  const cameraGuard = round.mode === 'camera' && round.cameraMove?.guard && now - round.lastPose < 260;
  const guard = round.keyboardGuard || cameraGuard;
  if (now >= round.strike) {
    visuals.play('laser', now, guard);
    round.strike = now + (enemy.value <= 40 ? battleTiming.enragedInterval : battleTiming.strikeInterval);
    round.strikeNotice = 'Strike finished';
    if (guard) {
      round.counterUntil = now + battleTiming.counterWindow;
      round.powerCounterAvailable = true;
      confirmPose('guard', 'Blocked! Power counter ready.', now);
      if (cameraGuard) cameraNotice('Guard blocked the strike.', 'accepted', now);
    } else {
      const damage = Math.min(player.value, 19);
      setHealth(player, player.value - damage);
      round.strikeNotice = 'Laser hit · −' + damage + ' HP';
      if (player.value === 0) round.finished = { won: false, until: now + 400 };
    }
    round.strikeNoticeUntil = now + 1000;
  }

  if (round.mode === 'camera') updateCameraStatus(now);
  const cameraPose = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove?.state : null;
  const untilStrike = round.strike - now;
  const danger = untilStrike <= battleTiming.warning;
  const flash = danger && (battleTiming.warning - untilStrike) % 1000 < 235;
  const used = round.poseFeedback;
  const recentAction = used && now < used.until;
  if (cameraPose === 'power') showPose('power', 'Both arms detected', canPowerCounter(now) ? '' : 'locked');
  else if (recentAction && used.move === 'guard') showPose(used.move, used.label, 'active');
  else if (guard) showPose('guard', 'Guard detected', 'active');
  else if (recentAction) showPose(used.move, used.label, used.state ?? 'active');
  else if (cameraPose === 'power-held') showPose('power', 'Power registered', 'active');
  else if (cameraPose === 'basic') showPose('basic', 'Right hand seen');
  else if (humming) showPose('hum', round.aura === 1 ? 'Aura full · clap to fire' : 'Building aura');
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
  webcam.disabled = true;
  webcam.textContent = 'Starting camera…';
  exit.hidden = false;
  device.textContent = 'Allow camera access when your browser asks.';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
    });
    if (request !== requestId) return stopTracks(stream);
    cameraStream = stream;
    camera.srcObject = stream;
    await camera.play();
    if (request !== requestId) return;
    cameraFrame.hidden = false;
    device.textContent = 'Loading the pose model…';
    const model = await loadTracker();
    if (request !== requestId) return model.close();
    tracker = model;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (cameraStream !== stream) return;
      stopCamera();
      if (round) round.mode = 'keyboard';
      device.textContent = 'Camera disconnected. Keyboard controls are available.';
    });
    startRound('camera');
    device.textContent = 'Camera active. ' + defaultStatus;
  } catch (error) {
    if (request !== requestId) return;
    stopCamera();
    webcam.disabled = false;
    webcam.textContent = 'Retry camera';
    exit.hidden = !micStream;
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
  webcam.disabled = false;
  webcam.textContent = 'Enable camera';
  device.textContent = micStream ? 'Mic active. ' + defaultStatus : defaultStatus;
  startRound('keyboard');
});

mic.addEventListener('click', async () => {
  if (micStream) {
    stopMic();
    device.textContent = defaultStatus;
    if (!round && !cameraStream && !webcam.disabled) exit.hidden = true;
    return;
  }
  const request = ++micRequestId;
  mic.disabled = true;
  exit.hidden = false;
  device.textContent = 'Allow microphone access when your browser asks.';
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    context = new Audio();
    const audioContext = context;
    await audioContext.resume();
    if (request !== micRequestId) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: true },
    });
    if (request !== micRequestId) return stopTracks(stream);
    micStream = stream;
    audioInput = listen(audioContext, stream);
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (micStream !== stream) return;
      stopMic();
      if (!round && !cameraStream && !webcam.disabled) exit.hidden = true;
      device.textContent = 'Mic disconnected. F and G still work.';
    });
    mic.textContent = 'Disable mic';
    mic.setAttribute('aria-pressed', 'true');
    device.textContent = 'Mic active. Hum to build aura, then clap to fire.';
  } catch {
    if (request !== micRequestId) return;
    stopMic();
    if (!round && !cameraStream && !webcam.disabled) exit.hidden = true;
    device.textContent = 'Mic unavailable. F and G still work.';
  }
  mic.disabled = false;
});

exit.addEventListener('click', () => {
  resetRound();
  arena.dataset.state = 'ready';
  showOverlay('Defend the city.', 'Keep your shoulders and any raised hand in view. You can play sitting or standing.');
  resetHud();
  webcam.focus();
});

const keys = { a: 'basic', d: 'power', f: 'clap' };
window.addEventListener('keydown', event => {
  if (!round || round.finished || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 's') round.keyboardGuard = true;
  else if (key === 'g') round.keyboardHum = true;
  else if (Object.hasOwn(keys, key) && !event.repeat) attack(keys[key], performance.now());
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
