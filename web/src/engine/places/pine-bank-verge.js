import * as THREE from 'three';

// x, z, scale and a broad search midpoint in metres. The heights here only
// identify the correct ground band. Actual roots use the resident terrain mesh.
const bankSites = [
  [-2.95, 31.15, .61, 1.58], [-3.14, 29.8, .83, 1.74], [-4.15, 30.75, .72, 1.92],
  [-2.77, 28.35, .75, 1.79], [-3.9, 28.15, .88, 2.10], [-2.86, 26.7, .59, 1.97],
  [-4.15, 25.95, .90, 2.40], [-2.70, 24.96, .55, 2.09], [-3.48, 24.64, .84, 2.35],
  [-2.43, 23.2, .53, 2.24], [-3.68, 22.6, .93, 2.70], [-3.08, 20.7, .66, 2.80],
  [-3.74, 18.85, .61, 3.68],
  [2.63, 31.7, .59, 1.46], [3.49, 30.12, .72, 1.81], [2.73, 27.95, .66, 1.86],
  [3.4, 26.8, .83, 2.16], [2.63, 25.19, .73, 2.12], [3.04, 23.78, .67, 2.42],
  [2.56, 22.56, .66, 2.39], [3.39, 21.93, .83, 2.81], [2.94, 20.35, .62, 2.84],
  [2.85, 18.65, .55, 2.87], [3.48, 18.45, .71, 3.31],
  [-3.25, 30.83, .83, 1.67], [-3.61, 29.07, .81, 2.04], [-3.01, 27.54, .76, 1.87],
  [-3.33, 26.15, .68, 1.98], [-2.60, 25.85, .66, 1.99], [-3.16, 23.97, .78, 2.25],
  [-2.68, 22.51, .66, 2.42], [-3.92, 21.35, .89, 2.85],
  [3.01, 31.02, .76, 1.67], [3.14, 28.34, .84, 1.96], [2.91, 27.14, .87, 2.12],
  [3.17, 25.99, .82, 2.16], [3.52, 24.97, .86, 2.27], [2.85, 23.18, .65, 2.47],
  [2.88, 21.55, .64, 2.58], [3.45, 19.33, .74, 2.99],
];
const groundcoverSites = [
  [-2.0, 32.42, .65, 1.27], [-2.84, 32.7, 1.03, 1.46], [-3.76, 32.8, 1.26, 1.74],
  [-2.1, 31.45, .86, 1.40], [-2.65, 30.04, .72, 1.63], [-3.48, 30.05, 1.32, 1.80],
  [-2.42, 28.6, .76, 1.88], [-3.56, 28.2, 1.25, 2.24], [-4.2, 27.1, 1.12, 2.44],
  [-2.9, 26.22, .89, 2.05], [-2.78, 25.05, .85, 2.18], [-3.14, 23.06, 1.03, 2.25],
  [-2.3, 22.12, .84, 2.41], [-3.46, 21.10, 1.36, 2.55], [-2.88, 20.05, 1.16, 2.62],
  [-3.41, 17.94, 1.31, 3.19], [-2.40, 18.08, .76, 2.93],
  [2.04, 32.87, .69, 1.28], [2.77, 32.22, .97, 1.54], [3.89, 32.95, 1.12, 1.72],
  [2.15, 30.62, .68, 1.48], [2.90, 29.27, 1.16, 1.64], [4.16, 29.75, 1.34, 1.98],
  [2.42, 28.18, .78, 1.68], [3.68, 27.61, 1.21, 2.19], [3.19, 25.78, 1.08, 2.19],
  [2.26, 24.25, .74, 2.17], [3.6, 24.18, 1.37, 2.42], [3.18, 22.91, 1.09, 2.41],
  [2.86, 21.02, 1.09, 2.71], [3.92, 20.47, 1.23, 2.98], [3.38, 18.90, 1.13, 2.98],
  [4.02, 17.64, 1.28, 3.35], [3.25, 16.90, 1.16, 3.37],
  // Low growth along the soil side of the stonework leaves the tread clear.
  [-1.67, 32.6, .61, 1.27], [-1.72, 31.93, .77, 1.35], [-1.81, 29.27, .55, 1.57],
  [-1.93, 26.38, .63, 1.81], [-1.84, 18.43, .88, 2.71], [-1.72, 17.74, .64, 2.82],
  [1.76, 32.39, .93, 1.28], [1.93, 31.81, .72, 1.37], [1.72, 29.47, .62, 1.55],
  [1.70, 27.11, .86, 1.79], [1.94, 26.38, .65, 1.87], [1.88, 24.70, .73, 2.08],
  // Evergreen pockets beneath the upper west stand, beyond the stone verge.
  [-9.8, 8.95, 1.30, 5.76], [-8.04, 10.23, 1.39, 4.98], [-9.15, 11.71, 1.18, 5.20],
  [-7.12, 11.90, 1.27, 4.53], [-10.2, 13.16, 1.22, 5.46], [-8.44, 13.81, 1.45, 4.65],
  [-6.40, 14.41, 1.10, 4.12], [-7.62, 16.30, 1.36, 4.20], [-5.31, 17.58, 1.27, 3.86],
  [-6.25, 19.43, 1.41, 3.69], [-4.78, 19.96, 1.03, 3.49], [-6.26, 21.38, 1.46, 3.58],
];

