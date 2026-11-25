import { paintBeast } from './beast.mjs';
import { gestures, listen, loadTracker, posePoint, stopTracks } from './controls.mjs?v=4';

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
const poseCard = byId('ranger-pose');
const poseArt = byId('pose-art');
const poseLabel = byId('pose-label');
const player = byId('player');
const enemy = byId('enemy');
const time = byId('time');
const battleLength = 60_000;
const attacks = {
  wave: [5, 'Energy slash'],
  power: [22, 'Power strike'],
  clap: [13, 'Clap burst'],
  hum: [18, 'Sonic blast'],
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const armLines = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const trackingHints = {
  framing: 'Step back until your head, shoulders and both hands are visible.',
  neutral: 'Raise one hand and keep the other below your shoulder.',
  'wave-set': 'Hold your raised hand still for a moment.',
  'wave-ready': 'Wave ready. Move your raised hand sideways.',
  'wave-return': 'Now move your hand back.',
  'guard-set': 'Keep both hands beside your ears.',
  guard: 'Guard recognized. Hold it through the strike.',
  'two-hands': 'Hands beside ears to guard, or overhead for power.',
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

function say(message) {
  if (prompt.textContent !== message) prompt.textContent = message;
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
  for (const [start, end] of armLines) {
    const from = points?.[start];
    const to = points?.[end];
    if (!posePoint(from) || !posePoint(to)) continue;
    poseContext.beginPath();
    poseContext.moveTo(from.x * width, from.y * height);
    poseContext.lineTo(to.x * width, to.y * height);
    poseContext.stroke();
  }
  for (const index of [0, 11, 12, 13, 14, 15, 16]) {
    const point = points?.[index];
    if (!posePoint(point)) continue;
    poseContext.beginPath();
    poseContext.arc(point.x * width, point.y * height, width * .009, 0, 2 * Math.PI);
    poseContext.fill();
  }
}

function updateCameraStatus(now) {
  const move = round.cameraMove;
  if (!move || now - round.lastPose > 400) return cameraStatus('Waiting for tracking…', 'waiting');
  const notice = round.cameraNotice;
  if (notice && now < notice.until) return cameraStatus(notice.message, notice.state);
  if (move.state === 'power') {
    const label = move.charge === 1 ? 'Lower your hands to reset the power pose.' :
      'Power recognized. Keep holding (' + Math.floor(move.charge * 10) * 10 + '%).';
    return cameraStatus(label);
  }
  cameraStatus(trackingHints[move.state], move.state === 'guard' ? 'accepted' : move.state === 'framing' ? 'waiting' : '');
}

function cameraNotice(message, state, now) {
  round.cameraNotice = { message, state, until: now + 950 };
}

function showPose(move, label, state = '') {
  const href = './poses.svg#' + move;
  if (poseArt.getAttribute('href') !== href) poseArt.setAttribute('href', href);
  if (poseLabel.textContent !== label) poseLabel.textContent = label;
  if (poseCard.dataset.state !== state) poseCard.dataset.state = state;
}

function confirmPose(move, label, now) {
  round.poseFeedback = { move, label, until: now + 850 };
  showPose(move, label, 'active');
  poseAnimation?.cancel();
  if (!reducedMotion.matches) {
    poseAnimation = poseArt.ownerSVGElement.animate(
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
  poseAnimation?.cancel();
  poseCard.hidden = true;
  webcam.disabled = false;
  webcam.textContent = 'Enable camera';
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode) {
  const now = performance.now();
  round = {
    mode, started: now, strike: now + 4900,
    nextAttack: now, nextWave: now, nextAudioPoll: now, nextPosePoll: now, videoTime: -1,
    keyboardGuard: false,
    readGesture: gestures(), feedback: '', feedbackUntil: 0, hitUntil: 0,
  };
  player.value = 100;
  enemy.value = 100;
  time.textContent = '60';
  arena.dataset.state = 'ready';
  overlay.hidden = true;
  showPose('wave', 'Wave to attack');
  poseCard.hidden = false;
  tracking.hidden = mode !== 'camera';
  if (mode === 'camera') cameraStatus('Waiting for tracking…', 'waiting');
  exit.hidden = false;
  say('Get ready!');
  animation = requestAnimationFrame(tick);
}

function endRound(won, expired = false) {
  resetRound();
  arena.dataset.state = won ? 'win' : 'ready';
  showOverlay(won ? 'City saved!' : expired ? 'Time ran out' : 'Ranger down',
    won ? 'The Riftbeast has fallen.' : 'Wave to attack, then guard when the Riftbeast winds up.');
  say(won ? 'Victory' : 'Battle over');
  webcam.focus();
}

function attack(move, now, fromCamera = false) {
  if (!round) return;
  const [damage, label] = attacks[move];
  if (now < round.nextAttack || (move === 'wave' && now < round.nextWave)) {
    if (fromCamera) {
      cameraNotice((move === 'wave' ? 'Wave' : 'Power pose') + ' recognized. Attack cooling down.', 'waiting', now);
    }
    return;
  }
  const bonus = now < (round.counterUntil ?? 0);
  const counterDamage = move === 'wave' ? 2 : 5;
  const dealt = Math.min(enemy.value, bonus ? damage + counterDamage : damage);
  enemy.value -= dealt;
  round.nextAttack = now + 580;
  if (move === 'wave') round.nextWave = now + 950;
  round.hitUntil = now + 170;
  round.feedback = bonus ? label + ' • Counter bonus' : label;
  round.feedbackUntil = now + 700;
  confirmPose(move, label, now);
  if (fromCamera) cameraNotice(label + ' landed (−' + dealt + ' HP).', 'accepted', now);
  if (enemy.value === 0) endRound(true);
}

function tick(now) {
  if (!round) return;
  const remaining = battleLength - (now - round.started);
  time.textContent = Math.max(0, Math.ceil(remaining / 1000));
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
    if (move.attack) attack(move.attack, now, true);
    if (!round) return;
  }

  if (audioInput && now >= round.nextAudioPoll) {
    round.nextAudioPoll = now + 20;
    const move = audioInput(now);
    if (move) attack(move, now);
    if (!round) return;
  }

  const cameraGuard = round.mode === 'camera' && round.cameraMove?.guard && now - round.lastPose < 260;
  const guard = round.keyboardGuard || cameraGuard;
  if (now >= round.strike) {
    round.strike = now + (enemy.value <= 40 ? 3600 : 4700);
    if (guard) {
      round.feedback = 'Blocked! Counter now.';
      round.counterUntil = now + 1700;
      confirmPose('guard', 'Blocked!', now);
      if (cameraGuard) cameraNotice('Guard blocked the strike.', 'accepted', now);
    } else {
      player.value = Math.max(0, player.value - 19);
      round.feedback = 'Riftbeast hit! Guard on the next windup.';
      if (player.value === 0) return endRound(false);
    }
    round.feedbackUntil = now + 1000;
  }

  if (round.mode === 'camera') updateCameraStatus(now);
  const charge = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove?.charge : 0;
  const danger = now >= round.strike - 1400;
  const used = round.poseFeedback;
  if (used && now < used.until) showPose(used.move, used.label, 'active');
  else if (danger) showPose('guard', guard ? 'Guard held' : 'Guard now', guard ? 'active' : 'cue');
  else if (cameraGuard) showPose('guard', 'Guard recognized', 'active');
  else if (charge > 0 && charge < 1) showPose('power', 'Keep holding', 'cue');
  else showPose('wave', 'Wave to attack');
  arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
  if (danger) say(guard ? 'Guard held. Keep holding!' : 'Incoming! Hands by ears or hold S');
  else if (now < round.feedbackUntil) say(round.feedback);
  else if (charge > 0 && charge < 1) say('Charging power pose…');
  else say(round.mode === 'camera' ? 'Wave to attack' : 'Wave or press A to attack');
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
    device.textContent = 'Mic active. Clap or hum during the fight.';
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
  showOverlay('Defend the city.', 'Keep your head, shoulders and hands in view. You can play sitting or standing.');
  say('Ready to morph?');
  player.value = enemy.value = 100;
  time.textContent = '60';
  webcam.focus();
});

const keys = { a: 'wave', d: 'power', f: 'clap', g: 'hum' };
window.addEventListener('keydown', event => {
  if (!round || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 's') round.keyboardGuard = true;
  else if (Object.hasOwn(keys, key) && !event.repeat) attack(keys[key], performance.now());
});
window.addEventListener('keyup', event => {
  if (round && event.key.toLowerCase() === 's') round.keyboardGuard = false;
});
window.addEventListener('blur', () => { if (round) round.keyboardGuard = false; });
window.addEventListener('pagehide', () => {
  if (round || !exit.hidden) exit.click();
});
