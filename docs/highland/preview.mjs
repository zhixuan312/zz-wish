// A loopback review of the ordinary UI with an isolated API and database.
/* global document, window */
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
const RIDGE_BASELINE = '3811d40';
const RIDGE_MODULES = [SOURCE, 'web/src/engine/places/highland-ridges.js', 'web/src/engine/places/highland-surfaces.js'];
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const hash = text => createHash('sha256').update(text).digest('hex');

async function reviewSource(baseline, ridgeReview) {
  const revision = git('rev-parse', ridgeReview ? RIDGE_BASELINE : BASELINE).trim();
  const committedCamera = git('show', `${revision}:${CAMERA_SOURCE}`);
  const currentCamera = await readFile(join(root, CAMERA_SOURCE), 'utf8');
  if (committedCamera !== currentCamera) throw new Error('The authored camera differs from the matched baseline.');
  const files = ridgeReview ? RIDGE_MODULES : [SOURCE];
  const historical = new Map(files.map(file => [file, git('show', `${revision}:${file}`)]));
  const active = baseline ? historical : new Map(await Promise.all(files.map(async file => [file, await readFile(join(root, file), 'utf8')])));
  const hashes = modules => Object.fromEntries([...modules].map(([file, content]) => [file, hash(content)]));
  const seen = new Set();
  return {
    sourceFor(source, id) {
      const file = files.find(path => id.endsWith(`/${path}`));
      if (!file) return;
      seen.add(file);
      if (baseline) return active.get(file);
      if (source !== active.get(file)) throw new Error(`Review scene changed after starting: ${file}`);
    },
    verify() {
      const missing = files.filter(file => !seen.has(file));
      if (missing.length) throw new Error(`Review did not request scene modules: ${missing.join(', ')}`);
    },
    metadata: {
      mode: baseline ? 'baseline' : 'candidate',
      checkout: git('rev-parse', 'HEAD').trim(),
      baseline: revision,
      highlandSha256: hash(active.get(SOURCE)),
      cameraSha256: hash(currentCamera),
      injectedFiles: baseline ? files : [],
      ...(ridgeReview ? { sceneModulesSha256: hashes(active), baselineModulesSha256: hashes(historical) } : {}),
    },
  };
}

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Review anchor changed: ${before}`);
  return source.replace(before, after);
}

function makeThresholdClip(canvas, plan) {
  let settle;
  const result = new Promise(resolve => { settle = resolve; });
  let active, finishing = false, completed = false;
  const samples = [];
  function complete(value) {
    if (completed) return;
    completed = true;
    active?.track.stop();
    settle(value);
  }

  function verifyBlob(blob) {
    return new Promise((resolve, reject) => {
      const player = document.createElement('video');
      const url = window.URL.createObjectURL(blob);
      const finish = () => { window.clearTimeout(timer); window.URL.revokeObjectURL(url); };
      const timer = window.setTimeout(() => { finish(); reject(new Error('Timed out opening the live clip')); }, 5000);
      player.preload = 'metadata';
      player.onloadedmetadata = () => {
        const { videoWidth: width, videoHeight: height, duration } = player;
        finish();
        resolve({ width, height, mediaDurationSeconds: Number.isFinite(duration) ? duration : null });
      };
      player.onerror = () => { finish(); reject(new Error('Chrome could not open the live clip')); };
      player.src = url;
      player.load();
    });
  }

  function start() {
    // The mirror gets only the original composer output. The separate pose
    // diagnostic renders touch the WebGL canvas only and never enter the clip.
    const mirror = document.createElement('canvas');
    mirror.width = canvas.width; mirror.height = canvas.height;
    const drawing = mirror.getContext('2d', { alpha: false });
    drawing.drawImage(canvas, 0, 0);
    const stream = mirror.captureStream(0);
    const [track] = stream.getVideoTracks();
    const mimeType = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9'].find(type => window.MediaRecorder.isTypeSupported(type));
    if (!mimeType || typeof track?.requestFrame !== 'function') {
      track?.stop();
      throw new Error('Chrome must support manual canvas frame capture and WebM encoding');
    }
    const chunks = [];
    let recorder;
    try { recorder = new window.MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 }); }
    catch (error) { track.stop(); throw error; }
    active = { mirror, drawing, track, recorder, nextStamp: -Infinity };
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => complete({ error: event.error?.message ?? 'WebM recording failed' });
    recorder.onstop = async () => {
      try {
        const blob = new window.Blob(chunks, { type: recorder.mimeType });
        const meta = await verifyBlob(blob);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new window.FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        const firstFrame = samples[0], lastFrame = samples.at(-1);
        const gaps = samples.slice(1).map((frame, i) => frame.stampMs - samples[i].stampMs);
        complete({
          ...meta, dataUrl, mimeType: recorder.mimeType, requestedFps: plan.fps,
          submittedFrames: samples.length, firstFrame, lastFrame,
          submittedDurationMs: lastFrame.stampMs - firstFrame.stampMs, maxSubmissionGapMs: Math.max(0, ...gaps),
        });
      } catch (error) { complete({ error: error.message }); }
    };
    try { recorder.start(); }
    catch (error) { complete({ error: error.message }); }
  }

  function frame(sample) {
    if (completed || sample.walkSeconds < plan.from) return;
    try {
      if (finishing) {
        // Allow the terminal live frame to reach the track before stopping it.
        if (active.recorder.state !== 'inactive') active.recorder.stop();
        return;
      }
      if (!active) start();
      if (completed || (sample.stampMs < active.nextStamp && sample.walkSeconds < plan.to)) return;
      active.drawing.drawImage(canvas, 0, 0);
      active.track.requestFrame();
      samples.push(sample);
      const step = 1000 / plan.fps;
      const due = Number.isFinite(active.nextStamp) ? active.nextStamp : sample.stampMs;
      active.nextStamp = due + (Math.floor(Math.max(0, sample.stampMs - due) / step) + 1) * step;
      finishing = sample.walkSeconds >= plan.to;
    } catch (error) {
      if (active?.recorder.state === 'recording') active.recorder.stop();
      complete({ error: error.message });
    }
  }

  return { frame, result };
}

// Serialized into the scene module only by the local review server. Capture the
// actual rendered frame and an explicitly separate matched diagnostic render.
function makeReview(THREE, camera, canvas, mine, duration, meshNames, createClip) {
  const samples = [];
  let requests = [], frames = [], recording = false, walking = false, geometry = null;
  let clip = null;
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
    start(targets, clipPlan) {
      samples.length = 0; frames = []; requests = [...targets]; recording = true; walking = false; geometry = null;
      clip = clipPlan ? createClip(canvas, clipPlan) : null;
    },
    read() { return { ...latest, lamp: lampProjection() }; },
    nextStill(pose) { return new Promise(resolve => stills.push({ pose, resolve })); },
    stop() { recording = false; return { samples, frames, geometry, missed: requests }; },
    clipResult() { return clip?.result; },
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
      clip?.frame(latest);
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

export async function startPreview({ baseline = false, ridgeReview = false } = {}) {
  const sourceReview = await reviewSource(baseline, ridgeReview);
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
          const frozen = sourceReview.sourceFor(source, id);
          if (frozen !== undefined) return frozen;
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
            const setup = `const reviewHighlandFrame = (${makeReview.toString()})(THREE, camera, canvas, mine, ${HIGH_WHITE_TRAVEL_SECONDS}, ${JSON.stringify(HIGH_WHITE_VERIFIED_MESHES)}, (${makeThresholdClip.toString()}));`;
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
      server: { ...config.server, host: '127.0.0.1', port: 0, strictPort: true, watch: null,
        proxy: { '/api': { target, ws: true } } },
    });
    await vite.listen(0);
    return { url: `http://127.0.0.1:${vite.httpServer.address().port}`, source: sourceReview.metadata, verifySource: sourceReview.verify, close };
  } catch (error) {
    await close();
    throw error;
  }
}
