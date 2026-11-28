export const manualWindUpMs = 200;

/** Track one pending manual wind-up per action on the round clock. */
export function createManualWindUp(commit) {
  const pending = new Map();

  /** Start a visible wind-up, optionally requiring a physical hold. */
  function start(action, now, requiresHold) {
    if (!pending.has(action)) pending.set(action, { readyAt: now + manualWindUpMs, requiresHold });
  }

  /** Resolve a ready action once and remove its pending pose. */
  function finish(action, now) {
    pending.delete(action);
    commit(action, now);
  }

  /** Cancel released holds or commit a completed attack between animation frames. */
  function release(action, now, cancelled) {
    const windUp = pending.get(action);
    if (!windUp || (!windUp.requiresHold && !cancelled)) return;
    if (cancelled || now < windUp.readyAt) pending.delete(action);
    else finish(action, now);
  }

  /** Commit actions whose held wind-up has reached its deadline. */
  function advance(now) {
    for (const [action, { readyAt }] of pending) {
      if (now >= readyAt) finish(action, now);
    }
  }

  /** Discard uncommitted inputs on focus loss or session teardown. */
  function cancel() {
    pending.clear();
  }

  /** Report which visual cue to show while an action is preparing. */
  function isPending(action) {
    return pending.has(action);
  }

  return { start, release, advance, cancel, isPending };
}
