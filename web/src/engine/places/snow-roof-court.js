import { loadBakedPlace } from '../baked/loadPlace.js';
import { loadSnowCourtBackdrop } from './snow-court-backdrop.js';
import { buildSnowChimney } from './snow-court-chimney.js';
import { winterCourtWalk, winterCourtEntry, winterCourtEntrySeconds, winterCourtBurnSettle } from './snow-court-camera.js';
import { isEarlierGauze, tieVisitorWishTag, tuneEarlierGauze } from './snow-court-gauze.js';
import { buildSnowDoorDrift, isWinterCourtSnow, tuneWinterCourtSnow } from './snow-court-snow.js';
import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };
import site from '../../../../shared/snow-roof-court-site.json' with { type: 'json' };

function tuneHallLimewash(material, floor) {
  const baseShader = material.onBeforeCompile.bind(material);
  const baseKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = shader => {
    baseShader(shader);
    // The reference is the midpoint of the measured dark and adjacent
    // plaster medians for each Cycles diffuse pass. Spread that bounce
    // into the high limewash, retaining the contact at the wall foot.
    shader.fragmentShader = shader.fragmentShader.replace('float away=', `
      vec3 roomBounce = uBakedWeights.x * vec3(.0802, .0670, .0562)
                      + uBakedWeights.y * vec3(.0773, .0661, .0563)
                      + uBakedWeights.z * vec3(.1023, .0882, .0706);
      float bouncedPlaster = .76 * smoothstep(.16, .64, vBakedWorld.y - ${floor.toFixed(3)});
      baked = mix(baked, roomBounce, bouncedPlaster);
      float away=`);
  };
  material.customProgramCacheKey = () => baseKey() + '-hall-limewash';
}

function tuneAltarFigure(material) {
  const baseShader = material.onBeforeCompile.bind(material);
  const baseKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = shader => {
    baseShader(shader);
    // The small altar atlas undersamples diffuse light across the carving.
    // Restore the broad paper-window bounce using the incoming direction
    // in hall space and the continuous vertex normals of the sculpture.
    // The darker stone needs stronger night window bounce to keep the
    // carving readable while retaining the unlit sides and the day look.
    shader.fragmentShader = shader.fragmentShader.replace('float away=', `
      vec3 stoneNormal = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
      float windowBounce = max(0., dot(stoneNormal, normalize(vec3(.53, .72, .62))));
      vec3 stoneFill = uBakedWeights.x * vec3(.031, .028, .026)
                     + uBakedWeights.y * vec3(.022, .019, .017)
                     + uBakedWeights.z * vec3(.029, .027, .024);
      vec3 stoneKey = uBakedWeights.x * vec3(.157, .137, .112)
                    + uBakedWeights.y * vec3(.102, .086, .069)
                    + uBakedWeights.z * vec3(.119, .111, .100);
      baked = mix(baked, stoneFill + stoneKey * windowBounce, .97);
      float away=`);
  };
  material.customProgramCacheKey = () => baseKey() + '-altar-figure';
}

function tuneRepairedEave(material) {
  const baseShader = material.onBeforeCompile.bind(material);
  const baseKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = shader => {
    baseShader(shader);
    // Reflected light from the courtyard snow reaches the undercut clay lips.
    shader.fragmentShader = shader.fragmentShader.replace('float away=', `
      vec3 tileNormal = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
      float towardSnow = max(0., dot(tileNormal, normalize(vec3(0., -.66, .75))));
      vec3 snowBounce = vec3(.78, .87, 1.) * dot(uBakedWeights, vec3(.115, .125, .232));
      baked += snowBounce * (.55 + .45 * towardSnow);
      float away=`);
  };
  material.customProgramCacheKey = () => baseKey() + '-mended-eave';
}

export default function createWinterCourt(h) {
  const { THREE, V3 } = h;
  const pose = ({ position, look, fov }) => ({ pos: V3(...position), look: V3(...look), fov });
  const arrival = pose(site.walk.at(-2));
  // Look across the hall from the aisle. The half-open door sits just
  // beyond the visitor's lamp, which stays clear of the chooser controls.
  const lampView = (x, z, bearing, pitch, fov, eye = 3.65) => {
    const pos = V3(x, eye, z);
    const tilt = THREE.MathUtils.degToRad(pitch);
    const yaw = THREE.MathUtils.degToRad(bearing);
    const direction = V3(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), -Math.cos(yaw) * Math.cos(tilt));
    return { pos, look: pos.clone().addScaledVector(direction, 3.5), fov };
  };
  const choicePhone = lampView(1.048, -7.52, -139.7, -17.5, 69, 3.71);
  const lampDesktop = lampView(.20, -7.425, -177.8, 9, 72, 3.53);
  const lampPhone = lampView(.03, -7.40, -180, -8, 69);
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
    createChooseEntry: (start, end, phone) => winterCourtEntry(THREE, start, end, phone),
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

      const earlierCloth = new Set();
      const winterSnow = new Set();
      const limewash = new Set();
      const altarFigure = new Set();
      const repairedEave = new Set();
      baked.group.traverse(object => {
        if (!object.isMesh) return;
        const region = object.userData.lightmap_region ?? object.userData.region ?? object.parent?.userData.lightmap_region;
        for (const material of [object.material].flat()) {
          if (isEarlierGauze(material)) earlierCloth.add(material);
          if (isWinterCourtSnow(material)) winterSnow.add(material);
          if (/^Worn hall limewash, (east|west) wall$/.test(material.name)) limewash.add(material);
          if (material.name === 'Matte weathered stone of the seated Buddha') altarFigure.add(material);
          if (region === 'hall' && material.name === 'Greyer clay of the replaced eave tiles') repairedEave.add(material);
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
      for (const material of altarFigure) tuneAltarFigure(material);
      for (const material of limewash) tuneHallLimewash(material, site.hall.floor);
      for (const material of repairedEave) tuneRepairedEave(material);
      for (const material of earlierCloth) {
        tuneEarlierGauze(material, earlierWicks, THREE, baked.cameraPreExposure, h.visitorCloth);
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
        // Keep the oil flame above the metal rim at walk distance. The
        // veranda flame also has to read through its backlit windscreen.
        const flameAppearance = fixture.kind === 'storm lantern' ? { size: 1.12, radiance: .98 }
          : fixture.zone === 'gate' ? { size: 1.15, radiance: .92 }
          : { size: .94, radiance: .90 };
        const flame = h.liveFlame(...contact, { ...flameAppearance, halo: false });
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
      decorateVisitorLantern: (parts, grain) => tieVisitorWishTag(THREE, parts, grain),
      interior: { min: [site.hall.west, site.hall.floor, site.hall.rear],
        max: [site.hall.east, site.hall.eave, site.hall.front] },
      wide: arrival, widePhone: { ...arrival, fov: arrival.fov + 5 },
      steadyIgnition: true, settleSecondsPhone: 14,
      createBurnSettle: (start, end) => winterCourtBurnSettle(THREE, site.visitorCord, start, end),
      choose: lampDesktop, choosePhone: choicePhone,
      burn: lampDesktop, burnPhone: lampPhone,
      build() {},
    },
  };
}
