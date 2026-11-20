import { loadBakedPlace } from '../baked/loadPlace.js';
import { readPineBackdrop, readPineFernDetail, readPineWaxNormal } from '../baked/pineManifest.js';
import { readBakedAsset, readBakedManifest } from '../baked/prefetchPlace.js';
import { preparePineHighTrees } from './pine-gate-high-trees.js';
import { loadPineGateBackdrop } from './pine-gate-backdrop.js';
import { loadPineForestBackdrop, readPineForestBackdrop } from './pine-forest-backdrop.js';
import { createPineGateLife } from './pine-gate-life.js';
import { animatePineCreek } from './pine-creek-water.js';
import { animatePineSpringBasin } from './pine-spring-basin.js';
import { buildPineCrestNeedles } from './pine-crest-needles.js';
import { buildPineRidgeFascicles } from './pine-ridge-fascicles.js';
import { buildPineBankVerge } from './pine-bank-verge.js';
import { dressAncientPineBark } from './pine-ancient-bark.js';
import { dressPineCrestCloth } from './pine-crest-cloth.js';
import { createWishCloth } from './pine-wish-cloth.js';
import { createCandleSlots } from './pine-candle-slots.js';
import { blendInputsAt as pineBlendInputsAt } from './pine-day-parts.ts';
import { dressPineWetTreads } from './pine-wet-treads.js';
import { pineDaySunDirection, pineDaySunDiscEdges } from './pine-gate-sun.js';
import crestNeedleAnchors from './pine-crest-needle-anchors.json' with { type: 'json' };
import path from '../../../../shared/pine-gate-path.json' with { type: 'json' };
import moonlight from '../../../../shared/pine-gate-moonlight.json' with { type: 'json' };

function restoreShrineFixtureFlames(h, context, niche, anchor) {
  const sources = [];
  const bounds = [new h.THREE.Box3(), new h.THREE.Box3()];
  const point = h.V3();
  niche.traverse(object => {
    if (!object.isMesh || object.material.name !== 'Small warm flames in the shoulder fixtures') return;
    sources.push(object);
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      object.localToWorld(point.fromBufferAttribute(positions, index));
      bounds[Number(point.x > anchor[0])].expandByPoint(point);
    }
  });
  // Keep the authored mesh if this package does not contain the two short
  // stubs. The lightmaps still carry their original illumination.
  if (bounds.some(box => box.isEmpty() || box.max.y - box.min.y < .009 || box.max.y - box.min.y > .026
    || Math.max(box.max.x - box.min.x, box.max.z - box.min.z) > .012)) return;
  for (const source of sources) source.visible = false;
  for (const [index, box] of bounds.entries()) {
    box.getCenter(point);
    point.y = box.min.y;
    h.pineFixtureFlame(context, point, box.max.y - box.min.y, 2.2 + index * 2.5);
  }
}

