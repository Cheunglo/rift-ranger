// Turn local camera landmarks and microphone samples into game inputs.
const visionPackage = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const poseModel = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export async function loadTracker() {
  const { FilesetResolver, PoseLandmarker } = await import(visionPackage + '/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(visionPackage + '/wasm');
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: poseModel },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

export function stopTracks(stream) {
  stream?.getTracks().forEach(track => track.stop());
}

export function posePoint(point, minimumVisibility = .55, edge = .015) {
  return point && point.visibility >= minimumVisibility &&
    point.x > edge && point.x < 1 - edge && point.y > edge && point.y < 1 - edge;
}

export function wristPoint(point) {
  return posePoint(point, .42, .005);
}

// Give each round its own pose history. Raised arms can animate immediately, but
// guard and attack events have separate hold and rearm rules.
export function gestures() {
  const raised = [false, false];
  const lastSeen = [-Infinity, -Infinity];
  let pose;
  let poseSince;
  let lastFrame;
  let basicSpent = false;
  let rightDownSince;
  let powerSpent = false;
  let powerResult = 'power-held';
  let guardActive = false;

  return (points, now) => {
    const result = { state: 'framing', guard: false, attack: null, left: false, right: false };
    // MediaPipe uses the player's anatomical left and right, before the preview is mirrored.
    const shoulders = [points?.[11], points?.[12]];
    const hands = [points?.[15], points?.[16]];
    const visibleShoulders = shoulders.map(point => posePoint(point));
    const framed = visibleShoulders.some(Boolean);
    if (!framed || now - lastFrame > 260) {
      raised.fill(false);
      lastSeen.fill(-Infinity);
      pose = undefined;
      guardActive = false;
      rightDownSince = undefined;
    }
    lastFrame = now;
    if (!framed) return result;

    const width = visibleShoulders.every(Boolean)
      ? Math.max(.1, Math.hypot(shoulders[0].x - shoulders[1].x, shoulders[0].y - shoulders[1].y))
      : .2;
    const tracked = hands.map((hand, i) => visibleShoulders[i] && wristPoint(hand));
    for (let i = 0; i < raised.length; i++) {
      if (!tracked[i]) {
        // Brief occlusion should not turn a two-arm pose into a one-arm pose.
        if (now - lastSeen[i] > 160) raised[i] = false;
        continue;
      }
      lastSeen[i] = now;
      // Separate up/down thresholds keep a wrist near the boundary from flickering.
      const margin = raised[i] ? -.06 : i === 1 ? .06 : .09;
      raised[i] = hands[i].y < shoulders[i].y - width * margin;
    }

    const [left, right] = raised;
    // A lowered right hand rearms the slash, even with the left hand still in
    // guard. One clearly lowered frame is enough, while borderline positions
    // still need a short hold. A wrist that leaves frame has its own grace period.
    const clearlyLowered = tracked[1] && hands[1].y >= shoulders[1].y + width * .3;
    const restingOffscreen = !tracked[1] && !right && now - lastSeen[1] > 160;
    if (clearlyLowered || restingOffscreen || (rightDownSince !== undefined && now - rightDownSince >= 75)) {
      basicSpent = false;
    }
    rightDownSince = right ? undefined : (rightDownSince ?? now);
    result.left = left;
    result.right = right;
    // A briefly hidden left wrist can keep a guard stable, but it must not
    // keep a clearly raised right wrist stuck in a two-arm pose.
    const leftForPose = left && (!right || tracked[0] || now - lastSeen[0] <= 70);
    const next = leftForPose && right ? 'power' : leftForPose ? 'guard' : right ? 'basic' : 'neutral';
    if (next !== pose) {
      pose = next;
      poseSince = now;
      guardActive = false;
      if (pose !== 'power') powerSpent = false;
    }
    const held = now - poseSince;

    if (pose === 'neutral') {
      result.state = basicSpent ? 'reset' : tracked.some(Boolean) ? 'neutral' : 'hands-hidden';
      return result;
    }
    if (pose === 'guard') {
      if (held >= 180 && tracked[0]) guardActive = true;
      result.guard = guardActive;
      result.state = result.guard ? 'guard' : 'guard-set';
      return result;
    }
    if (pose === 'power') {
      result.state = powerSpent ? powerResult : 'power';
      if (!powerSpent && tracked.every(Boolean)) {
        result.attack = 'power';
        // Both arms up can spend a counter or heal. Latch the accepted action.
        result.consume = (state = 'power-held') => {
          basicSpent = powerSpent = true;
          powerResult = result.state = state;
        };
      }
      return result;
    }
    if (basicSpent) {
      result.state = 'reset';
      return result;
    }

    // Leave a short window for both arms to come up. Only latch the slash
    // when the game accepts it, so a blocked tutorial input doesn't spend it.
    result.state = pose;
    if (held >= 130 && tracked[1]) {
      result.attack = 'basic';
      result.consume = () => {
        basicSpent = true;
        result.state = 'reset';
      };
    }
    return result;
  };
}

// The analyser reads the microphone without routing it to the speakers.
export function listen(context, stream) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2 ** Math.ceil(Math.log2(context.sampleRate * .064));
  const source = context.createMediaStreamSource(stream);
  // Keep the analyser in the audio graph even in browsers that skip unused nodes.
  // A zero-gain output prevents microphone playback.
  const muted = context.createGain();
  muted.gain.value = 0;
  source.connect(analyser);
  analyser.connect(muted);
  muted.connect(context.destination);
  const samples = new Float32Array(analyser.fftSize);
  const clapWindow = Math.round(context.sampleRate * .042);
  let calibrationUntil;
  let roomLevel = .001;
  let previous = 0;
  let soundSince = 0;
  let lastSound = -Infinity;
  let previousSampleHadSound = false;
  let lastClap = -Infinity;
  let wasHumming = false;

  return (now, suppressHum = false) => {
    calibrationUntil ??= now + 400;
    const calibrating = now < calibrationUntil;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    let energy = 0;
    let recentEnergy = 0;
    let peak = 0;
    const startRecent = samples.length - clapWindow;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      sum += sample;
      energy += sample ** 2;
      if (i >= startRecent) {
        recentEnergy += sample ** 2;
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    const average = sum / samples.length;
    const rms = Math.sqrt(Math.max(0, energy / samples.length - average ** 2));
    const recentRms = Math.sqrt(recentEnergy / clapWindow);
    // A clap is a sudden peak in the most recent audio, not a sustained note.
    const clap = !calibrating && recentRms > Math.max(.013, roomLevel * 3.5, previous * 2.2) &&
      peak > Math.max(.09, recentRms * 3.1);
    previous = recentRms;
    if (clap) lastClap = now;
    const afterClap = now - lastClap < 110;
    const level = Math.max(0, Math.min(100, Math.round((20 * Math.log10(rms) + 65) * 2)));

    // Do not learn the clap or a hum held through the beam as background noise.
    if (calibrating || suppressHum || afterClap) {
      if (calibrating) roomLevel += (Math.min(rms, .05) - roomLevel) * .2;
      lastSound = -Infinity;
      previousSampleHadSound = false;
      wasHumming = false;
      const state = calibrating ? 'calibrating' : suppressHum ? 'beam' : 'sound';
      return { clap, humming: false, level, state };
    }

    // Charge from sustained sound above the calibrated room level. Once active,
    // tolerate a short pause or a dip in volume.
    const continuing = now - lastSound <= 160;
    const sustained = continuing || previousSampleHadSound;
    const threshold = Math.max(.00085, roomLevel * (sustained ? 1.12 : 1.35));
    const sound = rms >= threshold;
    if (sound) {
      if (!sustained) soundSince = now;
      lastSound = now;
      wasHumming = now - soundSince >= 140;
    } else if (!continuing) {
      wasHumming = false;
      roomLevel += (Math.min(rms, .05) - roomLevel) * .04;
    }

    previousSampleHadSound = sound;
    const state = wasHumming ? 'humming' : sound ? 'sustaining' : level > 6 ? 'sound' : 'quiet';
    return { clap, humming: wasHumming, level, state };
  };
}