// The trunk shade on the west side continues down to the damp bridge shelf.
// Reuse the fern and evergreen geometries, with small litter pockets below.
const evergreenProfile = 2;
const litterProfile = 3;
const westBankSites = [
  [-4.49, 18.43, .88, 3.80, 1], [-4.12, 19.52, .69, 3.46, 0], [-4.59, 20.33, .82, 3.45, 1],
  [-3.70, 20.04, .91, 3.04, evergreenProfile], [-4.91, 21.13, 1.06, 3.33, evergreenProfile],
  [-3.25, 21.64, .66, 2.75, 1], [-4.60, 21.91, .81, 3.11, 0], [-3.75, 22.14, .89, 2.69, evergreenProfile],
  [-2.12, 21.07, .51, 2.39, evergreenProfile],
  [-4.64, 18.81, 1.07, 3.72, litterProfile], [-4.12, 20.02, 1.00, 3.37, litterProfile],
  [-4.62, 20.15, 1.10, 3.43, litterProfile], [-3.46, 20.64, .85, 2.84, litterProfile],
  [-4.52, 21.12, .95, 3.21, litterProfile], [-4.11, 21.76, .87, 3.08, litterProfile],
  [-2.25, 21.02, .75, 2.40, litterProfile], [-1.90, 21.51, .67, 2.36, litterProfile],
  [-1.62, 21.77, .62, 2.32, litterProfile], [-1.68, 22.04, .71, 2.30, litterProfile],
  [-1.81, 22.22, .76, 2.30, litterProfile],
];

const pavilionVergeSites = [
  [4.78, 2.37, 1.02, 3.966, 0], [5.22, 2.13, 1.16, 4.234, evergreenProfile],
  [4.51, 3.05, .67, 3.802, 1], [5.01, 2.92, .78, 4.106, evergreenProfile],
  [5.56, 2.68, 1.25, 4.440, 1], [5.28, 3.63, 1.03, 4.263, 0],
  [4.64, 4.10, .72, 3.893, evergreenProfile], [5.93, 3.14, 1.22, 4.663, evergreenProfile],
  [5.53, 4.14, .83, 4.412, 1], [5.15, 4.68, .82, 4.299, evergreenProfile],
];
const detailedFernSites = new Set([
  bankSites[3], bankSites[22], bankSites[31],
  pavilionVergeSites[0], pavilionVergeSites[2], pavilionVergeSites[4], pavilionVergeSites[5], pavilionVergeSites[8],
]);

