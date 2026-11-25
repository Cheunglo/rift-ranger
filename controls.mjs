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

export function gestures() {
  const wrists = [[], []];
  let powerSince = 0;
  let powerSent = false;

  return (points, now) => {
    const result = { visible: false, guard: false, wave: false, power: false, charge: 0 };
    const usable = point => point && point.visibility >= .48 &&
      point.x > .01 && point.x < .99 && point.y > .01 && point.y < .99;
    const [nose, leftShoulder, rightShoulder, left, right] = [0, 11, 12, 15, 16].map(i => points?.[i]);
    if (![nose, leftShoulder, rightShoulder].every(usable)) {
      wrists.forEach(history => { history.length = 0; });
      powerSince = 0;
      powerSent = false;
      return result;
    }
    result.visible = true;
    const shoulders = [leftShoulder, rightShoulder];
    const width = Math.max(.10, Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y));
    const center = (leftShoulder.x + rightShoulder.x) / 2;
    const overhead = [left, right].every(hand => usable(hand) && hand.y < nose.y - width * .30);

    if (overhead) {
      powerSince ||= now;
      result.charge = Math.min(1, (now - powerSince) / 720);
      result.power = result.charge === 1 && !powerSent;
      powerSent ||= result.power;
    } else {
      powerSince = 0;
      powerSent = false;
      result.guard = [left, right].every((hand, i) => usable(hand) &&
        hand.y < shoulders[i].y - width * .08 &&
        Math.abs(hand.y - nose.y) < width * .55 &&
        Math.abs(hand.x - nose.x) < width * .85);
    }

    [left, right].forEach((hand, i) => {
      const history = wrists[i];
      if (overhead || result.guard || !usable(hand) || hand.y > shoulders[i].y - width * .1) {
        history.length = 0;
        return;
      }
      while (history.length && now - history[0].time > 380) history.shift();
      const x = (hand.x - center) / width;
      if (history.some(sample => now - sample.time >= 65 && Math.abs(x - sample.x) > .57)) {
        result.wave = true;
        history.length = 0;
      }
      history.push({ x, time: now });
    });
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
