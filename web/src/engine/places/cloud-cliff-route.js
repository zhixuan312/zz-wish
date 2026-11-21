// Private geometry preview. The shipped Home descriptor does not import this module.
import { addCloudCliffGorge, GORGE_PROBES } from './cloud-cliff-gorge.js';
export const ROUTE_DURATION = 30;
export const ROUTE_FLOOR = [
  [-18, 2], [-9, 1.2], [-2, .1], [6.3, -.5], [7.6, .78], [9.15, 1.58], [10.7, 1.64],
  [11.6, 1.45], [12.5, .91], [13.4, .7],
  [14, 4.7], [13.8, 9.4], [12.7, 12.6], [4, 13.1], [-5, 13.6], [-18, 13.5],
];
export const ROUTE_WALL = [
  [-17, 3], [-11, 2.5], [-6, 2.6], [-2, 2.3], [2.7, 2.4], [5.5, 3],
  [7.1, 4], [8.45, 5.25], [8.85, 6.15], [8.6, 6.9], [4.6, 7.05],
  [1.2, 6.5], [-2.1, 6.75], [-5.5, 6.85], [-8.1, 6.65], [-12.5, 7],
  [-17, 6.75],
];
export const ROUTE_LANTERN = [11.77, 1.34, 2.25];
const SPUR = [[11, 2.81], [11.44, 2.8], [11.68, 2.88], [11.76, 3.02],
  [11.55, 3.13], [11.05, 3.12], [10.91, 3.04]];

const PATH = [
  [0, -14, 9.6], [3, -12.3, 9.6], [12, -3.15, 9.55], [19, 3.9, 9.45],
  [22, 6.7, 9.3], [24, 8.8, 8.55], [26, 10.45, 5.9], [27.1, 10.76, 5.13], [28.65, 11.95, 4.23],
  [ROUTE_DURATION, 11.95, 4.23],
];
const ROCK_HEIGHTS = [7.5, 8.3, 7.7, 7.1, 6.7, 6.1, 5.7, 5.4, 5.8, 6.1, 6.65, 6.9, 7.6, 7.5, 8.1, 7.6, 7.7];
const WALK_FOV = 51;
const WICK_SOURCE = [4.500392913818359, 1.7925620079040527, 0];
const BASE_SOURCE_Y = 1.54;

function positionAt(time, axis) {
  const index = PATH.findIndex(point => point[0] >= time);
  if (index === 0) return PATH[0][axis];
  const a = PATH[index - 1], b = PATH[index];
  const before = PATH[index - 2] ?? a, after = PATH[index + 1] ?? b;
  const duration = b[0] - a[0];
  const u = (time - a[0]) / duration;
  const u2 = u * u, u3 = u2 * u;
  // Stop flat on the shoulder and start from rest.
  const da = (before === a || index === PATH.length - 1) ? 0 : (b[axis] - before[axis]) / (b[0] - before[0]);
  const db = (after === b || b[0] >= 28.5) ? 0 : (after[axis] - a[axis]) / (after[0] - a[0]);
  return (2 * u3 - 3 * u2 + 1) * a[axis] + (u3 - 2 * u2 + u) * duration * da
    + (-2 * u3 + 3 * u2) * b[axis] + (u3 - u2) * duration * db;
}

function smoothRange(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function lookYaw(t, phone) {
  const open = phone ? -13.5 : -30;
  const keys = [[0, 70, 0], [12, 71, 0], [17, 65, -3], [22, phone ? 34 : 26, -12],
    [25.3, open, 0], [27.27, open, 0], [ROUTE_DURATION, -5, 0]];
  const i = keys.findIndex(([time]) => time >= t);
  if (i === 0) return keys[0][1] * Math.PI / 180;
  const [ta, a, da] = keys[i - 1], [tb, b, db] = keys[i];
  const span = tb - ta, u = (t - ta) / span;
  const blend = u * u * (3 - 2 * u);
  const yaw = a + (b - a) * blend + span * u * (1 - u) * ((1 - u) * da - u * db);
  return yaw * Math.PI / 180;
}

function boundaryDistance(polygon, x, z) {
  let distance = Infinity;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j], [bx, bz] = polygon[i];
    const dx = bx - ax, dz = bz - az;
    const along = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - ax - along * dx, z - az - along * dz));
    if ((az > z) !== (bz > z) && x < ax + (z - az) * dx / dz) inside = !inside;
  }
  return inside ? distance : -distance;
}

