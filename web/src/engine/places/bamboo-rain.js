// A tiled shelter at the edge of a wet bamboo court.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARRIVAL_SECONDS, WALK_SECONDS, bambooRainCameras } from './bamboo-rain-camera.js';

const cloister = {
  start: -4.65,
  end: 4.45,
  eaveY: 2.72,
  eaveZ: 2.11,
  waterY: -.447,
  bedY: -.487,
  channel: [1.95, 2.28],
  banks: [1.64, 2.46],
  crossing: { center: -3.65, width: 1.44 },
};

function cutChannelThroughGround(THREE, terrain, nook) {
  const size = 1600;
  const half = size / 2;
  const outline = new THREE.Shape([[-half, -half], [half, -half], [half, half], [-half, half]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  const { start, end, banks: [near, far] } = cloister;
  // The nook faces the court along world +X. Terrain's horizontal coordinate maps to world -Z.
  outline.holes.push(new THREE.Path([[near, start], [near, end], [far, end], [far, start]]
    .map(([z, x]) => new THREE.Vector2(nook.pos.x + z, x - nook.pos.z))));
  const geometry = new THREE.ShapeGeometry(outline);
  const { position, uv } = geometry.attributes;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, position.getX(i) / size + .5, position.getY(i) / size + .5);
  }
  terrain.geometry.dispose();
  terrain.geometry = geometry;
}

function layChannelBank(THREE, G, name, profile, tones, offset) {
  const { start, end, bedY } = cloister;
  const lengths = [.47, .66, .55, .78, .44, .61, .53];
  const weathering = [0, -.007, .006, -.010, .002, .009, -.004];
  const batches = tones.map(() => []);
  const bevel = .008;
  const bank = new THREE.Group();
  bank.name = name;
  for (let x = start, i = offset; x < end; i++) {
    const stoneLength = lengths[i % lengths.length];
    const span = end - x < stoneLength + .10 ? end - x : stoneLength;
    const wear = weathering[i % weathering.length];
    const section = new THREE.Shape(profile.map(([z, y]) =>
      new THREE.Vector2(-z, y + wear * Math.max(0, (y - bedY) / .25))));
    const stone = new THREE.ExtrudeGeometry(section, {
      depth: span - 4 * bevel,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 1,
    });
    stone.rotateY(Math.PI / 2);
    stone.translate(x + 2 * bevel, 0, 0);
    batches[i % tones.length].push(stone);
    x += span;
  }
  for (const [i, stones] of batches.entries()) {
    const stonework = new THREE.Mesh(mergeGeometries(stones), tones[i]);
    stonework.castShadow = true;
    stonework.receiveShadow = true;
    bank.add(stonework);
    for (const stone of stones) stone.dispose();
  }
  G.add(bank);
}

function buildChannel({ THREE, M, water, pavingTex }, { G }) {
  const { start, end, bedY, waterY, banks: [near, far], channel: [inner, outer] } = cloister;
  const length = end - start;
  const middle = (start + end) / 2;
  const floor = M(0x2b332a, .88, { map: pavingTex });
  const invert = new THREE.Mesh(new THREE.BoxGeometry(length, .064, far - near), floor);
  invert.name = 'Bamboo Rain drain invert';
  invert.position.set(middle, bedY - .032, (near + far) / 2);
  invert.receiveShadow = true;
  G.add(invert);
  const nearStones = [0x565342, 0x676252, 0x515647].map(color => M(color, .84, { map: pavingTex }));
  const courtStones = [0x6d6757, 0x706a61, 0x646355].map(color => M(color, .91, { map: pavingTex }));
  // The shaded side is a worn slope. The court's proud stone ends expose a deeper face.
  layChannelBank(THREE, G, 'Bamboo Rain inner bank', [
    [1.635, -.188], [1.690, -.202], [1.747, -.261], [1.824, -.321], [1.926, -.387],
    [2.00, bedY], [1.635, bedY],
  ], nearStones, 0);
  layChannelBank(THREE, G, 'Bamboo Rain court bank', [
    [2.272, bedY], [2.333, -.433], [2.356, -.375], [2.398, -.352],
    [2.463, -.341], [2.52, -.356], [2.52, bedY],
  ], courtStones, 3);

  const stream = water(waterY, 0x3b5045, {
    x: middle, z: (inner + outer) / 2,
    geo: new THREE.PlaneGeometry(length, outer - inner),
    rough: .43, waves: .09, env: .23,
  });
  stream.material.clearcoat = .02;
  stream.material.specularIntensity = .15;
  stream.material.transparent = true;
  stream.material.opacity = .68;
  stream.material.depthWrite = false;
  stream.name = 'Bamboo Rain channel water';
  stream.receiveShadow = true;
  stream.renderOrder = 1;
}

