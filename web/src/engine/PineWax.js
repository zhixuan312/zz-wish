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
  const style = {
    body: { roughness: .49, clearcoat: .10, specularIntensity: .58, diffuse: .79, scatter: .24 },
    pool: { roughness: .22, clearcoat: .25, specularIntensity: .63, diffuse: .45, scatter: .052 },
    remnant: { roughness: .47, clearcoat: .10, specularIntensity: .49, diffuse: .71, scatter: .065 },
    runnel: { roughness: .35, clearcoat: .16, specularIntensity: .54, diffuse: .70, scatter: .18 },
  }[layer];
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, ior: 1.43,
    roughness: style.roughness, clearcoat: style.clearcoat, clearcoatRoughness: .32,
    specularIntensity: style.specularIntensity, envMapIntensity: .42 });
  material.onBeforeCompile = shader => {
    materialCoordinates(shader);
    Object.assign(shader.uniforms, light);
    shader.fragmentShader = `
      uniform vec3 uPineSourcePosition, uPineSourceColor, uPineWaxCrown;
      uniform float uPineCandela, uPineSourceRadius;
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float layerBand = sin(vPineLocal.y * 1430. + sin(vPineLocal.x * 125. + vPineLocal.z * 128.) * 1.4);
      float waxGrain = sin(dot(vPineLocal, vec3(1873., 2301., -1223.))) * sin(dot(vPineLocal, vec3(201., -2971., 2009.)));
      diffuseColor.rgb *= ${style.diffuse} * (1. + .018 * layerBand + .014 * waxGrain);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + .025 * layerBand + .019 * waxGrain, .1, 1.);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Approximate single scattering along a path from the warm crown. Red,
        // green and blue travel different distances through pigmented wax.
        vec3 fromCrown = vPineWorld - uPineWaxCrown;
        float depth = max(0., -fromCrown.y);
        float radius = max(.003, uPineSourceRadius);
        vec3 toSource = uPineSourcePosition - vPineWorld;
        float incident = uPineCandela / (dot(toSource, toSource) + radius * radius);
        float path = .0016 + depth * .84 + length(fromCrown.xz) * .33;
        vec3 absorption = vec3(64., 88., 132.) - 31. * log(clamp(diffuse, .055, 1.));
        vec3 transmission = exp(-absorption * path);
        float edge = .22 + .78 * pow(1. - abs(dot(normal, normalize(vViewPosition))), 1.45);
        float scatter = (1. - exp(-incident * .007)) * edge * ${style.scatter};
        totalEmissiveRadiance += uPineSourceColor * transmission * scatter;`);
  };
  material.customProgramCacheKey = () => `pine-wax-${layer}-1`;
  return material;
}

