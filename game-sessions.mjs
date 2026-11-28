// Owns the active session and coordinates its start, results, and teardown.
import { createCombatRound, startingHP } from './combat-round.mjs?v=75';

/** Connect a session's combat state to the menu, arena, devices, and frame loop. */
export function createGameSessions({ defaultFight, view, menu, camera, controls, startFrames, stopFrames }) {
  let round;

  /** Return the currently running round, if one exists. */
  function active() {
    return round;
  }

  /** Prepare the round and its views before scheduling the first frame. */
  function start(options) {
    controls.reset();
    round = createCombatRound({ ...options, now: performance.now() }, view.feedback);
    view.start(round.state);
    round.initialize();
    menu.showRound(round.state);
    startFrames();
  }

  /** Cancel updates and release input before discarding the active round. */
  function reset() {
    stopFrames();
    camera.stop();
    controls.reset();
    round = null;
    view.reset();
    menu.reset();
  }

  /** Finalize the active round once its last animation has completed. */
  function finish() {
    const result = round.state;
    reset();
    view.showResult(result.finished.won);
    if (result.finished.tutorial) view.showIdle(defaultFight.body, startingHP);
    menu.showResult(result);
  }

  /** End the session or pending camera start and return to the current menu. */
  function exit() {
    reset();
    menu.showStart();
    view.showIdle(defaultFight.body, startingHP);
    menu.focusStart();
  }

  /** Reflect a score penalty once if the session falls back to manual controls. */
  function forfeitCameraBonus(reason) {
    if (round?.forfeitCameraBonus()) view.showCameraBonusLost(reason);
  }

  return { active, start, finish, exit, forfeitCameraBonus };
}
