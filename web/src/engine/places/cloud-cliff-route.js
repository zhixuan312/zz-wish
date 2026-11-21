// Private geometry preview. The shipped Home descriptor does not import this module.
export const ROUTE_DURATION = 30;
export const ROUTE_FLOOR = [
  [-18, 2], [-9, 1.2], [-2, .1], [6.3, -.5], [11.6, -.6], [13.4, .7],
  [14, 4.7], [13.8, 9.4], [12.7, 12.6], [4, 13.1], [-5, 13.6], [-18, 13.5],
];
export const ROUTE_WALL = [
  [-17, 3], [-11, 2.5], [-6, 2.6], [-2, 2.3], [2.7, 2.4], [5.5, 3],
  [7.1, 4], [7.8, 5.25], [7.6, 6.15], [6.85, 6.9], [4.6, 7.05],
  [1.2, 6.5], [-2.1, 6.75], [-5.5, 6.85], [-8.1, 6.65], [-12.5, 7],
  [-17, 6.75],
];
export const ROUTE_LANTERN = [11.18, 1.34, 1.46];

const PATH = [
  [0, -14, 9.6], [3, -12.3, 9.6], [12, -3.15, 9.55], [19, 3.9, 9.45],
  [22, 6.7, 9.3], [24, 8.8, 8.55], [26, 10.45, 5.9], [28.5, 10.75, 3.9],
  [ROUTE_DURATION, 10.75, 3.9],
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
  const turn = smoothRange(19.3, phone ? 27 : 28.5, t);
  const yaw = (Math.PI * .484) * (1 - turn) + (phone ? .075 : .015) * turn;
  const pitch = -.11 - .075 * turn;
  const aim = 6;
  const horizontal = Math.cos(pitch) * aim;
  return {
    t, x, y, z,
    lx: x + Math.sin(yaw) * horizontal,
    ly: y + Math.sin(pitch) * aim,
    lz: z - Math.cos(yaw) * horizontal,
    fov: WALK_FOV,
    floorClearance: y,
    wallClearance: -boundaryDistance(ROUTE_WALL, x, z),
    edgeClearance: boundaryDistance(ROUTE_FLOOR, x, z),
  };
}

const bandNoise = (a, b) => Math.sin(a * 12.9898 + b * 78.233) * .5 + .5;

function addRock(THREE, parent, polygon, heights, depths, palette, inset) {
  const positions = [], colours = [];
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
    for (let i = 0; i < 3; i++) colours.push(tint.r, tint.g, tint.b);
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

  const cap = heights ? bands.at(-1) : bands[0];
  const outline = cap.map(([x, , z]) => new THREE.Vector2(x, z));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outline, [])) {
    face(cap[a], cap[b], cap[c], palette[0], .93 + .16 * bandNoise(a, b));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

function stageRock(THREE, scene) {
  const floor = addRock(THREE, scene, ROUTE_FLOOR, null, [0, -.45, -1.2, -3, -6.4, -13, -27, -55],
    [0x787068, 0x625d53, 0x6e6557, 0x615a50, 0x554e47, 0x675e50], .27);
  const wall = addRock(THREE, scene, ROUTE_WALL, ROCK_HEIGHTS, [0, .08, .15, .32, .48, .64, .81, 1],
    [0x686256, 0x5c584f, 0x70695f, 0x665e54, 0x756c60, 0x61594f], .24);
  const outerBank = [[-18, 12.5], [-9, 13.4], [2, 12.75], [8.8, 13.4], [13, 13.9], [12, 21], [-18, 20]];
  addRock(THREE, scene, outerBank, [4, 3.1, 3.5, 2.4, 2.8, 5.1, 4.5], [0, .22, .48, .74, 1],
    [0x60594e, 0x584f44, 0x675c4f], .2);

  const [x, y, z] = ROUTE_LANTERN;
  const seatTop = y + (BASE_SOURCE_Y - WICK_SOURCE[1]);
  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(.38, .52, seatTop, 9, 1),
    new THREE.MeshStandardMaterial({ color: 0x696258, roughness: .93, flatShading: true }),
  );
  seat.position.set(x, seatTop / 2, z);
  seat.rotation.y = Math.PI / 7;
  scene.add(seat);
  return { floor, wall };
}

const ASSETS = '/places/cloud-cliff/';

async function loadValley(scene, loader) {
  const [land, storm] = await Promise.all([
    loader.loadAsync(ASSETS + 'cloud-cliff.glb.gzip'),
    loader.loadAsync(ASSETS + 'cloud-cliff-storm.glb.gzip'),
  ]);
  const far = land.scene.getObjectByName('cloud-cliff_far');
  if (!far?.isMesh) throw new Error('The shipped Source19 far landscape is missing');
  far.updateWorldMatrix(true, false);
  scene.attach(far);

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
  return far;
}

function setLighting(THREE, scene, night) {
  scene.background = new THREE.Color(night ? 0x142339 : 0x9eafbd);
  scene.fog = new THREE.FogExp2(night ? 0x1d2e46 : 0xa1b3c0, .00082);

  const hemi = new THREE.HemisphereLight(night ? 0x9bbbf0 : 0xe8f1f7, night ? 0x5e625e : 0x8a7461, night ? 1.0 : 1.8);
  const key = new THREE.DirectionalLight(night ? 0xb4c9ee : 0xffebd5, night ? 1.25 : 2.65);
  key.position.set(10, 13, 7);
  const fill = new THREE.DirectionalLight(night ? 0x88786b : 0xd7e5f4, night ? .45 : .4);
  fill.position.set(-6, 7, -2);
  scene.add(hemi, key, fill);
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
  const { floor, wall } = stageRock(THREE, scene);
  const far = await loadValley(scene, loader).finally(() => ktx.dispose());
  setLighting(THREE, scene, night);
  scene.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const valleyPoint = new THREE.Vector3(0, 5, -400);
  const down = new THREE.Vector3(0, -1, 0);
  const station = new THREE.Vector3(...ROUTE_LANTERN);
  const viewSize = new THREE.Vector2();
  const projected = new THREE.Vector3();
  let running = null;

  function seek(seconds) {
    const row = sampleCloudCliffRoute(seconds, phone);
    camera.position.set(row.x, row.y, row.z);
    camera.lookAt(row.lx, row.ly, row.lz);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);

    raycaster.set(camera.position, down);
    const ground = raycaster.intersectObject(floor)[0];
    raycaster.set(camera.position, valleyPoint.clone().sub(camera.position).normalize());
    const valleyOccluded = raycaster.intersectObject(wall).length > 0;
    const valley = projected.copy(valleyPoint).project(camera);
    const valleyInFrame = Math.abs(valley.x) <= 1 && Math.abs(valley.y) <= 1 && Math.abs(valley.z) <= 1;
    renderer.getSize(viewSize);
    const anchor = projected.copy(station).project(camera);
    return {
      ...row,
      floorClearance: ground?.distance ?? null,
      valleyOccluded, valleyInFrame,
      lanternPx: { x: (anchor.x + 1) * viewSize.x / 2, y: (1 - anchor.y) * viewSize.y / 2 },
      farMesh: far.name,
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
