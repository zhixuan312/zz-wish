import * as THREE from 'three';
import { pineDaySunDirection } from './pine-gate-sun.js';
import { columns, depths, drains, elevations, heightStep, terraceAxis } from './pine-gate-elevation.data.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const FIELD_NEAR = 87;
const FIELD_FAR = 116;
const BEDS = [
  [-10.4, -7.31], [-7.6, -6.68], [-4.8, -6.05], [-1.7, -5.42],
  [1.7, -4.79], [4.8, -4.16], [7.8, -3.53], [10.6, -3.53],
];

function interval(axis, value) {
  let left = 0, right = axis.length - 1;
  while (right - left > 1) {
    const center = (left + right) >>> 1;
    if (value < axis[center]) right = center;
    else left = center;
  }
  return left;
}

function fieldCenter(depth) {
  const range = (depth - terraceAxis[0][0]) / 4;
  const i = clamp(Math.floor(range), 0, terraceAxis.length - 2);
  return lerp(terraceAxis[i][1], terraceAxis[i + 1][1], clamp(range - i, 0, 1));
}

function eastDrain(depth) {
  let leftBank = Infinity;
  const channel = drains[0];
  for (let i = 1; i < channel.length; i++) {
    const [x0, z0] = channel[i - 1], [x1, z1] = channel[i];
    if (depth > Math.max(-z0, -z1) || depth < Math.min(-z0, -z1)) continue;
    const x = z0 !== z1 ? lerp(x0, x1, (depth + z0) / (z0 - z1)) : Math.min(x0, x1);
    leftBank = Math.min(leftBank, x);
  }
  return leftBank;
}

function fieldEdge(depth, i, river = eastDrain(depth)) {
  const center = fieldCenter(depth) + 2.8;
  const curve = .81 * Math.sin(depth * .26 + i * .71) + .40 * Math.sin(depth * .62 - i * .83);
  const spread = 1.13 + .57 * smoothstep(depth, 90, 113);
  const upperLimit = (river - 1.95 - center) / (BEDS.at(-1)[0] + 1.1);
  return center + Math.min(spread, Math.max(.56, upperLimit)) * BEDS[i][0] + curve;
}

function gradeShoulder(x, depth, height) {
  if (x < -60 || x > 90 || depth <= FIELD_NEAR - 5 || depth >= FIELD_FAR + 17) return height;
  const river = eastDrain(depth);
  const left = fieldEdge(depth, 0, river), right = fieldEdge(depth, BEDS.length - 1, river);
  // The grading runs out into the slope and ends before the channel. A long,
  // asymmetric transition avoids a bright artificial scarp behind the beds.
  const east = Math.min(right + 17, river - .68);
  const edge = smoothstep(x, left - 8.2, left) * (1 - smoothstep(x, right, Math.max(right + .4, east)));
  const ends = smoothstep(depth, FIELD_NEAR - 5, FIELD_NEAR)
    * (1 - smoothstep(depth, FIELD_FAR, FIELD_FAR + 17));
  const grade = lerp(-7.93, -3.87, clamp((x - left) / (right - left), 0, 1));
  return lerp(height, grade, edge * ends);
}

function createTerrainField() {
  const ascii = atob(elevations);
  const stride = columns.length;
  const heights = new Float32Array(stride * depths.length);
  for (let j = 0; j < depths.length; j++) {
    const depth = depths[j];
    // The staged shoulder starts beyond the baked foreground. Bury the
    // front boundary under the cloud and blend into the measured slopes.
    const visible = smoothstep(depth, 18, 42);
    for (let i = 0; i < stride; i++) {
      const index = j * stride + i;
      const encoded = ascii.charCodeAt(index * 2) | (ascii.charCodeAt(index * 2 + 1) << 8);
      const elevation = ((encoded << 16) >> 16) * heightStep;
      heights[index] = gradeShoulder(columns[i], depth, lerp(-29, elevation, visible));
    }
  }
  function surfaceAt(x, depth) {
    const i = interval(columns, x), j = interval(depths, depth), a = j * stride + i;
    const u = clamp((x - columns[i]) / (columns[i + 1] - columns[i]), 0, 1);
    const v = clamp((depth - depths[j]) / (depths[j + 1] - depths[j]), 0, 1);
    // Use the triangle interpolation the rendered index buffer uses. Water
    // planes and grading can then meet the actual terrain surface.
    if (u + v <= 1) return heights[a] + u * (heights[a + 1] - heights[a])
      + v * (heights[a + stride] - heights[a]);
    const d = heights[a + stride + 1];
    return d + (1 - u) * (heights[a + stride] - d) + (1 - v) * (heights[a + 1] - d);
  }
  return { heights, surfaceAt };
}

