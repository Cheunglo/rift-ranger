import { bossBodies } from './boss-bodies.mjs?v=65';
import { bossProfiles } from './boss-profiles.mjs?v=64';
import { parseFightId, rollFight } from './boss-fights.mjs?v=65';

const options = document.getElementById('fight-options');
const bodyChoice = document.getElementById('boss-choice');
const idInput = document.getElementById('fight-id-input');
const inputMessage = document.getElementById('fight-id-error');
const stats = document.getElementById('boss-profile');
const sharePanel = document.getElementById('fight-share');
const currentId = document.getElementById('current-fight-id');
const shareMessage = document.getElementById('fight-share-message');

const randomOption = bodyChoice.firstElementChild;
for (const [code, body] of Object.entries(bossBodies)) {
  bodyChoice.add(new Option(body.label ?? body.name, code), randomOption);
}
bodyChoice.value = 'R';

const linkedId = new URLSearchParams(location.search).get('boss');
if (linkedId) {
  options.open = true;
  idInput.value = linkedId;
}

function showProfile() {
  const profile = idInput.value.trim() ? parseFightId(idInput.value)?.profile : bossProfiles[bodyChoice.value];
  stats.textContent = profile?.summary ?? (bodyChoice.value === 'random' && !idInput.value.trim() ? 'Roll a body and its stats.' : '');
}

showProfile();
idInput.addEventListener('input', () => {
  clearValidation();
  showProfile();
});
bodyChoice.addEventListener('change', () => {
  idInput.value = '';
  clearValidation();
  showProfile();
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
