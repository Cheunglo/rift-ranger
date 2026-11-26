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

export function posePoint(point, minimumVisibility = .55) {
  return point && point.visibility >= minimumVisibility &&
    point.x > .015 && point.x < .985 && point.y > .015 && point.y < .985;
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
    const tracked = hands.map((hand, i) => visibleShoulders[i] && posePoint(hand, .45));
    for (let i = 0; i < raised.length; i++) {
      if (!tracked[i]) {
        // Brief occlusion should not turn a two-arm pose into a one-arm pose.
        if (now - lastSeen[i] > 160) raised[i] = false;
        continue;
      }
      lastSeen[i] = now;
      // Separate up/down thresholds keep a wrist near the boundary from flickering.
      const margin = raised[i] ? -.06 : .09;
      raised[i] = hands[i].y < shoulders[i].y - width * margin;
    }

    const [left, right] = raised;
    // A lowered right hand rearms the slash, even with the left hand still in
    // guard. Keeping the right hand up never repeats the same attack.
    if (rightDownSince !== undefined && now - rightDownSince >= 120) basicSpent = false;
    rightDownSince = right ? undefined : (rightDownSince ?? now);
    result.left = left;
    result.right = right;
    const next = left && right ? 'power' : left ? 'guard' : right ? 'basic' : 'neutral';
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

    // Wait briefly on a single right arm so a two-arm raise can become power.
    result.state = pose;
    if (held >= 300 && tracked[1]) {
      result.attack = 'basic';
      basicSpent = true;
    }
    return result;
  };
}

// The analyser reads the microphone without routing it to the speakers.
export function listen(context, stream) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2 ** Math.ceil(Math.log2(context.sampleRate * .064));
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const stride = Math.max(1, Math.floor(context.sampleRate / 8000));
  const pitchRate = context.sampleRate / stride;
  const signal = new Float32Array(Math.floor(samples.length / stride));
  const shortestPeriod = Math.floor(pitchRate / 850);
  const longestPeriod = Math.ceil(pitchRate / 65);
  const comparisonLength = signal.length - longestPeriod - 1;
  const clapWindow = Math.round(context.sampleRate * .042);
  let calibrationUntil;
  let roomLevel = .001;
  let previous = 0;
  let pitch = 0;
  let humSince = 0;
  let lastNote = -Infinity;
  let lastClap = -Infinity;
  let wasHumming = false;

  // Look for a repeating waveform by comparing it with time-shifted copies.
  // Averaging small blocks first keeps the comparison cheap at high sample rates.
  function detectPitch(average) {
    for (let i = 0; i < signal.length; i++) {
      let sum = 0;
      for (let j = 0; j < stride; j++) sum += samples[i * stride + j];
      signal[i] = sum / stride - average;
    }

    let referenceEnergy = 0;
    for (let i = 0; i < comparisonLength; i++) referenceEnergy += signal[i] ** 2;
    let previousCorrelation = 0;
    for (let lag = Math.max(1, shortestPeriod - 1); lag <= longestPeriod + 1; lag++) {
      let cross = 0;
      let shiftedEnergy = 0;
      for (let i = 0; i < comparisonLength; i++) {
        cross += signal[i] * signal[i + lag];
        shiftedEnergy += signal[i + lag] ** 2;
      }
      const correlation = cross / Math.sqrt(referenceEnergy * shiftedEnergy);
      if (lag > shortestPeriod && previousCorrelation >= .76 && correlation < previousCorrelation) {
        return pitchRate / (lag - 1);
      }
      previousCorrelation = correlation;
    }
    return 0;
  }

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

    // Learn steady room noise before playing and between claps during a beam.
    // Do not treat the clap itself as the new noise floor, or charge from it.
    if (calibrating || suppressHum || afterClap) {
      if (!afterClap) roomLevel += (Math.min(rms, .05) - roomLevel) * .2;
      pitch = 0;
      lastNote = -Infinity;
      wasHumming = false;
      const state = calibrating ? 'calibrating' : suppressHum ? 'beam' : 'sound';
      return { clap, humming: false, level, state };
    }

    // A new hum must stand out above the room. A lower threshold then lets a
    // recognized note fade or wobble briefly without resetting the input.
    const continuing = now - lastNote <= 145;
    const threshold = Math.max(.0021, roomLevel * (continuing ? 1.25 : 1.75));
    const tone = rms >= threshold ? detectPitch(average) : 0;
    if (tone) {
      const similar = pitch && Math.abs(Math.log2(tone / pitch)) <= .3;
      if (!similar || now - lastNote > 145) humSince = now;
      pitch = similar ? pitch * .75 + tone * .25 : tone;
      lastNote = now;
      wasHumming = now - humSince >= 280;
    } else if (!continuing) {
      wasHumming = false;
      roomLevel += (Math.min(rms, .05) - roomLevel) * .04;
    }

    const state = wasHumming ? 'humming' : tone ? 'note' : level > 6 ? 'sound' : 'quiet';
    return { clap, humming: wasHumming, level, state };
  };
}
