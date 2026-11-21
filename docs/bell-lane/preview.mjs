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
            if (!source.includes(anchor)) throw new Error('Bell Lane review cannot find the active scene.');
            return source.replace(anchor, anchor + `
              window.__bellReviewWindow = () => {
                const windowMesh = outside.getObjectByName('Bell Lane east shop window');
                if (!windowMesh) return null;
                const p = windowMesh.getWorldPosition(new THREE.Vector3());
                const caster = new THREE.Raycaster(camera.position, p.clone().sub(camera.position).normalize(), 0, p.distanceTo(camera.position) + .01);
                const solids = [];
                outside.traverseVisible(object => {
                  if (object.isMesh && !object.material.transparent && !Array.isArray(object.material)) solids.push(object);
                });
                const hit = caster.intersectObjects(solids, false)[0];
                const ndc = p.clone().project(camera);
                const wick = mine.flameWorld().clone().project(camera);
                const covered = point => Boolean(document.elementFromPoint((point.x + 1) * innerWidth / 2,
                  (1 - point.y) * innerHeight / 2)?.closest('.candle-sheet'));
                return { wickNdc: wick.toArray(), wickCovered: covered(wick), windowCovered: covered(ndc), windowId: windowMesh.uuid, visible: hit?.object === windowMesh && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1,
                  ndc: ndc.toArray(), obstruction: hit?.object === windowMesh ? null : (hit?.object?.name || hit?.object?.type || null) };
              };
            `);
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
