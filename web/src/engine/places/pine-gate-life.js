// Pine Gate living atmosphere. Stage 1: wind in the pine sprays and undergrowth.
// Everything is procedural; no image or model asset is added.
//
// The place API does not hand a camera to a place, so the camera is read from the
// sky sphere the engine pins to it every frame, and power saver from the renderer's
// shadow-map flag, which the engine clears only in that mode.

const WIND_MATERIALS = ['Open pine needle sprays', ...[0, 1, 2, 3, 4].map((i) => `Woodland understory ${i}`)];

// The authored place supplies the path, niche and mist stations so the
// effects follow its layout as the stairs and terrace move.
export function createPineGateLife({
  THREE, group, scene, renderer, mistBands, mistY, nichePosition, path,
}) {
  if (!THREE || !group) throw new Error('Pine Gate life needs THREE and the baked group.');
  if (!mistBands || !Number.isFinite(mistY) || !nichePosition || !path) {
    throw new Error('Pine Gate life needs the authored mist, niche and path layout.');
  }
  const disposers = [];
  const own = (fn) => disposers.push(fn);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Wind ----------
  // Wind bends each connected island. Undergrowth stays pinned at its
  // lowest vertex, where the blade meets the soil.
  // Pine spray cards stay pinned along their authored branch edge. Blender
  // v=0 becomes glTF v=1; the opposite edge is the moving tip.
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
    const stats = { islands: islands.size, rootsAboveTolerance: 0, minRootHeight: Infinity,
      attachEdgeVertices: 0, maxAttachEdgeWeight: null };
    const uv = geometry.attributes.uv;
    if (isSpray && !uv) throw new Error('Pine needle sprays require their authored UVs.');
    const vertex = new THREE.Vector3(), root = new THREE.Vector3();
    for (const verts of islands.values()) {
      if (isSpray) {
        // The whole edge shares v=1, even when the two corners sit at
        // different heights or a rolled card points down.
        for (const v of verts) {
          const along = uv.getY(v);
          const t = Math.max(0, Math.min(1, 1 - along));
          weights[v] = t * t * (3 - 2 * t);
          if (along === 1) {
            stats.attachEdgeVertices++;
            stats.maxAttachEdgeWeight = Math.max(stats.maxAttachEdgeWeight ?? 0, weights[v]);
            stats.minRootHeight = Math.min(stats.minRootHeight, position.getY(v));
            if (weights[v] > .02) stats.rootsAboveTolerance++;
          }
        }
        continue;
      }
      const lowest = verts.reduce((a, b) => position.getY(a) <= position.getY(b) ? a : b);
      root.fromBufferAttribute(position, lowest);
      stats.minRootHeight = Math.min(stats.minRootHeight, root.y);
      let maxD = 0;
      for (const v of verts) {
        vertex.fromBufferAttribute(position, v);
        maxD = Math.max(maxD, vertex.distanceTo(root));
      }
      for (const v of verts) {
        vertex.fromBufferAttribute(position, v);
        const t = maxD > 1e-6 ? Math.min(1, vertex.distanceTo(root) / maxD) : 0;
        weights[v] = t * t * (3 - 2 * t);
      }
      if (weights[lowest] > .02) stats.rootsAboveTolerance++;
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

  // ---------- Falling needles ----------
  // A small instanced quad is enough at this distance; each needle spins as it falls
  // and is recycled once it passes the stones below the path point it dropped from.
  const NEEDLE_COUNT = 40;
  const needleGeometry = new THREE.PlaneGeometry(0.011, 0.075);
  const needleMaterial = new THREE.MeshBasicMaterial({
    color: 0x40351f, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false,
  });
  const needleMesh = new THREE.InstancedMesh(needleGeometry, needleMaterial, NEEDLE_COUNT);
  needleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  needleMesh.frustumCulled = false;
  needleMesh.count = 0;
  group.add(needleMesh);
  own(() => { group.remove(needleMesh); needleGeometry.dispose(); needleMaterial.dispose(); needleMesh.dispose(); });
  const needles = Array.from({ length: NEEDLE_COUNT }, () => ({ alive: false, p: new THREE.Vector3(), spin: 0, fall: 0, sway: 0, seed: 0, floorY: 0 }));

  // ---------- Dust in the candle niche ----------
  const MOTE_COUNT = 60;
  const moteTexture = (() => {
    const size = 32, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d'), half = size / 2;
    const grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, 'rgba(255,255,255,.9)');
    grad.addColorStop(0.3, 'rgba(255,236,200,.35)');
    grad.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  own(() => moteTexture.dispose());
  const motePositions = new Float32Array(MOTE_COUNT * 3);
  const moteSeeds = Array.from({ length: MOTE_COUNT }, () => Math.random());
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMaterial = new THREE.PointsMaterial({
    map: moteTexture, color: 0xffcf96, size: 0.011, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.frustumCulled = false;
  motes.visible = false;
  group.add(motes);
  own(() => { group.remove(motes); moteGeometry.dispose(); moteMaterial.dispose(); });

  const nicheAt = new THREE.Vector3(...nichePosition);
  const pathPoints = path.map((p) => new THREE.Vector3(...p));

  let sky = null, elapsed = 0, dustBlend = 0, needleDebt = 0, disposed = false;
  const cameraAt = new THREE.Vector3(0, 0, 34);

  // The needle band follows the walker: choose the path station nearest the eye.
  const nearestStation = () => {
    let best = pathPoints[0], bestD = Infinity;
    for (const p of pathPoints) { const d = p.distanceToSquared(cameraAt); if (d < bestD) { bestD = d; best = p; } }
    return best;
  };

  return {
    update(dt, time, daylight) {
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

      // Needles: drop into a band a few metres ahead of the eye, then fall and spin.
      const motesOn = !still && !saver;
      if (motesOn) {
        needleDebt += dt * 5.2;
        const station = nearestStation();
        while (needleDebt >= 1) {
          needleDebt -= 1;
          const free = needles.find((n) => !n.alive);
          if (!free) break;
          free.alive = true;
          free.seed = Math.random() * 6.283;
          free.fall = 0.13 + Math.random() * 0.15;
          free.sway = 0.14 + Math.random() * 0.2;
          free.spin = (Math.random() - 0.5) * 2.4;
          free.floorY = station.y - 1.9;
          free.p.set(
            station.x + (Math.random() - 0.5) * 3.0,
            station.y + 1.5 + Math.random() * 1.7,
            station.z - 1.0 - Math.random() * 5.0,
          );
        }
      }
      let liveNeedles = 0;
      if (motesOn) {
        const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), euler = new THREE.Euler();
        for (const needle of needles) {
          if (!needle.alive) continue;
          needle.p.y -= needle.fall * dt;
          needle.p.x += Math.sin(elapsed * 1.3 + needle.seed) * needle.sway * dt;
          needle.p.z += Math.cos(elapsed * 0.9 + needle.seed * 1.7) * needle.sway * 0.6 * dt;
          if (needle.p.y < needle.floorY) { needle.alive = false; continue; }
          euler.set(elapsed * needle.spin, needle.seed + elapsed * needle.spin * 0.7, Math.sin(elapsed * 1.1 + needle.seed) * 0.8);
          quat.setFromEuler(euler);
          matrix.compose(needle.p, quat, { x: 1, y: 1, z: 1 });
          needleMesh.setMatrixAt(liveNeedles++, matrix);
        }
      }
      needleMesh.count = motesOn ? liveNeedles : 0;
      needleMesh.visible = needleMesh.count > 0;
      if (needleMesh.count) needleMesh.instanceMatrix.needsUpdate = true;

      // Dust: appears only once the walker stands at the niche, lit by the candle.
      const nearNiche = 1 - Math.min(1, Math.max(0, (cameraAt.distanceTo(nicheAt) - 1.9) / 2.2));
      dustBlend += (((still || saver) ? 0 : nearNiche) - dustBlend) * (1 - Math.exp(-dt * 1.5));
      motes.visible = dustBlend > 0.01;
      if (motes.visible) {
        for (let i = 0; i < MOTE_COUNT; i++) {
          const seed = moteSeeds[i];
          const drift = elapsed * (0.05 + seed * 0.05);
          motePositions[i * 3] = nicheAt.x + Math.sin(drift + seed * 6.283) * (0.1 + seed * 0.45);
          motePositions[i * 3 + 1] = nicheAt.y - 0.8 + ((seed * 1.7 + elapsed * (0.015 + seed * 0.02)) % 1.15);
          motePositions[i * 3 + 2] = nicheAt.z + Math.cos(drift * 0.8 + seed * 4.1) * (0.09 + seed * 0.36);
        }
        moteGeometry.attributes.position.needsUpdate = true;
        // Backlit particles read against a dark niche. In sunlight they are faint.
        moteMaterial.opacity = (0.045 + 0.375 * (daylight?.n ?? 1)) * dustBlend;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers.splice(0)) { try { dispose(); } catch { /* already released */ } }
    },
    describe() {
      const attachWeights = swayStats.flatMap(row => row.maxAttachEdgeWeight ?? []);
      return { windMaterials: windUniforms.length, sway: swayStats, cameraProxy: sky ? 'sky' : 'fallback',
        maxAttachEdgeWeight: attachWeights.length ? Math.max(...attachWeights) : null };
    },
  };
}
