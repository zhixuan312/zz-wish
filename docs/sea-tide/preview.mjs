// Loopback review of the normal game UI and API with a disposable database.
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import config from '../../web/vite.config.ts';
import { buildApp } from '../../server/app.ts';

function replaceOnce(source, original, replacement) {
  const offset = source.indexOf(original);
  if (offset === -1 || source.indexOf(original, offset + original.length) !== -1) {
    throw new Error('Tide preview anchor changed: ' + original);
  }
  return source.replace(original, replacement);
}

const reviewScript = `
  // These probes are assigned only in the loopback review server.
  window.__tideSceneVisible = () => place?.id === 'sea-tide';

  const mouthPoints = [new THREE.Vector3(66, 0, 8.5), new THREE.Vector3(66, -2.76, 8.5)];
  const mouthRay = new THREE.Raycaster();
  const mouthAim = new THREE.Vector3();
  const mouthProjection = new THREE.Vector3();
  let tracedPlace;
  let mouthOccluders = [];
  window.__tideSampleMouth = () => {
    if (place?.id !== 'sea-tide' || window.__walkProgress?.state !== 'walking'
        || window.__walkProgress.progress < .5) return null;
    camera.updateMatrixWorld();
    const projected = mouthPoints.every(point => {
      const ndc = mouthProjection.copy(point).project(camera);
      return Math.abs(ndc.x) <= .85 && Math.abs(ndc.y) <= .85 && Math.abs(ndc.z) <= 1;
    });
    if (!projected) return { projected, visible: false, blockedBy: null };
    if (tracedPlace !== place) {
      tracedPlace = place;
      place.G.updateMatrixWorld(true);
      mouthOccluders = [];
      place.G.traverse(object => {
        if (!object.isMesh || ![object.material].flat().some(material => !material.transparent)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        mouthOccluders.push(object);
      });
    }
    for (const point of mouthPoints) {
      const direction = mouthAim.copy(point).sub(camera.position);
      mouthRay.set(camera.position, direction.clone().normalize());
      mouthRay.far = direction.length() - .035;
      const hit = mouthRay.intersectObjects(mouthOccluders, false).find(({ object }) => {
        for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
        return true;
      });
      if (hit) return { projected, visible: false, blockedBy: hit.object.name || hit.object.parent?.name || hit.object.type };
    }
    return { projected, visible: true, blockedBy: null };
  };

  window.__tideReview = () => {
    if (place?.id !== 'sea-tide') return null;
    camera.updateMatrixWorld();
    const sheet = document.querySelector('.candle-sheet')?.getBoundingClientRect();
    const solids = [];
    place.G.traverseVisible(object => {
      if (!object.isMesh || Array.isArray(object.material) || object.material.transparent) return;
      for (let parent = object; parent !== null; parent = parent.parent) {
        if (parent === mine.g) return;
      }
      solids.push(object);
    });
    function probe(point, raycast = false) {
      const ndc = point.clone().project(camera);
      const pixel = [(ndc.x + 1) * innerWidth / 2, (1 - ndc.y) * innerHeight / 2];
      const inFrame = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
      const underSheet = Boolean(sheet && pixel[0] >= sheet.left && pixel[0] <= sheet.right
        && pixel[1] >= sheet.top && pixel[1] <= sheet.bottom);
      const direction = point.clone().sub(camera.position);
      const nearest = raycast && inFrame
        ? new THREE.Raycaster(camera.position, direction.clone().normalize(), 0, direction.length() - .1)
          .intersectObjects(solids, false)[0]?.object
        : null;
      return { point: point.toArray(), pixel, inFrame, underSheet,
        occluder: nearest ? (nearest.name || nearest.parent?.name || nearest.type) : null };
    }
    function bounds(box) {
      if (box.isEmpty()) return null;
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) corners.push(probe(new THREE.Vector3(x, y, z)));
      }
      const left = Math.min(...corners.map(corner => corner.pixel[0]));
      const right = Math.max(...corners.map(corner => corner.pixel[0]));
      const top = Math.min(...corners.map(corner => corner.pixel[1]));
      const bottom = Math.max(...corners.map(corner => corner.pixel[1]));
      const underSheet = Boolean(sheet && left < sheet.right && right > sheet.left
        && top < sheet.bottom && bottom > sheet.top);
      return { left, right, top, bottom, inFrame: corners.every(corner => corner.inFrame), underSheet };
    }
    const hood = mine.g.getWorldPosition(new THREE.Vector3());
    const wick = mine.flameWorld().clone();
    const flameEnvelope = new THREE.Box3(wick.clone().add(new THREE.Vector3(-.035, -.015, -.035)),
      wick.clone().add(new THREE.Vector3(.035, .085, .035)));
    const lamp = mine.g.visible && mine.parts?.g;
    const floor = new THREE.Raycaster(hood.clone().add(new THREE.Vector3(0, .04, 0)),
      new THREE.Vector3(0, -1, 0), 0, .2).intersectObjects(solids, false)[0];
    const sea = [
      probe(new THREE.Vector3(24, -2.78, 8.5), true),
      probe(new THREE.Vector3(43, -2.78, 8.5), true),
      probe(new THREE.Vector3(65, -2.78, 8.5), true),
    ];
    return {
      camera: { position: camera.position.toArray(), direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        fov: camera.fov, rig: { position: rig.pos.toArray(), look: rig.look.toArray(), fov: rig.fov } },
      walk: window.__walkProgress ?? null, ignition: window.__visualIgnition ?? null,
      screen: document.querySelector('.ui')?.dataset.screen,
      lamp: lamp ? { base: probe(hood), wick: probe(wick), hoodBounds: bounds(new THREE.Box3().setFromObject(lamp)),
        flameEnvelope: bounds(flameEnvelope),
        contactMetres: floor ? hood.y - floor.point.y : null } : null,
      sea,
      mouth: probe(new THREE.Vector3(66, 0, 8.5), true),
      salt: [[8.77, .48, 9.78], [8.11, .48, 10.25], [7.24, .48, 10.89], [3, 1.05, 13.996]]
        .map(point => probe(new THREE.Vector3(...point), true)),
      screenSize: [innerWidth, innerHeight],
    };
  };`;