function buildCloister(h) {
  const { THREE, M, box, put, col, eave, otherLamp, plasterTex, grainTex, pavingTex } = h;
  const { G, up, rnd } = h.context;
  const { start, end, eaveY, eaveZ, waterY, channel, crossing } = cloister;
  const length = end - start;
  const middle = (start + end) / 2;
  const timber = M(0x4a3829, .75, { map: grainTex });
  const board = M(0x634a34, .69, { map: grainTex });
  const post = M(0x583729, .66, { map: grainTex });
  const white = M(0xd7d2c4, .93, { map: plasterTex });
  const dressedStone = M(0x6d6b60, .82, { map: pavingTex });
  const wetStone = M(0x444a47, .28, { map: pavingTex });

  box(length, 3.08, .24, white, middle, 1.54, -.50);
  box(length, .36, .29, dressedStone, middle, .18, -.49);
  box(length, .18, 1.96, dressedStone, middle, -.09, .535);
  // The lower stone apron lets the seated visitor see the water below the dry edge.
  box(length, .35, .12, dressedStone, middle, -.175, 1.475);
  box(length, .145, .145, wetStone, middle, -.2525, 1.60);
  for (const x of [-4.55, 3.10]) col(x, 1.32, 2.48, .115, post);
  box(length, .16, .21, timber, middle, 2.54, 1.32);
  eave({ x0: start, x1: end, y: eaveY, z: eaveZ, depth: eaveZ + .72, rise: .64, tile: 0x3d4442 });

  // The visitor's cup rests directly on the sill. The extra width leaves a usable dry edge.
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(4.18, .056, .48), board);
  shelf.name = 'Bamboo Rain dry shelf';
  shelf.position.set(-.12, .882, -.09);
  G.add(shelf);
  box(4.14, .055, .055, timber, -.12, .856, .14);
  for (const x of [-1.91, -.68, .62, 1.71]) {
    box(.07, .30, .11, timber, x, .71, -.25);
    const brace = new THREE.BoxGeometry(.055, .33, .055).rotateX(.71);
    put(brace, timber, x, .755, -.13);
  }
  // The old cups continue away from the seat, leaving the visitor's cup in front.
  for (const x of [-1.94, .53, .84, 1.16, 1.47, 1.77]) {
    const glowing = x === .84 || x === 1.47;
    otherLamp('celadon', x, .91, -.15, glowing ? .12 : .005, 0, glowing ? .23 : 0);
  }

  buildChannel(h, h.context);

  const { center, width } = crossing;
  box(width, .085, .70, dressedStone, center, -.14, 1.886);
  box(width, .062, .15, dressedStone, center, -.071, 1.54);
  // Leave a full eye-height margin as the bridge is approached from the side.
  box(width + .12, .11, .54, dressedStone, center, -.2525, 2.44);
  box(width + .12, .079, .42, dressedStone, center, -.319, 2.84);
  for (const x of [center - width / 2 + .07, center + width / 2 - .07]) {
    for (const [top, z] of [[-.093, 1.76], [-.195, 2.19]]) {
      box(.14, top - cloister.bedY, .17, wetStone, x, (top + cloister.bedY) / 2, z);
    }
  }

  // The source positions follow the drip tips generated by eave(). The bridge interrupts the row.
  const sources = [];
  for (let column = 0; start + .2 + column * .2 < end; column += 3) {
    const x = start + .2 + column * .2;
    if (Math.abs(x - center) > width / 2 + .10) sources.push([x, eaveY + .08, eaveZ + .03]);
  }
  addBambooStorm({ THREE, G, up, rnd }, {
    runoff: { sources, surfaceY: waterY, channel: { x: [start, end], z: channel } },
  });
}