export function sampleCloudCliffRoute(seconds, phone = false) {
  const t = Math.max(0, Math.min(ROUTE_DURATION, seconds));
  const x = positionAt(t, 1), y = 1.62, z = positionAt(t, 2);
  const yaw = lookYaw(t, phone);
  const phoneShoulder = phone ? .035 * smoothRange(17, 22, t) * (1 - smoothRange(22, 25.3, t)) : 0;
  const pitch = -.205 - phoneShoulder - .055 * smoothRange(22, 25.3, t) + .09 * smoothRange(27.4, 30, t);
  const aim = 6;
  const horizontal = Math.cos(pitch) * aim;
  return {
    t, x, y, z,
    lx: x + Math.sin(yaw) * horizontal,
    ly: y + Math.sin(pitch) * aim,
    lz: z - Math.cos(yaw) * horizontal,
    fov: WALK_FOV,
    floorClearance: y,
    wallClearance: Math.min(-boundaryDistance(ROUTE_WALL, x, z), -boundaryDistance(SPUR, x, z)),
    edgeClearance: boundaryDistance(ROUTE_FLOOR, x, z),
  };
}

const bandNoise = (a, b) => Math.sin(a * 12.9898 + b * 78.233) * .5 + .5;

function addRock(THREE, parent, polygon, heights, depths, palette, inset, surface, capSurface = true) {
  const positions = [], colours = [], uvs = [];
  const bands = depths.map((depth, row) => polygon.map(([x, z], i) => {
    const jitter = row === 0 ? 0 : (bandNoise(i, row) - .5) * inset;
    const [nextX, nextZ] = polygon[(i + 1) % polygon.length];
    // Keep the wall envelope at eye level within the verified clearance.
    const y = heights ? depth * heights[i] : depth + (row ? (bandNoise(row, i) - .5) * .35 : 0);
    return [x + (nextX - x) * jitter, y, z + (nextZ - z) * jitter];
  }));
  const tint = new THREE.Color();
  function face(a, b, c, colour, variation) {
    positions.push(...a, ...b, ...c);
    tint.setHex(colour).multiplyScalar(variation);
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const horizontal = a[1] === b[1] && b[1] === c[1];
    for (const [x, y, z] of [a, b, c]) {
      colours.push(tint.r, tint.g, tint.b);
      if (horizontal) uvs.push(x / 2.7, z / 2.7);
      else uvs.push((Math.abs(dx) >= Math.abs(dz) ? x : z) / 2.7, y / 2.7);
    }
  }

  for (let k = 0; k < bands.length - 1; k++) {
    const lower = bands[k], upper = bands[k + 1];
    const colour = palette[k % palette.length];
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      const variation = .84 + .29 * bandNoise(i, k);
      face(lower[i], lower[j], upper[i], colour, variation);
      face(lower[j], upper[j], upper[i], colour, variation * (1 + .045 * Math.sin(i + k)));
    }
  }

  if (capSurface) {
    const cap = heights ? bands.at(-1) : bands[0];
    const outline = cap.map(([x, , z]) => new THREE.Vector2(x, z));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outline, [])) {
      face(cap[a], cap[b], cap[c], palette[0], .93 + .16 * bandNoise(a, b));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    ...surface, vertexColors: true, roughness: .96, side: THREE.DoubleSide,
    normalScale: new THREE.Vector2(.74, .74),
  });
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

