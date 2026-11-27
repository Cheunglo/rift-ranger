// The tutorial runs through the real combat inputs in a predictable order.
// Lock drills use smaller counts than a battle so players can learn quickly.
export const lessons = [
  { id: 'slash', title: 'Basic slash', hint: 'Raise your right hand above your shoulder, or press K.' },
  { id: 'block', title: 'Block the laser', hint: 'When the eyes flash, hold your left hand up or hold S through the shot.' },
  { id: 'counter', title: 'Power counter', hint: 'Blocking banks a Powerwave. When ready, raise both hands or press D to spend one.' },
  { id: 'hum', title: 'Charge aura', hint: 'Hum, whistle, sing, or hold Space to charge. Higher stages give 2× and 4× laser power.' },
  { id: 'beam', title: 'Fire a short laser', hint: 'Clap once or press J to fire at the highest completed aura stage.' },
  { id: 'heal', title: 'Heal with aura', hint: 'Charge Stage 1 or higher, then raise both hands or press D to spend aura and heal.' },
  { id: 'flame', title: 'Interrupt the flamethrower', hint: 'Slash drops 1 color. Laser Stages 1–3 drop 2, 3, or 4 colors. Cool past red to stop it.' },
  { id: 'guard-break', title: 'Recover from a guard break', hint: 'Block the laser. Lower and raise your left hand, or release and re-press S, to block the fire.' },
  { id: 'slash-lock', title: 'Open the slash lock', hint: 'Slash to reach 40 HP, then keep slashing until the lock breaks.', lock: { hp: 40, move: 'basic', total: 2 }, startHp: 43 },
  { id: 'power-lock', title: 'Open the power lock', hint: 'Block the laser, then raise both hands or press D to open the lock.', lock: { hp: 20, move: 'power', total: 1 }, startHp: 23 },
  { id: 'beam-lock', title: 'Open the laser lock', hint: 'Earn 2 laser credits. Stages 1, 2, and 3 give 1, 2, and 4 credits.', lock: { hp: 10, move: 'beam', total: 2 }, startHp: 12 },
];