export default function createPlace(h) {
  const { THREE, V3, M, roofMat, ground, pave, hallB, gateB, trees, peak, ridges, box, put, wallRun, col, otherLamp, rock, plasterTex, grainTex, pavingTex, pauseBuild } = h;
  const nook = { pos: V3(-9.3, .35, 6), ry: Math.PI / 2 };
  const cameras = bambooRainCameras(V3, nook);
  return {
    exposure: 1.22, shade: .34,
    sky: {
      top: 0x141d28, horizon: 0x3b494e, ground: 0x131b18, sun: 0xd2e2e6, dir: [.5, .4, -1],
      glow: .05, clouds: .85, lit: 0x43525b, dark: 0x19252d, stars: 0, disc: 0,
    },
    fog: [0x394a4c, .018], sunL: [0xc8d6dc, .44], hemi: [0x465c61, 0x24352d, .60], bloom: [.53, .9],
    day: {
      exposure: 1.08,
      sky: {
        top: 0x788d94, horizon: 0xc6ceca, ground: 0x526b59, sun: 0xe6efeb, dir: [.5, .56, -1],
        glow: .06, clouds: .88, lit: 0xb1c0c1, dark: 0x798b91, disc: 0,
      },
      fog: [0xa7b8b0, .016], sunL: [0xd3ded9, 1.04], hemi: [0xc3d5d4, 0x61795d, 1.04], bloom: [.34, 1.2],
    },
    verticalCameraDrift: 0,
    view: cameras.view, viewPhone: cameras.viewPhone,
    walk: [], doors: V3(0, 1.6, 18),
    walkSeconds: WALK_SECONDS, createWalk: cameras.createWalk,
    arrivalSeconds: ARRIVAL_SECONDS, createArrival: cameras.createArrival,

    async build() {
      const C = h.context;
      const white = M(0xd7d1bf, .95, { map: plasterTex });
      const tile = roofMat(0x3d4543);
      const stone = M(0x535b55, .32, { map: pavingTex });
      const wood = M(0x44352b, .82, { map: grainTex });

      cutChannelThroughGround(THREE, ground(0x283b30, { y: -.013 }), nook);
      pave(0, 26.95, 3.55, 22.1, -.12, stone);
      // Stop the paving and open-air rain at the court side of the cut.
      const west = nook.pos.x + cloister.banks[1];
      const east = 7.83;
      pave((west + east) / 2, 5.3, east - west, 21.2, -.12, stone);
      gateB({ z: 18, w: 7, h: 3.7, wall: white, roof: tile, lift: .22 });
      wallRun(-11, 18, -3.5, 18, 2.8, white, tile);
      wallRun(3.5, 18, 11, 18, 2.8, white, tile);
      wallRun(10, 18, 10, -9, 2.8, white, tile);
      wallRun(-10, 18, -10, -9, 2.8, white, tile);
      wallRun(-10, -5.6, -6.9, -5.6, 2.35, white, tile);
      pave(-8.57, -2.05, 3.16, 7.1, -.122, stone);
      hallB({ z: -8, w: 15, d: 5, h: 3, wall: white, roof: tile, base: .3, lift: .2, glow: .18 });

      box(2.7, .35, 19, stone, 8.3, .175, 4);
      box(.45, .06, 17, wood, 9.3, .85, 4);
      for (const z of [-3, 1, 5, 9, 12]) box(.08, .5, .08, wood, 9.35, .57, z);
      for (let z = -3; z <= 12; z += 3) {
        col(6.9, z, 2.7, .12, wood, .35);
        box(2.8, .18, .14, wood, 8.1, 3.03, z);
      }
      const roof = new THREE.BoxGeometry(3.4, .13, 20).rotateZ(-.17);
      put(roof, tile, 8.2, 3.25, 4);
      box(.2, .2, 19, wood, 6.86, 3.05, 4);
      box(.26, .05, 19, M(0x273d37, .22), 6.56, .025, 4);
      for (let z = -2; z < 13; z += 3) otherLamp('celadon', 9.3, .88, z, .45, Math.PI / 2, .35);

      // The grove draws close on both sides before the gate walls open into the court.
      await pauseBuild();
      const grove = trees();
      C.free = true;
      for (let i = 0; i < 94; i++) {
        const side = i % 2 ? -1 : 1;
        const z = 20.9 + C.rnd() * 18;
        const edge = 2.47 + C.rnd() ** 1.8 * 5.8;
        grove.bamboo(side * edge, -.01, z, .67 + C.rnd() * .53, 0x45684b);
      }
      for (let i = 0; i < 118; i++) {
        const side = i % 2 ? -1 : 1;
        grove.bamboo(side * (10.9 + C.rnd() * 9), -.01, -15 + C.rnd() * 51, .77 + C.rnd() * .55, 0x38573d);
      }
      for (let i = 0; i < 28; i++) grove.bamboo(-15 + C.rnd() * 30, -.01, -15 - C.rnd() * 10, .8 + C.rnd() * .4, 0x2b4935);
      // Younger stems put leaf sprays near eye level beneath the mature canopy.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 18; i++) {
          const x = side * (2.58 + C.rnd() * 1.75);
          const z = 21.15 + i * .91 + C.rnd() * .54;
          grove.bamboo(x, -.01, z, .27 + C.rnd() * .22, 0x476946);
        }
      }
      grove.finish();
      C.free = false;
      for (const [x, z, scale] of [[-2.65, 32.8, .73], [2.77, 29.15, .51], [-2.62, 24.5, .49], [4.55, 10.80, .88], [3.82, -1.15, 1.03]]) {
        rock(x, -.025, z, [scale, scale * .54, scale * .68], Math.round(z * 100));
      }

      const hill = M(0x344e40, 1);
      peak(-65, 0, -110, 65, 45, hill, 4, .7);
      peak(65, 0, -145, 85, 65, hill, 8, .7);
      ridges([[300, 0, 60, 0x62766c]]);
      addBambooStorm({ THREE, G: C.G, up: C.up, rnd: C.rnd }, {
        // Keep both volumes off the gate roof, walls and covered walks.
        volumes: [
          { x: [-6.8, 6.8], y: [.01, 8], z: [21, 39], count: 510, opacity: .32 },
          { x: [west, 6.35], y: [.01, 8], z: [-4.6, 15.18], count: 580, opacity: .30 },
        ],
      });
      await pauseBuild();
    },

    nook: {
      at: nook,
      lamp: 'celadon', y: .91, exposure: 1.14, bloom: [.37, 1],
      explicitPhoneViews: true,
      wide: cameras.wide, widePhone: cameras.widePhone,
      choose: cameras.choose, choosePhone: cameras.choosePhone,
      burn: cameras.burn, burnPhone: cameras.burnPhone,
      async build(hh) {
        buildCloister(hh);
        await pauseBuild();
      },
    },
  };
}

