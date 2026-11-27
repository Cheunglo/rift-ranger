// Draws boss attack effects around the body's eye and mouth anchors.
export const bossEffectDurations = { laser: 360, flame: 650, shout: 540, 'guard-break': 460 };

export function createBossEffects(ctx, reducedMotion, { line, polygon, mix }) {
  function inhaleAir(scene, progress) {
    const [x, y] = scene.mouth;
    const reach = Math.max(38, scene.boss.width * .52);
    const still = reducedMotion.matches;
    ctx.fillStyle = '#161326';
    ctx.beginPath();
    ctx.ellipse(x, y, 8 + progress * 5, 3 + progress * 5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      const angle = Math.PI * 2 * i / 12;
      const travel = still ? .4 : (progress * 1.6 + i * .137) % 1;
      const radius = 14 + reach * (1 - travel);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle) * .68;
      line([[x + dx * radius, y + dy * radius], [x + dx * (radius + 13), y + dy * (radius + 13)]], '#c1f2ffb8', 2);
    }
  }

  function shoutWave(scene, elapsed, absorbed) {
    const [x, y] = scene.mouth;
    const progress = reducedMotion.matches ? .7 : Math.min(1, elapsed / 420);
    const radius = 20 + progress * Math.hypot(scene.width * .55, scene.floor - y);
    ctx.strokeStyle = '#d6f7ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, radius, -.15, Math.PI + .15);
    ctx.stroke();
    ctx.strokeStyle = '#72c6ee90';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(5, radius - 12), -.15, Math.PI + .15);
    ctx.stroke();
    if (absorbed && progress >= .5) {
      ctx.strokeStyle = '#ffe477';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(scene.x, scene.floor - 42 * scene.scale, 40 * scene.scale, 51 * scene.scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function lasers(scene, blocked) {
    const endY = blocked ? scene.boss.y + scene.boss.height : scene.floor - 62 * scene.scale;
    scene.eyes.forEach(([x, y], i) => {
      const endX = scene.x + (i ? 1 : -1) * (blocked ? scene.boss.width * .20 : 8);
      line([[x, y], [endX, endY]], '#ff204e8e', 14);
      line([[x, y], [endX, endY]], '#ff3559', 7);
      line([[x, y], [endX, endY]], '#fff0eb', 2);
    });
  }

  function fireball(scene, flame) {
    const [x, y] = scene.mouth;
    const radius = mix(6, 22, flame.charge) * scene.scale;
    const glow = ctx.createRadialGradient(x, y, radius * .2, x, y, radius * 2.3);
    glow.addColorStop(0, flame.color);
    glow.addColorStop(.4, (flame.halo ?? flame.color) + 'd0');
    glow.addColorStop(1, (flame.halo ?? flame.color) + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 2.3, y - radius * 2.3, radius * 4.6, radius * 4.6);
    ctx.fillStyle = flame.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function shatteredShield(scene, elapsed) {
    const progress = reducedMotion.matches ? .35 : elapsed / bossEffectDurations['guard-break'];
    const { x, y, width, height } = scene.boss;
    const center = x + width / 2;
    const impactY = y + height * .82;
    // Fragments scatter from the lower edge where the eye lasers hit the shield.
    for (let i = 0; i < 12; i++) {
      const offset = (i % 6 - 2.5) / 2.5;
      const shardX = center + offset * width * (.32 + progress * .42);
      const shardY = impactY - (i % 2) * height * .34 + progress * (i * 11 % 60 - 18);
      const size = (5 + i % 4 * 2) * scene.scale;
      polygon(i % 2 ? '#89ebff' : '#defaff', [[shardX - size,shardY - size],
        [shardX + size,shardY - size * .4],[shardX - size * .3,shardY + size * 1.5]]);
    }
  }

  function flamethrower(scene, elapsed, blocked) {
    const [x, y] = scene.mouth;
    const endY = blocked ? scene.boss.y + scene.boss.height : scene.floor - 30 * scene.scale;
    const still = reducedMotion.matches;
    const reach = still ? 1 : Math.min(1, elapsed / 130);
    const length = Math.max(12, endY - y) * reach;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scene.scale, 1);
    // The jet fans out from the mouth. Its bright center stays attached to the sprite.
    for (const side of [-1, 1]) {
      const sway = still ? 0 : Math.sin(elapsed / 42 + side) * 9;
      polygon('#ff5729b0', [[0,0],[side * 11,length * .19],[side * (24 + sway),length * .39],
        [side * 19,length * .34],[side * 42,length * .65],[side * 34,length * .62],
        [side * (60 + sway),length],[side * 17,length * .82],[0,length]]);
      polygon('#ffbb32ed', [[0,0],[side * 8,length * .28],[side * 22,length * .51],
        [side * 16,length * .44],[side * (37 + sway),length * .9],[side * 12,length * .68],[0,length * .98]]);
    }
    polygon('#fff4c3', [[-5,0],[5,0],[13,length * .42],[0,length * .73],[-14,length * .44]]);
    polygon('#80c9ff', [[-10,0],[10,0],[0,length * .28]]);
    if (!still) {
      for (let i = 0; i < 14; i++) {
        const drift = ((elapsed + i * 31) % 230) / 230;
        const side = i % 2 ? 1 : -1;
        const sparkX = side * (10 + (i * 17) % 55) * drift;
        const sparkY = length * drift;
        ctx.fillStyle = i % 3 ? '#ff853e' : '#fff4ae';
        ctx.fillRect(sparkX, sparkY, 2 + i % 3, 3);
      }
    }
    ctx.restore();
  }

  function drawEffect(scene, elapsed, { kind, strength }) {
    if (kind === 'shout') shoutWave(scene, elapsed, strength);
    else if (kind === 'flame') flamethrower(scene, elapsed, strength);
    else if (kind === 'guard-break') {
      if (elapsed < bossEffectDurations.laser) lasers(scene, true);
      shatteredShield(scene, elapsed);
    } else if (kind === 'laser') lasers(scene, strength);
  }

  return { fireball, inhaleAir, drawEffect };
}
