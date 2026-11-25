import { paintBeast } from './beast.mjs';
import { combatArt } from './combat-art.mjs?v=13';
import { gestures, listen, loadTracker, posePoint, stopTracks } from './controls.mjs?v=12';

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
const practice = byId('practice');
const practiceLaser = byId('practice-laser');
const micButtons = [byId('mic'), byId('mic-setup')];
const micStatus = byId('mic-status');
const micLevel = byId('mic-level');
const micSetupStatus = byId('mic-setup-status');
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
const practiceBadge = byId('practice-badge');
const auraMeter = byId('aura');
const battleTiming = {
  firstStrike: 7000,
  strikeInterval: 6200,
  enragedInterval: 4800,
  warning: 3000,
  counterWindow: 2400,
  practiceCounterWindow: 6000,
};
const attacks = {
  basic: [5, 'Energy slash'],
  power: [22, 'Power strike'],
};
const auraTiming = { capacity: 1600, clapGap: 600 };
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
const audioHints = {
  quiet: 'Mic on · hum close to the mic.',
  sound: 'Sound heard · try a steady note.',
  note: 'Note heard · keep humming.',
  humming: 'Hum detected · charging aura.',
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

function resetHud() {
  setHealth(player, player.max);
  setHealth(enemy, enemy.max);
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
  if (round) {
    round.micHumming = false;
    round.clapUntil = 0;
  }
  if (context && context.state !== 'closed') void context.close().catch(() => {});
  context = null;
  setMicControls(false);
  setMicMessage('');
  micLevel.value = 0;
  micLevel.hidden = true;
}

function setMicControls(active, busy = false) {
  for (const button of micButtons) {
    button.disabled = busy;
    button.textContent = active ? 'Disable microphone' : 'Enable microphone';
    button.setAttribute('aria-pressed', String(active));
  }
}

function setMicMessage(message) {
  if (micStatus.textContent !== message) micStatus.textContent = message;
  delete micStatus.dataset.state;
  micStatus.hidden = !message;
  if (micSetupStatus.textContent !== message) micSetupStatus.textContent = message;
  micSetupStatus.hidden = !message;
}

function showMicInput(state, level) {
  const hint = audioHints[state];
  if (micStatus.textContent !== hint) micStatus.textContent = hint;
  micStatus.dataset.state = state;
  micLevel.value = level;
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
  practiceLaser.hidden = true;
  practiceBadge.hidden = true;
  webcam.disabled = false;
  webcam.textContent = 'Enable camera';
  exit.hidden = true;
  device.textContent = defaultStatus;
}

function startRound(mode, practicing) {
  const now = performance.now();
  round = {
    mode, practicing, strike: practicing ? Infinity : now + battleTiming.firstStrike,
    nextAttack: now, nextBasic: now, nextAudioPoll: now, nextPosePoll: now, videoTime: -1,
    keyboardGuard: false,
    readGesture: gestures(), hitUntil: 0, auraMs: 0, beamDamage: 0, lastTick: now,
  };
  resetHud();
  practiceBadge.hidden = !practicing;
  practiceLaser.hidden = !practicing;
  practiceLaser.disabled = false;
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

function endRound(won) {
  resetRound();
  arena.dataset.state = won ? 'win' : 'ready';
  showOverlay(won ? 'City saved!' : 'Ranger down',
    won ? 'The Riftbeast has fallen.' : 'Raise your right arm to attack and your left arm to guard.');
  webcam.focus();
}

function canPowerCounter(now) {
  return round.powerCounterAvailable && now < round.counterUntil;
}

function attack(move, now, fromCamera = false) {
  if (!round || round.finished) return;
  const [damage, label] = attacks[move];
  if (move === 'power' && !canPowerCounter(now)) {
    if (!fromCamera) {
      round.poseFeedback = { move, label: 'Block a strike first to unlock power', state: 'locked', until: now + 1000 };
    }
    return;
  }
  if (now < round.nextAttack || (move === 'basic' && now < round.nextBasic)) {
    if (fromCamera && move === 'basic') {
      cameraNotice('Right arm recognized. Attack cooling down.', 'waiting', now);
    }
    return;
  }
  const bonus = now < (round.counterUntil ?? 0);
  const counterDamage = move === 'basic' ? 2 : 5;
  const dealt = Math.min(enemy.value, bonus ? damage + counterDamage : damage);
  if (!round.practicing) setHealth(enemy, enemy.value - dealt);
  round.nextAttack = now + 580;
  if (move === 'basic') round.nextBasic = now + 950;
  if (move === 'power') round.powerCounterAvailable = false;
  round.attackPose = { move, until: now + 360 };
  visuals.play(move, now);
  round.hitUntil = now + 170;
  const damageText = round.practicing ? dealt + ' damage' : '−' + dealt + ' HP';
  confirmPose(move, label + (bonus ? ' counter' : '') + ' · ' + damageText, now);
  if (fromCamera) cameraNotice(label + ' landed (' + damageText + ').', 'accepted', now);
  if (enemy.value === 0) round.finished = { won: true, until: now + (move === 'power' ? 800 : 510) };
  return true;
}

function requestBeam(now, microphone = false) {
  if (round.auraMs <= 0) {
    round.poseFeedback = { move: 'clap', label: 'Hum first to charge the beam', state: 'locked', until: now + 1000 };
    return;
  }
  if (microphone) {
    if (now >= (round.clapUntil ?? 0)) round.clapFrom = now;
    round.clapUntil = now + auraTiming.clapGap;
  }
}

function updateAura(now, delta, humming) {
  const clapUntil = round.clapUntil ?? 0;
  const clapTime = Math.max(0, Math.min(now, clapUntil) - Math.max(now - delta, round.clapFrom ?? now));
  const firing = round.keyboardBeam || now < clapUntil;
  const strength = firing ? round.auraMs / auraTiming.capacity : 0;
  const spent = Math.min(round.auraMs, round.keyboardBeam ? delta : clapTime);
  if (spent > 0) {
    round.auraMs -= spent;
    // Accumulate fractional damage so starting and stopping cannot round up each hit.
    const damagePerFullAura = now < (round.counterUntil ?? 0) ? 31 : 26;
    round.beamDamage += spent / auraTiming.capacity * damagePerFullAura;
    const dealt = Math.floor(round.beamDamage + 1e-9);
    round.beamDamage = Math.max(0, round.beamDamage - dealt);
    if (dealt && !round.practicing) {
      setHealth(enemy, Math.max(0, enemy.value - dealt));
      if (enemy.value === 0) round.finished = { won: true, until: now + 300 };
    }
  } else if (!firing && humming) {
    round.auraMs = Math.min(auraTiming.capacity, round.auraMs + delta);
  }
  const charge = Math.round(round.auraMs / auraTiming.capacity * 100);
  if (auraMeter.value !== charge) auraMeter.value = charge;
  return strength;
}

function drawBattle(now, guard, flash = false, beamStrength = 0) {
  const tracked = round.mode === 'camera' && now - round.lastPose < 260 ? round.cameraMove : null;
  const attack = now < round.attackPose?.until ? round.attackPose.move : null;
  visuals.render(now, {
    left: Boolean(tracked?.left || guard || attack === 'power'),
    right: Boolean(tracked?.right || attack === 'basic' || attack === 'power'),
    guard, aura: round.auraMs / auraTiming.capacity, flash, beamStrength,
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
    const { clap, humming, level, state } = audioInput(now);
    showMicInput(state, level);
    round.micHumming = humming;
    if (clap) requestBeam(now, true);
  }
  if (round.finished) {
    animation = requestAnimationFrame(tick);
    return;
  }
  const humming = round.keyboardHum || round.micHumming;
  const beamStrength = updateAura(now, delta, humming);
  if (round.finished) {
    drawBattle(now, false, false, beamStrength);
    animation = requestAnimationFrame(tick);
    return;
  }

  const cameraGuard = round.mode === 'camera' && round.cameraMove?.guard && now - round.lastPose < 260;
  const guard = round.keyboardGuard || cameraGuard;
  if (now >= round.strike) {
    visuals.play('laser', now, guard);
    round.strike = round.practicing ? Infinity :
      now + (enemy.value <= 40 ? battleTiming.enragedInterval : battleTiming.strikeInterval);
    if (round.practicing) practiceLaser.disabled = false;
    round.strikeNotice = 'Strike finished';
    if (guard) {
      round.counterUntil = now + (round.practicing ? battleTiming.practiceCounterWindow : battleTiming.counterWindow);
      round.powerCounterAvailable = true;
      confirmPose('guard', 'Blocked! Power counter ready.', now);
      if (cameraGuard) cameraNotice('Guard blocked the strike.', 'accepted', now);
    } else {
      const damage = Math.min(player.value, 19);
      if (!round.practicing) setHealth(player, player.value - damage);
      round.strikeNotice = round.practicing ? 'Laser hit · no HP lost in practice' : 'Laser hit · −' + damage + ' HP';
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
  else if (beamStrength > 0) showPose('clap', 'Aura beam firing', 'active');
  else if (recentAction) showPose(used.move, used.label, used.state ?? 'active');
  else if (cameraPose === 'power-held') showPose('power', 'Power registered', 'active');
  else if (cameraPose === 'basic') showPose('basic', 'Right hand seen');
  else if (humming) showPose('hum', round.auraMs === auraTiming.capacity ? 'Aura full · keep clapping to fire' : 'Building aura');
  else showPose();
  arena.dataset.state = danger ? 'danger' : now < round.hitUntil ? 'hit' : 'ready';
  if (danger) showWarning('Incoming eye lasers', true);
  else if (now < round.strikeNoticeUntil) showWarning(round.strikeNotice);
  else showWarning('No attack incoming');
  drawBattle(now, guard, flash, beamStrength);
  animation = requestAnimationFrame(tick);
}

webcam.addEventListener('click', async () => {
  const request = ++requestId;
  const practicing = practice.checked;
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
    startRound('camera', practicing);
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
  startRound('keyboard', practice.checked);
});

practiceLaser.addEventListener('click', () => {
  if (!round?.practicing || round.strike !== Infinity) return;
  practiceLaser.disabled = true;
  round.strike = performance.now() + battleTiming.warning;
});

async function toggleMic() {
  if (micStream) {
    stopMic();
    device.textContent = defaultStatus;
    if (!round && !cameraStream && !webcam.disabled) exit.hidden = true;
    return;
  }
  const request = ++micRequestId;
  setMicControls(false, true);
  exit.hidden = false;
  setMicMessage('Allow microphone access when your browser asks.');
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
      setMicMessage('Mic disconnected. F and G still work.');
      device.textContent = defaultStatus;
    });
    setMicControls(true);
    setMicMessage('Mic on. Hum a steady note, then keep clapping to fire.');
    micLevel.hidden = false;
    device.textContent = 'Mic active. Hum to build aura, then keep clapping to fire.';
  } catch {
    if (request !== micRequestId) return;
    stopMic();
    if (!round && !cameraStream && !webcam.disabled) exit.hidden = true;
    setMicMessage('Microphone unavailable. Check browser permission, or use F and G.');
  }
}

for (const button of micButtons) button.addEventListener('click', toggleMic);

exit.addEventListener('click', () => {
  resetRound();
  arena.dataset.state = 'ready';
  showOverlay('Defend the city.', 'Keep your shoulders and any raised hand in view. You can play sitting or standing.');
  resetHud();
  webcam.focus();
});

const keys = { a: 'basic', d: 'power' };
window.addEventListener('keydown', event => {
  if (!round || round.finished || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 's') round.keyboardGuard = true;
  else if (key === 'g') round.keyboardHum = true;
  else if (key === 'f' && !event.repeat) {
    round.keyboardBeam = true;
    requestBeam(performance.now());
  }
  else if (Object.hasOwn(keys, key) && !event.repeat) attack(keys[key], performance.now());
});
window.addEventListener('keyup', event => {
  if (!round) return;
  const key = event.key.toLowerCase();
  if (key === 's') round.keyboardGuard = false;
  if (key === 'g') round.keyboardHum = false;
  if (key === 'f') round.keyboardBeam = false;
});
window.addEventListener('blur', () => {
  if (round) round.keyboardGuard = round.keyboardHum = round.keyboardBeam = false;
});
window.addEventListener('pagehide', () => {
  if (round || !exit.hidden) exit.click();
});