function canopyTexture() {
  const size = 128, cells = 39;
  const random = (x, z, channel) => {
    let hash = Math.imul(x + 37, 0x9e3779b1) ^ Math.imul(z + 53, 0x85ebca6b) ^ channel;
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
  };
  const crowns = Array.from({ length: cells * cells }, (_, i) => {
    const x = i % cells, z = Math.floor(i / cells);
    return {
      x: .22 + .57 * random(x, z, 3), z: .22 + .57 * random(x, z, 61),
      radius: .40 + .27 * random(x, z, 83), height: .18 + .39 * random(x, z, 41),
      pigment: .37 + .63 * random(x, z, 103),
    };
  });
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = (col + .5) * cells / size, z = (row + .5) * cells / size;
      const ix = Math.floor(x), iz = Math.floor(z);
      let crownHeight = 0, pigment = .105, nx = 0, nz = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = ix + dx, gz = iz + dz;
          const crown = crowns[((gz + cells) % cells) * cells + (gx + cells) % cells];
          const u = (x - gx - crown.x) / crown.radius, v = (z - gz - crown.z) / crown.radius;
          const square = u * u + v * v;
          if (square >= 1) continue;
          const cap = Math.sqrt(1 - square);
          const height = crown.height + .49 * cap;
          if (height <= crownHeight) continue;
          crownHeight = height;
          pigment = crown.pigment * (.47 + .53 * cap);
          nx = u * .79;
          nz = v * .79;
        }
      }
      const at = (row * size + col) * 4;
      pixels[at] = Math.round(pigment * 255);
      pixels[at + 1] = Math.round((.5 + .5 * nx) * 255);
      pixels[at + 2] = Math.round((.5 + .5 * nz) * 255);
      pixels[at + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'Mipmapped distant tree crowns';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const NOISE = `
  float hashVista(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float softNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f *= f * (3. - 2. * f);
    return mix(mix(hashVista(i), hashVista(i + vec2(1., 0.)), f.x),
      mix(hashVista(i + vec2(0., 1.)), hashVista(i + 1.), f.x), f.y);
  }
`;

const ATMOSPHERE = `
  uniform float uNight, uDusk;
  uniform vec3 uHazeDay, uHazeNight, uHazeDusk;
  float climbHaze() {
    return .88 * smoothstep(8., 25., cameraPosition.z);
  }
  vec3 hazeColor() {
    return mix(mix(uHazeDay, uHazeNight, uNight), uHazeDusk, uDusk * .44);
  }
  vec3 ridgeAir(vec3 color, vec3 world) {
    float range = distance(cameraPosition, world);
    float lowAir = 1. - smoothstep(-10., 19., .5 * (world.y + cameraPosition.y));
    float rangeDepth = pow(range / mix(322., 319., uNight), 1.42);
    float opticalDepth = rangeDepth + lowAir * range * .00032;
    vec3 transmission = exp(-opticalDepth * vec3(.79, .98, 1.24));
    vec3 aerial = color * transmission + hazeColor() * (1. - transmission);
    return mix(aerial, hazeColor(), climbHaze());
  }
`;

const TERRAIN_LIGHT = `
  uniform vec3 uDaySun;
  vec3 hillsideLight(vec3 pigment, vec3 normal, float shelter) {
    float sky = (.43 + .57 * max(0., normal.y)) * mix(1., .57, shelter);
    float sun = max(0., dot(normal, uDaySun));
    float duskSun = max(0., dot(normal, normalize(vec3(-.62, .24, .72))));
    float moon = max(0., dot(normal, normalize(vec3(.48, .58, -.66))));
    vec3 dayLight = vec3(.36, .47, .61) * sky + vec3(1.07, .98, .82) * sun * .82;
    vec3 duskLight = vec3(.23, .33, .49) * sky + vec3(1.19, .63, .35) * duskSun * .56;
    vec3 nightLight = vec3(.17, .28, .49) * sky + vec3(.26, .39, .62) * moon * .26;
    vec3 light = mix(mix(dayLight, nightLight, uNight), duskLight, uDusk * .62);
    return pigment * light * mix(1., .69, shelter);
  }
`;

function tessellatedTerrain(field, look) {
  const stride = columns.length, indices = [];
  const positions = new Float32Array(field.heights.length * 3);
  const concavity = new Uint8Array(field.heights.length);
  for (let j = 0; j < depths.length; j++) {
    for (let i = 0; i < stride; i++) {
      const index = j * stride + i, x = columns[i], depth = depths[j], y = field.heights[index];
      positions.set([x, y, -depth], index * 3);
      const neighbours = [field.surfaceAt(x - 12, depth), field.surfaceAt(x + 12, depth),
        field.surfaceAt(x, depth - 12), field.surfaceAt(x, depth + 12)];
      const crestHeight = neighbours.reduce((sum, h) => sum + Math.max(0, h - y), 0) * .25;
      concavity[index] = Math.round(255 * smoothstep(crestHeight, .22, 5.2));
      if (i < stride - 1 && j < depths.length - 1) {
        indices.push(index, index + 1, index + stride, index + 1, index + stride + 1, index + stride);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('basinShade', new THREE.BufferAttribute(concavity, 1, true));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    uniforms: look,
    vertexShader: `
      attribute float basinShade;
      varying vec3 vWorld, vNormal;
      varying float vBasin;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vBasin = basinShade;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform sampler2D uCanopy;
      varying vec3 vWorld, vNormal;
      varying float vBasin;
      ${NOISE}
      ${ATMOSPHERE}
      ${TERRAIN_LIGHT}
      void main() {
        vec3 normal = normalize(vNormal);
        vec2 ground = vWorld.xz;
        float grove = softNoise(ground * .061 + vec2(12.8, 7.2));
        float scrub = softNoise(ground * .20 + vWorld.y * .062);
        float rockDetail = softNoise(ground * .75 + vWorld.y * .37);
        mat2 turn = mat2(.80, -.60, .60, .80);
        vec2 offset = vec2(scrub, grove) * .16;
        vec4 crowns = mix(texture2D(uCanopy, ground / 16.7 + offset),
          texture2D(uCanopy, turn * ground / 10.1 - offset), .46);
        vec2 relief = crowns.gb * 2. - 1.;
        vec3 leavesUp = normalize(normal + vec3(relief.x, .26, relief.y) * .53);
        float trees = smoothstep(.22, .70, grove * .48 + scrub * .27 + vBasin * .25);
        float rock = smoothstep(.32, .66, 1. - normal.y + (scrub - .5) * .26 - vBasin * .11);
        vec3 grass = mix(vec3(.052, .077, .028), vec3(.098, .121, .041), scrub);
        vec3 needles = mix(vec3(.017, .034, .019), vec3(.058, .104, .039), trees);
        needles *= (.62 + .69 * crowns.r) * mix(.88, 1.13, scrub);
        vec3 woods = hillsideLight(needles, leavesUp, vBasin);
        vec3 groundcover = hillsideLight(grass, normal, vBasin);
        float bedrock = .5 + .5 * sin(vWorld.y * 1.46 + ground.x * .077 + ground.y * .084 + scrub * 2.8);
        vec3 stone = mix(vec3(.077, .070, .058), vec3(.176, .156, .126), bedrock * .46 + rockDetail * .54);
        vec3 exposed = hillsideLight(stone, normal, vBasin * .51);
        vec3 pigment = mix(mix(groundcover, woods, .55 + .45 * trees), exposed, rock);
        gl_FragColor = vec4(ridgeAir(pigment, vWorld), 1.);
      }
    `,
  });
  const mountain = new THREE.Mesh(geometry, material);
  mountain.name = 'SRTM ridges and river valley';
  return mountain;
}

function stripStations(batch, stations, left, right) {
  const first = batch.points.length / 3;
  for (const [i, along] of stations.entries()) {
    batch.points.push(...left(along), ...right(along));
    batch.uv?.push(0, i / (stations.length - 1), 1, i / (stations.length - 1));
    if (i < stations.length - 1) {
      const a = first + i * 2;
      batch.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
}

function evenStations(span, steps) {
  return Array.from({ length: steps + 1 }, (_, i) => lerp(span[0], span[1], i / steps));
}

function strip(batch, span, left, right, steps = 42) {
  stripStations(batch, evenStations(span, steps), left, right);
}

function bundedBed(earth, full, spans, left, right, base, bed) {
  const transverses = [spans[0][0] - .32, (spans[0][1] + spans[1][0]) * .5, spans[1][1] + .32];
  const footprint = .235, crown = .075;
  const stations = [...new Set([...evenStations(full, 42), ...transverses.flatMap(depth =>
    [depth - footprint, depth - crown, depth + crown, depth + footprint])])].sort((a, b) => a - b);
  const crossLift = depth => {
    const distance = Math.min(...transverses.map(crest => Math.abs(depth - crest)));
    return (.194 + .007 * Math.cos(bed * 1.19))
      * clamp((footprint - distance) / (footprint - crown), 0, 1);
  };

  // One surface keeps the transverse crests joined to both lengthwise
  // banks, including the shared bund separating the two flooded spans.
  const rows = [
    [0, false, false], [.059, false, true], [.105, false, true], [.147, false, false],
    [.147, true, false], [.105, true, true], [.059, true, true], [0, true, false],
  ];
  const first = earth.points.length / 3, width = rows.length;
  for (const [j, depth] of stations.entries()) {
    const sideLift = .198 + .014 * Math.sin(depth * .41 + bed * 1.21);
    const transverse = crossLift(depth);
    for (const [i, [offset, highSide, crest]] of rows.entries()) {
      const x = highSide ? right(depth)[0] - offset : left(depth)[0] + offset;
      earth.points.push(x, base + Math.max(crest ? sideLift : 0, transverse), -depth);
      if (i < width - 1 && j < stations.length - 1) {
        const a = first + j * width + i;
        earth.indices.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
      }
    }
  }
  // The adjoining risers use the same stations and edge heights, so the
  // earth stays closed where a transverse bund reaches the bed boundary.
  const boundary = line => depth => [line(depth)[0], base + crossLift(depth), -depth];
  return { stations, left: boundary(left), right: boundary(right) };
}

function toGeometry(batch) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(batch.points, 3));
  if (batch.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
  geo.setIndex(batch.indices);
  return geo;
}

const SURFACE_VERTEX = `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
  }
`;

function fieldSurfaces(field, look) {
  const earth = { points: [], indices: [] }, water = { points: [], uv: [], indices: [] };
  const full = [FIELD_NEAR, FIELD_FAR];
  const line = (i, offset, height) => depth => [fieldEdge(depth, i) + offset, height, -depth];
  const landscape = (i, offset) => depth => {
    const x = fieldEdge(depth, i) + offset;
    return [x, field.surfaceAt(x, depth) - .12, -depth];
  };
  for (let i = 0; i < BEDS.length - 1; i++) {
    const y = BEDS[i][1], innerLeft = line(i, .24, y);
    const innerRight = line(i + 1, -.30, y);
    const split = 99.1 + 1.6 * Math.sin(i * 1.57);
    const spans = [[FIELD_NEAR + .86 + 1.5 * Math.sin(i * .93) ** 2, split - .21],
      [split + .37, FIELD_FAR - 1.14 - 1.8 * Math.cos(i * 1.12) ** 2]];
    const bunds = bundedBed(earth, full, spans, innerLeft, innerRight, y, i);
    const rise = i === 0 ? landscape(i, -3.6) : line(i, 0, BEDS[i - 1][1] + .085);
    stripStations(earth, bunds.stations, rise, bunds.left);
    const outerRight = line(i + 1, 0, y + .085);
    stripStations(earth, bunds.stations, bunds.right, outerRight);
    if (i === BEDS.length - 2) stripStations(earth, bunds.stations, outerRight, landscape(i + 1, 3.6));

    for (const span of spans) {
      const margin = depth => {
        const fromEnd = Math.min(depth - span[0], span[1] - depth);
        return .18 + .51 * (1 - smoothstep(fromEnd, 0, 2.4));
      };
      const left = depth => [fieldEdge(depth, i) + .24 + margin(depth), y + .047, -depth];
      const right = depth => [fieldEdge(depth, i + 1) - .30 - margin(depth), y + .047, -depth];
      strip(water, span, left, right, 21);
    }

    // Return the ends into the measured hillside. The nearest slope is
    // part of the same ground instead of an exposed edge under a deck.
    for (const [depth, direction] of [[FIELD_NEAR, -1], [FIELD_FAR, 1]]) {
      const groundDepth = depth + direction * 3.8;
      const limit = t => lerp(fieldEdge(depth, i) + .24, fieldEdge(depth, i + 1) - .30, t);
      const bed = t => [limit(t), y, -depth];
      const ground = t => [limit(t), field.surfaceAt(limit(t), groundDepth) - .18, -groundDepth];
      strip(earth, [0, 1], direction < 0 ? bed : ground, direction < 0 ? ground : bed, 3);
    }
  }
  const soil = new THREE.Mesh(toGeometry(earth), new THREE.ShaderMaterial({
    uniforms: look, side: THREE.DoubleSide,
    vertexShader: SURFACE_VERTEX,
    fragmentShader: `
      varying vec3 vWorld;
      ${ATMOSPHERE}
      ${TERRAIN_LIGHT}
      ${NOISE}
      void main() {
        vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (normal.y < 0.) normal = -normal;
        float verge = softNoise(vWorld.xz * .69 + vWorld.y * .31);
        float roots = softNoise(vWorld.xz * 2.1 + vWorld.y * .58);
        float grass = smoothstep(.22, .76, normal.y * .69 + verge * .56);
        vec3 clay = mix(vec3(.088, .045, .025), vec3(.179, .107, .053), verge);
        vec3 shoots = mix(vec3(.084, .127, .040), vec3(.157, .212, .049), verge);
        vec3 loam = mix(clay, shoots, grass);
        vec3 color = hillsideLight(loam * (.77 + roots * .43), normal, .17);
        gl_FragColor = vec4(ridgeAir(color, vWorld), 1.);
      }
    `,
  }));
  soil.name = 'Cut earthen banks on the DEM shoulder';
  const poolGeometry = toGeometry(water);
  poolGeometry.computeVertexNormals();
  // The outside scene already has a CubeUV convolution of its actual sky.
  // Use standard dielectric IBL here, without a new reflection pass.
  const poolMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x695f35, roughness: .17, ior: 1.333, metalness: 0, fog: false,
    envMapIntensity: 1, specularIntensity: 1,
  });
  poolMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, look);
    const coordinates = 'varying vec3 vPaddyWorld; varying vec2 vPaddyUV;';
    shader.vertexShader = coordinates + '\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPaddyWorld = (modelMatrix * vec4(transformed, 1.)).xyz; vPaddyUV = uv;');
    shader.fragmentShader = coordinates + '\nuniform float uTime;\n' + ATMOSPHERE + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 paddyP = vPaddyWorld.xz;
        float footprint = length(fwidth(paddyP));
        float ripple = 1. - smoothstep(.25, .79, footprint);
        vec2 waves = vec2(sin(paddyP.x * 5.12 + paddyP.y * 2.41 + uTime * 1.17),
          sin(paddyP.y * 4.23 - paddyP.x * 1.64 - uTime * .82));
        vec3 surfaceNormal = normalize(vec3(waves.x * .036 * ripple, 1., waves.y * .023 * ripple));
        normal = normalize(mat3(viewMatrix) * surfaceNormal);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec2 shoreUV = min(vPaddyUV, 1. - vPaddyUV);
        float shore = 1. - smoothstep(.005, .20, min(shoreUV.x, shoreUV.y * 4.));
        roughnessFactor = clamp(roughnessFactor + .22 * shore, 0., 1.);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= .49;
        reflectedLight.indirectDiffuse *= .68;`)
      .replace('#include <opaque_fragment>', `outgoingLight = ridgeAir(outgoingLight, vPaddyWorld);
        #include <opaque_fragment>`);
  };
  poolMaterial.customProgramCacheKey = () => 'pine-sky-reflecting-paddies';
  const pools = new THREE.Mesh(poolGeometry, poolMaterial);
  pools.name = 'Level flooded beds reflecting the sky';
  return [soil, pools];
}

