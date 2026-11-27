// Paints DOM battle state. The game decides when that state changes.
import { lockRequirement, nextBossLock } from './boss-locks.mjs?v=58';

export const byId = id => document.getElementById(id);
export const arena = byId('arena');
const overlay = byId('overlay');
const battleResult = byId('battle-result');
export const mobileControls = byId('mobile-controls');
const mobileStatus = byId('mobile-status');
const warningToggle = byId('warning-toggle');
const prompt = byId('prompt');
const bossPanel = byId('boss-panel');
const bossPanelLabel = byId('boss-panel-label');
const warningPose = byId('warning-pose');
const warningHint = byId('warning-hint');
const cameraPosePreview = byId('camera-pose');
const poseArt = byId('pose-art');
const poseIcon = poseArt.ownerSVGElement;
const moveNotice = byId('move-notice');
const battleFeedback = byId('battle-feedback');
const auraStatus = byId('aura-status');
const auraButtonCaption = byId('aura-button-caption');
export const player = byId('player');
export const burnStatus = byId('burn-status');
export const shakenStatus = byId('shaken-status');
export const powerStock = byId('power-stock');
export const enemy = byId('enemy');
export const lockMarkers = byId('lock-markers');
export const lockStatus = byId('lock-status');
const lockTitle = byId('lock-title');
const lockRemaining = byId('lock-remaining');
const lockInstruction = byId('lock-instruction');
const auraCaption = byId('aura-caption');
const bossPanelHome = bossPanel.parentElement;
const lockStatusHome = lockStatus.parentElement;

function setWarningVisible(visible) {
  bossPanel.classList.toggle('warnings-hidden', !visible);
  warningToggle.setAttribute('aria-expanded', String(visible));
  warningToggle.textContent = visible ? 'Hide warning' : 'Show warning';
}

export function setMobileHud(enabled) {
  mobileStatus.hidden = !enabled;
  setWarningVisible(true);
  (enabled ? mobileStatus : bossPanelHome).append(bossPanel);
  (enabled ? mobileStatus : lockStatusHome).append(lockStatus);
}
warningToggle.addEventListener('click', () => {
  setWarningVisible(warningToggle.getAttribute('aria-expanded') === 'false');
});

const lockInstructions = {
  basic: 'Right hand up · A',
  power: 'Block to bank Powerwaves',
  beam: 'Stages 1–3 earn 1, 2, 4',
};

export function showBattleWarning(message, incoming, hint, showGuardPose) {
  if (prompt.textContent !== message) prompt.textContent = message;
  const state = incoming ? 'danger' : '';
  if (bossPanel.dataset.state !== state) bossPanel.dataset.state = state;
  warningPose.toggleAttribute('hidden', !incoming || !showGuardPose);
  warningHint.hidden = !incoming;
  if (incoming && warningHint.textContent !== hint) warningHint.textContent = hint;
}

export function setHealth(bar, value) {
  bar.value = value;
  byId(bar.id + '-hp').textContent = bar.value + ' / ' + bar.max + ' HP';
}

export function resetHud() {
  setHealth(player, player.max);
  setHealth(enemy, enemy.max);
  burnStatus.hidden = shakenStatus.hidden = true;
  arena.dataset.auraStage = mobileControls.dataset.auraStage = '0';
  auraCaption.textContent = 'Aura · charge to 1';
  auraButtonCaption.textContent = 'Hold to charge';
  for (const marker of lockMarkers.children) marker.dataset.state = 'closed';
}

