import { loadBakedPlace } from '../baked/loadPlace.js';
import { loadSnowCourtBackdrop } from './snow-court-backdrop.js';
import { buildSnowChimney } from './snow-court-chimney.js';
import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };
import site from '../../../../shared/snow-roof-court-site.json' with { type: 'json' };

const agedGauzeOpacity = new Map([
  ['Pink-white sun-faded gauze', .83],
  ['Faded dusty rose gauze', .86],
  ['Faded iron-red gauze', .88],
  ['Thin gauze over low flame', .87],
]);

function tuneEarlierGauze(material, opacity, sources, THREE, preExposure) {
  // Draw the near cloth after the opaque split bamboo. The lower opacity
  // of the worn fabric leaves the actual ribs legible underneath it.
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  material.opacity = opacity;
  material.normalScale.setScalar(.63);
  material.envMapIntensity = .07;
  if (material.name !== 'Thin gauze over low flame') return;

  // Scatter the light of the two small old wicks across their own cloth.
  // The baked maps already carry the spill on the surrounding timber.
  material.emissiveIntensity *= .16;
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  const wicks = sources.map(source => new THREE.Vector3(...source.wickTip));
  const candela = sources.map(source => new THREE.Color().fromArray(source.linearColor)
    .multiplyScalar(source.watts * preExposure / (4 * Math.PI)));
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.uEarlierWick = { value: wicks };
    shader.uniforms.uEarlierCandela = { value: candela };
    shader.fragmentShader = `uniform vec3 uEarlierWick[2], uEarlierCandela[2];\n` + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        for (int j = 0; j < 2; j++) {
          vec3 fromWick = vBakedWorld - uEarlierWick[j];
          float distance2 = dot(fromWick, fromWick);
          float thinCloth = .53 * (1. - smoothstep(.29, .45, sqrt(distance2)));
          totalEmissiveRadiance += uEarlierCandela[j] * diffuseColor.rgb
            * thinCloth / (3.141593 * max(distance2, .004));
        }`);
  };
  material.customProgramCacheKey = () => key() + '-snow-hall-gauze';
}

export default function createWinterCourt(h) {
  const { THREE, V3 } = h;
  const pose = ({ position, look, fov }) => ({ pos: V3(...position), look: V3(...look), fov });
  const arrival = pose(site.walk.at(-1));
  const settledDesktop = pose(site.views.burn);
  // Keep the closest earlier lamp at the edge of the frame. The free cord
  // and the doorway can still be read together in the settled view.
  settledDesktop.pos.set(.20, 3.68, -8.23);
  settledDesktop.look.set(.09, 3.68, -5.83);
  settledDesktop.fov = 37;
  function createWalk(start, _end, phone) {
    const stops = site.walk.map(row => ({ time: row.time, ...pose(row) }));
    stops[0].pos.copy(start.pos);
    stops[0].look.copy(start.look);
    stops[0].fov = start.fov;
    const time = stops.map(row => row.time);
    const movement = new THREE.VectorKeyframeTrack('position', time, stops.flatMap(row => row.pos.toArray()),
      THREE.InterpolateSmooth).createInterpolant();
    const sightline = new THREE.VectorKeyframeTrack('look', time, stops.flatMap(row => row.look.toArray()),
      THREE.InterpolateSmooth).createInterpolant();
    const lens = new THREE.NumberKeyframeTrack('fov', time, stops.map(row => row.fov + (phone && row.time ? 5 : 0)),
      THREE.InterpolateSmooth).createInterpolant();
    return (progress, rig) => {
      const seconds = progress * site.walkSeconds;
      rig.pos.fromArray(movement.evaluate(seconds));
      rig.look.fromArray(sightline.evaluate(seconds));
      rig.fov = lens.evaluate(seconds)[0];
      rig.amp = 0;
    };
  }
  const entrance = pose(site.walk[0]);
  return {
    bakedLighting: true, cameraFar: 880, exposure: 1.11, shade: .55,
    sky: { top: 0x14243c, horizon: 0x59718a, ground: 0x212936, sun: 0xd9eaff,
      dir: projection.light.night.directionEngine, glow: .17, clouds: .04, lit: 0x889ab0,
      dark: 0x394c6c, stars: .075, disc: .64 },
    fog: [0x7c8eae, .0039], sunL: [0xbdd3ff, .32],
    hemi: [0x9aafd2, 0x414354, .59], bloom: [.20, 1.2],
    day: {
      exposure: 1.05,
      sky: { top: 0x6b9dca, horizon: 0xd8e6ef, ground: 0x65788c, sun: 0xffedce,
        dir: projection.light.day.directionEngine, glow: .43, clouds: .05,
        lit: 0xf1f5f9, dark: 0x9ab0bf, disc: 1.3 },
      fog: [0xc5d4dd, .0035], sunL: [0xffeed9, 1.55],
      hemi: [0xdae6f1, 0x575359, .89], bloom: [.18, 1.26],
    },
    view: entrance, viewPhone: { ...entrance, fov: entrance.fov + 5 },
    walk: [], walkSeconds: site.walkSeconds, createWalk,
    offerAfterTravel: true,
    chooseEntry: site.chooseEntry.map(point => V3(...point)),
    doors: V3(...site.gate.center),
    async build(_place, context) {
      const baked = await loadBakedPlace('snow-roof', h.renderer, context.light);
      if (baked.group.userData.snow_court_revision !== site.revision) {
        throw new Error('Snow Roof P1 package and authored court revision disagree.');
      }
      context.G.add(baked.group);
      context.baked = baked;
      const raw = baked.group.userData.snow_court_fixtures_engine;
      const fixtures = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(fixtures) || fixtures.length !== 6) throw new Error('Missing measured Snow Roof court lamp contacts.');
      const earlierWicks = fixtures.filter(fixture => fixture.kind === 'gauze shade' && fixture.lit);
      if (earlierWicks.length !== 2) throw new Error('Expected two earlier wishes with measured wicks.');

      const earlierCloth = new Map();
      baked.group.traverse(object => {
        if (!object.isMesh) return;
        for (const material of [object.material].flat()) {
          const opacity = agedGauzeOpacity.get(material.name);
          if (opacity !== undefined) earlierCloth.set(material, opacity);
          if (material.name === 'Thin pale storm lamp glass') {
            // The thin windscreen shows the flame directly. Avoid a second
            // scene render for screen-space refraction around this small lamp.
            material.transmission = 0;
            material.transparent = true;
            material.opacity = .16;
            material.depthWrite = false;
          }
        }
      });
      for (const [material, opacity] of earlierCloth) {
        tuneEarlierGauze(material, opacity, earlierWicks, THREE, baked.cameraPreExposure);
      }
      const crownUri = baked.manifest.snowCourt.needles;
      if (crownUri !== 'snow-court-needles.glb.zstd') throw new Error('Missing authored Snow Roof needle crowns.');
      const crowns = await baked.loadDetailModel(crownUri);
      context.G.add(crowns);
      for (const fixture of fixtures) {
        if (!fixture.lit) continue;
        const contact = fixture.wickTip;
        if (!Array.isArray(contact) || contact.length !== 3 || !contact.every(Number.isFinite)) {
          throw new Error('Invalid Snow Roof court lamp wick contact.');
        }
        // Earlier gauze lamps glow through the shell. Their flame is inside it.
        if (fixture.kind === 'gauze shade') continue;
        const atGate = fixture.zone === 'gate';
        const flame = h.liveFlame(...contact, { size: atGate ? .77 : .46, radiance: atGate ? .76 : .66, halo: false });
        h.fixtureSpecular(...fixture.pointLight, fixture.watts * baked.cameraPreExposure, fixture.linearColor);
        context.up.push(() => { flame.power = .66 + .26 * baked.fixturePower(); });
      }
      const backdrop = await loadSnowCourtBackdrop(baked, h.renderer, context.light);
      if (!backdrop) throw new Error('Missing Snow Roof court backdrop.');
      baked.backdrop = backdrop;
      context.G.add(backdrop.group);
      context.up.push((_dt, _time, light) => backdrop.update(light));
      context.disposers.push(backdrop.dispose);
      const outlet = baked.group.userData.snow_court_smoke_engine;
      if (outlet) {
        const origin = typeof outlet === 'string' ? JSON.parse(outlet) : outlet;
        if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) {
          throw new Error('Invalid authored Snow Roof chimney outlet.');
        }
        const smoke = buildSnowChimney({ THREE, renderer: h.renderer, group: context.G }, origin);
        context.up.push(smoke.update);
        context.disposers.push(smoke.dispose);
      }
      h.fall({ n: 1150, at: [.2, 6.1, 26.4], box: [32, 12, 60], color: 0xe5eef6,
        size: .022, vy: .43, sway: .31, opacity: .58, softEdges: true });
      h.fall({ n: 96, at: [.9, 3.03, -2.2], box: [5.1, 2.9, 2.65], color: 0xe7eeff,
        size: .017, vy: .29, sway: .42, wind: -.31, opacity: .78, softEdges: true });
    },
    nook: {
      at: { pos: V3(0, 0, 0), ry: 0 }, lamp: 'gauze', y: 3.54,
      hangingPoint: site.visitorCord, exposure: 1.22, bloom: [.21, 1.22], dust: false,
      gauzeGlow: { base: .42, reach: 8.2 }, winterWeave: true,
      interior: { min: [site.hall.west, site.hall.floor, site.hall.rear],
        max: [site.hall.east, site.hall.eave, site.hall.front] },
      wide: arrival, widePhone: { ...arrival, fov: arrival.fov + 5 },
      choose: pose(site.views.choose),
      choosePhone: { pos: V3(-2, 3.65, -5.35), look: V3(...site.views.choose.look), fov: 54 },
      spread: pose(site.views.burn), spreadPhone: pose(site.views.burnPhone),
      burn: settledDesktop, burnPhone: pose(site.views.burnPhone),
      burnWalk: [V3(-1.87, 3.64, -5.14), V3(-2.05, 3.65, -6.5), V3(-1.78, 3.67, -7.59)],
      burnWalkPhone: [V3(-2.04, 3.6, -6.48), V3(-1.91, 3.64, -7.61)],
      build() {},
    },
  };
}
