import { Vector3, PerspectiveCamera } from 'three';
import { bellLaneCameras, WALK_SECONDS, TURN_SECONDS, LAMP, TREE, WINDOW, DOOR_Z } from '../../web/src/engine/places/bell-lane-camera.js';
import { measureCameraPath } from '../../tests/visual/pine-camera-path.mjs';

const V3 = (...args) => new Vector3(...args);
const cameras = bellLaneCameras(V3);
const obstacles = [
  { position: [-1.20, 1.66, DOOR_Z], radius: .07 },
  { position: [1.20, 1.66, DOOR_Z], radius: .07 },
  { position: [TREE[0], 1.66, TREE[2]], radius: .4 },
  ...[-1.62, 1.62].flatMap(x => [-2.89, -.31].map(z => ({ position: [x, 1.66, z], radius: .17 }))),
];

export const cameraPeaks = metrics => Object.fromEntries(Object.entries(metrics).map(([key, item]) => {
  if (typeof item !== 'object') return [key, item];
  const { series: _series, ...rest } = item;
  return [key, rest];
}));

export function cameraAudit(phone) {
  const rig = { pos: V3(), look: V3(), fov: 0 };
  const snap = t => ({ t, x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, lx: rig.look.x, ly: rig.look.y, lz: rig.look.z, fov: rig.fov });
  const walk = cameras.createWalk(null, null, phone);
  const walking = Array.from({ length: WALK_SECONDS * 60 + 1 }, (_, i) => {
    walk(i / (WALK_SECONDS * 60), rig);
    return snap(i / 60);
  });
  const chosen = phone ? cameras.choosePhone : cameras.choose;
  const end = { pos: chosen.pos.clone().add(V3(...LAMP)), look: chosen.look.clone().add(V3(...LAMP)), fov: chosen.fov };
  const turn = cameras.createArrival({ pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov }, end);
  const arrival = Array.from({ length: Math.round(TURN_SECONDS * 60) + 1 }, (_, i) => {
    turn(i / (TURN_SECONDS * 60), rig);
    return snap(WALK_SECONDS + i / 60);
  });
  const width = phone ? 390 : 1440, height = phone ? 844 : 900;
  const camera = new PerspectiveCamera(rig.fov, width / height, .01, 900);
  camera.position.copy(rig.pos); camera.lookAt(rig.look); camera.updateMatrixWorld();
  const project = point => {
    const p = V3(...point).project(camera);
    return [Math.round((p.x + 1) * width / 2), Math.round((1 - p.y) * height / 2)];
  };
  const sightline = rig.pos.clone().lerp(V3(...WINDOW), (DOOR_Z - rig.pos.z) / (WINDOW[2] - rig.pos.z));
  return {
    walkMetrics: measureCameraPath(walking, obstacles),
    arrivalMetrics: measureCameraPath(arrival, obstacles),
    seated: { windowPx: project(WINDOW), wickPx: project([LAMP[0], .996, LAMP[2]]), sillSightline: sightline.toArray() },
    rows: [...walking, ...arrival.slice(1)],
  };
}

if (process.argv[1] === import.meta.filename) {
  for (const phone of [false, true]) {
    const { walkMetrics, arrivalMetrics, seated } = cameraAudit(phone);
    console.log(JSON.stringify({ phone, walk: cameraPeaks(walkMetrics), arrival: cameraPeaks(arrivalMetrics), seated }, null, 2));
  }
}

export function liveCameraAudit(rows) {
  const report = measureCameraPath(rows, obstacles);
  const zero = report.speed.series[0][0];
  const sections = [
    ['Speed', 'm/s', 1.8, report.speed.series, '#3ca38f'],
    ['Angular rate', 'deg/s', 25, report.turn.series, '#756bc6'],
    ['Eye height', 'm', 1.8, report.height.series, '#b97b43'],
  ];
  const width = 920, height = 410;
  const x = t => 64 + ((t - zero) / 42.5) * 824;
  const safeTime = t => t >= zero && t <= zero + 42.5;
  const panels = sections.map(([label, unit, upper, series, color], i) => {
    const y0 = 69 + i * 102;
    const y = q => y0 + 73 * (1 - q / upper);
    const path = series.filter(([t]) => safeTime(t)).map(([t, q]) => x(t).toFixed(1) + ',' + y(q).toFixed(1)).join(' ');
    const ticks = [0, 12, 22, 26, 30, 42.5].map(t => {
      const xx = x(t + zero);
      return `<line x1="${xx}" x2="${xx}" y1="${y0}" y2="${y(0)}" stroke="#d9e2e2"/>` +
        (i === 2 ? `<text x="${xx}" y="${y(0) + 18}" text-anchor="middle" font-size="11">${t}s</text>` : '');
    }).join('');
    return `<text x="64" y="${y0 - 8}" font-size="13" font-weight="600">${label}</text>
      <text x="51" y="${y0 + 4}" font-size="10" text-anchor="end">${upper} ${unit}</text>
      <text x="51" y="${y(0)}" font-size="10" text-anchor="end">0</text>
      ${ticks}<line x1="64" x2="888" y1="${y(0)}" y2="${y(0)}" stroke="#b5c0c0"/>
      <polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${path}"/>`;
  }).join('');
  const chart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f5f7f4"/>
    <g font-family="system-ui,sans-serif" fill="#1f3230">
      <text x="64" y="32" font-size="20" font-weight="650">Bell Lane camera recorded in gameplay</text>
      ${panels}<text x="64" y="393" font-size="12">Shop eaves → door approach → threshold → open court → seated view</text>
    </g></svg>`;
  return { observed: cameraPeaks(report), chart };
}
