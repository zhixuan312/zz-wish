import { loadBakedPlace } from '../baked/loadPlace.js';
import { createPineGateLife } from './pine-gate-life.js';

// Pine Gate Steps: a long flight of stone steps between tall pines, the mountain gate half hidden at the top.
// The lamp is a small candle in a stone niche cut into the gate pier, lighting the last few steps.
export default function createPlace(h) {
  const { V3 } = h;
  return {
    bakedLighting: true, exposure: 1, shade: .3,
    sky: { top: 0x0c121b, horizon: 0x364653, ground: 0x0c0f10, sun: 0xd8e2e6, dir: [.6, .3, -1], glow: .2, clouds: .62, lit: 0x506070, dark: 0x182127, stars: .2, disc: 1.2 },
    fog: [0x273843, .013], sunL: [0xc5d4db, .68], hemi: [0x47545c, 0x10150e, .48], bloom: [.25, 1.1],
    // The same place by day; the scene blends toward it by the visitor's local time.
    day: { exposure: 1, sky: { top: 0x587090, horizon: 0xdadee2, ground: 0xc8ccd2, sun: 0xfff4e0, dir: [.6, .3, -1], glow: .6, clouds: .35, lit: 0xffffff, dark: 0xa8b0bc }, fog: [0xc6ced6, .0055], sunL: [0xfff2dc, 2], hemi: [0xc0d0e0, 0x384030, .85], bloom: [.2, 1.3] },
    // Start between the trunks with several flights still ahead. The gate
    // and its guide are visible above the controls in both aspect ratios.
    view: { pos: V3(.97, 2.96, 33.7), look: V3(-.12, 4.55, 1), fov: 30 },
    viewPhone: { pos: V3(.62, 2.91, 34.05), look: V3(-.11, 4.42, 1), fov: 40 },
    walkSeconds: 30,
    walk: [V3(.30, 3.34, 29.5), V3(-.08, 3.90, 24), V3(.12, 4.70, 16), V3(.10, 5.65, 6)], doors: V3(-.3, 5.6, .8),
    async build(_place, context) {
      const baked = await loadBakedPlace('pine-gate', h.renderer, context.light);
      context.G.add(baked.group);
      context.baked = baked;
      // Living atmosphere rides on the place's own frame update: the engine calls
      // baked.update once per frame, so wrapping it keeps scene.js untouched.
      const life = createPineGateLife({
        THREE: h.THREE, group: baked.group, scene: context.G, renderer: h.renderer,

      });
      // baked.update carries no frame delta, so the wrapper keeps its own clock.
      const bakedUpdate = baked.update;
      let lastMs = performance.now(), lifeTime = 0;
      baked.update = function update(light, lampPower, lampPosition) {
        bakedUpdate.call(baked, light, lampPower, lampPosition);
        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0, (now - lastMs) / 1000));
        lastMs = now;
        lifeTime += dt;
        life.update(dt, lifeTime);
      };
      baked.life = life;
      context.disposers.push(() => { life.dispose(); });
    },

    // The gate pier at the top of the steps: a niche cut in the stone, the red gate leaf half open beside it.
    nook: {
      at: { pos: V3(-1.8, 4, .9), ry: 0 },
      lamp: 'pineWax', y: 1.0, exposure: 1.1, bloom: [.16, 1.35],
      approach: [V3(1.8, 1.65, 3.8), V3(1.2, 1.65, 2.7)],
      chooseApproach: [V3(.57, 1.55, 1.85), V3(.32, 1.41, 1.05)],
      wide: { pos: V3(.62, 1.62, 2.5), look: V3(.15, 1.22, 0) },
      // The close views keep the shelf visible, including the trace after the flame is gone.
      choose: { pos: V3(.13, 1.29, .58), look: V3(.095, 1.075, 0), fov: 31 },
      choosePhone: { pos: V3(.09, 1.25, .56), look: V3(0, .95, 0), fov: 43 },
      burn: { pos: V3(.095, 1.24, .43), look: V3(.025, 1.075, 0), fov: 34 },
      burnPhone: { pos: V3(.085, 1.26, .53), look: V3(.005, 1.060, 0), fov: 40 },
      spread: { pos: V3(.17, 1.32, .70), look: V3(.04, 1.10, 0), fov: 39 },
      spreadPhone: { pos: V3(.11, 1.33, .74), look: V3(0, 1.10, 0), fov: 43 },
      async build() {},
    },
  };
}
