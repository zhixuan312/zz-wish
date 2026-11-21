// A loopback review of the ordinary UI with an isolated API and database.
/* global window */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createServer } from 'vite';
import { buildApp } from '../../server/app.ts';
import config from '../../web/vite.config.ts';
import { HIGH_WHITE_TRAVEL_SECONDS } from '../../web/src/engine/places/highland-camera.js';
import { HIGH_WHITE_VERIFIED_MESHES } from './camera-audit.mjs';

const SOURCE = 'web/src/engine/places/highland.js';
const CAMERA_SOURCE = 'web/src/engine/places/highland-camera.js';
const BASELINE = 'a49d538';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const hash = text => createHash('sha256').update(text).digest('hex');

async function reviewSource(baseline) {
  const committedCamera = git('show', `${BASELINE}:${CAMERA_SOURCE}`);
  const currentCamera = await readFile(join(root, CAMERA_SOURCE), 'utf8');
  if (committedCamera !== currentCamera) throw new Error('The authored camera differs from the matched baseline.');
  const injected = baseline ? git('show', `${BASELINE}:${SOURCE}`) : null;
  return {
    injected,
    metadata: {
      mode: baseline ? 'baseline' : 'candidate',
      checkout: git('rev-parse', 'HEAD').trim(),
      baseline: git('rev-parse', BASELINE).trim(),
      highlandSha256: hash(injected ?? await readFile(join(root, SOURCE), 'utf8')),
      cameraSha256: hash(currentCamera),
      injectedFiles: baseline ? [SOURCE] : [],
    },
  };
}

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Review anchor changed: ${before}`);
  return source.replace(before, after);
}

// Serialized into the scene module only by the local review server. Capture the
// actual rendered frame and an explicitly separate matched diagnostic render.
function makeReview(THREE, camera, canvas, mine, duration, meshNames) {
  const samples = [];
  let requests = [], frames = [], recording = false, walking = false, geometry = null;
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
  function meshBounds(group) {
    const matches = new Map(meshNames.map(name => [name, []]));
    group.traverse(object => matches.get(object.name)?.push(object));
    return [...matches].map(([name, objects]) => {
      const [mesh] = objects;
      if (objects.length !== 1 || !mesh.isMesh || !mesh.visible) return { name, count: objects.length, min: null, max: null };
      const bounds = new THREE.Box3().setFromObject(mesh, true);
      return { name, count: objects.length, min: bounds.min.toArray(), max: bounds.max.toArray() };
    });
  }
  let latest, stills = [];
  window.__highlandReview = {
    start(targets) { samples.length = 0; frames = []; requests = [...targets]; recording = true; walking = false; geometry = null; },
    read() { return { ...latest, lamp: lampProjection() }; },
    nextStill(pose) { return new Promise(resolve => stills.push({ pose, resolve })); },
    stop() { recording = false; return { samples, frames, geometry, missed: requests }; },
  };
  return (stamp, place, progress, drawMatched) => {
    if (place?.id !== 'highland') return false;
    latest = sample(stamp, progress);
    let livePng;
    const bothRenders = pose => {
      livePng ??= canvas.toDataURL('image/png');
      return { capturePose: pose, png: drawMatched(pose), livePng };
    };
    if (recording && latest.walkState === 'walking') walking = true;
    if (recording && walking) {
      geometry ??= meshBounds(place.G);
      samples.push(latest);
      if (requests.length && latest.walkSeconds >= requests[0].seconds) {
        const { name, seconds, pose } = requests.shift();
        frames.push({ name, targetSeconds: seconds, ...latest, ...bothRenders(pose) });
      }
    }
    if (stills.length) {
      const next = stills; stills = [];
      for (const { pose, resolve } of next) {
        resolve({ ...latest, ...(pose ? bothRenders(pose) : {}), lamp: lampProjection() });
      }
    }
    // A diagnostic render used the same canvas. Let the caller put the actual
    // camera back in the visible framebuffer before this browser frame ends.
    return Boolean(livePng);
  };
}

export async function startPreview({ baseline = false } = {}) {
  const sourceReview = await reviewSource(baseline);
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
          if (id.endsWith(`/${SOURCE}`) && sourceReview.injected !== null) return sourceReview.injected;
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
            const setup = `const reviewHighlandFrame = (${makeReview.toString()})(THREE, camera, canvas, mine, ${HIGH_WHITE_TRAVEL_SECONDS}, ${JSON.stringify(HIGH_WHITE_VERIFIED_MESHES)});`;
            return replaceOnce(replaceOnce(source, entry, `${setup}\n${entry}`), draw, `
  composer.render();
  const paintedDiagnostic = reviewHighlandFrame(stamp, place, window.__walkProgress, ({ position, look, fov }) => {
    const live = { position: camera.position.clone(), rotation: camera.quaternion.clone(), fov: camera.fov, near: camera.near, sky: place.sky.position.clone() };
    try {
      camera.position.fromArray(position);
      camera.lookAt(V3(...look));
      camera.fov = fov;
      camera.near = Math.min(.3, Math.max(.01, camera.position.distanceTo(mine.g.getWorldPosition(V3())) * .012));
      camera.updateProjectionMatrix();
      place.sky.position.copy(camera.position);
      composer.render();
      return canvas.toDataURL('image/png');
    } finally {
      camera.position.copy(live.position); camera.quaternion.copy(live.rotation);
      camera.fov = live.fov; camera.near = live.near; camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      place.sky.position.copy(live.sky);
    }
  });
  if (paintedDiagnostic) composer.render();
}

// ---------- Start ----------`);
          }
        },
      }],
      server: { ...config.server, host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': { target, ws: true } } },
    });
    await vite.listen(0);
    return { url: `http://127.0.0.1:${vite.httpServer.address().port}`, source: sourceReview.metadata, close };
  } catch (error) {
    await close();
    throw error;
  }
}
