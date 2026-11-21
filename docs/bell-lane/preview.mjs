// Loopback-only fixture. The game uses its regular UI and API with a disposable database.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import config from '../../web/vite.config.ts';
import { buildApp } from '../../server/app.ts';

export async function startPreview() {
  const temp = await mkdtemp(join(tmpdir(), 'bell-lane-review-'));
  const { app } = await buildApp({ dbFile: join(temp, 'review.db'), logger: false });
  let vite;
  try {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const api = 'http://127.0.0.1:' + app.server.address().port;
    vite = await createServer({
      ...config,
      configFile: false,
      cacheDir: join(temp, 'vite'),
      plugins: [...config.plugins, {
        name: 'bell-lane-review-catalog',
        enforce: 'pre',
        transform(source, id) {
          if (id.endsWith('/web/src/engine/scene.js')) {
            const anchor = 'const outside = new THREE.Scene();';
            const draw = '  composer.render();\n}\n\n// ---------- Start ----------';
            if (!source.includes(anchor) || !source.includes(draw)) throw new Error('Bell Lane review cannot find the active scene or render loop.');
            return source.replace(anchor, anchor + `
              const requestedBellFrames = [];
              window.__captureBellFrame = (criteria = {}) => new Promise((resolve, reject) => {
                requestedBellFrames.push({ ...criteria, resolve, reject });
              });
              function captureBellFrames() {
                const walk = window.__walkProgress ?? null;
                const ignition = window.__visualIgnition ?? null;
                for (const request of requestedBellFrames.slice()) {
                  if (request.seconds != null && (walk?.id !== 'bell-lane' || walk.progress * 30 < request.seconds)) continue;
                  if (request.ignitionState && ignition?.state !== request.ignitionState) continue;
                  requestedBellFrames.splice(requestedBellFrames.indexOf(request), 1);
                  const frame = { position: camera.position.toArray(), direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
                    fov: camera.fov, walk, landmark: window.__bellReviewWindow(), ignition };
                  renderer.domElement.toBlob(blob => {
                    if (!blob) { request.reject(new Error('The renderer returned no frame')); return; }
                    const reader = new FileReader();
                    reader.onload = () => request.resolve({ ...frame, png: reader.result.split(',')[1] });
                    reader.onerror = request.reject;
                    reader.readAsDataURL(blob);
                  }, 'image/png');
                }
              }
              window.__bellTreeStats = () => {
                const tree = outside.getObjectByName('Bell Lane old tree');
                return {
                  meshes: tree.children.length,
                  triangles: tree.children.reduce((total, mesh) => total + mesh.geometry.index.count / 3, 0),
                };
              };
              window.__bellReviewWindow = () => {
                const windowMesh = outside.getObjectByName('Bell Lane east shop window');
                if (!windowMesh) return null;
                const p = windowMesh.getWorldPosition(new THREE.Vector3());
                const solids = [];
                outside.traverseVisible(object => {
                  if (object.isMesh && !object.material.transparent && !Array.isArray(object.material)) solids.push(object);
                });
                // Do not cast through the shared diagonal of the two pane triangles.
                // Multiple interior samples also distinguish a window from a glimpse of one corner.
                const samples = [];
                for (const across of [-.77, -.29, .29, .77]) for (const up of [-.30, .26]) {
                  const point = windowMesh.localToWorld(new THREE.Vector3(across, up, 0));
                  const ray = point.clone().sub(camera.position);
                  const caster = new THREE.Raycaster(camera.position, ray.clone().normalize(), 0, ray.length() + .02);
                  const projected = point.clone().project(camera);
                  const inFrame = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
                  const hit = caster.intersectObjects(solids, false)[0]?.object;
                  samples.push({ inFrame, onPane: hit === windowMesh, obstruction: hit && hit !== windowMesh ? (hit.name || hit.type) : null });
                }
                const ndc = p.clone().project(camera);
                const wick = mine.flameWorld().clone().project(camera);
                const covered = point => Boolean(document.elementFromPoint((point.x + 1) * innerWidth / 2,
                  (1 - point.y) * innerHeight / 2)?.closest('.candle-sheet'));
                const clearSamples = samples.filter(sample => sample.inFrame && sample.onPane).length;
                return { wickNdc: wick.toArray(), wickCovered: covered(wick), windowCovered: covered(ndc), windowId: windowMesh.uuid,
                  visible: clearSamples >= 2, clearSamples, ndc: ndc.toArray(), samples };
              };
            `).replace(draw, draw.replace('composer.render();', 'composer.render(); captureBellFrames();'));
          }
          if (!id.endsWith('/web/src/visiblePlaces.ts')) return;
          const original = "['snow-roof', 'pine-gate']";
          if (!source.includes(original)) throw new Error('Update the review fixture to match the current catalog.');
          return source.replace(original, "['bell-lane', 'snow-roof', 'pine-gate']");
        },
      }],
      server: {
        ...config.server, host: '127.0.0.1', port: 0, strictPort: true,
        proxy: { '/api': { target: api, ws: true } },
      },
    });
    await vite.listen(0);
    const address = vite.httpServer.address();
    return {
      url: 'http://127.0.0.1:' + address.port,
      async close() {
        await vite.close();
        await app.close();
        await rm(temp, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await vite?.close();
    await app.close();
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  const preview = await startPreview();
  console.log(preview.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); });
}
