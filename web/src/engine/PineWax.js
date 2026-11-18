import * as THREE from 'three';
import { waxCutHeight } from '../../../shared/wax.ts';

const TAU = 2 * Math.PI;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);

function surface(rings, sectors) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(rings * sectors * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  const indices = [];
  for (let row = 0; row < rings - 1; row++) {
    for (let side = 0; side < sectors; side++) {
      const a = row * sectors + side;
      const b = row * sectors + (side + 1) % sectors;
      indices.push(a, a + sectors, b, b, a + sectors, b + sectors);
    }
  }
  geometry.setIndex(indices);
  return { geometry, positions, rings, sectors };
}

function finishSurface(mesh, used = mesh.rings) {
  mesh.positions.needsUpdate = true;
  mesh.geometry.setDrawRange(0, (used - 1) * mesh.sectors * 6);
  mesh.geometry.computeVertexNormals();
}

function ringAt(rows, y) {
  let i = 1;
  while (i < rows.length - 1 && rows[i].y < y) i++;
  const a = rows[i - 1], b = rows[i];
  const k = clamp((y - a.y) / (b.y - a.y || 1), 0, 1);
  return { cx: lerp(a.cx, b.cx, k), r: lerp(a.r, b.r, k) };
}

function writeRing(mesh, row, cx, radius, height, contour, rise) {
  for (let side = 0; side < mesh.sectors; side++) {
    const angle = side * TAU / mesh.sectors;
    const r = radius * (contour ? contour(angle) : 1);
    mesh.positions.setXYZ(row * mesh.sectors + side, cx + Math.cos(angle) * r,
      height + (rise ? rise(angle) : 0), Math.sin(angle) * r);
  }
}

function bodySurface(mesh, rows, cut, melt) {
  const top = ringAt(rows, cut);
  const depth = Math.min(cut * .24, top.r * .27, .0036) * melt;
  const bevel = Math.min(cut * .2, top.r * .09, .0014);
  const uneven = a => melt * Math.min(top.r * .09, cut * .13, .0011) * (.65 * Math.sin(a * 3 + .8) + .35 * Math.sin(a * 7 - .3));
  const grain = y => a => 1 + .006 * Math.sin(a * 7 + y * 120) + .004 * Math.sin(a * 15 - y * 150);
  let row = 0;
  writeRing(mesh, row++, rows[0].cx, 0, 0);
  for (const q of rows) {
    if (q.y >= cut - bevel) break;
    writeRing(mesh, row++, q.cx, q.r, q.y, grain(q.y));
  }
  const shoulder = ringAt(rows, cut - bevel);
  writeRing(mesh, row++, shoulder.cx, shoulder.r, cut - bevel, grain(cut));
  writeRing(mesh, row++, top.cx, top.r * .99, cut - bevel * .25, grain(cut), a => uneven(a) * .4);
  writeRing(mesh, row++, top.cx, top.r * .92, cut, grain(cut), uneven);
  writeRing(mesh, row++, top.cx, top.r * .77, cut - depth * .55, grain(cut), a => uneven(a) * .3);
  writeRing(mesh, row++, top.cx, top.r * .61, cut - depth, grain(cut));
  const used = row + 1;
  // The unused rings collapse onto the cap centre so they contribute no normals.
  for (; row < mesh.rings; row++) writeRing(mesh, row, top.cx, 0, cut - depth);
  finishSurface(mesh, used);
  return { ...top, depth };
}

function makeTrace() {
  const mesh = surface(5, 64);
  const contour = a => 1 + .11 * Math.sin(a * 3 + .2) + .06 * Math.sin(a * 7 - .8)
    + .22 * Math.max(0, Math.cos(a - 1.1)) ** 12 + .21 * Math.max(0, Math.cos(a - 4.4)) ** 18;
  const profile = [[0, .04], [.94, .04], [1, .21], [.73, .58], [0, 1]];
  profile.forEach(([r, y], i) => writeRing(mesh, i, 0, r, y, contour));
  finishSurface(mesh);
  return mesh.geometry;
}

function writeDrip(drip, rows, cut, growth) {
  const mesh = drip.surface;
  const reach = Math.min(drip.reach * growth, cut * .8);
  drip.object.visible = reach > .0001;
  if (!drip.object.visible) return;
  for (let row = 0; row < mesh.rings; row++) {
    const k = 1 - row / (mesh.rings - 1);
    const y = cut - reach * k - Math.min(cut * .04, .00045);
    const q = ringAt(rows, y);
    const angle = drip.angle + .07 * Math.sin(k * 4.4);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    // The tear follows the actual outline, with its widest bead near its tip.
    const width = Math.min(drip.width, q.r * .24) * Math.sqrt(growth)
      * Math.sin(Math.PI * k) ** .45 * (.54 + .62 * Math.exp(-((k - .79) ** 2) / .014));
    const r = q.r + width * .16;
    for (let side = 0; side < mesh.sectors; side++) {
      const a = side * TAU / mesh.sectors;
      const radial = r + Math.cos(a) * width * .78;
      const tangent = Math.sin(a) * width;
      mesh.positions.setXYZ(row * mesh.sectors + side, q.cx + dx * radial - dz * tangent,
        y, dz * radial + dx * tangent);
    }
  }
  finishSurface(mesh);
}

