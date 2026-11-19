import * as THREE from 'three';

const RANGES = [
  {
    day: 0x9daeb9, night: 0x536878, base: -56, length: 92, step: 6, seed: .2,
    crest: [[-460, 34, -330], [-377, 64, -342], [-315, 47, -354], [-259, 74, -340], [-215, 50, -353],
      [-178, 68, -343], [-123, 49, -362], [-71, 62, -361], [-24, 34, -370], [28, 58, -365],
      [73, 82, -355], [107, 51, -357], [151, 68, -343], [215, 47, -349], [256, 67, -341],
      [304, 44, -342], [385, 58, -335], [454, 32, -327]],
  },
  {
    day: 0x7f969f, night: 0x455d6b, base: -49, length: 67, step: 4.5, seed: 3.9,
    crest: [[-288, 22, -191], [-231, 38, -187], [-198, 48, -170], [-164, 31, -177],
      [-146, 50, -165], [-120, 26, -168], [-98, 31, -173], [-83, 17, -183],
      [-52, 27, -177], [-30, 21, -181], [-12, 13, -190], [13, 19, -183], [34, 27, -178],
      [60, 46, -171], [79, 37, -171], [104, 28, -178], [135, 44, -169], [176, 51, -178],
      [218, 36, -187], [275, 53, -192], [322, 30, -201]],
  },
  {
    day: 0x526e71, night: 0x263d45, base: -42, length: 38, step: 3.2, seed: 7.4,
    crest: [[-167, 18, -91], [-133, 31, -86], [-107, 25, -78], [-85, 35, -72], [-61, 22, -70],
      [-44, 31, -76], [-28, 15, -74], [-12, 3, -83], [-5, -15, -89]],
  },
  {
    day: 0x5d7778, night: 0x2c424a, base: -44, length: 34, step: 2.8, seed: 11.6,
    crest: [[10, -16, -83], [16, 2, -85], [23, 20, -88], [31, 23, -90], [40, 20, -93],
      [49, 25, -96], [63, 34, -100], [78, 23, -104], [95, 31, -107], [113, 42, -113],
      [149, 29, -118], [192, 36, -130], [234, 21, -139], [296, 24, -146]],
  },
];

// Front talus climbs into a narrow crest, then falls down the hidden side.
// The east face has a steep exposed shoulder for the waterfall.
const SLOPE = [[.94, 0], [.67, .16], [.48, .32], [.32, .53], [.25, .67],
  [.18, .81], [.10, .94], [0, 1], [-.32, .63], [-.76, .19], [-1.04, 0]];

function crestAt(range, x) {
  const points = range.crest;
  let i = 1;
  while (i < points.length - 1 && points[i][0] < x) i++;
  const a = points[i - 1], b = points[i];
  const t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
}

function hillside(range, x, row) {
  const [crestY, crestZ] = crestAt(range, x);
  const i = Math.min(SLOPE.length - 2, Math.floor(row)), t = row - i;
  const [za, ya] = SLOPE[i], [zb, yb] = SLOPE[i + 1];
  const along = THREE.MathUtils.lerp(za, zb, t), height = THREE.MathUtils.lerp(ya, yb, t);
  const folds = Math.sin(x * .093 + range.seed) * 1.55 + Math.sin(x * .205 + range.seed * .78) * .92;
  const shoulder = Math.sin(x * .113 + along * 3.1 + range.seed) * range.length * .05;
  return [x, THREE.MathUtils.lerp(range.base, crestY + folds, height), crestZ + along * (range.length + shoulder)];
}

const toneVertex = `
  attribute vec3 dayColor, nightColor;
  varying vec3 vDay, vNight;
  void main() {
    vDay = dayColor;
    vNight = nightColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;
const toneFragment = `
  uniform float uNight, uDusk;
  varying vec3 vDay, vNight;
  void main() {
    vec3 light = mix(vDay, vNight, uNight);
    gl_FragColor = vec4(mix(light, light * vec3(1.13, .99, .90), uDusk * .4), 1.);
  }
