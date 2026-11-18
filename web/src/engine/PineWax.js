import * as THREE from 'three';
import { waxCutHeight } from '../../../shared/wax.ts';

const TAU = 2 * Math.PI;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);

export function waxContactShadow(radius, opacity) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpacity: { value: opacity } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      void main() {
        float radial = length(vUv * 2. - 1.);
        gl_FragColor = vec4(.013, .008, .005, uOpacity * (1. - smoothstep(.46, 1., radial)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.lampOwned = true;
  const contact = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), material);
  contact.scale.setScalar(radius);
  contact.position.y = .00016;
  return contact;
}

function materialCoordinates(shader) {
  shader.vertexShader = `varying vec3 vPineLocal; varying vec3 vPineWorld;\n${shader.vertexShader}`
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vPineLocal = transformed;
      vPineWorld = (modelMatrix * vec4(transformed, 1.)).xyz;`);
  shader.fragmentShader = `varying vec3 vPineLocal; varying vec3 vPineWorld;\n${shader.fragmentShader}`;
}

function refinedWaxMaterial(light, layer) {
  const wet = layer === 'pool';
  const style = {
    body: { roughness: .47, clearcoat: .11, specularIntensity: .58, diffuse: .91, scatter: .92 },
    pool: { roughness: .13, clearcoat: .42, specularIntensity: .75, diffuse: .34, scatter: .045 },
    remnant: { roughness: .47, clearcoat: .10, specularIntensity: .49, diffuse: .74, scatter: .08 },
  }[layer];
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, ior: 1.43,
    roughness: style.roughness, clearcoat: style.clearcoat, clearcoatRoughness: wet ? .15 : .32,
    specularIntensity: style.specularIntensity, envMapIntensity: wet ? .62 : .42 });
  material.onBeforeCompile = shader => {
    materialCoordinates(shader);
    Object.assign(shader.uniforms, light);
    shader.fragmentShader = `
      uniform vec3 uPineSourcePosition, uPineSourceColor, uPineWaxCrown;
      uniform float uPineCandela, uPineSourceRadius, uPinePoolWet;
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 grains = vPineLocal * 720.;
      float grainCoverage = 1. - smoothstep(.12, .65, length(fwidth(grains)));
      float waxGrain = sin(dot(grains, vec3(1.31, .62, .95))) * sin(dot(grains, vec3(-.18, 1.84, .54))) * grainCoverage;
      diffuseColor.rgb *= ${style.diffuse} * (1. + .013 * waxGrain);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + .018 * waxGrain, .1, 1.);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 fromCrown = vPineWorld - uPineWaxCrown;
        float depth = max(0., -fromCrown.y);
        float radius = max(.003, uPineSourceRadius);
        vec3 toSource = uPineSourcePosition - vPineWorld;
        float incident = uPineCandela / (dot(toSource, toSource) + radius * radius);
        float sourceFraction = 1. - exp(-incident * .023);
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 viewRay = normalize(vViewPosition);
        float side = 1. - abs(worldNormal.y);
        // The flame lights the rim from within. Wavelength-dependent absorption
        // leaves the lower wax cooler and keeps the original pigments readable.
        float path = .0012 + depth * .69 + length(fromCrown.xz) * .16;
        vec3 absorption = vec3(54., 100., 175.) - 29. * log(clamp(diffuse, .055, 1.));
        vec3 transmission = exp(-absorption * path);
        float edge = .71 + .29 * pow(1. - abs(dot(normal, viewRay)), 1.45);
        float scatter = sourceFraction * edge * (.13 + .87 * side) * ${style.scatter};
        totalEmissiveRadiance += uPineSourceColor * transmission * scatter;
        ${wet ? `
        // The glowing wick and flame base are a finite source. Project that
        // source across the curved meniscus so the reflection moves with the
        // view and disappears as the wax cools.
        vec3 viewWorld = inverseTransformDirection(viewRay, viewMatrix);
        vec3 reflected = reflect(-viewWorld, worldNormal);
        float reflectionDistance = (uPineWaxCrown.y - .0039 - vPineWorld.y) / max(.001, reflected.y);
        vec2 reflectedOffset = fromCrown.xz + max(0., reflectionDistance) * reflected.xz;
        float flameReflection = (1. - smoothstep(.00075, .0044, length(reflectedOffset)))
          * smoothstep(.02, .09, reflected.y) * step(0., reflectionDistance);
        float fresnel = .09 + .91 * pow(1. - max(0., dot(worldNormal, viewWorld)), 4.);
        vec3 reflectionColor = mix(uPineSourceColor, vec3(1., .88, .70), .57);
        totalEmissiveRadiance += reflectionColor * (.25 + fresnel * 2.4) * flameReflection * sourceFraction * uPinePoolWet;` : ''}`);
  };
  material.customProgramCacheKey = () => `pine-wax-${layer}-3`;
  return material;
}

export function createPineTray(seat) {
  const points = [[0, 0], [.038, 0], [.042, .001], [.045, .0035], [.052, .006],
    [.057, .0105], [.058, .014], [.0565, .0165], [.054, .017], [.0515, .0144],
    [.048, .0105], [.0465, seat.y], [0, seat.y]];
  const geometry = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x), rim = clamp((Math.hypot(x, z) - .046) / .012, 0, 1);
    const uneven = rim * (.0033 * Math.sin(angle * 17 + 1.8) + .0024 * Math.sin(angle * 29 - .9));
    const chip = .00038 * rim * Math.sin(angle * 37 + .5) * Math.sin(angle * 11);
    positions.setXYZ(i, x * (1 + uneven), y + chip * clamp(y / .008, 0, 1), z * (1 + uneven));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x6e6860, roughness: .89, envMapIntensity: .28 });
  material.onBeforeCompile = shader => {
    materialCoordinates(shader);
    shader.fragmentShader = `
      float pineStoneHash(vec3 p) { return fract(sin(dot(p, vec3(93.2, 43.9, 163.7))) * 28631.41); }
      float pineStoneValue(vec3 p) {
        vec3 q = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(
          mix(mix(pineStoneHash(q), pineStoneHash(q + vec3(1., 0., 0.)), f.x),
              mix(pineStoneHash(q + vec3(0., 1., 0.)), pineStoneHash(q + vec3(1., 1., 0.)), f.x), f.y),
          mix(mix(pineStoneHash(q + vec3(0., 0., 1.)), pineStoneHash(q + vec3(1., 0., 1.)), f.x),
              mix(pineStoneHash(q + vec3(0., 1., 1.)), pineStoneHash(q + vec3(1., 1., 1.)), f.x), f.y), f.z);
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float aggregate = pineStoneValue(vPineLocal * 226.);
      float mineral = pineStoneValue(vPineLocal * 940. + vec3(48., 12., 9.));
      float fleck = smoothstep(.64, .9, mineral);
      float soot = (1. - smoothstep(.012, .048, length(vPineLocal.xz))) * smoothstep(.37, .85, aggregate);
      float scuffedRim = smoothstep(.049, .057, length(vPineLocal.xz)) * smoothstep(.006, .012, vPineLocal.y);
      diffuseColor.rgb *= .67 + .31 * aggregate + .09 * fleck + .10 * scuffedRim - .30 * soot;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + .14 * (aggregate - .5) - .10 * scuffedRim, .56, .98);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float relief = .00026 * aggregate + .000024 * mineral;
        vec3 viewDx = dFdx(-vViewPosition);
        vec3 viewDy = dFdy(-vViewPosition);
        vec3 surfaceX = cross(viewDy, normal);
        vec3 surfaceY = cross(normal, viewDx);
        float surfaceArea = dot(viewDx, surfaceX);
        vec3 gradient = dFdx(relief) * surfaceX + dFdy(relief) * surfaceY;
        normal = normalize(normal - sign(surfaceArea) * gradient / max(abs(surfaceArea), 1.e-10));`);
  };
  material.customProgramCacheKey = () => 'pine-hewn-stone-2';
  material.userData.lampOwned = true;
  const tray = new THREE.Mesh(geometry, material);
  tray.receiveShadow = true;
  return tray;
}

function fillPool(mesh, radius, rise) {
  const profile = [[1, 1], [.94, .48], [.88, .06], [.69, -.11], [.46, -.07], [.22, .025], [0, 0]];
  const perimeter = angle => 1 + .022 * Math.sin(angle * 3 + .8) + .012 * Math.sin(angle * 7 - .3);
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    const relief = angle => rise * r * (.09 * Math.sin(angle * 2 + .3) + .048 * Math.sin(angle * 5 - .6));
    writeRing(mesh, i, 0, radius * r, rise * y, perimeter, relief);
  }
  finishSurface(mesh);
}

function makeBraidedWick(path, fiberMaterial, charMaterial) {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const phase = TAU * i / 3;
    const points = Array.from({ length: 18 }, (_, j) => {
      const t = j / 17;
      const p = path.getPoint(t);
      const twist = phase + t * TAU * 2.7;
      return p.add(vector(Math.cos(twist) * .00029, 0, Math.sin(twist) * .00029));
    });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 26, .000235, 5), fiberMaterial));
  }
  const tipPath = new THREE.CatmullRomCurve3([path.getPoint(.46), path.getPoint(.69), path.getPoint(.86), path.getPoint(1)]);
  const char = new THREE.Mesh(new THREE.TubeGeometry(tipPath, 12, .00058, 8), charMaterial);
  const charCap = new THREE.Mesh(new THREE.IcosahedronGeometry(.00062, 1), charMaterial);
  charCap.position.copy(path.getPoint(1));
  charCap.scale.set(1.13, .82, .92);
  char.add(charCap);
  group.add(char);
  return { group, char };
}

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

function runnelContour(y, radius, runnels) {
  const flows = [];
  for (const drip of runnels) {
    const k = (drip.crown - y) / drip.reach;
    if (k < 0 || k > 1) continue;
    const taper = Math.sin(Math.PI * k) ** .5;
    const bead = .34 + .78 * Math.exp(-((k - .78) ** 2) / .027);
    const width = Math.min(drip.width, radius * .25) * drip.growth;
    const angle = drip.angle + .18 * Math.sin(k * 4.4) + .07 * Math.sin(k * 7.2 + drip.angle) * k;
    flows.push({ angle, height: width * (taper * bead + .29 * Math.exp(-k * 8)),
      halfWidth: Math.max(.16, width / radius * (1.12 + .64 * taper)) });
  }
  return a => {
    let rise = 0;
    for (const flow of flows) {
      const gap = Math.abs(a - flow.angle);
      const distance = Math.min(gap, TAU - gap);
      if (distance >= flow.halfWidth) continue;
      const blend = Math.cos(distance / flow.halfWidth * Math.PI * .5);
      rise += flow.height * blend ** 2;
    }
    return 1 + .0035 * Math.sin(a * 7 + y * 29) + .0016 * Math.sin(a * 13 - y * 42) + rise / radius;
  };
}

const RUNNEL_ROW_STEP = .0018;
const RUNNEL_ROWS = 26;

function bodySurface(mesh, rows, cut, melt, runnels) {
  const top = ringAt(rows, cut);
  const depth = Math.min(cut * .24, top.r * .27, .0036) * melt;
  const bevel = Math.min(cut * .2, top.r * .09, .0014);
  const uneven = a => melt * Math.min(top.r * .09, cut * .13, .0011) * (.65 * Math.sin(a * 3 + .8) + .35 * Math.sin(a * 7 - .3));
  const grain = (y, radius) => runnels ? runnelContour(y, radius, runnels)
    : a => 1 + .006 * Math.sin(a * 7 + y * 120) + .004 * Math.sin(a * 15 - y * 150);
  let row = 0;
  writeRing(mesh, row++, rows[0].cx, 0, 0);
  const shoulderY = cut - bevel;
  const firstRunnel = runnels?.length ? Math.min(...runnels.map(drip => drip.crown - drip.reach)) : shoulderY;
  let detailY = Math.max(0, firstRunnel);
  const fillTo = y => {
    // Only subdivide the short band with raised wax. Keep every drawn row
    // and leave the lower body at its original profile resolution.
    while (detailY < y - 1e-6) {
      const q = ringAt(rows, detailY);
      writeRing(mesh, row++, q.cx, q.r, detailY, grain(detailY, q.r));
      detailY += RUNNEL_ROW_STEP;
    }
    if (detailY <= y + 1e-6) detailY += RUNNEL_ROW_STEP;
  };
  for (const q of rows) {
    if (q.y >= shoulderY) break;
    fillTo(q.y);
    writeRing(mesh, row++, q.cx, q.r, q.y, grain(q.y, q.r));
  }
  fillTo(shoulderY);
  const shoulder = ringAt(rows, shoulderY);
  writeRing(mesh, row++, shoulder.cx, shoulder.r, shoulderY, grain(runnels ? shoulderY : cut, shoulder.r));
  writeRing(mesh, row++, top.cx, top.r * .99, cut - bevel * .25, grain(runnels ? cut - bevel * .25 : cut, top.r), a => uneven(a) * .4);
  writeRing(mesh, row++, top.cx, top.r * .92, cut, grain(cut, top.r), uneven);
  writeRing(mesh, row++, top.cx, top.r * .77, cut - depth * .55, grain(cut, top.r), a => uneven(a) * .3);
  writeRing(mesh, row++, top.cx, top.r * .61, cut - depth, grain(cut, top.r));
  const used = row + 1;
  // The unused rings collapse onto the cap centre so they contribute no normals.
  for (; row < mesh.rings; row++) writeRing(mesh, row, top.cx, 0, cut - depth);
  finishSurface(mesh, used);
  return { ...top, depth };
}

function makeTrace(refined) {
  const mesh = surface(refined ? 8 : 5, 64);
  const contour = a => 1 + .11 * Math.sin(a * 3 + .2) + .06 * Math.sin(a * 7 - .8)
    + .22 * Math.max(0, Math.cos(a - 1.1)) ** 12 + .21 * Math.max(0, Math.cos(a - 4.4)) ** 18;
  const profile = refined
    ? [[0, .006], [.91, .014], [1, .075], [.98, .17], [.86, .23], [.66, .41], [.37, .66], [0, .81]]
    : [[0, .04], [.94, .04], [1, .21], [.73, .58], [0, 1]];
  profile.forEach(([r, y], i) => writeRing(mesh, i, 0, r, y, contour,
    refined ? angle => y * r * (.12 * Math.sin(angle * 4 + i * .7) + .055 * Math.sin(angle * 11)) : null));
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
    const taper = Math.sin(Math.PI * k) ** .45 * (.54 + .62 * Math.exp(-((k - .79) ** 2) / .014));
    const width = Math.min(drip.width, q.r * .24) * Math.sqrt(growth) * taper;
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

export function createPineWax(seat, waxMaterial, { refined = false } = {}) {
  const group = new THREE.Group();
  group.position.y = seat.y;
  const light = refined ? {
    uPineSourcePosition: { value: vector(0, 0, 0) },
    uPineSourceColor: { value: new THREE.Color() },
    uPineWaxCrown: { value: vector(0, 0, 0) },
    uPineSourceRadius: { value: .007 },
    uPineCandela: { value: 0 },
    uPinePoolWet: { value: 0 },
  } : null;
  const bodyMaterial = refined ? refinedWaxMaterial(light, 'body')
    : waxMaterial(0xffffff, { roughness: .42, clearcoat: .28, fall: 92 });
  const poolMaterial = refined ? refinedWaxMaterial(light, 'pool')
    : waxMaterial(0xffffff, { roughness: .14, clearcoat: .95, fall: 84 });
  const traceMaterial = refined ? refinedWaxMaterial(light, 'remnant')
    : waxMaterial(0xffffff, { roughness: .45, clearcoat: .35, fall: 115 });
  const materials = refined ? [] : [bodyMaterial, poolMaterial, traceMaterial];
  const wickMaterial = new THREE.MeshStandardMaterial({ color: 0x665442, roughness: .98 });
  const charMaterial = refined ? new THREE.MeshPhysicalMaterial({ color: 0x0a0705, roughness: .98, specularIntensity: .08, envMapIntensity: .09 }) : null;
  for (const material of [bodyMaterial, poolMaterial, traceMaterial, wickMaterial, charMaterial]) {
    if (material) material.userData.lampOwned = true;
  }

  const add = (geometry, material) => {
    const object = new THREE.Mesh(geometry, material);
    object.receiveShadow = true;
    group.add(object);
    return object;
  };
  const body = add(new THREE.BufferGeometry(), bodyMaterial);
  body.frustumCulled = false; // Small, moving vertices do not need a new bounding sphere each frame.
  const poolMesh = refined ? surface(7, 64) : null;
  const pool = add(poolMesh?.geometry ?? new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), poolMaterial);
  if (refined) pool.frustumCulled = false;
  const trace = add(makeTrace(refined), traceMaterial);
  const contact = waxContactShadow(1, .42);
  group.add(contact);
  const drops = [
    { angle: 1.12, start: .015, reach: .031, width: .00165 },
    { angle: 2.16, start: .095, reach: .020, width: .00118 },
    { angle: .18, start: .18, reach: .043, width: .00141 },
    { angle: 3.6, start: .24, reach: .026, width: .00175 },
    { angle: 5.1, start: .31, reach: .036, width: .00124 },
  ].map(spec => {
    if (refined) return spec;
    const mesh = surface(12, 10);
    const object = add(mesh.geometry, traceMaterial);
    object.frustumCulled = false;
    return { ...spec, surface: mesh, object };
  });
  const wickPath = new THREE.CatmullRomCurve3([vector(0, -.001, 0), vector(-.00015, .002, 0),
    vector(.00035, .0041, .00022), vector(.00135, .00575, .00058)]);
  const braid = refined ? makeBraidedWick(wickPath, wickMaterial, charMaterial) : null;
  const wick = braid ? braid.group : add(new THREE.TubeGeometry(wickPath, 10, .00068, 7, false), wickMaterial);
  if (braid) group.add(wick);
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
      bodyMesh = surface(rows.length + 7 + (refined ? RUNNEL_ROWS : 0), refined ? 72 : 48);
      body.geometry = bodyMesh.geometry;
      bodyMaterial.color.setHex(shape.color);
      poolMaterial.color.copy(bodyMaterial.color).lerp(warmWax, refined ? .06 : .12);
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
        const runnels = refined ? drops.map(drip => {
          const amount = clamp((1 - fuel - drip.start) * 5, 0, 1);
          return { ...drip, reach: Math.min(drip.reach * amount, cut * .8),
            growth: Math.sqrt(amount), crown: cut - Math.min(cut * .04, .0002) };
        }).filter(drip => drip.reach > .0001) : null;
        const top = spent ? rows[0] : bodySurface(bodyMesh, rows, cut, melted, runnels);
        body.visible = !spent;
        pool.visible = !spent && melted > 0;
        if (refined) {
          const depth = top.depth ?? 0;
          if (pool.visible) fillPool(poolMesh, top.r * (.65 + .065 * melted), Math.min(.00038, depth * .21));
          pool.position.set(top.cx, cut - depth * .80 + Math.min(cut * .04, .00012), 0);
          poolMaterial.roughness = state === 'burning' ? .13 : .38;
          light.uPinePoolWet.value = state === 'burning' ? 1 : 0;
        } else {
          pool.scale.setScalar(top.r * (.56 + .086 * melted));
          pool.position.set(top.cx, cut - (top.depth ?? 0) + Math.min(cut * .04, .00016), 0);
          poolMaterial.roughness = state === 'burning' ? .14 : .29;
        }
        const spread = Math.sqrt(Math.max(0, 1 - fuel));
        const base = rows[0];
        contact.position.x = base.cx;
        contact.scale.setScalar(base.r * 1.48);
        const traceHeight = Math.min(.0052, base.r * .32) * spread;
        trace.visible = spread > .04;
        trace.position.x = base.cx;
        const spreadRadius = Math.min(base.r * (.78 + .38 * spread), (seat.traceRadius - Math.abs(base.cx)) / 1.4);
        trace.scale.set(spreadRadius, traceHeight, spreadRadius);
        drips = runnels?.length ?? 0;
        if (!refined) {
          for (const drip of drops) {
            writeDrip(drip, rows, cut, clamp((1 - fuel - drip.start) * 5, 0, 1));
            drips += Number(drip.object.visible);
          }
        }
        if (braid) {
          braid.char.visible = state !== 'unlit';
          wickMaterial.color.setHex(state === 'unlit' ? 0x9b8966 : 0x3b2d1f);
        } else wickMaterial.color.setHex(state === 'unlit' ? 0x665442 : 0x18110b);
        const spentWick = 1 - clamp(cut / Math.max(.002, traceHeight * 1.8), 0, 1);
        wick.scale.y = lerp(1, .56, spentWick);
        wick.position.set(top.cx, Math.max(pool.position.y, traceHeight * .9), 0);
        wickTip.copy(wickEnd).multiply(wick.scale).add(wick.position);
        wickTip.y += seat.y;
      }
      anchor.set(wickTip.x, wickTip.y - .004, wickTip.z);
    },
    updateLight(sourceLight, emitterRadius = .007) {
      if (!light) return;
      light.uPineCandela.value = sourceLight.intensity;
      if (!sourceLight.intensity) return;
      light.uPineSourceRadius.value = emitterRadius;
      light.uPineSourceColor.value.copy(sourceLight.color);
      sourceLight.getWorldPosition(light.uPineSourcePosition.value);
      light.uPineWaxCrown.value.copy(wickTip);
      group.parent?.localToWorld(light.uPineWaxCrown.value);
    },
    fullHeight: () => fullHeight,
    profileBounds() {
      const minX = Math.min(...rows.map(row => row.cx - row.r));
      const maxX = Math.max(...rows.map(row => row.cx + row.r));
      const depth = Math.max(...rows.map(row => row.r));
      return new THREE.Box3(vector(minX, seat.y, -depth), vector(maxX, seat.y + fullHeight + .006, depth));
    },
    state: () => ({ remaining: lastFuel, cutHeight, bodyHeight, state: lastState, drips, trace: trace.visible }),
  };
}
