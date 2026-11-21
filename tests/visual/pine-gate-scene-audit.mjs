import assert from 'node:assert/strict';

function insertAt(source, anchor, name, statement, before = false) {
  const matches = [...source.matchAll(anchor)];
  assert.equal(matches.length, 1, `Expected one scene audit anchor for ${name}, found ${matches.length}.`);
  const [line, indent] = matches[0];
  const replacement = before ? `${indent}${statement}\n${line}` : `${line}\n${indent}${statement}`;
  return source.replace(anchor, () => replacement);
}

const readinessAnchors = [
  ['queued', /^([ \t]*)if\s*\(\s*!preparingPlaces\.has\(id\)\s*\)\s*\{/gm, 'id'],
  ['build-started', /^([ \t]*)PLACES\[t\.id\]\s*\?\?=\s*(?:await )?\(await placeModules\[t\.id\]\(\)\)\.default\(placeHelpers\);/gm, 't.id', true],
  ['environment-ready', /^([ \t]*)const envTarget\s*=\s*pmrem\.fromScene\(skyScene,\s*0,\s*0?\.1,\s*(?:1000|1e3)\),\s*env\s*=\s*envTarget\.texture;/gm, 't.id'],
  ['assets-ready', /^([ \t]*)await P\.build\(t,\s*context\);\s+if\s*\(!isolated\)\s*await finishBatch\(\);/gm, 't.id'],
  ['compile-started', /^([ \t]*)try\s*\{(?=\s*(?:\/\/[^\r\n]*\r?\n\s*)*(?:if\s*\(!streamsSnowInterior\)\s*)?await renderer\.compileAsync\(stage,\s*stageCamera\);)/gm, 't.id'],
  ['shaders-ready', /^([ \t]*)renderer\.setRenderTarget\(warm\);\s*renderer\.render\(stage,\s*stageCamera\);/gm, 't.id'],
  ['build-finished', /^([ \t]*)cachedPlaces\.set\(t\.id,\s*candidate\);/gm, 't.id'],
];

export const sceneComposerDraw = /^([ \t]*)composer\.render\(\);[ \t]*(?=\r?\n\})/gm;

const frameAnchor = /^([ \t]*)function frame\(stamp\s*=\s*performance\.now\(\)\)\s*\{/gm;

export function readDirectionOverview(raw) {
  assert(raw, 'Set CAPTURE_DIRECTION_OVERVIEW to the declared site overview pose.');
  const view = JSON.parse(raw);
  const isPoint = point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
  assert(['world', 'nook-local'].includes(view?.space) && isPoint(view.position) && isPoint(view.look)
    && view.position.some((axis, i) => axis !== view.look[i]) && Number.isFinite(view.fov) && view.fov >= 12 && view.fov <= 100,
  'CAPTURE_DIRECTION_OVERVIEW must declare a world or nook-local pose with two distinct points and a 12–100 degree FOV.');
  return view;
}

export function instrumentPineScene(source, { readiness, cadence, lighting, walkClock, directionCamera, solarProbe, backdropProbe, realismBaseOnly }) {
  if (realismBaseOnly) {
    const anchor = /^([ \t]*)if \(!narrow\(\) && !touchPrimary\.matches && !powerSaver\)(?=\s+(?:\{\s+const entering = place, started = performance\.now\(\);|entering\.baked\?\.backdrop\?\.startDesktopHigh\(\);))/gm;
    assert.equal([...source.matchAll(anchor)].length, 1, 'Expected one scene audit anchor for desktop high-tier streaming.');
    source = source.replace(anchor, "$1if (id !== 'pine-gate' && !narrow() && !touchPrimary.matches && !powerSaver)");
  }
  if (readiness) for (const [name, anchor, id, before] of readinessAnchors) {
    const mark = `if (${id} === 'pine-gate' || ${id} === 'snow-roof') performance.mark('one-light:' + ${id} + ':${name}');`;
    source = insertAt(source, anchor, name, mark, before);
  }
  if (cadence) {
    source = insertAt(source, sceneComposerDraw, 'composer render', 'window.__pineMeasureFrame?.();');
  }
  if (walkClock) {
    source = insertAt(source, /^([ \t]*)const walk\s*=\s*tween\(P\.walkSeconds\s*\?\?\s*14,\s*(?:\(k\)|k)\s*=>\s*\{/gm,
      'physical walk time', 'window.__pineCaptureWalkClock = { id, seconds: k * (P.walkSeconds ?? 14), durationSeconds: P.walkSeconds ?? 14 };');
  }
  if (lighting) {
    source = insertAt(source, frameAnchor, 'lighting state', `window.__pineCaptureLighting = () => {
  const state = place?.baked?.lightingState();
  return state ? { placeId: place.id, agx: !!nativeAgXPass?.enabled, ...state } : null;
};`, true);
  }
  if (backdropProbe) {
    source = insertAt(source, frameAnchor, 'offline backdrop state', `window.__pineCaptureBackdrop = () => {
  const group = place?.baked?.backdrop?.group;
  const forest = place?.baked?.approachForest?.group;
  const wax = place?.baked?.waxNormal;
  if (!group && !wax && !forest) return null;
  const image = (texture) => ({ uri: texture.name, pixels: [texture.image.width, texture.image.height],
    ...(texture.isCompressedTexture ? { compressed: texture.format !== THREE.RGBAFormat,
      gpuBytes: texture.mipmaps.reduce((total, mip) => total + mip.data.byteLength, 0) } : {}) });
  const eye = camera.getWorldPosition(V3());
  const ray = camera.getWorldDirection(V3());
  const trees = place?.baked?.highTrees?.group;
  const baseCrowns = place?.baked?.highTrees?.base;
  return {
    approachForest: forest ? {
      visible: forest.visible,
      planes: forest.children.map(plane => ({
        ...image(plane.material.uniforms.uPlate.value),
        position: plane.position.toArray(),
        size: [plane.geometry.parameters.width, plane.geometry.parameters.height],
        depthTest: plane.material.depthTest, depthWrite: plane.material.depthWrite,
      })),
    } : null,
    baseCrowns: baseCrowns ? { visible: baseCrowns.visible, mounts: baseCrowns.children.map(tree => ({
      name: tree.name, position: tree.position.toArray(), height: tree.scale.y,
    })) } : null,
    nativeTreeMounts: trees ? JSON.parse(place.baked.group.userData.one_light_pine_native_mounts) : null,
    waxSunVisibility: place?.baked?.sunShade?.uPineSunVisibility.value ?? null,
    nativeTrees: trees ? trees.children.map(tree => {
      let triangles = 0;
      tree.traverse(object => {
        if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      });
      return { name: tree.name, position: tree.position.toArray(), scale: tree.scale.x, triangles };
    }) : null,
    waxNormal: wax ? image(wax) : null,
    backdrop: group ? {
      visible: group.visible,
      planes: group.children.map(plane => {
        const center = plane.getWorldPosition(V3());
        const front = V3(0, 0, 1).applyQuaternion(plane.getWorldQuaternion(new THREE.Quaternion()));
        const { width, height } = plane.geometry.parameters;
        const distance = center.clone().sub(eye).dot(front) / ray.dot(front);
        const hit = distance > camera.near && distance < camera.far ? plane.worldToLocal(eye.clone().addScaledVector(ray, distance)) : null;
        const uniforms = plane.material.uniforms;
        return {
          name: plane.name, ...image(uniforms.uPlate.value),
          opacity: uniforms.uDayOpacity.value,
          ...(uniforms.uHighPlate && uniforms.uHighMix ? { high: { ...image(uniforms.uHighPlate.value), mix: uniforms.uHighMix.value } } : {}),
          position: center.toArray(), front: front.toArray(), size: [width, height],
          viewportCenterUv: hit ? [.5 + hit.x / width, .5 + hit.y / height] : null,
          depthTest: plane.material.depthTest, depthWrite: plane.material.depthWrite,
          renderOrder: plane.renderOrder,
        };
      }),
    } : null,
  };
};`, true);
  }
  if (directionCamera) {
    source = insertAt(source, frameAnchor, 'direction camera', `let pineCaptureRestoreView = null;
window.__pineCaptureCamera = () => ({
  phase, position: camera.position.toArray(), direction: camera.getWorldDirection(V3()).toArray(),
  fov: camera.fov, overview: !!pineCaptureRestoreView,
});
window.__pineCaptureOverview = async (view) => {
  if (place?.id !== 'pine-gate' || phase !== 'candle') throw new Error('Pine Gate overview requires the candle chooser.');
  if (view) {
    if (pineCaptureRestoreView) throw new Error('An overview is already active.');
    pineCaptureRestoreView = { pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov };
    const convert = (point) => view.space === 'world' ? V3(...point) : toWorld(V3(...point));
    const pos = convert(view.position), look = convert(view.look);
    await moveCam(pos, look, .85, view.fov);
    return { position: pos.toArray(), direction: look.sub(pos).normalize().toArray(), fov: view.fov };
  } else {
    const saved = pineCaptureRestoreView;
    if (!saved) return;
    await moveCam(saved.pos, saved.look, .85, saved.fov);
    rig.fov = saved.fov;
    pineCaptureRestoreView = null;
  }
};`, true);
  }
  if (solarProbe) {
    source = insertAt(source, frameAnchor, 'solar direction and diagnostic camera', `let pineSolarRestoreView = null;
window.__pineCaptureSolar = () => {
  if (place?.id !== 'pine-gate') throw new Error('Solar proof requires the live Pine Gate scene.');
  const uniforms = place.sky.material.uniforms;
  const skyUniform = uniforms.uDir.value.clone();
  const skyDirection = skyUniform.clone().applyQuaternion(place.sky.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const lightPosition = place.sun.getWorldPosition(V3());
  const lightTarget = place.sun.target.getWorldPosition(V3());
  const towardLight = lightPosition.clone().sub(lightTarget).normalize();
  const project = (direction) => camera.getWorldDirection(V3()).dot(direction) <= 0 ? null
    : camera.getWorldPosition(V3()).addScaledVector(direction, 400).project(camera).toArray().slice(0, 2);
  return {
    phase, diagnostic: !!pineSolarRestoreView, bakedLighting: !!place.P.bakedLighting,
    skyUniform: skyUniform.toArray(), skyDirection: skyDirection.toArray(), discStrength: uniforms.uDisc.value,
    lightType: place.sun.type, lightPosition: lightPosition.toArray(), lightTarget: lightTarget.toArray(),
    towardLight: towardLight.toArray(), lightToTarget: towardLight.clone().negate().toArray(),
    lightIntensity: place.sun.intensity, liveCastShadow: place.sun.castShadow,
    projectedSky: project(skyDirection), projectedLight: project(towardLight),
  };
};
window.__pineCaptureSolarView = async (enable) => {
  if (place?.id !== 'pine-gate' || phase !== 'burning') throw new Error('Solar view requires settled Pine Gate burning.');
  if (enable) {
    if (pineSolarRestoreView) throw new Error('Solar diagnostic camera is already active.');
    pineSolarRestoreView = { pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov };
    const skyDirection = V3(...window.__pineCaptureSolar().skyDirection);
    const eye = rig.pos.clone().add(V3(0, 36, 0));
    const look = eye.clone().add(skyDirection.applyAxisAngle(V3(0, 1, 0), .065).add(V3(0, -.045, 0)));
    await moveCam(eye, look, .65, 12);
  } else {
    const saved = pineSolarRestoreView;
    if (!saved) return;
    await moveCam(saved.pos, saved.look, .65, saved.fov);
    rig.fov = saved.fov;
    pineSolarRestoreView = null;
  }
};`, true);
  }
  return source;
}