`;

function mountainRanges(look) {
  const points = [], day = [], night = [], indices = [];
  const add = (point, sun, moon, scale) => {
    points.push(...point);
    day.push(sun.r * scale, sun.g * scale, sun.b * scale);
    night.push(moon.r * scale, moon.g * scale, moon.b * scale);
  };
  for (const range of RANGES) {
    const sun = new THREE.Color(range.day), moon = new THREE.Color(range.night);
    const start = range.crest[0][0], end = range.crest.at(-1)[0];
    const columns = Math.ceil((end - start) / range.step), rows = SLOPE.length;
    const offset = points.length / 3;
    for (let i = 0; i <= columns; i++) {
      const x = THREE.MathUtils.lerp(start, end, i / columns);
      for (let row = 0; row < rows; row++) {
        const point = hillside(range, x, row);
        const strata = Math.sin(x * .146 + row * .52 + range.seed) * .065;
        const tint = .77 + .23 * SLOPE[row][1] + strata;
        add(point, sun, moon, tint);
        if (i < columns && row < rows - 1) {
          const a = offset + i * rows + row, b = a + rows;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('dayColor', new THREE.Float32BufferAttribute(day, 3));
  geometry.setAttribute('nightColor', new THREE.Float32BufferAttribute(night, 3));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({ uniforms: look, vertexShader: toneVertex, fragmentShader: toneFragment });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'Four distant mountain ranges';
  return object;
}

function cloudSea(look) {
  const geometry = new THREE.PlaneGeometry(770, 426, 54, 34);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -12, -224);
  const material = new THREE.ShaderMaterial({
    uniforms: { ...look,
      uNightDark: { value: new THREE.Color(0x304754) }, uNightLight: { value: new THREE.Color(0x738994) },
      uDayDark: { value: new THREE.Color(0x8ca4b0) }, uDayLight: { value: new THREE.Color(0xe0e8e6) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        vWorld.y += .74 * sin(vWorld.x * .085 + uTime * .026) * sin(vWorld.z * .069 - uTime * .017)
          + .37 * sin(vWorld.z * .12 + vWorld.x * .035 + uTime * .016);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform float uTime, uNight, uDusk;
      uniform vec3 uNightDark, uNightLight, uDayDark, uDayLight;
      varying vec3 vWorld;
      float hashCloud(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * .1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float cloudNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hashCloud(i), hashCloud(i + vec2(1., 0.)), f.x),
          mix(hashCloud(i + vec2(0., 1.)), hashCloud(i + 1.), f.x), f.y);
      }
      void main() {
        vec2 uv = vWorld.xz * vec2(.041, .052) + vec2(uTime * .009, uTime * .003);
        float banks = .58 * cloudNoise(uv) + .28 * cloudNoise(uv * 2.16 + 16.)
          + .14 * cloudNoise(uv * 4.35 - 3.);
        float softLight = smoothstep(.29, .72, banks);
        vec3 cool = mix(uDayDark, uNightDark, uNight);
        vec3 bright = mix(uDayLight, uNightLight, uNight);
        vec3 clouds = mix(cool, bright, softLight);
        vec3 horizon = mix(bright, cool, .45);
        float distance = length(cameraPosition.xz - vWorld.xz);
        clouds = mix(clouds, horizon, smoothstep(208., 428., distance) * .83);
        clouds *= mix(vec3(1.), vec3(1.09, 1.01, .91), uDusk * .44);
        gl_FragColor = vec4(clouds, 1.);
      }
    `,
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'Moving cloud banks below the terrace';
  return object;
}

const PADDY_CONTOURS = [
  [7, 15, -82.4, 1.26], [6.3, 16, -79.8, .65], [5.5, 17.6, -76.9, -1.0],
  [4.8, 18.1, -73.9, -2.66], [4.1, 18, -70.6, -4.3], [3.4, 17.5, -67, -5.94],
  [2.7, 16.7, -63.3, -7.58], [2.2, 15.6, -59.6, -9.24], [2, 15, -55.8, -11.15],
];

function paddyContour(level, t, y = PADDY_CONTOURS[level][3], offset = 0) {
  const [cx, width, z] = PADDY_CONTOURS[level];
  const curve = (3.1 + .55 * Math.sin(level * .9)) * t * t;
  return [cx + width * t, y, z + offset - curve + .58 * Math.sin(t * 3 + level * .44)];
}