// The HUD previews the next gate and keeps an engaged lock highlighted if the boss heals.
export function renderBossLocks(locks) {
  const next = nextBossLock(locks);
  const active = Boolean(next?.engaged);
  for (const lock of locks) {
    byId('lock-' + lock.hp).dataset.state = lock.done === lock.total ? 'open' :
      lock === next && active ? 'active' : 'closed';
  }
  let title = 'All three locks opened';
  if (next) {
    title = active ? next.hp + ' HP lock' : 'Next lock · ' + next.hp + ' HP';
  }
  const remaining = next ? lockRequirement(next) + ' left' : '';
  const instruction = active ? lockInstructions[next.move] : '';
  if (lockTitle.textContent !== title) lockTitle.textContent = title;
  if (lockRemaining.textContent !== remaining) lockRemaining.textContent = remaining;
  if (lockInstruction.textContent !== instruction) lockInstruction.textContent = instruction;
  lockRemaining.hidden = !remaining;
  lockInstruction.hidden = !instruction;
  lockStatus.dataset.active = String(active);
}

// The character shows successful moves; only explain blocked moves in text.
export function renderPose(cameraMode, move, label = '', state = '') {
  cameraPosePreview.hidden = !cameraMode;
  poseIcon.toggleAttribute('hidden', !move);
  if (move) poseArt.setAttribute('href', './poses.svg?v=7#' + move);
  cameraPosePreview.setAttribute('aria-label', label || 'Recognized camera pose');
  moveNotice.hidden = state !== 'locked';
  if (state === 'locked' && moveNotice.textContent !== label) moveNotice.textContent = label;
}

export function showOverlay(title, copy) {
  battleResult.hidden = true;
  byId('overlay-title').textContent = title;
  byId('overlay-copy').textContent = copy;
  overlay.hidden = false;
}

export function renderAura(ready) {
  const index = ready?.level ?? 0;
  arena.dataset.auraStage = mobileControls.dataset.auraStage = String(index);
  const caption = ready ? 'Aura ' + index + ' · ' + ready.multiplier + '×' : 'Aura · charge to 1';
  const buttonCaption = ready ? 'Stage ' + index + ' · ' + ready.multiplier + '×' : 'Hold to charge';
  if (auraCaption.textContent !== caption) auraCaption.textContent = caption;
  if (auraButtonCaption.textContent !== buttonCaption) auraButtonCaption.textContent = buttonCaption;
}

export function renderPowerStock(charges) {
  powerStock.textContent = 'Powerwaves: ' + charges;
}

export function renderBossLabel(label) {
  if (bossPanelLabel.textContent !== label) bossPanelLabel.textContent = label;
}

export function hideOverlay() {
  overlay.hidden = true;
}

export function setBattleHudVisible(visible) {
  battleFeedback.hidden = auraStatus.hidden = bossPanel.hidden = warningToggle.hidden = !visible;
  if (!visible) cameraPosePreview.hidden = true;
}

export function showBattleResult(elapsed, damage, maxHealth, cameraBonusEligible, cameraBonusPercent) {
  const speedMax = 6000;
  const healthMax = 4000;
  const referenceSeconds = 60;
  const timeBonus = Math.round(speedMax * referenceSeconds / (referenceSeconds + elapsed));
  const healthBonus = Math.round(healthMax * Math.max(0, maxHealth - damage) / maxHealth);
  const baseScore = timeBonus + healthBonus;
  const cameraBonus = cameraBonusEligible ? Math.round(baseScore * cameraBonusPercent / 100) : 0;
  const seconds = Math.floor(elapsed);
  const points = value => value.toLocaleString();
  byId('result-score').textContent = points(baseScore + cameraBonus);
  byId('result-time').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  byId('result-damage').textContent = damage + ' HP';
  byId('result-speed-formula').textContent =
    points(speedMax) + ' × ' + referenceSeconds + ' ÷ (' + referenceSeconds + ' + ' + points(elapsed) +
    ') ≈ ' + points(timeBonus) + ' pts';
  byId('result-health-formula').textContent =
    points(healthMax) + ' × max(0, ' + maxHealth + ' − ' + damage + ') ÷ ' + maxHealth +
    ' = ' + points(healthBonus) + ' pts';
  byId('result-camera-bonus').hidden = !cameraBonusEligible;
  byId('result-camera-formula').textContent =
    points(baseScore) + ' × ' + cameraBonusPercent + '% ≈ +' + points(cameraBonus) + ' pts';
  battleResult.hidden = false;
}
