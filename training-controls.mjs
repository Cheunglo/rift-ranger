import { trainingMoves } from './boss-attacks.mjs?v=74';

const queueLimit = 3;

/** Own the editable move queue and pass an independent snapshot to the round. */
export function createTrainingControls(onRun) {
  const panel = document.getElementById('training-controls');
  const move = document.getElementById('training-move');
  const add = document.getElementById('training-add-move');
  const run = document.getElementById('training-run-queue');
  const list = document.getElementById('training-queue');
  const status = document.getElementById('training-queue-status');
  const names = new Map(trainingMoves.map(({ id, name }) => [id, name]));
  const queue = [];
  let running = false;

  for (const [id, name] of names) move.add(new Option(name, id));

  /** Disable queue edits during playback and reflect the queue limit. */
  function updateButtons() {
    move.disabled = add.disabled = running || queue.length >= queueLimit;
    run.disabled = running || queue.length === 0;
    for (const button of list.querySelectorAll('button')) button.disabled = running;
    status.textContent = running ? 'Running queue…' : queue.length + ' / ' + queueLimit + ' moves';
  }

  /** Rebuild the ordered list with a remove control for each queued move. */
  function renderQueue() {
    list.replaceChildren(...queue.map((id, index) => {
      const name = names.get(id);
      const item = document.createElement('li');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = (index + 1) + '. ' + name + ' ×';
      remove.setAttribute('aria-label', 'Remove move ' + (index + 1) + ', ' + name);
      remove.addEventListener('click', () => {
        queue.splice(index, 1);
        renderQueue();
        add.focus({ preventScroll: true });
      });
      item.append(remove);
      return item;
    }));
    updateButtons();
  }

  add.addEventListener('click', () => {
    if (running || queue.length >= queueLimit) return;
    queue.push(move.value);
    renderQueue();
    if (queue.length === queueLimit) run.focus({ preventScroll: true });
  });
  run.addEventListener('click', () => {
    if (!running && queue.length) onRun([...queue]);
  });
  renderQueue();

  return {
    /** Set panel visibility and return its buttons to the idle state. */
    show(visible) {
      panel.hidden = !visible;
      running = false;
      updateButtons();
    },
    /** Refresh controls only when playback starts or ends. */
    setRunning(active) {
      if (active === running) return;
      running = active;
      updateButtons();
    },
  };
}
