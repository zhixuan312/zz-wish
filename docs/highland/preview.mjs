// A loopback review of the ordinary UI with an isolated API and database.
/* global window */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { buildApp } from '../../server/app.ts';
import config from '../../web/vite.config.ts';
import { HIGH_WHITE_TRAVEL_SECONDS } from '../../web/src/engine/places/highland-camera.js';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Review anchor changed: ${before}`);
  return source.replace(before, after);
}

// Serialized into the scene module only by the local review server. Capture the
// exact rendered frame without changing the clock, the rig, or the game UI.
function makeReview(THREE, camera, canvas, mine, duration) {
  const samples = [];
  let requests = [], frames = [], recording = false, walking = false;
  const direction = new THREE.Vector3();
  function sample(stamp, progress) {
    return {
      stampMs: stamp,
      walkSeconds: progress?.id === 'highland' ? progress.progress * duration : null,
      walkState: progress?.id === 'highland' ? progress.state : null,
      position: camera.position.toArray(),
      direction: camera.getWorldDirection(direction).toArray(),
      fov: camera.fov,
    };
  }
  function lampProjection() {
    if (!mine.g.visible || !mine.parts?.g) return null;
    const box = new THREE.Box3().setFromObject(mine.parts.g);
    const bounds = canvas.getBoundingClientRect();
    const points = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          points.push({
            x: bounds.left + (p.x + 1) * bounds.width / 2,
            y: bounds.top + (1 - p.y) * bounds.height / 2,
            visibleDepth: p.z > -1 && p.z < 1,
          });
        }
      }
    }
    return {
      left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
      top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)),
      visibleDepth: points.every(p => p.visibleDepth),
      worldBounds: [box.min.toArray(), box.max.toArray()],
    };
  }
  let latest, stills = [];
  window.__highlandReview = {
    start(targets) { samples.length = 0; frames = []; requests = [...targets]; recording = true; walking = false; },
    read() { return { ...latest, lamp: lampProjection() }; },
    nextStill() { return new Promise(resolve => stills.push(resolve)); },
    stop() { recording = false; return { samples, frames, missed: requests }; },
  };
  return (stamp, placeId, progress) => {
    if (placeId !== 'highland') return;
    latest = sample(stamp, progress);
    if (recording && latest.walkState === 'walking') walking = true;
    if (recording && walking) {
      samples.push(latest);
      if (requests.length && latest.walkSeconds >= requests[0].seconds) {
        const { name, seconds } = requests.shift();
        frames.push({ name, targetSeconds: seconds, ...latest, png: canvas.toDataURL('image/png') });
      }
    }
    if (stills.length) {
      const next = stills; stills = [];
      const frame = { ...latest, png: canvas.toDataURL('image/png') };
      for (const resolve of next) resolve(frame);
    }
  };
}

export async function startPreview() {
  const temporary = await mkdtemp(join(tmpdir(), 'highland-review-'));
  let app, vite;
  async function close() {
    try { await vite?.close(); }
    finally {
      try { await app?.close(); }
      finally { await rm(temporary, { recursive: true, force: true }); }
    }
  }

  try {
    ({ app } = await buildApp({ dbFile: join(temporary, 'review.db'), logger: false }));
    await app.listen({ host: '127.0.0.1', port: 0 });
    const target = `http://127.0.0.1:${app.server.address().port}`;
    vite = await createServer({
      ...config, configFile: false, cacheDir: join(temporary, 'vite'),
      plugins: [...config.plugins, {
        name: 'high-white-court-review', enforce: 'pre',
        transform(source, id) {
          if (id.endsWith('/web/src/visiblePlaces.ts')) {
            return replaceOnce(source, "['snow-roof', 'pine-gate']", "['snow-roof', 'pine-gate', 'highland']");
          }
          if (id.endsWith('/web/src/engine/index.ts')) {
            return replaceOnce(source, "if (id === 'pine-gate') onProgress?.(progress);",
              "if (id === 'pine-gate' || id === 'highland') onProgress?.(progress);");
          }
          if (id.endsWith('/web/src/engine/scene.js')) {
            const entry = 'function frame(stamp = performance.now()) {';
            const draw = '  composer.render();\n}\n\n// ---------- Start ----------';
            const setup = `const reviewHighlandFrame = (${makeReview.toString()})(THREE, camera, canvas, mine, ${HIGH_WHITE_TRAVEL_SECONDS});`;
            return replaceOnce(replaceOnce(source, entry, `${setup}\n${entry}`), draw,
              draw.replace('composer.render();', 'composer.render();\n  reviewHighlandFrame(stamp, place?.id, window.__walkProgress);'));
          }
        },
      }],
      server: { ...config.server, host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': { target, ws: true } } },
    });
    await vite.listen(0);
    return { url: `http://127.0.0.1:${vite.httpServer.address().port}`, close };
  } catch (error) {
    await close();
    throw error;
  }
}
