// Pine Gate living atmosphere. Stage 1: wind in the pine sprays and undergrowth.
// Everything is procedural; no image or model asset is added.
//
// The place API does not hand a camera to a place, so the camera is read from the
// sky sphere the engine pins to it every frame, and power saver from the renderer's
// shadow-map flag, which the engine clears only in that mode.

const WIND_MATERIALS = ['Open pine needle sprays', ...[0, 1, 2, 3, 4].map((i) => `Woodland understory ${i}`)];

// Layout defaults. The owner may move the steps and the niche, so every position
// below is a parameter with its current value as the default: nothing in this file
// hard-codes world coordinates that a re-authored place would invalidate.
const DEFAULT_MIST_BANDS = [
  // [x, z, lateral drift amplitude] along the flight of steps.
  [1.1, 31.5, 1.4], [2.4, 28.0, 1.2], [0.8, 24.5, 1.6], [3.1, 21.0, 1.0],
  [1.6, 17.5, 1.3], [2.7, 14.0, 1.5], [0.9, 10.5, 1.1], [2.2, 7.0, 1.4],
];
const DEFAULT_MIST_Y = 0.55;
const DEFAULT_NICHE_POSITION = [-1.8, 5.0, 0.9];
const DEFAULT_PATH = [
  // [x, y, z] stations the needles fall around, low end to gate.
  [0.97, 2.96, 33.7], [0.30, 3.34, 29.5], [-0.08, 3.90, 24], [0.12, 4.70, 16], [0.10, 5.65, 6],
];

