// Browser-only comparison controls for isolated frozen snapshots. Never product code.
import * as THREE from 'three';

export function createGeometryControls({ renderer, camera, getPlace }) {
  const savedTextures = new Map(), savedMaterials = new Map(), idMaterials = new Set();
  const lab = { mode: 'normal', exactCamera: null, surfaceIds: [] };
  lab.inspectSceneAnchors = () => {
    const place = getPlace(), entries = [];
    place?.G?.updateMatrixWorld(true);
    place?.G?.traverse(object => {
      for (const emitter of object.userData.captureSmokeEmitters ?? []) entries.push({ role: 'static-fixture-smoke-emitter', type: object.type,
        localPosition: emitter.localPosition, worldPosition: object.localToWorld(new THREE.Vector3(...emitter.localPosition)).toArray(),
        positionEvidence: 'Exact smokeAt emission argument, transformed through the actual live parent; not a moving puff position.' });
      if (!object.userData.captureRole?.startsWith('static-fixture-')) return;
      entries.push({ role: object.userData.captureRole, type: object.type, name: object.name,
        localPosition: object.position.toArray(), worldPosition: object.getWorldPosition(new THREE.Vector3()).toArray(),
        children: object.children.map(child => ({ type: child.type, name: child.name, localPosition: child.position.toArray(), worldPosition: child.getWorldPosition(new THREE.Vector3()).toArray() })) });
    });
    const extras = structuredClone(place?.baked?.group.userData ?? null);
    const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
    const wicks = parse(extras?.static_lamp_wicks_engine), smoke = parse(extras?.static_incense_smoke_engine), tolerance = 1e-8;
    const validPoint = point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
    const matches = [];
    const match = (expected, role, field) => {
      const remaining = entries.filter(entry => entry.role === role);
      for (const source of expected) {
        const point = source[field];
        const index = validPoint(point) && remaining.length ? remaining.map((entry, index) => ({ index, distance: Math.hypot(...entry.worldPosition.map((value, axis) => value - point[axis])) })).sort((a, b) => a.distance - b.distance)[0].index : -1;
        const actual = index >= 0 ? remaining.splice(index, 1)[0] : null;
        const maximumElementDelta = actual ? Math.max(...actual.worldPosition.map((value, axis) => Math.abs(value - point[axis]))) : null;
        matches.push({ sourceName: source.name, role, comparedSourceField: field, expectedWorld: point ?? null, actualWorld: actual?.worldPosition ?? null, maximumElementDelta, passed: maximumElementDelta !== null && maximumElementDelta <= tolerance });
      }
    };
    const sourceWicks = Array.isArray(wicks) ? wicks : [];
    match(sourceWicks, 'static-fixture-live-flame', 'wickTip');
    match(sourceWicks.filter(wick => wick.name?.startsWith('altar ')), 'static-fixture-specular', 'pointLight');
    match([{ name: 'incense smoke emitter', static_incense_smoke_engine: smoke }], 'static-fixture-smoke-emitter', 'static_incense_smoke_engine');
    const counts = Object.fromEntries(['static-fixture-live-flame', 'static-fixture-specular', 'static-fixture-smoke-emitter'].map(role => [role, entries.filter(entry => entry.role === role).length]));
    const alignment = { toleranceMetres: tolerance, counts, matches,
      passed: sourceWicks.length === 6 && counts['static-fixture-live-flame'] === 6 && counts['static-fixture-specular'] === 4 && counts['static-fixture-smoke-emitter'] === 1 && matches.every(item => item.passed),
      contract: 'liveFlame group origin compares to source wickTip, never flameAnchor; flameParts internally raises its visible quad 2 mm. Specular PointLight compares to pointLight. Smoke compares to static_incense_smoke_engine through the real parent transform.' };
    return { sourceSceneExtras: extras, runtimeFixtures: entries, alignment,
      note: 'Capture-only userData tags identify live fixture groups, specular lights and smoke emission inputs. Values come from live transforms without changing rendering or authored source anchors.' };
  };
  let originalAutoUpdate = null;
  const materials = () => {
    const found = new Set();
    getPlace()?.baked?.group.traverse(object => {
      if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) found.add(material);
    });
    return [...found];
  };
  const restoreMaterials = () => {
    for (const [object, material] of savedMaterials) object.material = material;
    savedMaterials.clear(); for (const material of idMaterials) material.dispose(); idMaterials.clear();
  };
  const restoreTextures = () => {
    for (const [texture, values] of savedTextures) { Object.assign(texture, values); texture.needsUpdate = true; }
    savedTextures.clear();
  };
  lab.setMode = mode => {
    if (!['normal', 'nearest-mip0', 'surface-id', 'white-baked', 'unlit-albedo'].includes(mode)) throw new Error(`Unknown geometry diagnostic ${mode}.`);
    restoreMaterials(); restoreTextures(); lab.surfaceIds = [];
    if (mode === 'nearest-mip0') for (const material of materials()) {
      const uniforms = renderer.properties.get(material).uniforms;
      for (const pass of ['Night', 'Dusk', 'Day', 'Lamp']) {
        const texture = uniforms?.['uBaked' + pass]?.value;
        if (!texture?.isTexture || texture.image?.width === 1 || savedTextures.has(texture)) continue;
        savedTextures.set(texture, { minFilter: texture.minFilter, magFilter: texture.magFilter, anisotropy: texture.anisotropy });
        // Non-mipmap minification selects base level 0; no GL binding manipulation.
        texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter; texture.anisotropy = 1; texture.needsUpdate = true;
      }
    }
    if (mode === 'surface-id') getPlace()?.baked?.group.traverse(object => {
      if (!object.isMesh) return;
      savedMaterials.set(object, object.material);
      const convert = (material, index) => {
        const key = `${object.name}|${material.name}|${index}`;
        let hash = 2166136261; for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
        const color = new THREE.Color().setHSL((hash % 360) / 360, .72, .55);
        const replacement = new THREE.MeshBasicMaterial({ color, side: material.side, fog: false, toneMapped: false });
        idMaterials.add(replacement); lab.surfaceIds.push({ key, mesh: object.name, material: material.name, rgb: color.toArray() });
        return replacement;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material, 0);
    });
    if (mode === 'white-baked' || mode === 'unlit-albedo') getPlace()?.baked?.group.traverse(object => {
      if (!object.isMesh) return;
      savedMaterials.set(object, object.material);
      const convert = material => {
        let replacement;
        if (mode === 'white-baked') {
          replacement = material.clone();
          replacement.color.setHex(0xffffff);
          for (const slot of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'envMap']) replacement[slot] = null;
          replacement.vertexColors = false; replacement.roughness = 1; replacement.metalness = 0; replacement.envMapIntensity = 0;
          replacement.emissive?.setHex(0); if ('clearcoat' in replacement) replacement.clearcoat = 0; if ('sheen' in replacement) replacement.sheen = 0;
          // Material.clone does not preserve the loader's custom compile hook.
          // Reuse that exact baked shader, then remove its final specular/emission sum.
          replacement.onBeforeCompile = shader => {
            material.onBeforeCompile.call(replacement, shader);
            const original = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
            if (!shader.fragmentShader.includes(original)) throw new Error('White baked control could not isolate diffuse output.');
            shader.fragmentShader = shader.fragmentShader.replace(original, 'vec3 outgoingLight = totalDiffuse;');
          };
          replacement.customProgramCacheKey = () => material.customProgramCacheKey() + '-white-baked-diffuse-control';
        } else {
          replacement = new THREE.MeshBasicMaterial({ color: material.color.clone(), map: material.map, alphaMap: material.alphaMap,
            vertexColors: material.vertexColors, side: material.side, opacity: material.opacity, transparent: material.transparent,
            alphaTest: material.alphaTest, fog: material.fog, toneMapped: material.toneMapped });
          // MeshBasic uses the original albedo/vertex tint, with no lightmap,
          // normal map, specular response or scene-environment illumination.
        }
        idMaterials.add(replacement); return replacement;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    lab.mode = mode;
    return { mode, affectedTextures: savedTextures.size, surfaceIds: lab.surfaceIds,
      contributionControl: mode === 'white-baked' ? 'Existing baked shader and normal atlas samplers retained. White diffuse only; UV0/normal/vertex tint and specular/emission output removed.' : mode === 'unlit-albedo' ? 'Original color/map/vertex tint and alpha retained. Unlit MeshBasic without lightmap, normal or specular; original fog/tone-mapping flags retained.' : null };
  };
  lab.setExactCamera = value => {
    if (!value) {
      lab.exactCamera = null;
      if (originalAutoUpdate !== null) camera.matrixAutoUpdate = originalAutoUpdate;
      originalAutoUpdate = null; camera.updateMatrixWorld(true); return;
    }
    originalAutoUpdate ??= camera.matrixAutoUpdate;
    lab.exactCamera = structuredClone(value); lab.prepare();
  };
  lab.prepare = () => {
    if (!lab.exactCamera) return;
    const { world, projection } = lab.exactCamera;
    camera.matrixAutoUpdate = false;
    camera.matrix.fromArray(world); camera.matrixWorld.fromArray(world);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); camera.matrixWorldNeedsUpdate = true;
    camera.position.setFromMatrixPosition(camera.matrixWorld);
    camera.quaternion.setFromRotationMatrix(camera.matrixWorld);
    camera.projectionMatrix.fromArray(projection); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  lab.reset = () => { lab.setMode('normal'); lab.setExactCamera(null); };
  window.__geometryLab = lab;
  return lab;
}
