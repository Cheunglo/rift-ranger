import { paintBeast } from './beast.mjs';
import { gestures, listen, loadTracker, stopTracks } from './controls.mjs';

const byId = id => document.getElementById(id);
const arena = byId('arena');
const camera = byId('camera');
const cameraFrame = byId('camera-frame');
const overlay = byId('overlay');
const webcam = byId('webcam');
const keyboard = byId('keyboard');
const mic = byId('mic');
const exit = byId('exit');
const device = byId('device');
const prompt = byId('prompt');
const player = byId('player');
const enemy = byId('enemy');
const time = byId('time');
const battleLength = 60_000;
const attacks = {
  wave: [8, 'Energy slash'],
  power: [22, 'Power strike'],
  clap: [13, 'Clap burst'],
  hum: [18, 'Sonic blast'],
};

let round;
let animation;
let tracker;
let cameraStream;
let micStream;
let context;
let audioInput;
let requestId = 0;
let micRequestId = 0;
const defaultStatus = 'Camera and mic stay on your device.';
paintBeast(byId('beast'));

function say(message) {
  if (prompt.textContent !== message) prompt.textContent = message;
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
  webcam.disabled = false;
  webcam.textContent = 'Enable camera';
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode) {
  const now = performance.now();
  round = {
    mode, started: now, strike: now + 4900,
    nextAttack: now, nextAudioPoll: now, nextPosePoll: now, videoTime: -1,
    keyboardGuard: false, cameraGuard: false, visible: false,
    readGesture: gestures(), feedback: '', feedbackUntil: 0, hitUntil: 0,
  };
  player.value = 100;
  enemy.value = 100;
  time.textContent = '60';
  arena.dataset.state = 'ready';
  overlay.hidden = true;
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

function attack(move, now) {
  if (!round || now < round.nextAttack) return;
  const [damage, label] = attacks[move];
  const bonus = now < (round.counterUntil ?? 0);
  enemy.value = Math.max(0, enemy.value - (bonus ? damage + 5 : damage));
  round.nextAttack = now + 580;
  round.hitUntil = now + 170;
  round.feedback = bonus ? label + ' • Counter bonus' : label;
  round.feedbackUntil = now + 700;
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
    round.lastPose = now;
    round.visible = move.visible;
    round.cameraGuard = move.guard;
    round.charge = move.charge;
    if (move.power) attack('power', now);
    if (move.wave) attack('wave', now);
    if (!round) return;
  }

  if (audioInput && now >= round.nextAudioPoll) {
    round.nextAudioPoll = now + 20;
    const move = audioInput(now);
    if (move) attack(move, now);
    if (!round) return;
  }

  const guard = round.keyboardGuard || (round.cameraGuard && now - round.lastPose < 260);
  if (now >= round.strike) {
    round.strike = now + (enemy.value <= 40 ? 3600 : 4700);
    if (guard) {
      round.feedback = 'Blocked! Counter now.';
      round.counterUntil = now + 1700;
    } else {
      player.value = Math.max(0, player.value - 19);
      round.feedback = 'Riftbeast hit! Guard on the next windup.';
      if (player.value === 0) return endRound(false);
    }
    round.feedbackUntil = now + 1000;
  }

  const danger = now >= round.strike - 1400;
  arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
  if (danger) say(guard ? 'Guard held. Keep holding!' : 'Incoming! Hands by ears or hold S');
  else if (now < round.feedbackUntil) say(round.feedback);
  else if (round.mode === 'camera' && (!round.visible || now - round.lastPose > 400)) say('Keep your head and shoulders in view.');
  else if (round.charge > 0 && round.charge < 1) say('Charging power pose…');
  else say('Wave or press A to attack');
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
