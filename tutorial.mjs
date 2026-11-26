// The tutorial runs through the real combat inputs in a predictable order.
// Lock drills use smaller counts than a battle so players can learn quickly.
export const lessons = [
  { id: 'slash', title: 'Basic slash', hint: 'Raise your right hand above your shoulder, or press A.' },
  { id: 'block', title: 'Block the laser', hint: 'Watch the eye flashes. Raise your left hand or hold S through the shot. Missed blocks retry.' },
  { id: 'counter', title: 'Power counter', hint: 'After blocking, raise both hands or press D. In battle you have 2.4 seconds to counter.' },
  { id: 'hum', title: 'Charge aura', hint: 'Enable the mic and hum a steady note, or hold G until the aura meter is full.' },
  { id: 'beam', title: 'Fire a long laser', hint: 'Keep clapping or hold F until the full meter empties. If the beam breaks, refill and try again.' },
  { id: 'slash-lock', title: 'Open the slash lock', hint: 'Slash to reach 40 HP, then follow the lock card. Only the required move advances it.', lock: { hp: 40, move: 'basic', total: 2 }, startHp: 43 },
  { id: 'power-lock', title: 'Open the power lock', hint: 'Block the next shot, then raise both hands or press D to open the 20 HP lock.', lock: { hp: 20, move: 'power', total: 1 }, startHp: 23 },
  { id: 'beam-lock', title: 'Open the laser lock', hint: 'Hum or hold G, then fire at the 10 HP lock. Short beams count once; a full beam counts as five.', lock: { hp: 10, move: 'beam', total: 2 }, startHp: 12 },
];
