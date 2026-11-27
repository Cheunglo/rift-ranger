// Body tuning changes pressure and durability while move tells stay fixed.
export const bossProfiles = {
  R: { summary: 'Balanced stats' },
  T: { summary: '30% shorter healing intervals · 25% weaker hits', healInterval: .7, damage: .75 },
  B: { summary: 'Extra lock at 65 HP · longer gaps between attacks', gap: 650, extraLock: { hp: 65, total: 2 } },
  H: {
    summary: 'Shorter gap before Regulars · longer gap before Specials',
    before: { regular: -350, special: 450 },
  },
  D: { summary: '85 HP · shorter gaps between attacks', maxHp: 85, gap: -450 },
  S: { summary: '25% harder hits · 35% longer healing intervals', damage: 1.25, healInterval: 1.35 },
  G: { summary: '120 HP · 15% weaker hits', maxHp: 120, damage: .85 },
  W: { summary: '35% harder Specials · longer recovery after Specials', specialDamage: 1.35, after: { special: 650 } },
  O: { summary: 'Shorter recovery after Specials · longer after Regulars', after: { special: -550, regular: 450 } },
};

export function attackGapOffset(profile, previousSlot, nextSlot) {
  return (profile.gap ?? 0) + (profile.after?.[previousSlot] ?? 0) + (profile.before?.[nextSlot] ?? 0);
}

export function attackDamage(profile, damage, slot) {
  const special = slot === 'special' ? profile.specialDamage ?? 1 : 1;
  return Math.round(damage * (profile.damage ?? 1) * special);
}
