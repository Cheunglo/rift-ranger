// Connects the game modules and advances the active session once per frame.
import { mobileControls } from './battle-hud.mjs?v=64';
import { createBattleView } from './battle-view.mjs?v=75';
import { parseFightId } from './boss-fights.mjs?v=74';
import { createCameraSession } from './camera-session.mjs?v=73';
import { createGameMenu } from './game-menu.mjs?v=75';
import { createGameSessions } from './game-sessions.mjs?v=75';
import { bindCombatInputs } from './mobile-controls.mjs?v=75';

const defaultFight = parseFightId('RR1-R-LFS-SPL');
const cameraBonusPercent = 20;
let animation;

const camera = createCameraSession({
  /** Let the menu expose cancellation as soon as camera setup starts. */
  onConnecting() { menu.cameraConnecting(); },
  /** Restore play options when the camera cannot start. */
  onConnectFailed() { menu.cameraFailed(); },
  /** Fall back to manual controls if the active camera disconnects. */
  onLost(reason, message) {
    sessions.forfeitCameraBonus(reason);
    sessions.active()?.useKeyboard();
    menu.setDeviceStatus(message);
  },
  /** Clear sustained sound when audio input ends. */
  onMicStopped() {
    sessions.active()?.stopMic();
  },
});
const view = createBattleView(camera, cameraBonusPercent);
const menu = createGameMenu({
  defaultFight, cameraBonusPercent,
  /** Wait for pose tracking before starting a camera round. */
  startCamera(options) { void camera.start(() => sessions.start(options)); },
  /** Begin a round using the opponent and input mode selected in the menu. */
  startRound(options) { sessions.start(options); },
  stopCamera: camera.stop,
  /** Close a pending setup or an active session. */
  onExit() { sessions.exit(); },
  /** Hand independent queue data from the training controls to combat. */
  onTrainingQueue(moves) {
    const round = sessions.active();
    if (!round) return;
    round.enqueue(moves, performance.now());
    menu.updateTraining(round.trainingBusy);
  },
});
const controls = bindCombatInputs(mobileControls, {
  /** Accept inputs only during active combat. */
  active() {
    const round = sessions.active();
    return Boolean(round && !round.state.finished);
  },
  /** Route a manual press through the active round. */
  press(action, touch, requiresHold) {
    sessions.forfeitCameraBonus(touch ? 'Touch controls used' : 'Keyboard used');
    sessions.active().press(action, performance.now(), requiresHold);
  },
  /** Release the input if its round still exists. */
  release(action, cancelled) { sessions.active()?.release(action, performance.now(), cancelled); },
  /** Cancel uncommitted feints when controls lose focus or are reset. */
  cancel() { sessions.active()?.cancelManualWindUp(); },
});
const sessions = createGameSessions({
  defaultFight, view, menu, camera, controls, startFrames: requestNextFrame,
  /** Stop the frame loop before ending a session. */
  stopFrames() { cancelAnimationFrame(animation); },
});

view.showIdle(defaultFight.body);

/** Schedule the next turn of the animation loop. */
function requestNextFrame() {
  animation = requestAnimationFrame(tick);
}

/** Advance and render one frame, or finish once end-of-round effects clear. */
function tick(now) {
  const round = sessions.active();
  if (!round) return;

  const { finished } = round.state;
  if (finished) {
    menu.updateTraining(round.trainingBusy);
    if (now >= finished.until) return sessions.finish();
    view.drawBattle(now, round, false);
  } else {
    const frame = round.step(now, camera);
    if (frame) {
      view.render(now, round, frame);
      round.continueTraining(now);
      menu.updateTraining(round.trainingBusy);
    }
  }

  requestNextFrame();
}