function fallingWater(field, look) {
  const batch = { points: [], uv: [], indices: [] }, streams = [], waterKind = [];
  for (const [branch, route] of drains.entries()) {
    const plan = new THREE.CatmullRomCurve3(route.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const samples = Math.ceil(plan.getLength() * 2.4);
    const current = t => plan.getPointAt(t);
    const bank = edge => t => {
      const point = current(t), ahead = current(Math.min(1, t + .006)), behind = current(Math.max(0, t - .006));
      const grade = (field.surfaceAt(behind.x, -behind.z) - field.surfaceAt(ahead.x, -ahead.z))
        / Math.max(.001, ahead.distanceTo(behind));
      const direction = ahead.sub(behind).normalize();
      const cells = route[Math.min(route.length - 1, Math.round(t * (route.length - 1)))][2];
      const ledge = smoothstep(grade, .24, .89);
      const width = (.16 + .19 * Math.sqrt(Math.min(cells, 1600) / 1600))
        * lerp(1.42, .72, ledge) * (branch ? .60 : 1);
      const x = point.x - direction.z * edge * width, z = point.z + direction.x * edge * width;
      return [x, field.surfaceAt(x, -z) + .079, z];
    };
    // This strip uses a separate, transverse mesh orientation.
    strip(batch, [0, 1], bank(-1), bank(1), samples);
    for (let i = 0; i <= samples; i++) {
      const from = current(Math.max(0, (i - 1) / samples)), to = current(Math.min(1, (i + 1) / samples));
      const fall = field.surfaceAt(from.x, -from.z) - field.surfaceAt(to.x, -to.z);
      const rapid = smoothstep(fall / Math.max(.001, from.distanceTo(to)), .40, .96);
      streams.push(rapid, rapid);
      waterKind.push(0, 0);
    }

    if (branch !== 0) continue;
    // Find a sustained measured drop, then release a narrow jet over the lip.
    // The subdued stream underneath continues along the original drainage.
    const heightAt = point => field.surfaceAt(point.x, -point.z);
    let selected = null;
    const run = 4.8 / plan.getLength();
    for (let i = Math.ceil(samples * .28); i < samples * .78; i++) {
      const t = i / samples, start = current(t), end = current(t + run);
      const y = heightAt(start), floor = heightAt(end), drop = y - floor;
      if (floor > -8.5 && drop > Math.max(2.2, selected?.drop ?? 0)) {
        selected = { start, end, y, floor, drop };
      }
    }
    if (!selected) continue;
    const { start, end, y, floor, drop } = selected;
    const heading = end.clone().sub(start).normalize();
    const lane = side => t => {
      const point = start.clone().lerp(end, t);
      const width = .25 - .075 * Math.sin(t * Math.PI) + .09 * t;
      const x = point.x - heading.z * width * side, z = point.z + heading.x * width * side;
      const freefall = y - drop * t ** 1.6 + .078;
      return [x, Math.max(field.surfaceAt(x, -z) + .064, freefall), z];
    };
    strip(batch, [0, 1], lane(-1), lane(1), 22);
    streams.push(...Array(46).fill(1));
    waterKind.push(...Array(46).fill(1));

    // Spray rises from the landing, in the same transparent draw.
    const first = batch.points.length / 3;
    const px = end.x, pz = end.z + .12;
    batch.points.push(px - 1.20, floor - .10, pz, px + 1.20, floor - .10, pz,
      px - .83, floor + 1.45, pz, px + .83, floor + 1.45, pz);
    batch.uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    batch.indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
    streams.push(0, 0, 0, 0);
    waterKind.push(2, 2, 2, 2);
  }
  const geometry = toGeometry(batch);
  geometry.setAttribute('rapid', new THREE.Float32BufferAttribute(streams, 1));
  geometry.setAttribute('waterKind', new THREE.Uint8BufferAttribute(waterKind, 1));
  const object = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: look, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: `
      attribute float rapid, waterKind;
      varying float vRapid, vKind;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        vUv = uv;
        vRapid = rapid;
        vKind = waterKind;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying float vRapid, vKind;
      ${NOISE}
      ${ATMOSPHERE}
      void main() {
        float light = mix(1., .39, uNight);
        float distanceVeil = 1. - climbHaze();
        if (vKind > 1.5) {
          vec2 shape = (vUv - vec2(.5, .38)) * vec2(2.12, 1.69);
          float cloud = softNoise(vUv * vec2(5., 6.) - vec2(uTime * .31, uTime * .43));
          float edge = (1. - smoothstep(.25, 1., length(shape) + .20 * (.5 - cloud)))
            * smoothstep(.01, .23, vUv.y);
          vec3 spray = ridgeAir(vec3(.48, .57, .61) * light, vWorld);
          gl_FragColor = vec4(spray, edge * cloud * distanceVeil * .37);
          return;
        }
        float sides = 1. - smoothstep(.17, .50, abs(vUv.x - .5));
        float ends = smoothstep(0., .085, vUv.y) * (1. - smoothstep(.86, 1., vUv.y));
        float plunge = smoothstep(-12.4, -7., vWorld.y);
        float streak = .5 + .5 * sin(vUv.y * 124. - uTime * 6.3 + vUv.x * 14.5);
        float broken = softNoise(vec2(vUv.y * 27.3 + 3.8, vUv.x * 3.2));
        float aerated = smoothstep(.33, .84, vRapid) * smoothstep(.44, .78, broken + streak * .12);
        vec3 water = mix(vec3(.046, .094, .107), vec3(.43, .55, .59), aerated);
        float opacity = sides * ends * distanceVeil * plunge * (.09 + .20 * aerated);
        if (vKind > .5) {
          float ribbons = smoothstep(.20, .84, .57 * broken + .43 * streak);
          water = mix(vec3(.22, .35, .39), vec3(.77, .83, .81), ribbons);
          opacity = sides * ends * distanceVeil * (.56 + .28 * ribbons);
        }
        gl_FragColor = vec4(ridgeAir(water * light, vWorld), opacity);
      }
    `,
  }));
  object.name = 'Drainage-fed hillside cascades';
  return object;
}

