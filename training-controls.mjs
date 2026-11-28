import { trainingMoves } from './boss-attacks.mjs?v=71';

const queueLimit = 3;

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

  function updateButtons() {
    move.disabled = add.disabled = running || queue.length >= queueLimit;
    run.disabled = running || queue.length === 0;
    for (const button of list.querySelectorAll('button')) button.disabled = running;
    status.textContent = running ? 'Running queue…' : queue.length + ' / ' + queueLimit + ' moves';
  }

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
    show(visible) {
      panel.hidden = !visible;
      running = false;
      updateButtons();
    },
    setRunning(active) {
      if (active === running) return;
      running = active;
      updateButtons();
    },
  };
}