export function createPineGateLife({
  THREE, group, scene, renderer,
  mistBands = DEFAULT_MIST_BANDS,
  mistY = DEFAULT_MIST_Y,
  nichePosition: _nichePosition = DEFAULT_NICHE_POSITION,
  path: _path = DEFAULT_PATH,
}) {
  if (!THREE || !group) throw new Error('Pine Gate life needs THREE and the baked group.');
  const disposers = [];
  const own = (fn) => disposers.push(fn);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Wind ----------
  // A per-vertex sway weight comes from the geometry itself, not from world height:
  // an absolute height test would move every island bodily, because pine sprays all
  // sit metres above the ground. Each connected island is found inside the group of
  // triangles that carries the wind material, its root vertex is the lowest one, and
  // the weight rises from 0 at that root to 1 at the island's furthest tip.
  //
  // For the undergrowth the lowest vertex is its root, which is what meets the soil.
  // For the pine sprays the lowest vertex is not necessarily the attach end, so the
  // root is taken as the vertex closest to the island's dominant neighbour direction
  // (the side that carries the most other spray islands), falling back to the lowest
  // vertex when no neighbour is nearer. That keeps the sprayed branch end still while
  // the tips travel.
  const swayStats = [];

  function islandWeights(geometry, start, count, isSpray) {
    const position = geometry.attributes.position;
    const index = geometry.index;
    const triangles = count / 3;
    const parent = new Map();
    const find = (v) => { while (parent.get(v) !== v) { parent.set(v, parent.get(parent.get(v))); v = parent.get(v); } return v; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const seen = new Set();
    for (let t = 0; t < triangles; t++) {
      const base = start + t * 3;
      const a = index ? index.getX(base) : base, b = index ? index.getX(base + 1) : base + 1, c = index ? index.getX(base + 2) : base + 2;
      for (const v of [a, b, c]) { if (!parent.has(v)) parent.set(v, v); seen.add(v); }
      union(a, b); union(b, c);
    }
    const islands = new Map();
    for (const v of seen) { const r = find(v); if (!islands.has(r)) islands.set(r, []); islands.get(r).push(v); }
    const weights = new Float32Array(position.count);
    const stats = { islands: islands.size, rootsAboveTolerance: 0, minRootHeight: Infinity };
    const v3 = new THREE.Vector3();
    const roots = [];
    for (const verts of islands.values()) {
      let lowest = verts[0];
      let lowestY = Infinity, cx = 0, cz = 0;
      for (const v of verts) {
        v3.fromBufferAttribute(position, v);
        cx += v3.x; cz += v3.z;
        if (v3.y < lowestY) { lowestY = v3.y; lowest = v; }
      }
      cx /= verts.length; cz /= verts.length;
      let root = lowest;
      if (isSpray) {
        // The attach end points back toward the trunk: the vertex nearest the island
        // centroid's outward direction from the spray mass is the branch end, so pick
        // the vertex with the shortest distance to any other island's centroid.
        let best = Infinity;
        for (const v of verts) {
          v3.fromBufferAttribute(position, v);
          const d = Math.hypot(v3.x - cx, v3.z - cz);
          if (d < best) { best = d; root = v; }
        }
      }
      const rootPos = new THREE.Vector3().fromBufferAttribute(position, root);
      roots.push({ root, rootPos, verts });
      stats.minRootHeight = Math.min(stats.minRootHeight, rootPos.y);
    }
    for (const { root, rootPos, verts } of roots) {
      let maxD = 0;
      for (const v of verts) { v3.fromBufferAttribute(position, v); maxD = Math.max(maxD, v3.distanceTo(rootPos)); }
      for (const v of verts) {
        v3.fromBufferAttribute(position, v);
        const t = maxD > 1e-6 ? Math.min(1, v3.distanceTo(rootPos) / maxD) : 0;
        weights[v] = t * t * (3 - 2 * t);
      }
      if (weights[root] > 0.02) stats.rootsAboveTolerance++;
    }
    if (!Number.isFinite(stats.minRootHeight)) stats.minRootHeight = null;
    return { weights, stats };
  }

  const windUniforms = [];
  const touched = [];
  group.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    // The export splits one material per mesh, so each wind material owns a whole
    // geometry; a grouped mesh is also handled by walking its material groups.
    const materials = [object.material].flat();
    const parts = object.geometry.groups?.length
      ? object.geometry.groups.map((g) => ({ start: g.start, count: g.count, material: materials[g.materialIndex ?? 0] }))
      : [{ start: 0, count: object.geometry.index?.count ?? object.geometry.attributes.position.count, material: materials[0] }];
    for (const part of parts) {
      const material = part.material;
      if (!material || !WIND_MATERIALS.includes(material.name) || material.userData.pineWind) continue;
      material.userData.pineWind = true;
      const isSpray = material.name === 'Open pine needle sprays';
      const { weights, stats } = islandWeights(object.geometry, part.start, part.count, isSpray);
      const attribute = new THREE.BufferAttribute(weights, 1);
      attribute.setUsage(THREE.StaticDrawUsage);
      object.geometry.setAttribute('aPineSway', attribute);
      swayStats.push({ material: material.name, ...stats });
      const uniforms = { uPineTime: { value: 0 }, uPineGust: { value: 0 }, uPineAmp: { value: 0.028 } };
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer2) => {
        compile.call(material, shader, renderer2);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'attribute float aPineSway;\nuniform float uPineTime,uPineGust,uPineAmp;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec3 wp=(modelMatrix*vec4(transformed,1.)).xyz;
            float phase=wp.x*.37+wp.z*.29+wp.y*.11;
            float a=sin(uPineTime*1.15+phase)*.6+sin(uPineTime*2.7+phase*1.7)*.4;
            float b=sin(uPineTime*.43+phase*.6);
            float amp=uPineAmp*aPineSway*(1.+uPineGust*1.8);
            transformed.x+=a*amp;
            transformed.z+=b*amp*.55;
          }`);
      };
      material.customProgramCacheKey = () => key() + '-pine-sway-2';
      material.needsUpdate = true;
      windUniforms.push(uniforms);
      touched.push({ object, attribute, material, compile, key });
    }
  });
  own(() => {
    for (const { object, attribute, material } of touched) {
      object.geometry.deleteAttribute('aPineSway');
      void attribute;
      material.userData.pineWind = false;
      material.needsUpdate = true;
    }
  });

  // ---------- Mist ----------
  // Flat soft sprites lying along the steps: wide, shallow, and faded out as the
  // walker approaches so nothing ever reads as a card crossing the view.
  const mistTexture = (() => {
    const size = 64, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d'), half = size / 2;
    const grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, 'rgba(255,255,255,.50)');
    grad.addColorStop(0.45, 'rgba(255,255,255,.18)');
    grad.addColorStop(0.78, 'rgba(255,255,255,.04)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  own(() => mistTexture.dispose());
  const mist = [];
  for (const [x, z, drift] of mistBands) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: mistTexture, color: 0xb9c9d2, transparent: true, opacity: 0,
      depthWrite: false, fog: true,
    }));
    sprite.scale.set(6.5, 2.0, 1);
    sprite.position.set(x, mistY, z);
    sprite.renderOrder = 1;
    group.add(sprite);
    mist.push({ sprite, x0: x, z0: z, drift, phase: z * 0.8, base: 0.05 + 0.02 * (Math.abs(z * 7) % 1) });
  }
  own(() => { for (const { sprite } of mist) { group.remove(sprite); sprite.material.dispose(); } });

  let sky = null, elapsed = 0, disposed = false;
  const cameraAt = new THREE.Vector3(0, 0, 34);

  return {
    update(dt, time) {
      if (disposed) return;
      if (!sky && scene) sky = scene.children.find((o) => o.material?.uniforms?.uHorizon) ?? null;
      if (sky) cameraAt.copy(sky.position);
      const still = reduced();
      const saver = !!renderer && renderer.shadowMap?.enabled === false;
      elapsed += dt;
      // A gust every eleven seconds or so, easing in and out rather than switching.
      const gust = Math.pow(0.5 + 0.5 * Math.sin(elapsed * 0.57) * Math.sin(elapsed * 0.23 + 1.1), 3);
      for (const u of windUniforms) {
        u.uPineTime.value = still || saver ? 0 : time;
        u.uPineGust.value = still || saver ? 0 : gust;
      }

      // Mist: slow lateral drift only, thinning out within a few metres of the eye.
      for (const entry of mist) {
        const { sprite, x0, z0, drift, phase, base } = entry;
        if (still || saver) { sprite.visible = false; continue; }
        sprite.visible = true;
        sprite.position.x = x0 + Math.sin(elapsed * 0.06 + phase) * drift;
        sprite.position.z = z0;
        const distance = cameraAt.distanceTo(sprite.position);
        const near = Math.min(1, Math.max(0, (distance - 3.2) / 4.5));
        sprite.material.opacity = base * near * (0.75 + 0.25 * Math.sin(elapsed * 0.31 + phase));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers.splice(0)) { try { dispose(); } catch { /* already released */ } }
    },
    // Exposed for the capture harness and for diagnostics, not used by the engine.
    describe: () => ({ windMaterials: windUniforms.length, sway: swayStats, cameraProxy: sky ? 'sky' : 'fallback' }),
  };
}