function addWornPath(THREE, scene, surface) {
  const positions = [], uvs = [], colors = [], indices = [];
  const points = [[-17, 9.65]];
  for (let t = 0; t < 28.9; t += .32) {
    const { x, z } = sampleCloudCliffRoute(t);
    if (Math.hypot(x - points.at(-1)[0], z - points.at(-1)[1]) > .045) points.push([x, z]);
  }
  points.push([11.25, 2.75]);
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [ax, az] = points[Math.max(0, i - 1)];
    const [bx, bz] = points[Math.min(points.length - 1, i + 1)];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    const radius = 1.13 + .18 * (bandNoise(i, 11) - .5);
    for (const [offset, strength] of [[-1, 0], [-.76, .67], [0, .85], [.76, .65], [1, 0]]) {
      const px = x - dz / length * radius * offset, pz = z + dx / length * radius * offset;
      positions.push(px, .012, pz);
      uvs.push(px / 1.8, pz / 1.8);
      const shade = .65 + .09 * bandNoise(i, offset);
      colors.push(shade, shade, shade * .95, strength * (i === points.length - 1 ? .25 : 1));
    }
    if (!i) continue;
    const previous = (i - 1) * 5;
    for (let j = 0; j < 4; j++) {
      const a = previous + j;
      indices.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    ...surface, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    roughness: .96, normalScale: new THREE.Vector2(.6, .6),
  })));
}

function stageRock(THREE, scene, rock, pavers) {
  const floor = addRock(THREE, scene, ROUTE_FLOOR, null, [0, -.45, -1.2, -3, -6.4, -13, -27, -55],
    [0xb3a99d, 0xa69a89, 0xb3a597, 0x9b948a, 0x9b938a, 0xa69688], .2, rock);
  const wall = addRock(THREE, scene, ROUTE_WALL, ROCK_HEIGHTS, [0, .08, .15, .32, .48, .64, .81, 1],
    [0xa49d8e, 0x9b988f, 0xa69f93, 0xada696, 0xaeab9e, 0xa19b8a], .17, rock);
  const outerBank = [[-18, 12.5], [-9, 13.4], [2, 12.75], [8.8, 13.4], [14, 13.9], [16, 9.8],
    [19, 7.8], [24, 10.6], [44, 13], [48, 37], [-18, 28]];
  // The bank extends beyond the platform. Carry its footing below the rim
  // into the valley mesh so the side of the approach has no air gap.
  addRock(THREE, scene, outerBank, null, [0, -3, -10, -26, -74],
    [0x989187, 0xa19a90, 0x898177], .12, rock, false);
  const outer = addRock(THREE, scene, outerBank, [4, 3.1, 3.5, 2.4, 3.3, 4.8, 5.1, 7.3, 10, 9.6, 4.5],
    [0, .22, .48, .74, 1], [0xa39c90, 0xa89f92, 0x969088], .13, rock);
  const spur = addRock(THREE, scene, SPUR, [2.45, 2.4, 2.44, 2.33, 2.34, 2.3, 2.35],
    [0, .3, .55, .75, 1], [0xa49d8e, 0x9b988f, 0xa69f93, 0xada696], .06, rock);
  addWornPath(THREE, scene, pavers);

  const [x, y, z] = ROUTE_LANTERN;
  const seatTop = y + (BASE_SOURCE_Y - WICK_SOURCE[1]);
  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(.37, .49, seatTop, 11, 4),
    new THREE.MeshStandardMaterial({ ...rock, color: 0xa29b90, roughness: .93, flatShading: true }),
  );
  seat.position.set(x, seatTop / 2, z);
  seat.rotation.y = Math.PI / 7;
  scene.add(seat);
  addContactShade(THREE, scene, x, seatTop, z);
  const gorge = addCloudCliffGorge(THREE, scene, rock);
  return { floor, wall, outer, spur, gorge };
}