const around = 2 * Math.PI;
const frondSeeds = [809, 1537];
const down = new THREE.Vector3(0, -1, 0);
const up = new THREE.Vector3(0, 1, 0);

function randomFrom(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function approachTerrain(group) {
  const meshes = [];
  group.traverse(object => {
    if (!object.isMesh || object.material?.name !== 'Damp pine needle litter') return;
    for (let parent = object; parent; parent = parent.parent) {
      const region = parent.userData.lightmap_region ?? parent.userData.region;
      if (region) {
        if (region === 'approach') meshes.push(object);
        break;
      }
    }
  });
  return meshes;
}

function dressForestFloor(material) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => cacheKey + '-pine-forest-floor';
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 forestFloor = vBakedWorld.xz;
      float liveCover = pineFloorNoise(forestFloor * 1.6) * .56
        + pineFloorNoise(forestFloor * 5.1) * .29 + pineFloorNoise(forestFloor * 16.3) * .15;
      float alongBank = smoothstep(14., 17., forestFloor.y) * (1. - smoothstep(35., 44., forestFloor.y));
      float atVerge = smoothstep(.93, 2.35, abs(forestFloor.x));
      float mossThreads = smoothstep(.30, .71, liveCover) * alongBank * atVerge;
      diffuseColor.rgb *= mix(vec3(1.), vec3(.51, 1.02, .68), mossThreads * .88);
      float westSlope = smoothstep(4.3, 6.3, -forestFloor.x)
        * (1. - smoothstep(11.8, 14., -forestFloor.x))
        * smoothstep(6.6, 8.3, forestFloor.y) * (1. - smoothstep(18.4, 23., forestFloor.y));
      vec3 shadedGround = mix(vec3(.64, .79, .65), vec3(.36, .87, .48), smoothstep(.24, .66, liveCover));
      float westernVerge = smoothstep(2.52, 3.64, -forestFloor.x)
        * (1. - smoothstep(4.9, 5.9, -forestFloor.x))
        * smoothstep(17.05, 18.3, forestFloor.y) * (1. - smoothstep(22.0, 23.1, forestFloor.y));
      float bridgeShelf = smoothstep(1.27, 1.55, -forestFloor.x)
        * (1. - smoothstep(1.88, 2.43, -forestFloor.x))
        * smoothstep(20.45, 21.10, forestFloor.y) * (1. - smoothstep(22.10, 22.62, forestFloor.y));
      diffuseColor.rgb *= mix(vec3(1.), shadedGround, max(westSlope, westernVerge));
      vec3 mossAtBridge = mix(vec3(.82, .90, .81), vec3(.48, .83, .55), liveCover);
      diffuseColor.rgb *= mix(vec3(1.), mossAtBridge, bridgeShelf * .86);
      float pavilionBank = smoothstep(4.36, 4.84, forestFloor.x)
        * (1. - smoothstep(6.41, 7.3, forestFloor.x))
        * smoothstep(.4, 1.96, forestFloor.y) * (1. - smoothstep(4.75, 5.61, forestFloor.y));
      diffuseColor.rgb *= mix(vec3(1.), shadedGround, pavilionBank);
      float pineLitter = smoothstep(.37, .78, pineFloorNoise(forestFloor * 13.3));
      diffuseColor.rgb *= mix(vec3(.83, .87, .89), vec3(1.08, 1.07, 1.02), pineLitter * .65);
    `);
    shader.fragmentShader = `
      float pineFloorHash(vec2 cell) {
        vec3 p = fract(vec3(cell.xyx) * .1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float pineFloorNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f *= f * (3. - 2. * f);
        return mix(mix(pineFloorHash(cell), pineFloorHash(cell + vec2(1., 0.)), f.x),
          mix(pineFloorHash(cell + vec2(0., 1.)), pineFloorHash(cell + 1.), f.x), f.y);
      }
    ` + shader.fragmentShader;
  };
}

function fernProfile(seed, frondCount) {
  const random = randomFrom(seed);
  const positions = [], colors = [], indices = [];
  const green = new THREE.Color(0x36562b), young = new THREE.Color(0x5b7433);
  const vein = new THREE.Color(0x4d562b), base = new THREE.Color(0x3b3d24);
  const color = green.clone();
  const vertex = (point, tone, brightness = 1) => {
    const i = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    colors.push(tone.r * brightness, tone.g * brightness, tone.b * brightness);
    return i;
  };

  for (let frond = 0; frond < frondCount; frond++) {
    const direction = frond * 2.39996 + (random() - .5) * .47;
    const forward = new THREE.Vector3(Math.cos(direction), 0, Math.sin(direction));
    const across = new THREE.Vector3(-forward.z, 0, forward.x);
    const reach = .57 + .45 * random();
    const rise = .27 + .40 * random();
    const drift = (random() - .5) * .14;
    const frondAt = t => forward.clone().multiplyScalar(reach * t ** 1.24)
      .addScaledVector(across, drift * t * t)
      .setY(rise * Math.sin(2.45 * t) - .071 * t ** 3);

    // A living central stipe supports the individual pinnae above the bank.
    const stem = positions.length / 3;
    for (let row = 0; row <= 10; row++) {
      const t = row / 10;
      const center = frondAt(t);
      const thickness = .011 * (1 - t) + .0019;
      const normal = frondAt(Math.min(1, t + .02)).sub(frondAt(Math.max(0, t - .02))).cross(across).normalize();
      const tone = color.copy(base).lerp(vein, Math.min(1, 1.6 * t));
      for (let edge = 0; edge < 3; edge++) {
        const angle = edge * around / 3;
        vertex(center.clone().addScaledVector(across, thickness * Math.cos(angle))
          .addScaledVector(normal, thickness * Math.sin(angle)), tone);
      }
      if (!row) continue;
      for (let edge = 0; edge < 3; edge++) {
        const lower = stem + (row - 1) * 3;
        const next = (edge + 1) % 3;
        indices.push(lower + edge, lower + next, lower + edge + 3,
          lower + next, lower + next + 3, lower + edge + 3);
      }
    }

    for (let pair = 0; pair < 9; pair++) {
      const row = .22 + .70 * pair / 8;
      const profile = Math.sin(Math.PI * (.20 + .80 * row)) ** .84;
      for (const side of [-1, 1]) {
        const t = row + side * .019 + (random() - .5) * .020;
        const anchor = frondAt(t);
        const length = (.17 + .10 * random()) * reach * profile;
        const tip = anchor.clone().addScaledVector(across, length * side)
          .addScaledVector(forward, length * (.28 + .30 * row));
        tip.y += length * (.10 + (random() - .61) * .31);
        const axis = tip.clone().sub(anchor).normalize();
        const margin = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
        margin.y = side * (.12 + (random() - .5) * .38);
        const breadth = length * (.122 + .084 * random());
        const tone = color.copy(green).lerp(young, .08 + .62 * random() + row * .21);
        const first = vertex(anchor, tone, .68);
        for (const [part, width] of [[.31, .91], [.66, .67]]) {
          const middle = anchor.clone().lerp(tip, part);
          middle.y += length * .085 * Math.sin(Math.PI * part);
          vertex(middle.clone().addScaledVector(margin, breadth * width), tone, .85);
          vertex(middle.clone().setY(middle.y + breadth * .32), tone, 1.09);
          vertex(middle.clone().addScaledVector(margin, -breadth * width * (.8 + .22 * random())), tone, .95);
        }
        vertex(tip, tone, 1.02);
        for (const face of [[0, 1, 2], [0, 2, 3], [1, 4, 2], [4, 5, 2], [2, 5, 3], [5, 6, 3], [4, 7, 5], [5, 7, 6]]) {
          indices.push(...face.map(index => first + index));
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function evergreenShoots() {
  const random = randomFrom(21689);
  const positions = [], colors = [], indices = [];
  const leaf = new THREE.Color(0x68834a);
  const tip = new THREE.Color(0x7f9452);
  const stem = new THREE.Color(0x605742);
  const tone = new THREE.Color();
  const vertex = (point, color, weight = 1) => {
    const i = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    colors.push(color.r * weight, color.g * weight, color.b * weight);
    return i;
  };

  for (let branch = 0; branch < 7; branch++) {
    const heading = branch * 2.39996 + .25 * random();
    const u = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    const side = new THREE.Vector3(-u.z, 0, u.x);
    const extension = .22 + .28 * random();
    const height = .14 + .25 * random();
    const sprig = t => u.clone().multiplyScalar(extension * t).setY(-.012 + height * Math.sin(1.30 * t));
    let last = null;
    for (let section = 0; section <= 6; section++) {
      const t = section / 6;
      const point = sprig(t);
      const diameter = .006 * (1 - t) + .0016;
      const rib = [
        vertex(point.clone().addScaledVector(side, diameter), stem),
        vertex(point.clone().addScaledVector(side, -diameter), stem),
        vertex(point.clone().add(new THREE.Vector3(0, diameter, 0)), stem),
      ];
      if (last) {
        for (let edge = 0; edge < 3; edge++) {
          const next = (edge + 1) % 3;
          indices.push(last[edge], rib[edge], last[next], last[next], rib[edge], rib[next]);
        }
      }
      last = rib;
      if (section < 2) continue;
      const attachment = sprig(t - .04);
      for (const sign of [-1, 1]) {
        const span = (.05 + .074 * random()) * (1.06 - .45 * t);
        const end = attachment.clone().addScaledVector(u, span * .45)
          .addScaledVector(side, sign * span);
        end.y += span * (.07 + .26 * random());
        const centre = attachment.clone().lerp(end, .46);
        const edge = u.clone().addScaledVector(side, -.45 * sign).multiplyScalar(span * .27);
        tone.copy(leaf).lerp(tip, .6 * random());
        const start = vertex(attachment, tone, .77);
        vertex(centre.clone().add(edge), tone, .82);
        vertex(centre.clone().add(new THREE.Vector3(0, span * .11, 0)), tone, 1.05);
        vertex(centre.clone().sub(edge), tone, .94);
        vertex(end, tone);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3,
          start + 1, start + 4, start + 2, start + 2, start + 4, start + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function fallenNeedles() {
  const random = randomFrom(44129);
  const positions = [], colors = [], indices = [];
  const fresh = new THREE.Color(0x665840), worn = new THREE.Color(0x473b2c);
  const color = new THREE.Color();
  for (let i = 0; i < 28; i++) {
    const bearing = random() * around, radius = .11 * Math.sqrt(random());
    const x = radius * Math.cos(bearing), z = radius * Math.sin(bearing);
    const angle = random() * around, length = .060 + .069 * random(), width = .0013 + .0012 * random();
    const dx = Math.cos(angle), dz = Math.sin(angle), y = .0006 + .0032 * random();
    const cx = x + dx * length * .56, cz = z + dz * length * .56;
    const start = positions.length / 3;
    positions.push(x, y, z, cx - dz * width, y + .002, cz + dx * width,
      x + dx * length, y, z + dz * length, cx + dz * width, y + .001, cz - dx * width);
    color.copy(worn).lerp(fresh, random());
    for (let vertex = 0; vertex < 4; vertex++) colors.push(color.r, color.g, color.b);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPineBankVerge(bakedGroup, fern) {
  const terrain = approachTerrain(bakedGroup);
  if (!terrain.length) return null;
  for (const material of new Set(terrain.map(object => object.material))) dressForestFloor(material);
  bakedGroup.updateWorldMatrix(true, true);
  const origin = new THREE.Vector3(), normal = origin.clone(), tint = new THREE.Color();
  const normalMatrix = new THREE.Matrix3(), ray = new THREE.Raycaster(origin, down, 0, .68);
  const profiles = [() => fernProfile(frondSeeds[0], 6), () => fernProfile(frondSeeds[1], 7),
    evergreenShoots, fallenNeedles];
  const nativeFern = fern?.getObjectByName('fern_02_a');
  if (fern && !nativeFern?.isMesh) throw new Error('Missing Pine Gate fern prototype');
  const detailProfile = profiles.length;
  if (nativeFern) {
    fern.updateMatrixWorld(true);
    profiles.push(() => nativeFern.geometry);
  }
  const accepted = profiles.map(() => []);
  const allBanks = [...bankSites, ...groundcoverSites, ...westBankSites, ...pavilionVergeSites];
  for (const [i, site] of allBanks.entries()) {
    const [x, z, size, searchY, siteProfile] = site;
    origin.set(x, searchY + .50, z);
    ray.set(origin, down);
    const hit = ray.intersectObjects(terrain, false).find(candidate => {
      normalMatrix.getNormalMatrix(candidate.object.matrixWorld);
      return normal.copy(candidate.face.normal).applyNormalMatrix(normalMatrix).y > .46;
    });
    const scanned = nativeFern && detailedFernSites.has(site);
    const profile = scanned ? detailProfile : siteProfile ?? (i < bankSites.length ? i % frondSeeds.length : evergreenProfile);
    if (hit) accepted[profile].push({ i, root: hit.point, size, surface: normal.clone() });
  }
  if (accepted.every(profile => !profile.length)) return null;

  const group = new THREE.Group();
  group.name = 'Rooted bank wood ferns and evergreen groundcover';
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .80, metalness: 0, side: THREE.DoubleSide, envMapIntensity: .24,
  });
  const placement = new THREE.Object3D(), angle = new THREE.Quaternion();
  for (const [profile, sites] of accepted.entries()) {
    if (!sites.length) continue;
    const scanned = profile === detailProfile;
    const sprouts = new THREE.InstancedMesh(profiles[profile](), scanned ? nativeFern.material : material, sites.length);
    for (const [instance, { i, root, size, surface }] of sites.entries()) {
      const random = randomFrom(Math.imul(i + 97, 9419));
      placement.position.copy(root);
      const azimuth = random() * around;
      if (profile === litterProfile) {
        placement.position.addScaledVector(surface, .003);
        placement.quaternion.setFromUnitVectors(up, surface).multiply(angle.setFromAxisAngle(up, azimuth));
        placement.scale.set(size, size, size);
      } else {
        placement.position.y -= .021;
        placement.rotation.set(0, azimuth, 0);
        placement.scale.set(size * (1.19 + .18 * random()), size * (.87 + .33 * random()), size * 1.19);
        if (scanned && allBanks[i] !== pavilionVergeSites[4]) {
          placement.scale.multiply(new THREE.Vector3(1.6, 1.25, 1.6));
        }
      }
      placement.updateMatrix();
      if (scanned) placement.matrix.multiply(nativeFern.matrixWorld);
      sprouts.setMatrixAt(instance, placement.matrix);
      const brightness = (profile < frondSeeds.length ? .62 : .83) + .25 * random();
      sprouts.setColorAt(instance, tint.setRGB(brightness * .97, brightness, brightness * (.87 + .11 * random())));
    }
    sprouts.computeBoundingSphere();
    group.add(sprouts);
  }
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const sprouts of group.children) {
        sprouts.dispose();
        if (sprouts.geometry !== nativeFern?.geometry) sprouts.geometry.dispose();
      }
      material.dispose();
      group.clear();
    },
  };
}