// The old road reaches a sudden break in the forest at a spring on the ridge.
export default function createPlace(h) {
  const { V3, THREE } = h;
  const entrance = path.entrance;
  const { lerp, smoothstep } = THREE.MathUtils;
  function liftAt(seconds, phone) {
    // The wider vertical phone lens already shows more canopy at the entrance.
    const lift = phone ? lerp(.10, .38, smoothstep(seconds, 0, 6)) : .56;
    return lift * (1 - smoothstep(seconds, 6, 12));
  }
  const entranceLook = phone => {
    const aim = V3(...entrance.look);
    aim.y += liftAt(0, phone);
    return aim;
  };
  const nookOrigin = [-1.8, 4, .9];
  const createWalk = (start, end, phone) => {
    const times = [0, ...path.waypoints.map(shot => shot.time), path.seconds];
    const positions = [start.pos.toArray(), ...path.waypoints.map(shot => shot.position), end.pos.toArray()];
    const startLook = start.look.toArray();
    // Add the entrance lift back after interpolation so it fades before the crest.
    startLook[1] -= liftAt(0, phone);
    const looks = [startLook, ...path.waypoints.map(shot => shot.look), end.look.toArray()];
    const fovs = [start.fov, ...path.waypoints.map(shot => phone ? shot.phoneFov : shot.desktopFov), end.fov ?? start.fov];
    const smooth = THREE.InterpolateSmooth;
    const position = new THREE.VectorKeyframeTrack('position', times, positions.flat(), smooth).createInterpolant();
    const look = new THREE.VectorKeyframeTrack('look', times, looks.flat(), smooth).createInterpolant();
    const fov = new THREE.NumberKeyframeTrack('fov', times, fovs, smooth).createInterpolant();
    return (progress, rig) => {
      const at = progress * path.seconds;
      rig.pos.fromArray(position.evaluate(at));
      rig.look.fromArray(look.evaluate(at));
      rig.look.y += liftAt(at, phone);
      rig.fov = fov.evaluate(at)[0];
      rig.amp = 0;
    };
  };
  return {
    bakedLighting: true, exposure: 1.23, shade: .3,
    sky: { top: 0x0a1628, horizon: 0x354b61, ground: 0x263144, sun: 0xe6edf1, dir: moonlight.directionEngine, glow: .22, clouds: .5, lit: 0x394c66, dark: 0x213248, stars: .12, disc: 1.2 },
    fog: [0x4b626a, .024], sunL: [0xc5d4db, .68], hemi: [0x47545c, 0x10150e, .48], bloom: [.22, 1.1],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1.28, sky: { top: 0x6895b9, horizon: 0xc3d5dc, ground: 0xaabdc5, sun: 0xfff4df, dir: pineDaySunDirection, discEdges: pineDaySunDiscEdges, glow: .52, clouds: .16, lit: 0xf9faff, dark: 0xa7bac7 }, fog: [0xb4c8cd, .012], sunL: [0xfff2dc, 2], hemi: [0xc0d0e0, 0x404937, .85], bloom: [.2, 1.3] },
    view: { pos: V3(...entrance.position), look: entranceLook(false), fov: entrance.desktopFov },
    viewPhone: { pos: V3(...entrance.phonePosition), look: entranceLook(true), fov: entrance.phoneFov },
    walkSeconds: path.seconds,
    // Optional per-place lighting override: the scene uses this instead of the shared day keys
    // when a place provides it. Pine Gate needs its own six-part curve; Snow Roof does not.
    lightAt: clock => pineBlendInputsAt(clock),
    walk: [], doors: V3(-.17, 5.58, 6.32), createWalk,
    async build(_place, context) {
      // Start the soft plates and wax normal while the mesh and lightmaps
      // decode. Their regular texture loaders re-use the verified bytes.
      const manifest = await readBakedManifest('pine-gate');
      const softFiles = Object.values(readPineBackdrop(manifest)?.files ?? {});
      const forestDescriptor = readPineForestBackdrop(manifest);
      if (forestDescriptor) softFiles.push(...forestDescriptor.plates.map(({ file }) => file));
      const waxNormal = readPineWaxNormal(manifest);
      if (waxNormal) softFiles.push(waxNormal);
      const fernFile = readPineFernDetail(manifest);
      if (fernFile) softFiles.push(fernFile);
      for (const file of softFiles) void readBakedAsset('pine-gate', file).catch(() => {});
      const baked = await loadBakedPlace('pine-gate', h.renderer, context.light);
      context.G.add(baked.group);
      if (baked.manifest.walkLightmaps) {
        context.up.push(animatePineCreek(baked.group));
        dressPineWetTreads(baked.group);
      }
      const gate = baked.group.children.find(object => object.userData.lightmap_region === 'gate');
      const spring = gate && animatePineSpringBasin(gate);
      if (spring) context.up.push(spring);
      context.baked = baked;
      dressAncientPineBark(baked.group);
      dressPineCrestCloth(baked.group);
      const crest = buildPineCrestNeedles(baked.manifest.geometryFingerprint, crestNeedleAnchors);
      if (crest) {
        context.G.add(crest.group);
        context.disposers.push(crest.dispose);
      }
      const ridge = buildPineRidgeFascicles(baked.group);
      if (ridge) context.disposers.push(ridge.dispose);
      const niche = baked.group.children.find(object => object.userData.lightmap_region === 'niche');
      if (niche) {
        baked.group.updateMatrixWorld(true);
        const shelf = V3(...baked.manifest.lampAnchor);
        const samples = [V3(0, .029, 0), V3(.032, .077, -.027), V3(-.032, .13, .027)]
          .map(point => point.add(shelf));
        const solarRay = new THREE.Raycaster(shelf, V3(0, 1, 0), .001, .9);
        const sunShade = {
          uPineSunDirection: { value: V3(0, 1, 0) },
          uPineSunVisibility: { value: 1 },
        };
        baked.sunShade = sunShade;
        // The baked granite also shelters the live candle. Raycast its actual
        // exported stone when the sun direction changes, with no new shadow map.
        baked.updateWaxSun = direction => {
          sunShade.uPineSunDirection.value.copy(direction);
          let visible = 0;
          for (const point of samples) {
            solarRay.set(point, direction);
            if (!solarRay.intersectObject(niche, true).length) visible++;
          }
          sunShade.uPineSunVisibility.value = visible / samples.length;
        };
      }
      const backdrop = await loadPineGateBackdrop(baked, h.renderer, context.light);
      if (backdrop) {
        baked.backdrop = backdrop;
        context.G.add(backdrop.group);
        context.up.push((_dt, _time, light) => backdrop.update(light));
        context.disposers.push(backdrop.dispose);
      }
      const [forest, fern] = await Promise.all([
        loadPineForestBackdrop(baked, h.renderer, context.light, forestDescriptor),
        fernFile && baked.loadDetailModel(fernFile.uri),
      ]);
      if (forest) {
        baked.approachForest = forest;
        context.G.add(forest.group);
        context.up.push((_dt, _time, light) => forest.update(light));
        context.disposers.push(forest.dispose);
        const verge = buildPineBankVerge(baked.group, fern);
        if (verge) {
          context.G.add(verge.group);
          context.disposers.push(verge.dispose);
        }
      }
      const highTrees = preparePineHighTrees(baked, readPineBackdrop(baked.manifest)?.high?.trees);
      if (highTrees) {
        baked.highTrees = highTrees;
        if (highTrees.base) context.G.add(highTrees.base);
        context.G.add(highTrees.group);
        context.disposers.push(highTrees.dispose);
      }
      if (waxNormal) {
        baked.waxNormal = await baked.loadTexture(waxNormal.uri);
        if (baked.waxNormal.image.width !== 512 || baked.waxNormal.image.height !== 512) throw new Error('Wrong Pine Gate wax normal atlas dimensions');
        h.renderer.initTexture(baked.waxNormal);
        if (niche) restoreShrineFixtureFlames(h, context, niche, baked.manifest.lampAnchor);
      }
      const life = createPineGateLife({
        THREE, group: baked.group, scene: context.G, renderer: h.renderer,
        nichePosition: [nookOrigin[0], nookOrigin[1] + 1, nookOrigin[2]],
        path: [entrance.position, ...path.waypoints.filter(shot => shot.time <= 24).map(shot => shot.position)],
        mistBands: [[-1.1, 31, .65], [.96, 23, .74], [-.86, 15, .70], [.94, 8.1, .86]],
        mistY: 3.8,
      });
      context.up.push((dt, time, daylight) => life.update(dt, time, daylight));
      baked.life = life;
      context.disposers.push(life.dispose);

      // The visitor's red cloth, tied under the candle stand. It lives with the place, not
      // with the lamp, so rebuilding the candle never removes it and both endings keep it.
      // Fixed, authored order of free places on the shrine shelf. The first candle takes the
      // centre, and each later one moves to the next place while the earlier remnant stays.
      // Coordinates are metres in the place group, offset from the lamp anchor.
      const slots = createCandleSlots();
      baked.candleOffset = slots.current;
      baked.takeCandleSlot = slots.take;
      if (import.meta.env.DEV) {
        window.__pineCandleSlot = () => ({ index: slots.index, current: slots.current() });
      }
      // The candle sits at nook-local (0, N.y, 0) and the burn camera looks from +z, so the
      // strip hangs just under the tray's front rim: tied to the stand, and not hidden beneath
      // the tray from the product view.
      // The candle stand sits at the world lamp anchor. Placement here runs before the nook
      // group exists, so the strip is added to the world group and positioned in world metres:
      // just outside the tray's front rim (about 69 mm radius) on the burn camera's side.
      // The strip is authored round the tray in the stand's own frame: the module wraps the
      // tray wall at its measured radius and ties the knot on the burn camera's side, so the
      // group simply sits at the seat.
      const anchor = baked.manifest.lampAnchor;
      const cloth = createWishCloth({
        THREE, anchor: V3(anchor[0], anchor[1], anchor[2]), seed: 3,
      });
      cloth.show(false);
      // The glTF place group is in world metres, the same space as the lamp anchor.
      baked.group.add(cloth.group);
      baked.wishCloth = cloth;
      if (import.meta.env.DEV) {
        // Read by the Tier 1 test: the strip must exist under the candle stand while burning
        // and stay after the ending.
        window.__pineWishCloth = () => {
          // Local to the nook group, which is where the candle stand lives too.
          const anchor = cloth.anchor;
          return {
            visible: cloth.group.visible,
            position: cloth.group.position.toArray(),
            anchor: [anchor.x, anchor.y, anchor.z],
            bbox: (() => {
              cloth.group.updateWorldMatrix(true, true);
              const ribbon = cloth.group.getObjectByName('Visitor wish cloth tied under the candle stand');
              if (!ribbon) return null;
              ribbon.geometry.computeBoundingBox();
              const b = ribbon.geometry.boundingBox.clone().applyMatrix4(ribbon.matrixWorld);
              return { min: b.min.toArray().map(v => +v.toFixed(3)), max: b.max.toArray().map(v => +v.toFixed(3)) };
            })(),
            faces: (() => {
              const ribbon = cloth.group.getObjectByName('Visitor wish cloth tied under the candle stand');
              return ribbon ? { index: ribbon.geometry.index?.count ?? 0, verts: ribbon.geometry.attributes.position?.count ?? 0 } : null;
            })(),
          };
        };
      }
      context.disposers.push(cloth.dispose);
    },

    // The visitor lights the central recess. The right edge opens to the valley.
    nook: {
      at: { pos: V3(...nookOrigin), ry: 0 },
      lamp: 'pineWax', y: 1.0, exposure: 1.1, bloom: [.16, 1.35],
      approach: [V3(1.8, 1.65, 3.8), V3(1.2, 1.65, 2.7)],
      chooseApproach: [V3(.57, 1.55, 1.85), V3(.32, 1.41, 1.05)],
      wide: { pos: V3(.77, 1.49, 1.87), look: V3(.47, .93, -.48), fov: 51 },
      // The close views keep the shelf visible, including the trace after the flame is gone.
      choose: { pos: V3(.13, 1.29, .58), look: V3(.095, 1.075, 0), fov: 31 },
      choosePhone: { pos: V3(.09, 1.25, .56), look: V3(0, .95, 0), fov: 43 },
      // The low eye line keeps the day and night horizon visible through the stone posts.
      burn: { pos: V3(-.055, 1.092, .44), look: V3(0, 1.074, -.045), fov: 34 },
      burnPhone: { pos: V3(-.05, 1.104, .53), look: V3(0, 1.065, -.06), fov: 39 },
      spread: { pos: V3(.17, 1.32, .70), look: V3(.04, 1.10, 0), fov: 39 },
      spreadPhone: { pos: V3(.11, 1.33, .74), look: V3(0, 1.10, 0), fov: 43 },
      async build() {},
    },
  };
}
