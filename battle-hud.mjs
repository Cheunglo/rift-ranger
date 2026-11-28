// Paints DOM battle state. The game decides when that state changes.
import { baseLockThresholds, lockRequirement, nextBossLock } from './boss-locks.mjs?v=64';

/** Look up a required element in the static game markup. */
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
const player = byId('player');
export const burnStatus = byId('burn-status');
export const shakenStatus = byId('shaken-status');
export const powerStock = byId('power-stock');
const enemy = byId('enemy');
const healthBars = { player, enemy };
export const lockMarkers = byId('lock-markers');
export const lockStatus = byId('lock-status');
const lockTitle = byId('lock-title');
const lockRemaining = byId('lock-remaining');
const lockInstruction = byId('lock-instruction');
const auraCaption = byId('aura-caption');
const bossPanelHome = bossPanel.parentElement;
const lockStatusHome = lockStatus.parentElement;

/** Toggle warning content while retaining its reserved layout space. */
function setWarningVisible(visible) {
  bossPanel.classList.toggle('warnings-hidden', !visible);
  warningToggle.setAttribute('aria-expanded', String(visible));
  warningToggle.textContent = visible ? 'Hide warning' : 'Show warning';
}

/** Move warnings and lock status to the layout slots for the active input mode. */
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
  basic: 'Right hand up · K',
  power: 'Block to bank Powerwaves',
  beam: 'Stages 1–3 earn 1, 2, 4',
};

/** Update the warning live region only when its text changes. */
export function showBattleWarning(message, incoming, hint, showGuardPose) {
  if (prompt.textContent !== message) prompt.textContent = message;
  const state = incoming ? 'danger' : '';
  if (bossPanel.dataset.state !== state) bossPanel.dataset.state = state;
  warningPose.toggleAttribute('hidden', !incoming || !showGuardPose);
  warningHint.hidden = !incoming;
  if (incoming && warningHint.textContent !== hint) warningHint.textContent = hint;
}

/** Set the boss name on both the visible HUD and the accessible HP meter. */
export function renderBossName(name) {
  byId('boss-name').textContent = name;
  enemy.setAttribute('aria-label', name + ' health');
}

/** Synchronize a fighter's native HP meter and numeric label with the round. */
export function renderHealth(fighter, hp, maxHp) {
  const bar = healthBars[fighter];
  bar.max = maxHp;
  bar.value = hp;
  byId(bar.id + '-hp').textContent = hp + ' / ' + maxHp + ' HP';
}

/** Reset health and Aura and rebuild exactly the lock markers for this session. */
export function resetHud(maxHp, gateHP = baseLockThresholds) {
  renderHealth('player', maxHp.player, maxHp.player);
  renderHealth('enemy', maxHp.enemy, maxHp.enemy);
  burnStatus.hidden = shakenStatus.hidden = true;
  arena.dataset.auraStage = mobileControls.dataset.auraStage = '0';
  auraCaption.textContent = 'Aura · charge to 1';
  auraButtonCaption.textContent = 'Hold to charge';
  lockMarkers.replaceChildren(...gateHP.map(hp => {
    const marker = document.createElement('span');
    marker.className = 'lock-marker';
    marker.id = 'lock-' + hp;
    marker.dataset.state = 'closed';
    marker.style.setProperty('--threshold', hp / maxHp.enemy * 100 + '%');
    return marker;
  }));
}

/** Show the next unopened gate and retain its engaged state through boss healing. */
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

/** Show the recognized camera pose and surface feedback for rejected actions. */
export function renderPose(cameraMode, move, label = '', state = '') {
  cameraPosePreview.hidden = !cameraMode;
  poseIcon.toggleAttribute('hidden', !move);
  if (move) poseArt.setAttribute('href', './poses.svg?v=7#' + move);
  cameraPosePreview.setAttribute('aria-label', label || 'Recognized camera pose');
  moveNotice.hidden = state !== 'locked';
  if (state === 'locked' && moveNotice.textContent !== label) moveNotice.textContent = label;
}

/** Open a menu or result message and clear the previous score breakdown. */
export function showOverlay(title, copy) {
  battleResult.hidden = true;
  byId('overlay-title').textContent = title;
  byId('overlay-copy').textContent = copy;
  overlay.hidden = false;
}

/** Draw the same completed charge stage on the arena HUD and the touch button. */
export function renderAura(ready) {
  const index = ready?.level ?? 0;
  arena.dataset.auraStage = mobileControls.dataset.auraStage = String(index);
  const caption = ready ? 'Aura ' + index + ' · ' + ready.multiplier + '×' : 'Aura · charge to 1';
  const buttonCaption = ready ? 'Stage ' + index + ' · ' + ready.multiplier + '×' : 'Hold to charge';
  if (auraCaption.textContent !== caption) auraCaption.textContent = caption;
  if (auraButtonCaption.textContent !== buttonCaption) auraButtonCaption.textContent = buttonCaption;
}

/** Show how many banked Powerwaves the Ranger can still spend. */
export function renderPowerStock(charges) {
  powerStock.textContent = 'Powerwaves: ' + charges;
}

/** Update the warning panel title without rebuilding the live region. */
export function renderBossLabel(label) {
  if (bossPanelLabel.textContent !== label) bossPanelLabel.textContent = label;
}

/** Return the arena to its unobstructed battle view. */
export function hideOverlay() {
  overlay.hidden = true;
}

/** Show or hide the HUD elements that belong to a running round. */
export function setBattleHudVisible(visible) {
  battleFeedback.hidden = auraStatus.hidden = bossPanel.hidden = warningToggle.hidden = !visible;
  if (!visible) cameraPosePreview.hidden = true;
}

/** Calculate and disclose the components of a scored victory. */
export function showBattleResult(elapsed, damage, maxHealth, cameraBonusEligible, cameraBonusPercent) {
  const speedMax = 6000;
  const healthMax = 4000;
  const referenceSeconds = 60;
  const timeBonus = Math.round(speedMax * referenceSeconds / (referenceSeconds + elapsed));
  const healthBonus = Math.round(healthMax * Math.max(0, maxHealth - damage) / maxHealth);
  const baseScore = timeBonus + healthBonus;
  const cameraBonus = cameraBonusEligible ? Math.round(baseScore * cameraBonusPercent / 100) : 0;
  const seconds = Math.floor(elapsed);
  /** Format a score component using the browser's number conventions. */
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