function terraceStrip(batch, rear, front, segments = 28, min = -1, max = 1) {
  const first = batch.points.length / 3;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, t = THREE.MathUtils.lerp(min, max, u);
    batch.points.push(...rear(t), ...front(t));
    batch.uv?.push(u, 0, u, 1);
    if (i < segments) {
      const a = first + i * 2;
      batch.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
}

function floodedTerraces(look) {
  const earth = { points: [], indices: [] }, water = { points: [], uv: [], indices: [] };
  const day = [], night = [];
  function bank(rear, front, toneA, toneB) {
    const first = earth.points.length / 3;
    terraceStrip(earth, rear, front);
    for (let i = first; i < earth.points.length / 3; i++) {
      const tint = (i % 2 === 0 ? toneA : toneB) * (.95 + .05 * Math.sin(earth.points[i * 3] * .73));
      day.push(.112 * tint, .163 * tint, .113 * tint);
      night.push(.041 * tint, .063 * tint, .055 * tint);
    }
  }
  for (let level = 1; level < PADDY_CONTOURS.length; level++) {
    const y = PADDY_CONTOURS[level][3];
    const rear = t => paddyContour(level - 1, t, y, .47);
    const innerBank = t => paddyContour(level, t, y, -.42);
    const crest = t => paddyContour(level, t, y + .20, -.18);
    const lip = t => paddyContour(level, t, y + .12, .08);
    const foot = t => paddyContour(level, t, PADDY_CONTOURS[level + 1]?.[3] ?? -15.32, .47);
    bank(rear, innerBank, .92, .84);
    bank(innerBank, crest, .84, 1.30);
    bank(crest, lip, 1.30, 1.04);
    bank(lip, foot, 1.04, .47);

    // Continue the shoulders under the waterline and cloud so neither the
    // paddy ends nor the last retaining wall look like floating cards.
    for (const side of [-1, 1]) {
      const edge = [rear(side), innerBank(side), crest(side), lip(side), foot(side)];
      const grade = (t, outside) => {
        const row = (t + 1) * .5 * (edge.length - 1);
        const i = Math.min(Math.floor(row), edge.length - 2), u = row - i;
        const a = edge[i], b = edge[i + 1];
        return [THREE.MathUtils.lerp(a[0], b[0], u) + outside * side * 4.2,
          THREE.MathUtils.lerp(a[1], b[1], u) - outside * 3.8,
          THREE.MathUtils.lerp(a[2], b[2], u) + outside * 1.4];
      };
      bank(t => grade(t, 0), t => grade(t, 1), .81, .54);
    }
    if (y < -10.0) continue;
    const poolEdge = (t, back) => {
      const a = rear(t), b = innerBank(t);
      const taper = THREE.MathUtils.smoothstep(Math.abs(t), .57, 1) * .22;
      const depth = back ? .11 + taper : .91 - taper;
      return [THREE.MathUtils.lerp(a[0], b[0], depth), y + .044, THREE.MathUtils.lerp(a[2], b[2], depth)];
    };
    const breakAt = .32 * Math.sin(level * 1.64);
    for (const [min, max] of [[-.95, breakAt - .028], [breakAt + .025, .96]]) {
      terraceStrip(water, t => poolEdge(t, true), t => poolEdge(t, false), 14, min, max);
    }
  }
  bank(t => paddyContour(0, t, -12.5, -7.7), t => paddyContour(0, t, 1.35, -.20), .59, .90);
  bank(t => paddyContour(0, t, 1.35, -.20), t => paddyContour(0, t, .65, .47), .90, .92);

  const geometryOf = batch => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.points, 3));
    geometry.setIndex(batch.indices);
    return geometry;
  };
  const slopes = geometryOf(earth);
  slopes.setAttribute('dayColor', new THREE.Float32BufferAttribute(day, 3));
  slopes.setAttribute('nightColor', new THREE.Float32BufferAttribute(night, 3));
  const bankMaterial = new THREE.ShaderMaterial({
    uniforms: look, vertexShader: toneVertex, fragmentShader: toneFragment, side: THREE.DoubleSide,
  });
  const berms = new THREE.Mesh(slopes, bankMaterial);
  berms.name = 'Curved banks on the valley shoulder';

  const pools = geometryOf(water);
  pools.setAttribute('uv', new THREE.Float32BufferAttribute(water.uv, 2));
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { ...look,
      uSkyDay: { value: new THREE.Color(0xc5d8dd) }, uSkyNight: { value: new THREE.Color(0x77929e) },
      uBedDay: { value: new THREE.Color(0x596f57) }, uBedNight: { value: new THREE.Color(0x2d433a) },
    },
    vertexShader: `
      varying vec2 vWet;
      varying vec3 vWorld;
      void main() {
        vWet = uv;
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform float uNight, uDusk, uTime;
      uniform vec3 uSkyDay, uSkyNight, uBedDay, uBedNight;
      varying vec2 vWet;
      varying vec3 vWorld;
      void main() {
        vec3 eye = normalize(cameraPosition - vWorld);
        float ripple = sin(vWorld.x * .71 + vWorld.z * 1.72 + uTime * .27)
          * cos(vWorld.x * .39 - vWorld.z * 2.06 - uTime * .19);
        float facing = clamp(eye.y + ripple * .021, 0., 1.);
        float reflection = .025 + .83 * pow(1. - facing, 4.);
        float shore = min(min(vWet.x, 1. - vWet.x), min(vWet.y, 1. - vWet.y));
        vec3 bed = mix(uBedDay, uBedNight, uNight);
        vec3 sky = mix(uSkyDay, uSkyNight, uNight) * mix(vec3(1.), vec3(1.15, 1.02, .91), uDusk * .48);
        vec3 wet = mix(bed, sky, reflection * mix(.66, 1., smoothstep(0., .18, shore)));
        gl_FragColor = vec4(wet, 1.);
      }
    `,
  });
  const flooded = new THREE.Mesh(pools, waterMaterial);
  flooded.name = 'Spring paddies reflecting the open sky';
  return [berms, flooded];
}