export function createPineWax(seat, waxMaterial) {
  const group = new THREE.Group();
  group.position.y = seat.y;
  const bodyMaterial = waxMaterial(0xffffff, { roughness: .42, clearcoat: .28, fall: 92 });
  const poolMaterial = waxMaterial(0xffffff, { roughness: .14, clearcoat: .95, fall: 84 });
  const traceMaterial = waxMaterial(0xffffff, { roughness: .45, clearcoat: .35, fall: 115 });
  const materials = [bodyMaterial, poolMaterial, traceMaterial];
  const wickMaterial = new THREE.MeshStandardMaterial({ color: 0x665442, roughness: .98 });
  for (const material of [...materials, wickMaterial]) material.userData.lampOwned = true;

  const add = (geometry, material) => {
    const object = new THREE.Mesh(geometry, material);
    object.receiveShadow = true;
    group.add(object);
    return object;
  };
  const body = add(new THREE.BufferGeometry(), bodyMaterial);
  body.castShadow = true;
  body.frustumCulled = false; // Small, moving vertices do not need a new bounding sphere each frame.
  const pool = add(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), poolMaterial);
  const trace = add(makeTrace(), traceMaterial);
  const drops = [
    { angle: 1.12, start: .015, reach: .031, width: .00165 },
    { angle: 2.16, start: .095, reach: .020, width: .00118 },
    { angle: .18, start: .18, reach: .043, width: .00141 },
    { angle: 3.6, start: .24, reach: .026, width: .00175 },
    { angle: 5.1, start: .31, reach: .036, width: .00124 },
  ].map(spec => {
    const mesh = surface(12, 10), object = add(mesh.geometry, traceMaterial);
    object.frustumCulled = false;
    return { ...spec, surface: mesh, object };
  });
  const wickPath = new THREE.CatmullRomCurve3([vector(0, -.001, 0), vector(-.00015, .002, 0),
    vector(.00035, .0041, .00022), vector(.00135, .00575, .00058)]);
  const wick = add(new THREE.TubeGeometry(wickPath, 10, .00068, 7, false), wickMaterial);
  const wickTip = new THREE.Vector3();
  const wickEnd = wickPath.getPoint(1);
  const warmWax = new THREE.Color(0xffc07d);
  let source, rows, bodyMesh, lastFuel, lastState, fullHeight, cutHeight, bodyHeight;
  let drips = 0;

  return {
    group, materials, wickTip,
    setShape(shape) {
      source = shape.rows;
      const base = source[0].y;
      const width = Math.max(...source.map(q => Math.abs(q.cx) + q.r));
      const scale = Math.min(1, seat.maxR / width, seat.maxH / ((source.at(-1).y - base) || 1));
      rows = source.map(q => ({ y: (q.y - base) * scale, cx: q.cx * scale, r: q.r * scale }));
      fullHeight = rows.at(-1).y;
      body.geometry.dispose();
      bodyMesh = surface(rows.length + 7, 48);
      body.geometry = bodyMesh.geometry;
      bodyMaterial.color.setHex(shape.color);
      poolMaterial.color.copy(bodyMaterial.color).lerp(warmWax, .12);
      traceMaterial.color.copy(bodyMaterial.color).lerp(warmWax, .065);
      lastFuel = undefined;
    },
    update(remaining, state, anchor) {
      const fuel = state === 'burned_down' ? 0 : remaining;
      if (lastFuel !== fuel || lastState !== state) {
        lastFuel = fuel;
        lastState = state;
        cutHeight = waxCutHeight(source, fuel);
        const span = source.at(-1).y - source[0].y;
        const cut = span > 0 ? (cutHeight - source[0].y) * fullHeight / span : 0;
        bodyHeight = cut;
        const spent = cut <= 0;
        const melted = state === 'unlit' ? 0 : Math.min(1, .54 + (1 - fuel) * 4);
        const top = spent ? rows[0] : bodySurface(bodyMesh, rows, cut, melted);
        body.visible = !spent;
        pool.visible = !spent && melted > 0;
        pool.scale.setScalar(top.r * (.56 + .086 * melted));
        pool.position.set(top.cx, cut - (top.depth ?? 0) + Math.min(cut * .04, .00016), 0);
        poolMaterial.roughness = state === 'burning' ? .14 : .29;
        const spread = Math.sqrt(Math.max(0, 1 - fuel));
        const base = rows[0], traceHeight = Math.min(.0052, base.r * .32) * spread;
        trace.visible = spread > .04;
        trace.position.x = base.cx;
        const spreadRadius = Math.min(base.r * (.78 + .38 * spread), (seat.traceRadius - Math.abs(base.cx)) / 1.4);
        trace.scale.set(spreadRadius, traceHeight, spreadRadius);
        drips = 0;
        for (const drip of drops) {
          writeDrip(drip, rows, cut, clamp((1 - fuel - drip.start) * 5, 0, 1));
          drips += Number(drip.object.visible);
        }
        wickMaterial.color.setHex(state === 'unlit' ? 0x665442 : 0x18110b);
        const spentWick = 1 - clamp(cut / Math.max(.002, traceHeight * 1.8), 0, 1);
        wick.scale.y = lerp(1, .56, spentWick);
        wick.position.set(top.cx, Math.max(pool.position.y, traceHeight * .9), 0);
        wickTip.copy(wickEnd).multiply(wick.scale).add(wick.position);
        wickTip.y += seat.y;
      }
      anchor.set(wickTip.x, wickTip.y - .004, wickTip.z);
    },
    fullHeight: () => fullHeight,
    state: () => ({ remaining: lastFuel, cutHeight, bodyHeight, state: lastState, drips, trace: trace.visible }),
  };
}
