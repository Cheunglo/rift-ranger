// The tutorial runs through the real combat inputs in a predictable order.
// Lock drills use smaller counts than a battle so players can learn quickly.
export const lessons = [
  { id: 'slash', title: 'Basic slash', hint: 'Raise your right hand above your shoulder, or press A.' },
  { id: 'block', title: 'Block the laser', hint: 'When the eyes flash, hold your left hand up or hold S through the shot.' },
  { id: 'counter', title: 'Power counter', hint: 'After blocking, raise both hands or press D. In battle, you have 2.4 seconds.' },
  { id: 'hum', title: 'Charge aura', hint: 'Hum a steady note or hold G to charge. Higher stages give 2× and 4× laser power.' },
  { id: 'beam', title: 'Fire a short laser', hint: 'Clap once or press F to fire at the highest completed aura stage.' },
  { id: 'heal', title: 'Heal with aura', hint: 'Charge Stage 1 or higher, then raise both hands or press D to spend aura and heal.' },
  { id: 'slash-lock', title: 'Open the slash lock', hint: 'Slash to reach 40 HP, then keep slashing until the lock breaks.', lock: { hp: 40, move: 'basic', total: 2 }, startHp: 43 },
  { id: 'power-lock', title: 'Open the power lock', hint: 'Block the laser, then raise both hands or press D to open the lock.', lock: { hp: 20, move: 'power', total: 1 }, startHp: 23 },
  { id: 'beam-lock', title: 'Open the laser lock', hint: 'Fire a Stage 1 laser, then a Stage 2 laser. Match the stage on the lock card.', lock: { hp: 10, move: 'beam', total: 2, stages: [1, 2] }, startHp: 12 },
];
