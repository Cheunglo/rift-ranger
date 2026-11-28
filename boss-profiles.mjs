// Body tuning changes pressure and durability while move tells stay fixed.
export const bossProfiles = {
  R: { summary: 'Balanced stats' },
  T: { summary: '30% shorter healing intervals · 25% weaker hits', healInterval: .7, damage: .75 },
  B: { summary: 'Extra lock at 65 HP · longer gaps between attacks', gap: 650, extraLock: { hp: 65, total: 2 } },
  H: {
    summary: 'Shorter gap before Status · 20% weaker Specials',
    before: { status: -250 },
    slotDamage: { special: .8 },
  },
  D: { summary: '85 HP · shorter gaps between attacks', maxHp: 85, gap: -450 },
  S: { summary: '25% harder Regulars · 35% longer healing intervals', slotDamage: { regular: 1.25 }, healInterval: 1.35 },
  G: { summary: '150 HP · two locks', maxHp: 150, lockThresholds: [40, 10] },
  W: { summary: '35% harder Specials · longer recovery after Specials', slotDamage: { special: 1.35 }, after: { special: 650 } },
  O: { summary: 'Shorter recovery after Specials · longer after Regulars', after: { special: -550, regular: 450 } },
};

/** Combine a body's base timing offset with its previous and next move modifiers. */
export function attackGapOffset(profile, previousSlot, nextSlot) {
  return (profile.gap ?? 0) + (profile.after?.[previousSlot] ?? 0) + (profile.before?.[nextSlot] ?? 0);
}

/** Apply body-specific damage scaling for the move category. */
export function attackDamage(profile, damage, slot) {
  return Math.round(damage * (profile.damage ?? 1) * (profile.slotDamage?.[slot] ?? 1));
}