function addContactShade(THREE, scene, x, y, z) {
  const width = 32;
  const data = new Uint8Array(width * width * 4);
  for (let j = 0; j < width; j++) {
    for (let i = 0; i < width; i++) {
      const radius = Math.hypot(i + .5 - width / 2, j + .5 - width / 2) / (width / 2);
      data[(j * width + i) * 4 + 3] = Math.round(163 * (1 - smoothRange(.44, 1, radius)));
    }
  }
  const map = new THREE.DataTexture(data, width, width);
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(.45, .45),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(x, y + .001, z);
  scene.add(mark);
}

async function scannedSurface(THREE, name) {
  const loader = new THREE.TextureLoader();
  const path = '/materials/scans/' + name + '/';
  const [map, normalMap, roughnessMap] = await Promise.all(
    ['diffuse', 'normal', 'roughness'].map(kind => loader.loadAsync(path + kind + '.jpg')),
  );
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return { map, normalMap, roughnessMap };
}

const ASSETS = '/places/cloud-cliff/';

async function loadLantern(scene, loader) {
  const storm = await loader.loadAsync(ASSETS + 'cloud-cliff-storm.glb.gzip');
  const [x, y, z] = ROUTE_LANTERN;
  storm.scene.traverse(object => {
    // These chain links supported the original hanging cover mount.
    const sourceName = object.userData.name ?? object.name;
    if (/^(?:Fixed forged hanging eye|Storm (?:upper load|second load|third load|lower load) link)$/.test(sourceName)) {
      object.visible = false;
    }
  });
  storm.scene.position.set(x - WICK_SOURCE[0], y - WICK_SOURCE[1], z - WICK_SOURCE[2]);
  scene.add(storm.scene);
  return storm.scene;
}

function setLighting(THREE, scene, night) {
  scene.background = new THREE.Color(night ? 0x1d2b41 : 0xaebfcb);
  scene.fog = new THREE.FogExp2(night ? 0x1d2b41 : 0xaebfcb, .00096);

  const hemi = new THREE.HemisphereLight(night ? 0x9bbbf0 : 0xe8f1f7, night ? 0x5e625e : 0x8a7461, night ? 1.0 : 1.8);
  const key = new THREE.DirectionalLight(night ? 0xb4c9ee : 0xffebd5, night ? 1.25 : 2.65);
  key.position.set(10, 13, 7);
  const fill = new THREE.DirectionalLight(night ? 0x88786b : 0xd7e5f4, night ? .45 : .4);
  fill.position.set(-6, 7, -2);
  scene.add(hemi, key, fill);
}

function addCatch(THREE, scene) {
  const [x, y, z] = ROUTE_LANTERN;
  // Replica of a hinged clasp for this proof. The catch meets a bowed upright
  // and the rim: nothing is attached to the translating Source19 glass asset.
  const catchGroup = new THREE.Group();
  catchGroup.position.set(x - .117, y - .014, z + .136);
  catchGroup.rotation.y = -.46;
  const brass = new THREE.MeshStandardMaterial({ color: 0x856039, roughness: .43, metalness: .79 });
  const wear = new THREE.MeshStandardMaterial({ color: 0xbe9560, roughness: .34, metalness: .76 });
  const pin = new THREE.MeshStandardMaterial({ color: 0x53422d, roughness: .53, metalness: .68 });
  function part(geo, material, px, py, pz) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(px, py, pz);
    catchGroup.add(mesh);
    return mesh;
  }
  part(new THREE.BoxGeometry(.035, .081, .015), brass, 0, -.019, -.005);
  part(new THREE.BoxGeometry(.039, .039, .025), wear, .009, .013, .004).rotation.z = -.16;
  part(new THREE.CylinderGeometry(.008, .008, .047, 14), pin, .005, -.008, .012).rotation.z = Math.PI / 2;
  for (const py of [-.043, .02]) {
    part(new THREE.SphereGeometry(.007, 12, 8), wear, -.009, py, .01).scale.z = .36;
  }
  scene.add(catchGroup);
  return catchGroup;
}

