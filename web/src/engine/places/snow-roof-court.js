import { loadBakedPlace } from '../baked/loadPlace.js';
import { loadSnowCourtBackdrop } from './snow-court-backdrop.js';
import { buildSnowChimney } from './snow-court-chimney.js';
import { winterCourtWalk, winterCourtEntry, winterCourtEntrySeconds, winterCourtBurnSettle } from './snow-court-camera.js';
import { addSnowCourtGauzeTransmission } from './snow-court-gauze.js';
import { buildSnowDoorDrift, isWinterCourtSnow, tuneWinterCourtSnow } from './snow-court-snow.js';
import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };
import site from '../../../../shared/snow-roof-court-site.json' with { type: 'json' };

const agedGauzeOpacity = new Map([
  ['Sun-faded rose-red gauze', .938],
  ['Faded dusty rose gauze', .950],
  ['Faded iron-red gauze', .958],
  ['Thin gauze over low flame', .924],
]);

function tuneEarlierGauze(material, opacity, sources, THREE, preExposure, fabric) {
  // The open sleeve retains its back-facing cloth at slits and torn lips.
  // A single draw keeps both sides in one pass as the hall comes into view.
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;
  material.opacity = opacity;
  material.map = fabric.weave;
  material.normalMap = fabric.normal;
  material.normalScale.setScalar(.54);
  material.roughnessMap = fabric.roughness;
  material.envMapIntensity = .07;

  // Scatter the light of the two small old wicks across their own cloth.
  // The baked maps already carry the spill on the surrounding timber.
  const lit = material.name === 'Thin gauze over low flame';
  if (lit) material.emissiveIntensity *= .16;
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  const wicks = sources.map(source => new THREE.Vector3(...source.wickTip));
  const candela = sources.map(source => new THREE.Color().fromArray(source.linearColor)
    .multiplyScalar(source.watts * preExposure / (4 * Math.PI)));
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    addSnowCourtGauzeTransmission(shader, 8, true);
    shader.uniforms.uOldWeaveMean = { value: fabric.mean };
    shader.fragmentShader = 'uniform float uOldWeaveMean;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 weave = texture2D(map,vMapUv * vec2(3.2, 1.9)).rgb;
        float thread = dot(weave, vec3(.2126,.7152,.0722)) / uOldWeaveMean;
        diffuseColor.rgb *= clamp(1. + (thread - 1.) * 1.65, .48, 1.34);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = max(roughnessFactor, .88);
      `)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular *= .12;
        reflectedLight.indirectSpecular *= .16;
        reflectedLight.directDiffuse *= ${lit ? '.68' : '.38'};
        reflectedLight.indirectDiffuse *= ${lit ? '.74' : '.51'};
      `);
    if (!lit) return;
    shader.uniforms.uEarlierWick = { value: wicks };
    shader.uniforms.uEarlierCandela = { value: candela };
    shader.fragmentShader = `uniform vec3 uEarlierWick[2], uEarlierCandela[2];\n` + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        for (int j = 0; j < 2; j++) {
          vec3 fromWick = vBakedWorld - uEarlierWick[j];
          float distance2 = dot(fromWick, fromWick);
          float thinCloth = .67 * (1. - smoothstep(.29, .45, sqrt(distance2)));
          vec3 throughThreads = pow(max(diffuseColor.rgb, vec3(0.)), vec3(.56));
          totalEmissiveRadiance += uEarlierCandela[j] * throughThreads
            * thinCloth * (1. - gauzeBamboo * .26) / (3.141593 * max(distance2, .004));
        }`);
  };
  material.customProgramCacheKey = () => key() + (lit ? '-snow-hall-wick-gauze' : '-snow-hall-aged-gauze');
}

export default function createWinterCourt(h) {
  const { THREE, V3 } = h;
  const pose = ({ position, look, fov }) => ({ pos: V3(...position), look: V3(...look), fov });
  const arrival = pose(site.walk.at(-2));
  // Look across the hall from the aisle. The half-open door sits just
  // beyond the visitor's lamp, which stays clear of the chooser controls.
  const lampView = (x, z, bearing, pitch, fov) => {
    const pos = V3(x, 3.65, z);
    const tilt = THREE.MathUtils.degToRad(pitch);
    const yaw = THREE.MathUtils.degToRad(bearing);
    const direction = V3(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), -Math.cos(yaw) * Math.cos(tilt));
    return { pos, look: pos.clone().addScaledVector(direction, 3.5), fov };
  };
  const choiceDesktop = lampView(.75, -7.35, -117.65, -1, 67);
  const choicePhone = lampView(2.19, -8.96, -117.65, -41, 128);
  const lampDesktop = lampView(.75, -7.35, -154, 0, 67);
  const lampPhone = lampView(.16, -7.51, -173, -8, 60);
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
    cameraExposure(camera, light) {
      // Adapt to the much dimmer hall after the bright court. The local
      // gate lift follows the shadow and dies away before the wide reveal.
      const { z } = camera.position;
      const { smoothstep } = THREE.MathUtils;
      const gateZ = site.gate.center[2];
      const gateShade = smoothstep(z, gateZ + 1.55, gateZ + 3.55)
        * (1 - smoothstep(z, gateZ + 5, gateZ + 7.8));
      const hall = smoothstep(-z, -1.75, 1.55);
      const threshold = smoothstep(-z, .8, 2.8) * (1 - smoothstep(-z, 4.3, 5.9));
      const gateEV = THREE.MathUtils.lerp(1.34, .52, light.n);
      const hallEV = THREE.MathUtils.lerp(2.63, .72, light.n);
      return 2 ** (gateEV * gateShade + hallEV * hall + .37 * threshold);
    },
    walk: [], walkSeconds: site.walkSeconds,
    createWalk: (start, _end, phone) => winterCourtWalk(THREE, site, start, phone),
    offerAfterTravel: true,
    entrySeconds: winterCourtEntrySeconds,
    createChooseEntry: (start, end) => winterCourtEntry(THREE, start, end),
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
      const winterSnow = new Set();
      baked.group.traverse(object => {
        if (!object.isMesh) return;
        for (const material of [object.material].flat()) {
          const opacity = agedGauzeOpacity.get(material.name);
          if (opacity !== undefined) earlierCloth.set(material, opacity);
          if (isWinterCourtSnow(material)) winterSnow.add(material);
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
        tuneEarlierGauze(material, opacity, earlierWicks, THREE, baked.cameraPreExposure, h.visitorCloth);
      }
      if (winterSnow.size) {
        const sunlight = V3(...projection.light.day.directionEngine);
        const moonlight = V3(...projection.light.night.directionEngine);
        const lightDirection = V3();
        const lightStrength = { value: 0 };
        const snowTint = new THREE.Color('#e2ebf3');
        const updateCrystals = (_dt, _seconds, light) => {
          lightDirection.lerpVectors(sunlight, moonlight, light.n).normalize();
          lightStrength.value = .76 - .59 * light.n;
        };
        updateCrystals(0, 0, context.light);
        context.up.push(updateCrystals);
        for (const material of winterSnow) tuneWinterCourtSnow(material, snowTint, lightDirection, lightStrength);
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
      const drift = buildSnowDoorDrift({ THREE, renderer: h.renderer, group: context.G }, site.hall.front);
      context.up.push(drift.update);
      context.disposers.push(drift.dispose);
    },
    nook: {
      at: { pos: V3(0, 0, 0), ry: 0 }, lamp: 'gauze', y: 3.54,
      hangingPoint: site.visitorCord, exposure: 1.22, bloom: [.21, 1.22], dust: false,
      gauzeGlow: { base: .42, reach: 8.2 }, winterWeave: true,
      interior: { min: [site.hall.west, site.hall.floor, site.hall.rear],
        max: [site.hall.east, site.hall.eave, site.hall.front] },
      wide: arrival, widePhone: { ...arrival, fov: arrival.fov + 5 },
      steadyIgnition: true,
      createBurnSettle: (start, end) => winterCourtBurnSettle(THREE, site.visitorCord, start, end),
      choose: choiceDesktop, choosePhone: choicePhone,
      burn: lampDesktop, burnPhone: lampPhone,
      build() {},
    },
  };
}