export async function startPreview() {
  const temp = await mkdtemp(join(tmpdir(), 'tide-review-'));
  let app;
  let vite;
  async function close() {
    try {
      await vite?.close();
    } finally {
      try {
        await app?.close();
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    }
  }
  try {
    ({ app } = await buildApp({ dbFile: join(temp, 'review.db'), logger: false }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    const api = 'http://127.0.0.1:' + app.server.address().port;
    vite = await createServer({
      ...config,
      configFile: false,
      cacheDir: join(temp, 'vite'),
      plugins: [...config.plugins, {
        name: 'tide-loopback-review',
        enforce: 'pre',
        transform(source, id) {
          const path = id.split('?')[0];
          if (path.endsWith('/web/src/visiblePlaces.ts')) {
            return replaceOnce(source, "['snow-roof', 'pine-gate']", "['sea-tide', 'snow-roof', 'pine-gate']");
          }
          if (path.endsWith('/web/src/engine/index.ts')) {
            const procedural = replaceOnce(source, "if (id === 'pine-gate') onProgress?.(progress);",
              "if (id === 'pine-gate' || id === 'sea-tide') onProgress?.(progress);");
            const prepare = replaceOnce(procedural, "onProgress?.({ ...progress, stage: 'error' });",
              "window.__tidePrepareError = String((error as Error)?.stack ?? error); onProgress?.({ ...progress, stage: 'error' });");
            return replaceOnce(prepare, "initialize().then(s => s.previewPlace(id));",
              "initialize().then(s => s.previewPlace(id)).catch(error => { window.__tidePreviewError = String(error?.stack ?? error); throw error; });");
          }
          if (path.endsWith('/web/src/engine/scene.js')) {
            const trace = 'lx: rig.look.x, ly: rig.look.y, lz: rig.look.z, fov: rig.fov ?? camera.fov });';
            return replaceOnce(source, trace, `lx: rig.look.x, ly: rig.look.y, lz: rig.look.z, fov: camera.fov,
              actual: camera.position.toArray(), walkState: window.__walkProgress?.state,
              walkProgress: window.__walkProgress?.progress, mouth: window.__tideSampleMouth?.() });`) + '\n' + reviewScript;
          }
        },
      }],
      server: {
        ...config.server, host: '127.0.0.1', port: 0, strictPort: true,
        proxy: { '/api': { target: api, ws: true } },
      },
    });
    await vite.listen(0);
    const address = vite.httpServer.address();
    return { url: 'http://127.0.0.1:' + address.port, close };
  } catch (error) {
    await close();
    throw error;
  }
}