function waterfall(look) {
  const range = RANGES[3], points = [], uv = [], indices = [];
  for (const branch of [{ x: 28.6, width: .59, start: 6.7, end: 2.95 }, { x: 29.45, width: .27, start: 5.64, end: 3.37 }]) {
    const start = points.length / 3, steps = 32;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, row = THREE.MathUtils.lerp(branch.start, branch.end, t);
      const x = branch.x + .5 * Math.sin(t * 3.6) - .37 * t;
      const width = branch.width * (.59 + t * .48 + .21 * Math.sin(t * 11.4));
      for (const edge of [-1, 1]) {
        const [px, y, z] = hillside(range, x + edge * width, row);
        points.push(px, y + .046, z + .25);
        uv.push((edge + 1) / 2, t);
      }
      const base = start + i * 2;
      if (i < steps) indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    uniforms: { ...look, uDayWater: { value: new THREE.Color(0xcddce0) }, uNightWater: { value: new THREE.Color(0x748a99) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform float uNight, uTime;
      uniform vec3 uDayWater, uNightWater;
      varying vec2 vUv;
      void main() {
        float curtain = pow(max(0., sin(3.14159 * vUv.x)), .58);
        float falls = .82 + .11 * sin(vUv.y * 102. - uTime * 2.9 + 3. * vUv.x)
          + .07 * sin(vUv.y * 48. - uTime * 1.6);
        float edge = smoothstep(0., .075, vUv.y) * (1. - smoothstep(.84, 1., vUv.y));
        gl_FragColor = vec4(mix(uDayWater, uNightWater, uNight), curtain * falls * edge * .84);
      }
    `,
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'Distant falls on the east ridge';
  return object;
}

export function createPineGateVista(initialLight = { n: 1, g: 0 }) {
  const look = { uNight: { value: initialLight.n }, uDusk: { value: initialLight.g }, uTime: { value: 0 } };
  const group = new THREE.Group();
  group.name = 'Pine Gate valley vista';
  group.add(mountainRanges(look), cloudSea(look), waterfall(look), ...floodedTerraces(look));
  return {
    group,
    update(time, light = initialLight) {
      look.uTime.value = time;
      look.uNight.value = light.n;
      look.uDusk.value = light.g;
    },
    dispose() {
      group.removeFromParent();
      for (const object of group.children) {
        object.geometry.dispose();
        object.material.dispose();
      }
      group.clear();
    },
  };
}