export function createPineTray(seat) {
  const points = [[0, 0], [.054, 0], [.060, .0014], [.066, .004], [.069, .0085],
    [.068, .0115], [.0664, .014], [.0645, .0143], [.0624, .0131],
    [.06, .0102], [.056, seat.y], [0, seat.y]];
  const geometry = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x), rim = clamp((Math.hypot(x, z) - .059) / .009, 0, 1);
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
      float mineral = pineStoneValue(vPineLocal * 1170. + vec3(48., 12., 9.));
      float fleck = smoothstep(.64, .9, mineral);
      float soot = (1. - smoothstep(.012, .048, length(vPineLocal.xz))) * smoothstep(.37, .85, aggregate);
      float scuffedRim = smoothstep(.058, .066, length(vPineLocal.xz)) * smoothstep(.006, .012, vPineLocal.y);
      diffuseColor.rgb *= .72 + .32 * aggregate + .34 * fleck + .14 * scuffedRim - .34 * soot;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + .1 * (aggregate - .5) - .11 * scuffedRim, .56, .98);`);
  };
  material.customProgramCacheKey = () => 'pine-hewn-stone-1';
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
  const tipPath = new THREE.CatmullRomCurve3([path.getPoint(.59), path.getPoint(.74), path.getPoint(.88), path.getPoint(1)]);
  const char = new THREE.Mesh(new THREE.TubeGeometry(tipPath, 10, .00049, 7), charMaterial);
  const charCap = new THREE.Mesh(new THREE.IcosahedronGeometry(.00048, 1), charMaterial);
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

function writeDrip(drip, rows, cut, growth, refined) {
  const mesh = drip.surface;
  const reach = Math.min(drip.reach * growth, cut * .8);
  drip.object.visible = reach > .0001;
  if (!drip.object.visible) return;
  for (let row = 0; row < mesh.rings; row++) {
    const k = 1 - row / (mesh.rings - 1);
    const y = cut - reach * k - Math.min(cut * .04, .00045);
    const q = ringAt(rows, y);
    const bend = .07 * Math.sin(k * 4.4);
    const angle = drip.angle + bend + (refined ? .11 * Math.sin(k * 5.2 + drip.angle) * k : 0);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    // The tear follows the actual outline, with its widest bead near its tip.
    const taper = Math.sin(Math.PI * k) ** .45 * (.54 + .62 * Math.exp(-((k - .79) ** 2) / .014));
    const neck = refined ? .34 * Math.exp(-k * 14) : 0;
    const width = Math.min(drip.width, q.r * .24) * Math.sqrt(growth) * (taper + neck);
    const r = q.r + width * (refined ? -.18 : .16);
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
  } : null;
  const bodyMaterial = refined ? refinedWaxMaterial(light, 'body')
    : waxMaterial(0xffffff, { roughness: .42, clearcoat: .28, fall: 92 });
  const poolMaterial = refined ? refinedWaxMaterial(light, 'pool')
    : waxMaterial(0xffffff, { roughness: .14, clearcoat: .95, fall: 84 });
  const traceMaterial = refined ? refinedWaxMaterial(light, 'remnant')
    : waxMaterial(0xffffff, { roughness: .45, clearcoat: .35, fall: 115 });
  const runnelMaterial = refined ? refinedWaxMaterial(light, 'runnel') : traceMaterial;
  const materials = refined ? [] : [bodyMaterial, poolMaterial, traceMaterial];
  const wickMaterial = new THREE.MeshStandardMaterial({ color: 0x665442, roughness: .98 });
  const charMaterial = refined ? new THREE.MeshStandardMaterial({ color: 0x201911, roughness: .97 }) : null;
  for (const material of new Set([bodyMaterial, poolMaterial, traceMaterial, runnelMaterial, wickMaterial, charMaterial])) {
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
    const mesh = surface(refined ? 15 : 12, 10);
    const object = add(mesh.geometry, runnelMaterial);
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
      bodyMesh = surface(rows.length + 7, refined ? 64 : 48);
      body.geometry = bodyMesh.geometry;
      bodyMaterial.color.setHex(shape.color);
      poolMaterial.color.copy(bodyMaterial.color).lerp(warmWax, refined ? .06 : .12);
      traceMaterial.color.copy(bodyMaterial.color).lerp(warmWax, .065);
      if (refined) runnelMaterial.color.copy(bodyMaterial.color).lerp(warmWax, .03);
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
        if (refined) {
          const depth = top.depth ?? 0;
          if (pool.visible) fillPool(poolMesh, top.r * (.65 + .065 * melted), Math.min(.00038, depth * .21));
          pool.position.set(top.cx, cut - depth * .80 + Math.min(cut * .04, .00012), 0);
          poolMaterial.roughness = state === 'burning' ? .22 : .38;
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
        drips = 0;
        for (const drip of drops) {
          writeDrip(drip, rows, cut, clamp((1 - fuel - drip.start) * 5, 0, 1), refined);
          drips += Number(drip.object.visible);
        }
        if (braid) {
          braid.char.visible = state !== 'unlit';
          wickMaterial.color.setHex(state === 'unlit' ? 0x9b8966 : 0x514130);
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
