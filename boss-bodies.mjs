import { paintBeast, riftbeastAnchors } from './beast.mjs?v=58';
import {
  paintBeetle, paintHound, paintHuman, paintOwl, paintSerpent, paintSlime, paintTree, paintWhale,
} from './boss-body-art.mjs?v=67';

// Bodies describe where existing effects originate. Keep these on the same
// pixels as the eyes and mouth when editing a sprite.
const anchors = (eyes, mouth, target) => ({
  eyes: eyes.map(normalize), mouth: normalize(mouth), target: normalize(target),
});

function normalize([x, y]) {
  return [x / 40, y / 36];
}

export const bossBodies = {
  R: { name: 'The Riftbeast', pixelScale: 1, paint: paintBeast, anchors: riftbeastAnchors },
  T: { name: 'Barkjaw', label: 'Barkjaw (tree)', paint: paintTree, anchors: anchors([[16.5,19.5],[24.5,19.5]], [20.5,26], [20,19]) },
  B: { name: 'Iron Beetle', paint: paintBeetle, anchors: anchors([[15.5,22],[24.5,22]], [20,27], [20,18]) },
  H: { name: 'The Duelist', label: 'The Duelist (human)', paint: paintHuman, anchors: anchors([[17,11.5],[23,11.5]], [20,14.5], [20,23]) },
  D: { name: 'Rift Hound', paint: paintHound, anchors: anchors([[13.5,16.5],[26.5,16.5]], [20,24.5], [20,18]) },
  S: { name: 'Coilfang', label: 'Coilfang (serpent)', paint: paintSerpent, anchors: anchors([[15.5,10.5],[24.5,10.5]], [20,16.5], [20,19]) },
  G: { name: 'Rift Slime', paint: paintSlime, anchors: anchors([[15.5,19.5],[25.5,19.5]], [21,26], [20,19]) },
  W: { name: 'Tidewhale', paint: paintWhale, anchors: anchors([[13,17.5],[27,17.5]], [20,24.5], [20,17]) },
  O: { name: 'Moon Owl', paint: paintOwl, anchors: anchors([[14.5,16.5],[25.5,16.5]], [20,23.5], [20,17]) },
};

export function paintBoss(canvas, body) {
  const scale = body.pixelScale ?? 2;
  canvas.width = 40 * scale;
  canvas.height = 36 * scale;
  body.paint(canvas);
}
