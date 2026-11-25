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

export function posePoint(point) {
  return point && point.visibility >= .55 &&
    point.x > .015 && point.x < .985 && point.y > .015 && point.y < .985;
}

export function gestures() {
  const raised = [false, false];
  let pose;
  let poseSince;
  let lastFrame;
  let attackSpent = false;

  return (points, now) => {
    const result = { state: 'framing', guard: false, attack: null, charge: 0 };
    // MediaPipe uses the player's anatomical left and right, before the preview is mirrored.
    const shoulders = [points?.[11], points?.[12]];
    const hands = [points?.[15], points?.[16]];
    const framed = [...shoulders, ...hands].every(posePoint);
    if (!framed || now - lastFrame > 260) {
      raised.fill(false);
      pose = undefined;
    }
    lastFrame = now;
    if (!framed) return result;

    const width = Math.max(.1, Math.hypot(shoulders[0].x - shoulders[1].x, shoulders[0].y - shoulders[1].y));
    for (let i = 0; i < raised.length; i++) {
      // Separate up/down thresholds keep a wrist near the boundary from flickering.
      const margin = raised[i] ? -.06 : .14;
      raised[i] = hands[i].y < shoulders[i].y - width * margin;
    }

    const [left, right] = raised;
    const next = left && right ? 'power' : left ? 'guard' : right ? 'basic' : 'neutral';
    if (next !== pose) {
      pose = next;
      poseSince = now;
    }
    const held = now - poseSince;

    if (pose === 'neutral') {
      if (held >= 120) attackSpent = false;
      result.state = attackSpent ? 'reset' : 'neutral';
      return result;
    }
    if (pose === 'guard') {
      result.guard = held >= 180;
      result.state = result.guard ? 'guard' : 'guard-set';
      return result;
    }
    if (attackSpent) {
      result.state = 'reset';
      return result;
    }

    // Wait briefly on a single right arm so a two-arm raise can become power.
    result.state = pose;
    const hold = pose === 'power' ? 650 : 300;
    if (pose === 'power') result.charge = Math.min(1, held / hold);
    if (held >= hold) {
      result.attack = pose;
      attackSpent = true;
    }
    return result;
  };
}

export function listen(context, stream) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const started = performance.now();
  let floor = .006;
  let previous = 0;
  let pitch = 0;
  let humSince = 0;
  let humSent = false;

  function detectPitch(rms) {
    if (rms < Math.max(.008, floor * 2)) return 0;
    const minimum = Math.floor(context.sampleRate / 520);
    const maximum = Math.min(samples.length - 1000, Math.ceil(context.sampleRate / 85));
    let prior = 0;
    for (let lag = minimum; lag <= maximum; lag += 2) {
      let product = 0;
      let initialEnergy = 0;
      let shiftedEnergy = 0;
      for (let i = 0; i < 1000; i += 4) {
        const first = samples[i];
        const second = samples[i + lag];
        product += first * second;
        initialEnergy += first * first;
        shiftedEnergy += second * second;
      }
      const correlation = product / Math.sqrt(initialEnergy * shiftedEnergy);
      if (prior > .85 && correlation < prior) return context.sampleRate / (lag - 2);
      prior = correlation;
    }
    return 0;
  }

  return now => {
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    let peak = 0;
    for (const sample of samples) {
      energy += sample ** 2;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(energy / samples.length);
    const tone = detectPitch(rms);
    const clap = now - started > 450 && !tone && rms > Math.max(.013, floor * 3.5, previous * 2.2) &&
      peak > Math.max(.09, rms * 3.1);
    if (!tone && !clap) floor = floor * .96 + Math.min(rms, .035) * .04;
    previous = rms;

    if (!tone) {
      humSince = 0;
      humSent = false;
    } else if (!pitch || Math.abs(tone / pitch - 1) > .12) {
      humSince = now;
    }
    pitch = tone;
    const hum = tone && !humSent && now - humSince >= 850;
    if (hum) humSent = true;
    return clap ? 'clap' : hum ? 'hum' : null;
  };
}
