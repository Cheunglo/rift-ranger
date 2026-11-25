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
  let wave;
  let guardSince;
  let powerSince;
  let powerSent = false;
  let lastFrame;

  return (points, now) => {
    const result = { state: 'framing', guard: false, attack: null, charge: 0 };
    const [nose, ...shoulders] = [0, 11, 12].map(i => points?.[i]);
    const elbows = [13, 14].map(i => points?.[i]);
    const hands = [15, 16].map(i => points?.[i]);
    const framed = [nose, ...shoulders, ...hands].every(posePoint);

    if (!framed || now - lastFrame > 260) {
      wave = guardSince = powerSince = undefined;
      powerSent = false;
    }
    lastFrame = now;
    if (!framed) return result;

    const width = Math.max(.1, Math.hypot(shoulders[0].x - shoulders[1].x, shoulders[0].y - shoulders[1].y));
    const center = (shoulders[0].x + shoulders[1].x) / 2;
    const raised = hands.map((hand, i) => hand.y < shoulders[i].y - width * .14);

    if (hands.every(hand => hand.y < nose.y - width * .28)) {
      wave = guardSince = undefined;
      powerSince ??= now;
      result.state = 'power';
      result.charge = Math.min(1, (now - powerSince) / 720);
      if (result.charge === 1 && !powerSent) {
        result.attack = 'power';
        powerSent = true;
      }
      return result;
    }
    powerSince = undefined;
    powerSent = false;

    if (raised.every(Boolean)) {
      wave = undefined;
      const byEars = hands.every((hand, i) => {
        const side = Math.sign(shoulders[i].x - center);
        const distance = (hand.x - nose.x) / width * side;
        return distance > .15 && distance < .9 && Math.abs(hand.y - nose.y) < width * .56;
      });
      if (byEars) guardSince ??= now;
      else guardSince = undefined;
      result.guard = byEars && now - guardSince >= 160;
      result.state = result.guard ? 'guard' : byEars ? 'guard-set' : 'two-hands';
      return result;
    }
    guardSince = undefined;

    const index = raised.findIndex(Boolean);
    const hand = hands[index];
    const elbow = elbows[index];
    // Use a bent, raised arm. Ignore low sweeps and straight reaches.
    if (index < 0 || !posePoint(elbow) || elbow.y - hand.y < width * .27 ||
        hand.y < nose.y - width * .45) {
      wave = undefined;
      result.state = 'neutral';
      return result;
    }

    const x = (hand.x - center) / width;
    const y = (hand.y - shoulders[index].y) / width;
    const elbowX = (elbow.x - center) / width;
    const reset = () => { wave = { index, x, y, elbowX, since: now }; };
    if (wave?.index !== index || Math.abs(y - wave.y) > .32 || Math.abs(elbowX - wave.elbowX) > .42) {
      reset();
    }
    if (wave.readyAt === undefined) {
      if (Math.abs(x - wave.x) > .16) reset();
      if (now - wave.since >= 150) wave.readyAt = now;
      result.state = wave.readyAt === undefined ? 'wave-set' : 'wave-ready';
      return result;
    }
    if (now - (wave.peakAt ?? wave.readyAt) > (wave.peakAt === undefined ? 1200 : 600)) {
      reset();
      result.state = 'wave-set';
      return result;
    }

    const travel = x - wave.x;
    if (wave.peakAt === undefined && Math.abs(travel) >= .34) {
      wave.peak = travel;
      wave.peakAt = now;
    }
    if (wave.peakAt === undefined) {
      result.state = 'wave-ready';
      return result;
    }
    result.state = 'wave-return';
    const direction = Math.sign(wave.peak);
    if (travel * direction > wave.peak * direction) wave.peak = travel;
    if ((wave.peak - travel) * direction >= .28) {
      result.attack = 'wave';
      reset();
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
