import { bellLaneRack } from './bell-lane-rack.js';
import { addBellLaneWishTag } from './bell-lane-wish-tag.js';

export function bellLaneRackDisplay(lamps) {
  const { previous, next } = bellLaneRack(lamps);
  return {
    next,
    previous: previous.map(({ lamp, slot }) => {
      // The centre and door-side shades sit to the right of the visitor's
      // lamp in the seated view. Hang their tags from the outer corner.
      const side = ['visitor', 'door-side', 'far-end'].includes(slot.id) ? -1 : 1;
      return { slot, lamp: { ...lamp, rackDisplay: side } };
    }),
  };
}

export function makeBellLaneSavedTag(h, lamp, post, side) {
  return addBellLaneWishTag(h, lamp, post, { side, saved: true });
}

// Earlier lamps have been re-papered at different times. Keep the stored pigment
// and the timber lattice, with soft differences in the reflected paper.
export function finishBellLaneSavedPaper(THREE, lamp, side, finishes) {
  const shell = lamp.children.find(child => child.material?.userData.u?.uGlow);
  const material = shell?.material;
  const source = material?.map;
  if (!source?.image) return;
  if (!finishes.has(side)) {
    const canvas = document.createElement('canvas');
    const { width, height } = source.image;
    canvas.width = width;
    canvas.height = height;
    const paper = canvas.getContext('2d');
    paper.drawImage(source.image, 0, 0);
    const pixels = paper.getImageData(0, 0, width, height);
    const freshPaper = [250, 231, 202];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const k = 4 * (y * width + x);
      if (pixels.data[k] < 115) continue;
      const cellX = x / width, cellY = y / height;
      const repair = side < 0
        ? cellX > .13 && cellX < .30 && cellY > .37 && cellY < .71
        : cellX > .49 && cellX < .78 && cellY > .10 && cellY < .32;
      const age = side < 0 ? 1.02 - .09 * cellY : .93 + .05 * cellY;
      for (let channel = 0; channel < 3; channel++) {
        const old = pixels.data[k + channel];
        pixels.data[k + channel] = repair ? .32 * old + .68 * freshPaper[channel] : old * age;
      }
    }
    paper.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.copy(source);
    texture.source = new THREE.Source(canvas);
    texture.needsUpdate = true;
    finishes.set(side, texture);
  }
  material.map = finishes.get(side);
  material.needsUpdate = true;
}