function cloudBanks(field, look) {
  const batch = { points: [], indices: [] }, layers = [], terrainGaps = [];
  const width = 65, length = 47;
  for (const [layer, y] of [-16, -11.6, -8.0].entries()) {
    const first = batch.points.length / 3;
    for (let row = 0; row < length; row++) {
      const depth = lerp(18, 640, (row / (length - 1)) ** 1.68);
      for (let i = 0; i < width; i++) {
        const x = lerp(-1, 1, i / (width - 1)) * Math.min(730, depth * 1.21 + 36);
        // Wisps lift onto the far slopes while the denser banks stay in
        // the river channel. Leave the near pools below the higher layer.
        const lift = layer === 2 ? 4.1 * smoothstep(depth, 111, 195) : 0;
        batch.points.push(x, y + lift, -depth);
        layers.push(layer);
        terrainGaps.push(y + lift - field.surfaceAt(x, depth));
        if (i < width - 1 && row < length - 1) {
          const a = first + row * width + i;
          batch.indices.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
        }
      }
    }
  }
  const geometry = toGeometry(batch);
  geometry.setAttribute('layer', new THREE.Float32BufferAttribute(layers, 1));
  geometry.setAttribute('terrainGap', new THREE.Float32BufferAttribute(terrainGaps, 1));
  const object = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: look, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float uTime;
      attribute float layer, terrainGap;
      varying vec3 vWorld;
      varying float vLayer, vTerrainGap;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        vLayer = layer;
        float ripple = sin(vWorld.x * .081 + uTime * .034 + layer) * sin(vWorld.z * .069 - uTime * .027);
        float lift = ripple * 1.19 + .43 * sin(vWorld.z * .21 + vWorld.x * .043 + uTime * .029);
        vWorld.y += lift;
        vTerrainGap = terrainGap + lift;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vLayer, vTerrainGap;
      ${NOISE}
      ${ATMOSPHERE}
      void main() {
        vec2 drift = vec2(uTime * (.013 + vLayer * .002), -uTime * .007);
        vec2 world = vWorld.xz * vec2(.057, .041) + vec2(-3.8, 9.3) * vLayer + drift;
        float billow = softNoise(world + vec2(.47 * sin(world.y), .35 * cos(world.x * 1.17)));
        float fold = softNoise(world * 2.03 - drift * .42 + 5.3);
        float wisp = softNoise(world * 4.21 + vec2(7.8, 3.2) * vLayer);
        float bank = billow * .63 + fold * .31 + wisp * .06;
        float coverage = smoothstep(.30, .64, bank + uDusk * .073 - vLayer * .044);
        float lift = smoothstep(.31, .72, bank * .69 + .31 * fold);
        vec3 dark = mix(vec3(.21, .29, .34), vec3(.034, .058, .092), uNight);
        vec3 bright = mix(vec3(.47, .58, .63), vec3(.103, .161, .225), uNight);
        vec3 cloud = mix(dark, bright, lift) * mix(vec3(1.), vec3(1.10, .97, .87), uDusk * .32);
        float shore = smoothstep(18., 38., -vWorld.z) * (1. - smoothstep(491., 640., -vWorld.z));
        float aboveLand = smoothstep(.11, 3.5, vTerrainGap);
        float grazed = smoothstep(.015, .134, normalize(cameraPosition - vWorld).y);
        float opacity = coverage * shore * aboveLand * mix(.67, 1., grazed)
          * (.43 - vLayer * .052) * (1. - climbHaze() * .64);
        gl_FragColor = vec4(ridgeAir(cloud, vWorld), opacity);
      }
    `,
  }));
  object.name = 'Separately drifting low cloud banks';
  // Draw the low cloud after the cascades so passing wisps can veil the
  // channel. The three strata share the same depth-tested mesh.
  object.renderOrder = 1;
  return object;
}

export function createPineGateVista(initialLight = { n: 1, g: 0 }) {
  const daySun = new THREE.Vector3(...pineDaySunDirection), canopy = canopyTexture();
  const look = { uNight: { value: initialLight.n }, uDusk: { value: initialLight.g }, uTime: { value: 0 },
    uDaySun: { value: daySun }, uCanopy: { value: canopy }, uHazeDay: { value: new THREE.Color(0x8aaaca) },
    uHazeNight: { value: new THREE.Color(0x2a4057) }, uHazeDusk: { value: new THREE.Color(0xa095a2) } };
  const field = createTerrainField(), group = new THREE.Group();
  group.name = 'Pine Gate valley vista';
  group.add(tessellatedTerrain(field, look), ...fieldSurfaces(field, look), cloudBanks(field, look), fallingWater(field, look));
  return {
    group,
    update(time, light = initialLight) {
      look.uTime.value = time;
      look.uNight.value = light.n;
      look.uDusk.value = light.g;
    },
    dispose() {
      if (!group.children.length) return;
      group.removeFromParent();
      canopy.dispose();
      for (const object of group.children) {
        object.geometry.dispose();
        object.material.dispose();
      }
      group.clear();
    },
  };
}