// A rain volume stops at the paving. Eave drops and impact rings use the same
// flight clock so the ring always begins where and when the drop meets water.
const weatherClock = `
  uniform float uSeconds;
  uniform float uLight;
  attribute vec4 dropOrigin;
  attribute vec4 dropMotion;

  float dropAge() {
    return mod(uSeconds + dropMotion.x * dropMotion.y, dropMotion.y);
  }

  float flightSeconds() {
    return sqrt((dropOrigin.y - dropOrigin.w) / 4.9);
  }
`;

const streakVertex = `
  #include <fog_pars_vertex>
  ${weatherClock}
  uniform bool uRunoff;
  varying vec2 vDropUV;
  varying float vAlpha;

  void main() {
    float flight = uRunoff ? flightSeconds() : dropMotion.y;
    float progress = clamp(dropAge() / flight, 0.0, 1.0);
    float fall = uRunoff ? progress * progress : progress;
    float bottom = mix(dropOrigin.y, dropOrigin.w, fall);
    float tail = dropMotion.z * (uRunoff ? mix(0.28, 1.0, progress) : 1.0);
    float top = min(dropOrigin.y, bottom + tail);
    vec4 front = modelViewMatrix * vec4(dropOrigin.x, bottom, dropOrigin.z, 1.0);
    vec4 rear = modelViewMatrix * vec4(dropOrigin.x, top, dropOrigin.z, 1.0);
    vec2 direction = rear.xy - front.xy;
    vec2 across = vec2(direction.y, -direction.x) / max(0.0001, length(direction));

    vec4 mvPosition = mix(front, rear, uv.y);
    // Carry sub-pixel rain at a distance without letting near drops become broad ribbons.
    float halfWidth = clamp(0.0026 + max(0.0, -mvPosition.z) * 0.00043, 0.003, 0.011);
    if (uRunoff) halfWidth *= 1.35;
    mvPosition.xy += across * position.x * (2.0 * halfWidth);
    gl_Position = projectionMatrix * mvPosition;

    vDropUV = uv;
    float fadeIn = smoothstep(0.0, 0.055, progress);
    float fadeOut = 1.0 - smoothstep(uRunoff ? 0.98 : 0.94, 1.0, progress);
    float distanceFade = 1.0 - smoothstep(13.0, 30.0, -mvPosition.z);
    vAlpha = dropMotion.w * fadeIn * fadeOut * distanceFade * uLight;
    #include <fog_vertex>
  }
`;

