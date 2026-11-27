import { paintBeast, riftbeastAnchors } from './beast.mjs?v=58';

// Bodies describe where existing effects originate. Drawing a new body does
// not change an attack's rules, tell duration, or damage.
const anchors = (eyes, mouth, target) => ({
  eyes: eyes.map(normalize), mouth: normalize(mouth), target: normalize(target),
});

function normalize([x, y]) {
  return [x / 40, y / 36];
}

function paintLayers(canvas, layers) {
  const ctx = canvas.getContext('2d');
  for (const [color, rectangles] of layers) {
    ctx.fillStyle = color;
    for (const rectangle of rectangles) ctx.fillRect(...rectangle);
  }
}

function paintTree(canvas) {
  paintLayers(canvas, [
    ['#101b1a', [[10, 4, 20, 11], [15, 1, 17, 13], [28, 5, 7, 9], [6, 8, 29, 8],
      [11, 12, 18, 21], [4, 15, 9, 7], [1, 11, 7, 7], [27, 16, 8, 6], [32, 11, 7, 7], [7, 31, 26, 4]]],
    ['#375a36', [[11, 5, 19, 8], [16, 2, 15, 8], [29, 6, 5, 6], [7, 9, 26, 5]]],
    ['#639849', [[12, 6, 9, 3], [18, 3, 11, 3], [23, 7, 8, 3], [8, 9, 7, 2]]],
    ['#725039', [[13, 12, 14, 21], [5, 16, 8, 4], [2, 12, 5, 5],
      [27, 17, 7, 3], [33, 12, 5, 5], [9, 32, 9, 2], [23, 32, 8, 2]]],
    ['#a4784e', [[14, 13, 3, 18], [19, 12, 3, 5], [23, 25, 3, 6], [6, 16, 6, 1]]],
    ['#291e22', [[13, 17, 6, 5], [22, 17, 6, 5], [16, 24, 9, 5], [18, 23, 5, 6]]],
    ['#d5ff76', [[15, 19, 3, 1], [23, 19, 3, 1]]],
    ['#436d3d', [[0, 10, 5, 3], [1, 9, 4, 2], [34, 10, 6, 3], [36, 8, 3, 2], [27, 29, 3, 3]]],
  ]);
}

function paintBeetle(canvas) {
  paintLayers(canvas, [
    ['#131726', [[11, 8, 18, 4], [7, 11, 26, 6], [5, 15, 30, 13], [9, 27, 22, 6],
      [1, 17, 8, 4], [31, 17, 8, 4], [2, 23, 7, 4], [31, 23, 7, 4], [4, 29, 10, 4], [26, 29, 10, 4],
      [10, 5, 4, 7], [26, 5, 4, 7]]],
    ['#23434e', [[12, 9, 16, 4], [8, 12, 24, 7], [6, 16, 28, 10], [11, 26, 18, 5]]],
    ['#397c74', [[12, 10, 7, 4], [21, 10, 7, 4], [9, 13, 10, 7], [21, 13, 10, 7], [7, 18, 6, 5], [27, 18, 6, 5]]],
    ['#76ae92', [[11, 13, 5, 2], [24, 13, 5, 2], [8, 17, 3, 2], [29, 17, 3, 2]]],
    ['#131726', [[19, 9, 2, 9], [13, 19, 14, 9], [11, 22, 18, 5]]],
    ['#526782', [[13, 20, 14, 5], [5, 28, 7, 4], [28, 28, 7, 4], [11, 6, 2, 6], [27, 6, 2, 6]]],
    ['#ffcf76', [[14, 21, 3, 2], [23, 21, 3, 2]]],
    ['#252039', [[17, 25, 6, 4], [18, 28, 4, 2]]],
    ['#9e8f77', [[13, 26, 3, 4], [24, 26, 3, 4], [15, 29, 2, 2], [23, 29, 2, 2]]],
  ]);
}

export const bossBodies = {
  R: { name: 'The Riftbeast', paint: paintBeast, anchors: riftbeastAnchors },
  T: { name: 'Barkjaw', paint: paintTree, anchors: anchors([[16.5, 19.5], [24.5, 19.5]], [20.5, 26], [20, 19]) },
  B: { name: 'Iron Beetle', paint: paintBeetle, anchors: anchors([[15.5, 22], [24.5, 22]], [20, 27], [20, 18]) },
};

export function paintBoss(canvas, body) {
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  body.paint(canvas);
}