function lightLantern(THREE, renderer, scene, lantern, catchGroup, night) {
  const reflection = new THREE.Scene();
  reflection.background = new THREE.Color(night ? 0x26344d : 0x8eabc2);
  const panel = (x, y, z, width, height, tint, intensity) => {
    const color = new THREE.Color(tint).multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    reflection.add(mesh);
  };
  panel(-3, 2.2, 3.4, .65, 4.6, 0xffdda1, night ? 2.4 : 1.65);
  panel(4, 2.7, -2, 2.8, .65, 0xbacde8, night ? .8 : 1.1);
  panel(1, -3, 2, 7, 7, 0x595349, night ? .5 : 1.4);
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(reflection, .035);
  generator.dispose();
  reflection.traverse(mesh => {
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  });
  for (const group of [lantern, catchGroup]) {
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const material of [mesh.material].flat()) {
        if (!material.isMeshStandardMaterial) continue;
        material.envMap = environment.texture;
        material.envMapIntensity = night ? .8 : .55;
        if (material.transmission > .5) {
          material.roughness = .14;
          material.thickness = .002;
          material.color.setHex(0xe1e9ed);
        }
      }
    });
  }
  if (night) {
    const [x, y, z] = ROUTE_LANTERN;
    // A local off-axis practical spill reads on the brass and ledge without
    // implying that the unlit candle is emitting light.
    const bounce = new THREE.PointLight(0xffd3a3, 6.4, 3.6, 2);
    bounce.position.set(x - .92, y + .54, z + .42);
    scene.add(bounce);
  }
}

function meshTriangles(THREE, mesh) {
  const positions = mesh.geometry.getAttribute('position'), triangles = [];
  const vertex = index => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
  for (let i = 0; i < positions.count; i += 3) triangles.push(new THREE.Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
  return triangles;
}

function visibleBounds(THREE, ...roots) {
  const bounds = new THREE.Box3();
  const part = new THREE.Box3();
  for (const root of roots) {
    root.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      bounds.union(part);
    });
  }
  return bounds;
}

export function wallBetween(raycaster, origin, target, wall) {
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  if (!distance) return false;
  raycaster.set(origin, direction.multiplyScalar(1 / distance));
  const previousFar = raycaster.far;
  try {
    raycaster.far = distance;
    return raycaster.intersectObject(wall, false).length > 0;
  } finally {
    raycaster.far = previousFar;
  }
}

