import { parseFightId, rollFight } from './boss-fights.mjs?v=62';

const options = document.getElementById('fight-options');
const bodyChoice = document.getElementById('boss-choice');
const idInput = document.getElementById('fight-id-input');
const inputMessage = document.getElementById('fight-id-error');
const sharePanel = document.getElementById('fight-share');
const currentId = document.getElementById('current-fight-id');
const shareMessage = document.getElementById('fight-share-message');

const linkedId = new URLSearchParams(location.search).get('boss');
if (linkedId) {
  options.open = true;
  idInput.value = linkedId;
}

idInput.addEventListener('input', clearValidation);
bodyChoice.addEventListener('change', () => {
  idInput.value = '';
  clearValidation();
});

function clearValidation() {
  idInput.removeAttribute('aria-invalid');
  inputMessage.textContent = '';
}

export function showFightOptions(visible) {
  options.hidden = !visible;
}

export function chooseFight() {
  if (!idInput.value.trim()) return rollFight(bodyChoice.value);
  const fight = parseFightId(idInput.value);
  if (fight) {
    clearValidation();
    return fight;
  }
  options.open = true;
  idInput.setAttribute('aria-invalid', 'true');
  inputMessage.textContent = 'Enter a valid fight ID, such as RR1-T-LFS-SPL.';
  idInput.focus();
  return null;
}

export function showFightId(id = '') {
  currentId.value = id;
  sharePanel.hidden = !id;
  shareMessage.textContent = '';
}

document.getElementById('copy-fight-id').addEventListener('click', async () => {
  const id = currentId.value;
  try {
    await navigator.clipboard.writeText(id);
    if (currentId.value === id) shareMessage.textContent = 'Fight ID copied.';
  } catch {
    if (currentId.value !== id) return;
    currentId.select();
    shareMessage.textContent = 'Select and copy the fight ID.';
  }
});
