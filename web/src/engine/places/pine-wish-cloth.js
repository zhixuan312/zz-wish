// The visitor's red cloth strip, tied round the candle tray when the lamp is lit.
// It carries no text: the wish stays with the visitor. It stays through the burn, the
// burnt-down ending and the put-out ending, becoming part of the shrine like the older wax.
//
// The visible strip is the modelled asset from `art/blender/pine_visitor_cloth.py`, a settled
// double-sided woven ribbon with a real knot and two tails. Its origin is the stone surface at
// the lamp anchor, +Z faces the burning camera, and it is authored round the runtime tray at that
// tray's own radius, so it needs no rescaling: the baked mesh already clears the wall.
//
// All coordinates are metres relative to the lamp anchor, which is the stone surface.
import { Vector3 as V3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const CLOTH_URL = '/places/pine-gate/pine-visitor-cloth.glb';
export const CLOTH_MESH_NAME = 'One palm-width length of coarse red cloth';

// The tray's outer wall, straight from createPineTray's lathe profile: [radius, y].
export const TRAY_PROFILE = Object.freeze([
  [.038, 0], [.042, .001], [.045, .0035], [.052, .006],
  [.057, .0105], [.058, .014], [.0565, .0165], [.054, .017],
]);

/** The tray's outer radius at height y, linearly interpolated through the lathe profile. */
export function wallRadius(y) {
  const profile = TRAY_PROFILE;
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return profile.at(-1)[0];
}

// The strip exists from the moment the place loads, but is tied on only when the lamp is lit,
// and it is never taken away afterwards: both endings leave it in place.
export function wishClothVisible(lit) {
  return lit === true;
}

// Load the modelled strip. The group is placed at the lamp anchor and hidden until the lamp is
// lit; the caller may show it before the fetch settles, and the mesh appears when it arrives.
export function createWishCloth({ THREE, anchor, url = CLOTH_URL, loader = new GLTFLoader() }) {
  const group = new THREE.Group();
  // The anchor is the stone surface; the cloth is authored in this frame already.
  group.position.set(anchor.x, anchor.y, anchor.z);
  // Hidden until the lamp is lit; see wishClothVisible and the ignite path in scene.js.
  group.visible = false;
  group.name = 'Visitor wish cloth tied under the candle stand';

  const resources = [];
  let mesh = null;
  let settled = false;

  const ready = loader.loadAsync(url).then(gltf => {
    const source = gltf.scene;
    source.traverse(object => {
      if (!object.isMesh) return;
      mesh = object;
      object.castShadow = true;
      object.receiveShadow = true;
      object.name = CLOTH_MESH_NAME;
      const material = object.material;
      // The asset is delivered with a dark red base colour and a white sheen. Under the bright
      // stone ledge that sheen washes the dye out to pink, so it is held to a fraction and tinted
      // with the dye: a dyed cotton cloth keeps its colour in full sun.
      if (material) {
        material.side = THREE.DoubleSide;
        if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
        // The delivered weave is strong enough that its ridges read as stripes on a tail seen close
        // up. Keep the weave but soften it, so it reads as cloth rather than corduroy.
        if (material.normalScale) material.normalScale.setScalar(.42);
        if (material.normalMap) {
          material.normalMap.repeat.set(2.4, 2.4);
          material.normalMap.wrapS = material.normalMap.wrapT = THREE.RepeatWrapping;
          material.normalMap.needsUpdate = true;
        }
        if (material.sheen !== undefined) material.sheen = .28;
        if (material.sheenColor) material.sheenColor.setRGB(.34, .012, .018);
        material.envMapIntensity = .32;
        material.roughness = .92;
      }
      if (object.geometry) resources.push(object.geometry);
      for (const item of [material].flat()) if (item) resources.push(item);
    });
    group.add(source);
  }).catch(error => {
    // A missing strip must not take the place down: the wish still reaches the shrine.
    console.warn('Visitor cloth failed to load:', error);
  }).finally(() => { settled = true; });

  return {
    group,
    anchor: anchor.clone(),
    ready,
    /** True once the fetch has finished, whether it succeeded or failed. */
    settled() { return settled; },
    /** The loaded mesh, or null until the asset arrives. */
    get mesh() { return mesh; },
    update() { /* A settled cloth on a tray does not move. */ },
    /**
     * Follow the live tray. The asset is authored round the nominal tray wall, so when the runtime
     * holder is scaled in X and Z the cloth must take the same scale or it hangs off the wall.
     */
    setTrayScale(scale) {
      const value = Number.isFinite(scale) && scale > 0 ? scale : 1;
      group.scale.set(value, 1, value);
    },
    /**
     * Light the strip as the older wax stubs are lit: nothing of its own, just the candle. `lit` is
     * how much the visitor's own flame is giving, so a tail away from the flame stays darker.
     */
    setLight({ own = 0, ambient = 1 } = {}) {
      if (!mesh) return;
      const material = mesh.material;
      if (!material) return;
      // The strip must never read brighter than the stone beside it: at night it is candle-lit only.
      material.envMapIntensity = .06 + .26 * ambient;
      material.color?.setRGB?.((.39) * .82 + .05 * own, (.015) * .82, (.023) * .82);
    },
    show(lit) { group.visible = wishClothVisible(lit); },
    worldPosition() { return group.getWorldPosition(new V3()); },
    dispose() {
      for (const item of resources) item.dispose?.();
      group.clear();
    },
  };
}
