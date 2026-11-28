// Owns device permissions, stream lifetimes, and input sampling for a camera session.
import { listen, loadTracker, posePoint, stopTracks, wristPoint } from './controls.mjs?v=68';

export const defaultStatus = 'Camera and mic stay on your device.';

const armLines = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const audioHints = {
  calibrating: 'Calibrating mic · stay quiet briefly.',
  beam: 'Beam input · charging resumes after firing.',
  quiet: 'Mic on · hum, whistle, or sing.',
  sound: 'Sound heard · keep it going to charge.',
  sustaining: 'Sound heard · keep it going.',
  humming: 'Charging Aura from mic.',
};

/** Own permission requests, local media streams, and the sampled input lifecycle. */
export function createCameraSession({ onConnecting, onConnectFailed, onLost, onMicStopped }) {
  /** Find a camera or microphone element in the game markup. */
  const byId = id => document.getElementById(id);
  const camera = byId('camera');
  const cameraFrame = byId('camera-frame');
  const tracking = byId('tracking');
  const trackingPoints = byId('tracking-points');
  const poseContext = trackingPoints.getContext('2d');
  const micStatus = byId('mic-status');
  const micLevel = byId('mic-level');
  const device = byId('device');
  let lastVideoTime = -Infinity;
  let lastPosePoll = -Infinity;
  let lastAudioPoll = -Infinity;

  let tracker;
  let cameraStream;
  let micStream;
  let pendingCameraMic;
  let context;
  let audioInput;
  // Stale permission or model requests must not reopen a device after you exit.
  let requestId = 0;
  const videoInputOptions = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
  const audioInputOptions = { autoGainControl: false, noiseSuppression: false, echoCancellation: true };
  const micUnavailable = 'Microphone unavailable. Check browser permission, or use J and Space.';
  /** Show tracking guidance and its current acceptance state. */
  function cameraStatus(message, state = '') {
    const text = 'Camera: ' + message;
    if (tracking.textContent !== text) tracking.textContent = text;
    if (tracking.dataset.state !== state) tracking.dataset.state = state;
  }

  /** Draw the tracked joints in the preview coordinate space. */
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
    /** Use wrist-specific visibility rules for wrists and normal rules elsewhere. */
    const visibleJoint = (point, index) => index === 15 || index === 16 ? wristPoint(point) : posePoint(point);
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

  /** Invalidate pending device requests and release current media and tracking resources. */
  function stop() {
    requestId++;
    lastVideoTime = lastPosePoll = lastAudioPoll = -Infinity;
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

  /** Start microphone activation during a user gesture while permissions are pending. */
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

  /** Release microphone resources still waiting for activation. */
  function cancelCameraMic() {
    if (!pendingCameraMic) return;
    const { audioContext, stream } = pendingCameraMic;
    pendingCameraMic = null;
    stopTracks(stream);
    void audioContext.close().catch(() => {});
  }

  /** Attach an authorized microphone stream to the local input analyser. */
  function activateMic(stream, audioContext) {
    const read = listen(audioContext, stream);
    micStream = stream;
    context = audioContext;
    audioInput = read;
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (micStream !== stream) return;
      stopMic();
      setMicMessage('Mic disconnected. J and Space still work.');
      device.textContent = defaultStatus;
    });
    setMicMessage('Mic on. Sustain a sound to charge, then click your tongue or clap to fire.');
    micLevel.hidden = false;
  }

  /** Release active and pending audio resources and clear the microphone HUD. */
  function stopMic() {
    stopTracks(micStream);
    micStream = null;
    audioInput = null;
    onMicStopped();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    context = null;
    setMicMessage('');
    micLevel.value = 0;
    micLevel.hidden = true;
  }

  /** Show a microphone message without exposing a stale input level. */
  function setMicMessage(message) {
    if (micStatus.textContent !== message) micStatus.textContent = message;
    delete micStatus.dataset.state;
    micStatus.hidden = !message;
  }

  /** Render the current microphone detector state and sample level. */
  function showMicInput(state, level) {
    const hint = audioHints[state];
    if (micStatus.textContent !== hint) micStatus.textContent = hint;
    micStatus.dataset.state = state;
    micLevel.value = level;
  }

  /** Request camera access, prepare tracking, and start the round once ready. */
  async function start(onReady) {
    const request = ++requestId;
    onConnecting();
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
        stop();
        onLost('Camera disconnected', 'Camera disconnected. Keyboard controls are available.');
      });
      onReady();
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
      stop();
      onConnectFailed();
      const cameraError = error.name === 'NotAllowedError' || error.name === 'NotFoundError' ||
        error.name === 'NotReadableError' || !navigator.mediaDevices;
      device.textContent = cameraError
        ? 'Camera unavailable. Check browser permissions, or play with the keyboard.'
        : 'Could not start camera tracking. Check your connection, or play with the keyboard.';
    }
  }

  /** Read a fresh preview frame and return its landmarks when tracking is ready. */
  function readPose(now) {
    if (!tracker || camera.readyState < 2 || now - lastPosePoll < 55 || camera.currentTime === lastVideoTime) return null;
    lastVideoTime = camera.currentTime;
    lastPosePoll = now;
    let points;
    try {
      points = tracker.detectForVideo(camera, now).landmarks[0];
    } catch {
      stop();
      onLost('Camera tracking stopped', 'Tracking stopped. You can finish with the keyboard.');
      return null;
    }
    drawTracking(points);
    return { points };
  }

  /** Throttle microphone polling and return the sampled interval for Aura charging. */
  function readAudio(now, suppress) {
    const elapsed = now - lastAudioPoll;
    if (!audioInput || elapsed < 20) return null;
    lastAudioPoll = now;
    const result = audioInput(now, suppress);
    showMicInput(result.state, result.level);
    return { ...result, elapsed };
  }

  /** Show or hide feedback and supply initial guidance when tracking starts. */
  function setTrackingVisible(visible) {
    tracking.hidden = !visible;
    if (visible) cameraStatus('Waiting for tracking…', 'waiting');
  }

  return { start, stop, readPose, readAudio, setTrackingVisible, showTracking: cameraStatus };
}
