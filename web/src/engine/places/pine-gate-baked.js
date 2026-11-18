import { loadBakedPlace } from '../baked/loadPlace.js';
import { createPineGateVista } from './pine-gate-vista.js';
import path from '../../../../shared/pine-gate-path.json';

// The old road reaches a sudden break in the forest at a spring on the ridge.
export default function createPlace(h) {
  const { V3, THREE } = h;
  const entrance = path.entrance;
  const nookOrigin = [-1.8, 4, .9];
  const createWalk = (start, end, phone) => {
    const times = [0, ...path.waypoints.map(shot => shot.time), path.seconds];
    const positions = [start.pos.toArray(), ...path.waypoints.map(shot => shot.position), end.pos.toArray()];
    const looks = [start.look.toArray(), ...path.waypoints.map(shot => shot.look), end.look.toArray()];
    const fovs = [start.fov, ...path.waypoints.map(shot => phone ? shot.phoneFov : shot.desktopFov), end.fov ?? start.fov];
    const smooth = THREE.InterpolateSmooth;
    const position = new THREE.VectorKeyframeTrack('position', times, positions.flat(), smooth).createInterpolant();
    const look = new THREE.VectorKeyframeTrack('look', times, looks.flat(), smooth).createInterpolant();
    const fov = new THREE.NumberKeyframeTrack('fov', times, fovs, smooth).createInterpolant();
    return (progress, rig) => {
      const at = progress * path.seconds;
      rig.pos.fromArray(position.evaluate(at));
      rig.look.fromArray(look.evaluate(at));
      rig.fov = fov.evaluate(at)[0];
      rig.amp = 0;
    };
  };
  return {
    bakedLighting: true, exposure: 1, shade: .3,
    sky: { top: 0x0c121b, horizon: 0x364653, ground: 0x0c0f10, sun: 0xd8e2e6, dir: [.6, .3, -1], glow: .2, clouds: .62, lit: 0x506070, dark: 0x182127, stars: .2, disc: 1.2 },
    fog: [0x344951, .031], sunL: [0xc5d4db, .68], hemi: [0x47545c, 0x10150e, .48], bloom: [.25, 1.1],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x587090, horizon: 0xdadee2, ground: 0xc8ccd2, sun: 0xfff4e0, dir: [.6, .3, -1], glow: .6, clouds: .35, lit: 0xffffff, dark: 0xa8b0bc }, fog: [0xc6ced6, .0055], sunL: [0xfff2dc, 2], hemi: [0xc0d0e0, 0x384030, .85], bloom: [.2, 1.3] },
    view: { pos: V3(...entrance.position), look: V3(...entrance.look), fov: entrance.desktopFov },
    viewPhone: { pos: V3(...entrance.phonePosition), look: V3(...entrance.look), fov: entrance.phoneFov },
    walkSeconds: path.seconds,
    walk: [], doors: V3(-.17, 5.58, 6.32), createWalk,
    async build(_place, context) {
      const baked = await loadBakedPlace('pine-gate', h.renderer, context.light);
      context.G.add(baked.group);
      context.baked = baked;
      const vista = createPineGateVista(context.light);
      context.G.add(vista.group);
      context.up.push((_, time, light) => vista.update(time, light));
      context.disposers.push(vista.dispose);
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
      burn: { pos: V3(.24, 1.16, .38), look: V3(.12, 1.074, -.045), fov: 34 },
      burnPhone: { pos: V3(.20, 1.20, .46), look: V3(.070, 1.065, -.06), fov: 39 },
      spread: { pos: V3(.17, 1.32, .70), look: V3(.04, 1.10, 0), fov: 39 },
      spreadPhone: { pos: V3(.11, 1.33, .74), look: V3(0, 1.10, 0), fov: 43 },
      async build() {},
    },
  };
}
