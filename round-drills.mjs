// Owns the scripted progression of tutorial and training rounds.
import { scheduleTrainingStrike, scheduleTutorialFlame, warningDuration } from './boss-attacks.mjs?v=71';
import { lessons } from './tutorial.mjs?v=68';

const trainingMoveGap = 900;

/** Control a round's tutorial lessons with the shared health and resource rules. */
export function createTutorialDrill(round, feedback, { setHealth, updatePowerStock }) {
  /** Detect tutorial sessions from their active lesson index. */
  function isTutorial() {
    return round.lessonIndex !== null;
  }

  /** Read the current lesson's rules and instructions. */
  function lesson() {
    return lessons[round.lessonIndex];
  }

  /** Reset move-specific state and schedule the current tutorial drill. */
  function showLesson(now) {
    const current = lesson();
    if (current.id === 'heal') setHealth('player', 80);
    feedback.lesson(current, round.lessonIndex + 1, lessons.length, round.mobile);
    round.strike = Infinity;
    round.comboLaserAt = Infinity;
    round.strikeKind = current.id === 'flame' || current.id === 'guard-break' ? 'flame' : 'laser';
    if (current.id !== 'counter') {
      round.blockBonusUntil = 0;
      updatePowerStock(0);
    }
    if (current.id === 'block' || current.id === 'power-lock') {
      round.warningStart = 0;
      round.strike = now + warningDuration(round) + 1000;
    }
    if (round.strikeKind === 'flame') scheduleTutorialFlame(round, now, 1000, current.id === 'guard-break');
    feedback.showLocks(Boolean(current.lock));
    if (current.lock) {
      // Retain earlier tutorial gates so their markers stay open in the HUD.
      round.locks.push({ ...current.lock, done: 0, engaged: false });
      setHealth('enemy', current.startHp);
      feedback.locks(round.locks);
    }
  }

  /** Start the next drill or wait for the final tutorial animation. */
  function advanceLesson(now) {
    if (round.lessonIndex + 1 === lessons.length) {
      round.finished = { tutorial: true, until: now + 650 };
      return;
    }
    round.lessonIndex++;
    showLesson(now);
  }

  return { isTutorial, lesson, showLesson, advanceLesson };
}

/** Keep a round's pending practice moves separate from the editable menu queue. */
export function createTrainingDrill(round) {
  let pending = [];

  /** Schedule the next requested move once the current one clears. */
  function advanceTrainingQueue(startAt) {
    if (round.strike === Infinity && pending.length && !round.finished) {
      scheduleTrainingStrike(round, pending.shift(), startAt);
    }
  }

  /** Start a new practice queue if the current round is idle. */
  function enqueue(moves, now) {
    if (!round.training || round.finished || round.strike !== Infinity) return;
    pending = moves;
    advanceTrainingQueue(now);
  }

  /** Schedule the next training move after the current animation has had time to finish. */
  function continueTraining(now) {
    if (round.training) advanceTrainingQueue(now + trainingMoveGap);
  }

  return { enqueue, continueTraining };
}
