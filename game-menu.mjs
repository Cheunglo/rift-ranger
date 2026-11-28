// Owns the start menu, session selection, and the result overlay.
import { byId, showBattleResult, showOverlay } from './battle-hud.mjs?v=64';
import { bossBodies } from './boss-bodies.mjs?v=70';
import { bossProfiles } from './boss-profiles.mjs?v=64';
import { defaultStatus } from './camera-session.mjs?v=73';
import { chooseFight, showFightId, showFightOptions } from './fight-picker.mjs?v=71';
import { createTrainingControls } from './training-controls.mjs?v=71';

/** Bind the menu to the session actions it can request. */
export function createGameMenu({ defaultFight, cameraBonusPercent, startCamera, startRound, stopCamera, onExit, onTrainingQueue }) {
  const webcam = byId('webcam');
  const keyboard = byId('keyboard');
  const mobile = byId('mobile');
  const tutorial = byId('tutorial');
  const training = byId('training');
  const trainingOptions = byId('training-options');
  const trainingBoss = byId('training-boss');
  const exit = byId('exit');
  const device = byId('device');
  const trainingControls = createTrainingControls(onTrainingQueue);
  let session = 'battle';

  for (const [code, body] of Object.entries(bossBodies)) {
    trainingBoss.add(new Option(body.label ?? body.name, code));
  }

  /** Configure the shared start buttons for the selected session type. */
  function updateStartButtons() {
    webcam.disabled = tutorial.disabled = training.disabled = false;
    showFightOptions(session === 'battle');
    trainingOptions.hidden = session !== 'training';
    tutorial.hidden = session === 'training';
    training.hidden = session === 'tutorial';
    const action = session === 'training' ? 'Train' : session === 'tutorial' ? 'Tutorial' : 'Play';
    webcam.textContent = session === 'battle' ? 'Enable camera + mic' : action + ' with camera + mic';
    keyboard.textContent = action + ' with keyboard';
    mobile.textContent = action + ' on mobile';
    tutorial.textContent = session === 'tutorial' ? 'Back to battle' : 'Start Tutorial';
    training.textContent = session === 'training' ? 'Back to battle' : 'Training Mode';
  }

  /** Show entry instructions for the selected session. */
  function showStart() {
    updateStartButtons();
    if (session === 'tutorial') {
      showOverlay('Guided tutorial', 'Choose camera, keyboard, or mobile to learn the moves and open the boss locks.');
    } else if (session === 'training') {
      showOverlay('Training Mode', 'Choose a boss, then queue up to three moves to practice against.');
    } else {
      showOverlay('Defend the city.', 'Keep your shoulders and any raised hand in view. You can play sitting or standing.');
    }
  }

  /** Resolve the selected opponent using the rules of the chosen session. */
  function fightForSession() {
    if (session === 'tutorial') return defaultFight;
    if (session !== 'training') return chooseFight();
    const code = trainingBoss.value;
    return { body: bossBodies[code], profile: bossProfiles[code], moves: defaultFight.moves };
  }

  /** Cancel any pending camera start and begin a keyboard or touch session. */
  function startManual(mobileMode) {
    const fight = fightForSession();
    if (!fight) return;
    stopCamera();
    updateStartButtons();
    setDeviceStatus(mobileMode ? 'Hold Block to guard and Aura to charge. Tap the other moves.' : defaultStatus);
    startRound({ mode: 'keyboard', session, mobile: mobileMode, fight });
  }

  /** Update the status line for the selected input device. */
  function setDeviceStatus(message) {
    device.textContent = message;
  }

  /** Show the available cancellation action while camera permissions are pending. */
  function cameraConnecting() {
    webcam.disabled = tutorial.disabled = training.disabled = true;
    webcam.textContent = 'Starting camera…';
    exit.hidden = false;
  }

  /** Restore menu choices after a camera permission or model load failure. */
  function cameraFailed() {
    webcam.disabled = tutorial.disabled = training.disabled = false;
    webcam.textContent = 'Retry camera + mic';
    exit.hidden = true;
  }

  /** Show controls that apply while playing the active round. */
  function showRound(round) {
    showFightId(round.lessonIndex === null && !round.training ? round.fight.id : '');
    trainingControls.show(round.training);
    exit.hidden = false;
  }

  /** Indicate whether the current practice sequence can be edited or replayed. */
  function updateTraining(round) {
    if (round.training) trainingControls.setRunning(round.strike !== Infinity || Boolean(round.finished));
  }

  /** Restore idle controls and clear any round-specific share or device message. */
  function reset() {
    showFightId();
    trainingControls.show(false);
    updateStartButtons();
    exit.hidden = true;
    setDeviceStatus(defaultStatus);
  }

  /** Return keyboard focus to the first play action after leaving combat. */
  function focusStart() {
    webcam.focus({ preventScroll: true });
  }

  /** Show the appropriate result and publish a score only for a battle win. */
  function showResult(round) {
    if (round.finished.tutorial) {
      session = 'battle';
      updateStartButtons();
      showOverlay('Tutorial complete', 'You learned every move and opened all three locks. In battle, lock moves are shuffled and the boss can heal.');
    } else {
      const { won, at } = round.finished;
      const { id, body } = round.fight;
      showFightId(id);
      if (round.training) {
        showOverlay(won ? 'Training complete' : 'Ranger down',
          won ? body.name + ' has fallen. Start another session to keep practicing.' : 'Start another session to try a different counter.');
      } else {
        showOverlay(won ? 'City saved!' : 'Ranger down',
          won ? body.name + ' has fallen.' : 'Raise your right arm to attack and your left arm to guard.');
        if (won) {
          // Exclude the victory animation from the scored time.
          const elapsed = Math.round(at - round.startedAt) / 1000;
          showBattleResult(elapsed, round.damageTaken, round.maxHp.player, round.cameraBonusEligible, cameraBonusPercent);
        }
      }
    }
    focusStart();
  }

  tutorial.addEventListener('click', () => {
    session = session === 'tutorial' ? 'battle' : 'tutorial';
    showStart();
    (session === 'tutorial' ? webcam : tutorial).focus({ preventScroll: true });
  });
  training.addEventListener('click', () => {
    session = session === 'training' ? 'battle' : 'training';
    showStart();
    (session === 'training' ? trainingBoss : training).focus({ preventScroll: true });
  });
  webcam.addEventListener('click', () => {
    const fight = fightForSession();
    if (fight) startCamera({ mode: 'camera', session, mobile: false, fight });
  });
  // Some touch devices report a fine primary pointer when a mouse is attached.
  keyboard.addEventListener('click', () => startManual(
    navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse), (max-width: 820px)').matches,
  ));
  mobile.addEventListener('click', () => startManual(true));
  exit.addEventListener('click', onExit);
  window.addEventListener('pagehide', () => {
    if (!exit.hidden) onExit();
  });

  return {
    showStart, showRound, showResult, updateTraining, reset, focusStart,
    cameraConnecting, cameraFailed, setDeviceStatus,
  };
}
