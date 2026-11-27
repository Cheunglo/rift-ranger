import { bossEffectDurations, createBossEffects } from './boss-effects.mjs?v=58';

// Canvas coordinates are CSS pixels. The boss anchors follow its existing sprite.
export function combatArt(canvas, beast, reducedMotion) {
  const ctx = canvas.getContext('2d');
  const effects = [];
  let leftLift = 0;
  let rightLift = 0;
  let kneel = 0;
  let previousTime;
  const duration = { basic: 480, power: 780, heal: 850, ...bossEffectDurations };
  const auraColors = ['#b7adc8', '#68dfff', '#ce8cff', '#ffe477'];
  const eyeColors = { green: '#69ff77', yellow: '#ffe663', red: '#ff243c' };
  const mix = (from, to, amount) => from + (to - from) * amount;

  function polygon(color, points) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  }

  function line(points, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }

  const bossEffects = createBossEffects(ctx, reducedMotion, { line, polygon, mix });

  function arm(side, lift) {
    // Side is -1 for the player's left and +1 for right on the rear-facing ranger.
    return [[side * 19, -62], [side * mix(28, 32, lift), mix(-44, -59, lift)],
      [side * mix(25, 38, lift), mix(-25, -88, lift)]];
  }

  function ranger(scene, aura, auraStage) {
    ctx.save();
    ctx.translate(scene.x, scene.floor);
    ctx.scale(scene.scale, scene.scale);
    ctx.fillStyle = '#140e24a0';
    ctx.beginPath();
    ctx.ellipse(0, -2, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (aura > .01) {
      const color = auraColors[auraStage];
      const glow = ctx.createRadialGradient(0, -48 + 21 * kneel, 17, 0, -48 + 21 * kneel, 43 + aura * 35);
      glow.addColorStop(0, color + '90');
      glow.addColorStop(.55, color + '70');
      glow.addColorStop(1, color + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(-82, -130, 164, 155);
      ctx.strokeStyle = color + 'dd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -6, 31 + aura * 30, 8 + aura * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (kneel > .01) {
      // Rear view: the right knee touches the floor while the left foot stays planted.
      const leftLeg = [[-10, -32 + 22 * kneel], [-22, -18], [-24, -3]];
      const rightLeg = [[10, -32 + 22 * kneel], [mix(18, 13, kneel), mix(-18, -4, kneel)], [29, -3]];
      for (const joints of [leftLeg, rightLeg]) {
        line(joints, '#171326', 14);
        line(joints, '#8183bd', 8);
        line(joints.slice(1), '#5c578f', 7);
      }
      line([[-31, -3], [-23, -3]], '#171326', 8);
      line([[26, -3], [34, -3]], '#171326', 7);
    } else {
      polygon('#171326', [[-17,-34],[17,-34],[20,-8],[28,-3],[27,1],[8,1],[4,-22],[-4,-22],[-8,1],[-27,1],[-28,-3],[-20,-8]]);
      polygon('#8183bd', [[-17,-32],[-5,-27],[-9,-8],[-19,-5]]);
      polygon('#a6a7df', [[17,-32],[5,-27],[9,-8],[19,-5]]);
    }
    ctx.translate(0, 22 * kneel);
    for (const [side, lift] of [[-1, leftLift], [1, rightLift]]) {
      const joints = arm(side, lift);
      line(joints, '#171326', 17);
      line(joints, '#a3a4db', 11);
      line(joints.slice(1), '#5c578f', 7);
      const [handX, handY] = joints[2];
      ctx.fillStyle = '#e8ff75';
      ctx.fillRect(handX - 4, handY - 4, 8, 8);
    }
    polygon('#171326', [[-21,-70],[21,-70],[25,-60],[19,-33],[13,-27],[-13,-27],[-19,-33],[-25,-60]]);
    polygon('#d1cdf8', [[-19,-67],[19,-67],[22,-60],[15,-37],[-15,-37],[-22,-60]]);
    polygon('#5c578f', [[-15,-37],[15,-37],[12,-31],[-12,-31]]);
    polygon('#4b416f', [[0,-61],[9,-54],[0,-44],[-9,-54]]);
    polygon('#e8ff75', [[0,-58],[5,-54],[0,-48],[-5,-54]]);
    polygon('#171326', [[-17,-86],[-11,-94],[11,-94],[17,-86],[16,-74],[10,-68],[-10,-68],[-16,-74]]);
    polygon('#adabe4', [[-13,-85],[-9,-90],[9,-90],[13,-85],[12,-76],[8,-72],[-8,-72],[-12,-76]]);
    polygon('#e8ff75', [[-2,-89],[2,-89],[2,-75],[-2,-75]]);
    ctx.restore();
  }

  function shield(box) {
    const x = box.x - 6;
    const y = box.y - 4;
    const width = box.width + 12;
    const height = box.height + 4;
    ctx.fillStyle = '#75edff25';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#8cefffde';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    for (const corner of [x, x + width]) {
      const inward = corner === x ? 1 : -1;
      line([[corner, y + 18], [corner, y], [corner + inward * 18, y]], '#dcfcff', 3);
      line([[corner, y + height - 18], [corner, y + height], [corner + inward * 18, y + height]], '#dcfcff', 3);
    }
  }

  function slash(scene, elapsed) {
    const amount = reducedMotion.matches ? .65 : Math.min(1, elapsed / 350);
    const [handX, handY] = arm(1, rightLift)[2];
    const x = mix(scene.x + handX * scene.scale, scene.target.x, amount);
    const y = mix(scene.floor + handY * scene.scale, scene.target.y, amount);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-.55);
    ctx.scale(scene.scale, scene.scale);
    polygon('#a5ecff70', [[-68,21],[-24,-15],[36,-25],[68,-14],[17,-8],[-23,10],[-49,28]]);
    polygon('#e2fbff', [[-51,18],[-12,-13],[43,-22],[66,-14],[21,-9],[-13,5]]);
    ctx.restore();
  }

  function ripples(scene, elapsed) {
    const centerY = (scene.target.y + scene.floor - 60 * scene.scale) / 2;
    // Offset the start times so the three rings spread out in sequence.
    for (let i = 0; i < 3; i++) {
      const phase = (elapsed - i * 130) / 500;
      if (phase < 0 || phase > 1) continue;
      const radius = (20 + 160 * (reducedMotion.matches ? .45 : phase)) * scene.scale;
      ctx.save();
      ctx.globalAlpha *= 1 - phase * .7;
      ctx.strokeStyle = '#eaff9a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(scene.x, centerY, radius, radius * .71, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function beam(scene, strength, stage) {
    const origin = [scene.x, scene.floor - 78 * scene.scale];
    const target = [scene.target.x, scene.target.y];
    const width = (12 + strength * 34) * scene.scale;
    const color = auraColors[stage];
    line([origin, target], color + '7d', width + 12);
    line([origin, target], color, width);
    line([origin, target], '#fff9f1', width * .28);
  }

  function heal(scene, elapsed) {
    const still = reducedMotion.matches;
    const buildup = still ? 1 : Math.min(1, elapsed / 180);
    ctx.save();
    ctx.translate(scene.x, scene.floor);
    ctx.scale(scene.scale, scene.scale);
    ctx.globalAlpha *= buildup;
    const opacity = ctx.globalAlpha;
    const glow = ctx.createRadialGradient(0, -49, 18, 0, -49, 108);
    glow.addColorStop(0, '#d7ffb3d9');
    glow.addColorStop(.45, '#66ff8c99');
    glow.addColorStop(1, '#2bff7800');
    ctx.fillStyle = glow;
    ctx.fillRect(-108, -157, 216, 167);
    ctx.shadowColor = '#42ff80';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#92ffabcf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -4, 48 + buildup * 13, 10, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Draw two jagged streams from the floor to above the ranger's hands.
    for (const side of [-1, 1]) {
      const sway = still ? 0 : Math.sin(elapsed / 52 + side) * 7;
      ctx.save();
      ctx.scale(side, 1);
      polygon('#43ff7799', [[20,-3],[44,-27],[48,-55],[36,-46],[54,-90],
        [60 + sway,-134],[67,-93],[60,-59],[74,-72],[69,-38],[50,-10],[31,0]]);
      polygon('#c7ffabdf', [[28,-4],[49,-28],[54,-60],[61 + sway,-107],
        [62,-69],[57,-37],[67,-46],[52,-17]]);
      ctx.restore();
    }

    // Stagger the sparks so they keep rising while the aura fades.
    for (let i = 0; i < 20; i++) {
      const progress = still ? .24 + (i % 5) * .12 : (elapsed - i * 16) / 490;
      if (progress < 0 || progress >= 1) continue;
      const side = i % 2 ? 1 : -1;
      const x = side * (31 + (i * 13) % 42 + progress * 11);
      const y = -14 - (i * 11) % 48 - progress * 96;
      const size = 2 + (i % 4);
      ctx.globalAlpha = opacity * Math.min(1, progress * 7, (1 - progress) * 4);
      polygon(i % 3 === 0 ? '#efffd3' : '#8dff9f',
        [[x,y - size * 2],[x + 1,y - 1],[x + size,y],[x + 1,y + 1],
          [x,y + size],[x - 1,y + 1],[x - size,y],[x - 1,y - 1]]);
    }
    ctx.restore();
  }

  function burningRanger(scene, now) {
    const still = reducedMotion.matches;
    ctx.save();
    ctx.translate(scene.x, scene.floor);
    ctx.scale(scene.scale, scene.scale);

    const glow = ctx.createRadialGradient(0, -29, 8, 0, -29, 62);
    glow.addColorStop(0, '#ff782596');
    glow.addColorStop(.5, '#ff5b2d70');
    glow.addColorStop(1, '#ff5b2d00');
    ctx.fillStyle = glow;
    ctx.fillRect(-62, -91, 124, 96);

    // Flames rise beside the armor so the ranger's gestures stay readable.
    for (const side of [-1, 1]) {
      const flicker = still ? 0 : Math.sin(now / 95 + side);
      ctx.save();
      ctx.scale(side, 1);
      polygon('#fe522e', [[15,-5], [27,-28], [24,-47], [36,-37], [42 + flicker * 7,-83],
        [49,-54], [45,-34], [55 + flicker * 4,-48], [52,-19], [38,-5], [25,0]]);
      polygon('#ffb43c', [[25,-5], [34,-24], [37,-46], [44 + flicker * 4,-66],
        [44,-39], [40,-22], [47,-31], [45,-14], [33,-4]]);
      polygon('#ffe599', [[31,-7], [38,-19], [40,-35], [43,-22], [39,-11]]);
      ctx.restore();
    }

    // Stagger embers so the loop stays continuous between burn damage ticks.
    for (let i = 0; i < 12; i++) {
      const rise = still ? (i + 1) / 13 : ((now + i * 137) % 1050) / 1050;
      const side = i % 2 ? 1 : -1;
      const x = side * (28 + i * 13 % 19 + rise * 10);
      const y = -14 - i * 9 % 18 - rise * 96;
      const size = 1 + i % 3;
      ctx.globalAlpha = Math.min(1, rise * 7, (1 - rise) * 3);
      polygon(i % 3 ? '#ff9a44' : '#ffecaa',
        [[x,y - size * 2], [x + size,y], [x,y + size], [x - size,y]]);
    }
    ctx.restore();
  }

  return {
    play(kind, now, strength) {
      effects.push({ kind, now, strength });
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      effects.length = 0;
      previousTime = undefined;
      leftLift = rightLift = kneel = 0;
    },
    render(now, { left, right, guard, aura, auraStage = 0, flash, beamStrength, beamStage, flame, inhale, shaken, burning, anchors }) {
      // Draw at display pixel density while keeping layout and effect positions
      // in CSS pixels, including the boss anchors inside the scaled sprite.
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const bounds = beast.getBoundingClientRect();
      const spriteX = bounds.left - rect.left;
      const spriteY = bounds.top - rect.top;
      // Extra wing space extends the sprite without widening the shield or flashes.
      const coreWidth = bounds.width * (anchors.coreWidth ?? 1);
      const boss = { x: spriteX + (bounds.width - coreWidth) / 2, y: spriteY, width: coreWidth, height: bounds.height };
      const point = ([x, y]) => [spriteX + x * bounds.width, spriteY + y * bounds.height];
      const [targetX, targetY] = point(anchors.target);
      const scene = {
        width: rect.width, x: rect.width * .5, floor: rect.height * .95,
        scale: Math.min(1.3, rect.width / 500, rect.height / 420),
        boss, eyes: anchors.eyes.map(point), mouth: point(anchors.mouth), target: { x: targetX, y: targetY },
      };
      const delta = previousTime === undefined ? 16 : now - previousTime;
      previousTime = now;
      const settle = reducedMotion.matches ? 1 : 1 - Math.exp(-delta / 34);
      leftLift = mix(leftLift, Number(left), settle);
      rightLift = mix(rightLift, Number(right), settle);
      kneel = mix(kneel, Number(shaken), settle);
      const eyeColor = eyeColors[flash];
      if (eyeColor) {
        for (const [x, y] of scene.eyes) {
          ctx.shadowBlur = 17;
          ctx.shadowColor = eyeColor;
          ctx.fillStyle = eyeColor;
          ctx.fillRect(x - boss.width * .036, y - boss.width * .024, boss.width * .072, boss.width * .048);
        }
        ctx.shadowBlur = 0;
      }
      // Shield, beam and projectiles sit behind the foreground ranger.
      const active = effects.filter(effect => now - effect.now < duration[effect.kind]);
      effects.splice(0, effects.length, ...active);
      if (guard || active.some(effect => (effect.kind === 'laser' || effect.kind === 'flame') && effect.strength)) shield(boss);
      if (flame) bossEffects.fireball(scene, flame);
      if (inhale !== null) bossEffects.inhaleAir(scene, inhale);
      if (beamStrength > 0) beam(scene, beamStrength, beamStage);
      for (const effect of active) {
        const elapsed = now - effect.now;
        ctx.globalAlpha = Math.min(1, (duration[effect.kind] - elapsed) / 130);
        if (effect.kind === 'basic') slash(scene, elapsed);
        else if (effect.kind === 'power') ripples(scene, elapsed);
        else if (effect.kind === 'heal') heal(scene, elapsed);
        else bossEffects.drawEffect(scene, elapsed, effect);
      }
      ctx.globalAlpha = 1;
      if (burning) burningRanger(scene, now);
      ranger(scene, aura, auraStage);
    },
  };
}
