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
  // Low roof silhouettes are separate from the three isolated light points;
  // the small group reads as shelters along the opposite approach.
  const ridge = RANGES[1], sun = new THREE.Color(0x565f63), moon = new THREE.Color(0x394d56);
  for (const x of [1, 7, 13]) {
    const [cx, floor, z] = hillside(ridge, x, 5.2), base = points.length / 3;
    const w = .93, d = .84, eave = floor + 1.2, crown = eave + .53;
    for (const point of [[cx - w, floor - .35, z + d], [cx + w, floor - .35, z + d],
      [cx - w * 1.1, eave, z + d * 1.15], [cx + w * 1.1, eave, z + d * 1.15],
      [cx - w, crown, z], [cx + w, crown, z], [cx - w * 1.1, eave, z - d * 1.15],
      [cx + w * 1.1, eave, z - d * 1.15]]) add(point, sun, moon, 1);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2,
      base + 2, base + 3, base + 4, base + 3, base + 5, base + 4,
      base + 4, base + 5, base + 6, base + 5, base + 7, base + 6);
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
        float curtain = pow(sin(3.14159 * vUv.x), .58);
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

function otherRidgeLights(look) {
  const points = [1, 7, 13].flatMap(x => {
    const [px, y, z] = hillside(RANGES[1], x, 5.2);
    return [px + .24, y + .71, z + .86];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: look, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(470. / max(1., -view.z), 1.6, 3.4);
      }
    `,
    fragmentShader: `
      uniform float uNight, uDusk;
      void main() {
        float radius = length(gl_PointCoord * 2. - 1.);
        float pool = 1. - smoothstep(.03, 1., radius);
        float dusk = clamp(uNight + uDusk * .7, 0., 1.);
        gl_FragColor = vec4(vec3(.93, .46, .14), pool * dusk * .89);
      }
    `,
  });
  const object = new THREE.Points(geometry, material);
  object.name = 'Three shelter lights across the valley';
  return object;
}

export function createPineGateVista(initialLight = { n: 1, g: 0 }) {
  const look = { uNight: { value: initialLight.n }, uDusk: { value: initialLight.g }, uTime: { value: 0 } };
  const group = new THREE.Group();
  group.name = 'Pine Gate valley vista';
  group.add(mountainRanges(look), cloudSea(look), waterfall(look), otherRidgeLights(look));
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