const streakFragment = `
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  varying vec2 vDropUV;
  varying float vAlpha;

  void main() {
    float tail = vDropUV.y;
    float taper = mix(0.88, 0.32, tail);
    float width = abs(vDropUV.x * 2.0 - 1.0);
    float core = (1.0 - smoothstep(0.04, taper, width)) * (1.0 - tail);
    float tip = smoothstep(0.0, 0.12, tail);
    gl_FragColor = vec4(uColor, vAlpha * core * tip);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const rippleVertex = `
  #include <fog_pars_vertex>
  ${weatherClock}
  varying vec2 vChannelPoint;
  varying vec2 vRipple;
  varying float vAlpha;

  void main() {
    float age = dropAge() - flightSeconds();
    float lifetime = mix(0.34, 0.52, dropMotion.x);
    float progress = clamp(age / lifetime, 0.0, 1.0);
    float radius = mix(0.012, 0.145, progress);
    vRipple = position.xy * 2.0;
    vChannelPoint = dropOrigin.xz + vRipple * radius;

    vec4 mvPosition = modelViewMatrix * vec4(vChannelPoint.x, dropOrigin.w + 0.0025, vChannelPoint.y, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = smoothstep(0.0, 0.035, age) * (1.0 - progress) * uLight;
    #include <fog_vertex>
  }
`;

const rippleFragment = `
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform vec4 uChannel;
  varying vec2 vChannelPoint;
  varying vec2 vRipple;
  varying float vAlpha;

  void main() {
    if (vChannelPoint.x < uChannel.x || vChannelPoint.x > uChannel.y ||
        vChannelPoint.y < uChannel.z || vChannelPoint.y > uChannel.w) discard;

    float distanceToImpact = length(vRipple);
    float ring = 1.0 - smoothstep(0.042, 0.12, abs(distanceToImpact - 0.76));
    float crescent = 0.54 + 0.46 * smoothstep(-0.5, 0.5, dot(vRipple, vec2(-0.6, 0.8)));
    float centre = (1.0 - smoothstep(0.02, 0.16, distanceToImpact)) * vAlpha * 0.23;
    gl_FragColor = vec4(uColor, vAlpha * ring * crescent * 0.50 + centre);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function makeGeometry(THREE, origins, motion) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setAttribute('dropOrigin', new THREE.InstancedBufferAttribute(new Float32Array(origins), 4));
  geometry.setAttribute('dropMotion', new THREE.InstancedBufferAttribute(new Float32Array(motion), 4));
  geometry.instanceCount = origins.length / 4;
  return geometry;
}

function weatherMesh(THREE, geometry, vertexShader, fragmentShader, sharedUniforms, uniforms, name) {
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...sharedUniforms, ...uniforms },
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * All dimensions are local to G. Author ambient volumes only in open air. Every
 * runoff source is the tip of an eave tile directly above the open channel.
 */
function addBambooStorm({ THREE, G, up, rnd }, { volumes = [], runoff }) {
  const group = new THREE.Group();
  group.name = 'Bamboo rain and runoff';
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const density = (globalThis.innerWidth ?? 1440) < 720 ? 0.56 : 1;
  const common = {
    uSeconds: { value: 0 },
    uLight: { value: 1 },
  };
  const between = ([lo, hi]) => lo + rnd() * (hi - lo);
  const rainOrigin = [];
  const rainMotion = [];
  for (const volume of volumes) {
    const { x, y: [ground, top], z, count, speed = 7, opacity = 0.25 } = volume;
    const drops = Math.round(count * density);
    for (let i = 0; i < drops; i++) {
      rainOrigin.push(between(x), top, between(z), ground);
      rainMotion.push(
        rnd(),
        (top - ground) / (speed * between([0.76, 1.22])),
        between([0.075, 0.22]),
        opacity * between([0.68, 1.18]),
      );
    }
  }
  if (rainOrigin.length) {
    const rain = makeGeometry(THREE, rainOrigin, rainMotion);
    group.add(weatherMesh(THREE, rain, streakVertex, streakFragment, common, {
      uColor: { value: new THREE.Color(0x9aadaf) },
      uRunoff: { value: false },
    }, 'Open-air rain'));
  }

  if (runoff?.sources.length) {
    const { sources, surfaceY, channel: { x: [left, right], z: [near, far] } } = runoff;
    const dropOrigin = [];
    const dropMotion = [];
    for (const [x, y, z] of sources) {
      if (!(y > surfaceY && x >= left && x <= right && z >= near && z <= far)) {
        throw new Error('Each Bamboo Rain eave drip must be above the open channel');
      }
      dropOrigin.push(x, y, z, surfaceY);
      dropMotion.push(
        rnd(),
        Math.sqrt((y - surfaceY) / 4.9) + between([0.60, 1.08]),
        between([0.12, 0.25]),
        between([0.42, 0.56]),
      );
    }
    const eaveDrops = makeGeometry(THREE, dropOrigin, dropMotion);
    group.add(weatherMesh(THREE, eaveDrops, streakVertex, streakFragment, common, {
      uColor: { value: new THREE.Color(0xaabdc5) },
      uRunoff: { value: true },
    }, 'Eave runoff'));
    const impacts = makeGeometry(THREE, dropOrigin, dropMotion);
    const ripples = weatherMesh(THREE, impacts, rippleVertex, rippleFragment, common, {
      uColor: { value: new THREE.Color(0x9eafb0) },
      uChannel: { value: new THREE.Vector4(left, right, near, far) },
    }, 'Channel drop impacts');
    ripples.renderOrder = 2;
    group.add(ripples);
  }

  if (!group.children.length) return;
  G.add(group);
  group.visible = !motionPreference?.matches;
  up.push((_dt, seconds, light) => {
    group.visible = !motionPreference?.matches;
    if (!group.visible) return;
    common.uSeconds.value = seconds;
    common.uLight.value = 1 - (light?.n ?? 0) * (runoff ? 0.13 : 0.32);
  });
}
