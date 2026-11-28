// The tutorial runs through the real combat inputs in a predictable order.
// Lock drills use smaller counts than a battle so players can learn quickly.
export const lessons = [
  {
    id: 'slash',
    title: 'Basic slash',
    hint: 'Raise your right hand above your shoulder, or hold K briefly.',
    mobileHint: 'Hold Slash briefly to swing.',
  },
  {
    id: 'block',
    title: 'Block the laser',
    hint: 'When the eyes flash, hold your left hand up or hold S through the shot.',
    mobileHint: 'Hold Block before the shot so your shield has time to form.',
  },
  {
    id: 'counter',
    title: 'Power counter',
    hint: 'Blocking banks a Powerwave. Raise both hands or hold D briefly to spend one.',
    mobileHint: 'Blocking banks a Powerwave. Hold Powerwave / Heal briefly to spend one.',
  },
  {
    id: 'hum',
    title: 'Charge aura',
    hint: 'Hum, whistle, sing, or hold Space to charge. Higher stages give 2× and 4× laser power.',
    mobileHint: 'Hold Aura to charge. Higher stages give 2× and 4× laser power.',
  },
  {
    id: 'beam',
    title: 'Fire a short laser',
    hint: 'Click your tongue, clap, or hold J briefly to fire at the highest completed Aura stage.',
    mobileHint: 'Hold Laser briefly to fire at the highest completed Aura stage.',
  },
  {
    id: 'heal',
    title: 'Heal with aura',
    hint: 'Charge Stage 1 or higher, then raise both hands or hold D briefly to heal.',
    mobileHint: 'Charge Aura to Stage 1 or higher, then hold Powerwave / Heal briefly.',
  },
  { id: 'flame', title: 'Interrupt the flamethrower', hint: 'Slash drops 1 color. Laser Stages 1–3 drop 2, 3, or 4 colors. Cool past red to stop it.' },
  {
    id: 'guard-break',
    title: 'Recover from a guard break',
    hint: 'Block the laser. Lower and raise your left hand, or release and re-press S, to block the fire.',
    mobileHint: 'Block the laser. Release, then hold Block again before the fire lands.',
  },
  { id: 'slash-lock', title: 'Open the slash lock', hint: 'Slash to reach 40 HP, then keep slashing until the lock breaks.', lock: { hp: 40, move: 'basic', total: 2 }, startHp: 43 },
  {
    id: 'power-lock',
    title: 'Open the power lock',
    hint: 'Block the laser, then raise both hands or hold D briefly to open the lock.',
    mobileHint: 'Block the laser, then hold Powerwave / Heal briefly to open the lock.',
    lock: { hp: 20, move: 'power', total: 1 },
    startHp: 23,
  },
  { id: 'beam-lock', title: 'Open the laser lock', hint: 'Earn 2 laser credits. Stages 1, 2, and 3 give 1, 2, and 4 credits.', lock: { hp: 10, move: 'beam', total: 2 }, startHp: 12 },
];