export async function mountCloudCliffRoute({ mount, phone = false, night = false }) {
  const [THREE, { GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/KTX2Loader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? .73 : .98;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(WALK_FOV, mount.clientWidth / mount.clientHeight, .03, 2000);
  const ktx = new KTX2Loader().setTranscoderPath('/codecs/basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx);
  const [rock, pavers, lantern] = await Promise.all([
    scannedSurface(THREE, 'rock_pitted_mossy'),
    scannedSurface(THREE, 'stone_pavers'),
    loadLantern(scene, loader).finally(() => ktx.dispose()),
  ]);
  const { floor, wall, outer, spur, gorge } = stageRock(THREE, scene, rock, pavers);
  const catchGroup = addCatch(THREE, scene);
  setLighting(THREE, scene, night);
  lightLantern(THREE, renderer, scene, lantern, catchGroup, night);
  scene.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const targets = Object.fromEntries(Object.entries(GORGE_PROBES).map(([name, [d, side]]) =>
    [name, new THREE.Vector3(...gorge.pointAt(d, side))]));
  const terrainOccluders = [wall, floor, outer, spur];
  const triangles = [...meshTriangles(THREE, wall), ...meshTriangles(THREE, spur)];
  const lanternBounds = visibleBounds(THREE, lantern, catchGroup);
  const station = new THREE.Vector3(...ROUTE_LANTERN);
  const [min, max] = [lanternBounds.min, lanternBounds.max];
  const lanternProbes = [
    [min.x, station.y, max.z], [max.x, station.y, max.z], [station.x, min.y, max.z],
    [min.x, max.y, station.z], [max.x, max.y, station.z], [station.x, max.y, max.z],
  ].map(point => new THREE.Vector3(...point)).concat(station);
  const viewSize = new THREE.Vector2();
  const projected = new THREE.Vector3(), closest = new THREE.Vector3();
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
  const wallProbes = [-.9, -.68, -.44, -.15, .15, .44, .68, .9]
    .flatMap(x => [.12, .46].map(y => new THREE.Vector2(x, y)));

  function inFrame(point) {
    const ndc = projected.copy(point).project(camera);
    return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
  }

  function terrainVisible(point) {
    return inFrame(point)
      && !terrainOccluders.some(mesh => wallBetween(raycaster, camera.position, point, mesh))
      && !gorge.blocksSegment(camera.position, point);
  }
  let running = null;

  function seek(seconds) {
    const row = sampleCloudCliffRoute(seconds, phone);
    camera.position.set(row.x, row.y, row.z);
    camera.lookAt(row.lx, row.ly, row.lz);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);

    raycaster.set(camera.position, down);
    const ground = raycaster.intersectObject(floor)[0];
    const nearBankInFrame = terrainVisible(targets.nearBank);
    const valleyBedInFrame = terrainVisible(targets.valleyBed);
    const farBankInFrame = terrainVisible(targets.farBank);
    const valleyVisible = nearBankInFrame && valleyBedInFrame && farBankInFrame;
    const innerWallInFrame = wallProbes.some(probe => {
      raycaster.setFromCamera(probe, camera);
      return raycaster.intersectObject(wall).length > 0;
    });
    const wallDistance = triangles.reduce((nearest, triangle) =>
      Math.min(nearest, triangle.closestPointToPoint(camera.position, closest).distanceToSquared(camera.position)), Infinity);
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    renderer.getSize(viewSize);
    const lanternInFrame = frustum.intersectsBox(lanternBounds);
    const lanternVisible = lanternInFrame && lanternProbes.some(point => inFrame(point)
      && !wallBetween(raycaster, camera.position, point, wall)
      && !wallBetween(raycaster, camera.position, point, spur));
    const anchor = projected.copy(station).project(camera);
    return {
      ...row,
      floorClearance: ground?.distance ?? null,
      wallClearance: Math.sqrt(wallDistance),
      innerWallInFrame, valleyVisible, nearBankInFrame, valleyBedInFrame, farBankInFrame,
      lanternInFrame, lanternVisible,
      lanternPx: { x: (anchor.x + 1) * viewSize.x / 2, y: (1 - anchor.y) * viewSize.y / 2 },
      farMesh: gorge.mesh.name,
    };
  }

  function complete() {
    if (!running) return seek(ROUTE_DURATION);
    const { resolve, tick, onSample } = running;
    running = null;
    cancelAnimationFrame(tick);
    const row = seek(ROUTE_DURATION);
    onSample(row);
    resolve(row);
    return row;
  }

  function play({ reducedMotion = false, onSample = () => {} } = {}) {
    if (running) complete();
    if (reducedMotion) {
      const row = seek(ROUTE_DURATION);
      onSample(row);
      return Promise.resolve(row);
    }
    return new Promise(resolve => {
      const start = performance.now();
      const advance = now => {
        if ((now - start) / 1000 >= ROUTE_DURATION) {
          complete();
          return;
        }
        onSample(seek(Math.max(0, (now - start) / 1000)));
        if (running) running.tick = requestAnimationFrame(advance);
      };
      running = { resolve, onSample, tick: requestAnimationFrame(advance) };
      onSample(seek(0));
    });
  }

  seek(0);
  return { seek, play, skip: complete, duration: ROUTE_DURATION };
}
