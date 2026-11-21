// A private, loopback-only route review. Run --check without a GPU lease.
// Run the screenshot and live camera batch under the s5 GPU lease.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  ROUTE_FLOOR, ROUTE_LANTERN, ROUTE_WALL,
  sampleCloudCliffRoute,
} from '../../web/src/engine/places/cloud-cliff-route.js';
import { CAMERA_LIMITS, cameraPathViolations, measureCameraPath } from './pine-camera-path.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const quick = process.argv.includes('--quick');
const out = join(root, quick ? 'artifacts/cloud-cliff-route-r4-quick' : 'artifacts/cloud-cliff-route-r4');
const baseline = {
  commit: '76e11d7',
  evidenceDirectory: 'artifacts/cloud-cliff-route-r3',
  reportSha256: '13ee97a535655309386927fcc40386a2a9b01fe1b45f8c46e6efd529755b201c',
};
const baselineDir = join(root, baseline.evidenceDirectory);
const routeUrl = '/web/src/engine/places/cloud-cliff-route.js';
const gorgeUrl = '/web/src/engine/places/cloud-cliff-gorge.js';
const worldUrl = '/places/cloud-cliff/';
const worldDir = join(root, 'web/public', worldUrl);
const duration = 30;
const beats = [
  [0, 'entrance'],
  [12, 'wall-approach'],
  [22, 'before-shoulder'],
  [26, 'valley-reveal'],
  [30, 'grounded-hold'],
];
const comparisonBeats = [[26, 'valley reveal'], [30, 'lantern rest']];
const views = [
  { name: 'desktop', phone: false, width: 1440, height: 900 },
  { name: 'phone', phone: true, width: 390, height: 844 },
];
const looks = [
  { name: 'day', night: false, hour: 13, clock: '13:00' },
  { name: 'night', night: true, hour: 22, clock: '22:00' },
];
const scanTextures = ['rock_pitted_mossy', 'stone_pavers'].flatMap(material =>
  ['diffuse', 'normal', 'roughness'].map(map => `/materials/scans/${material}/${map}.jpg`));

function routeSamples(phone) {
  return Array.from({ length: duration * 60 + 1 }, (_, index) =>
    sampleCloudCliffRoute(index / 60, phone));
}

function addMeasuredMotion(rows) {
  return rows.map((row, i) => {
    const previous = rows[i - 1];
    const dt = previous ? row.t - previous.t : 0;
    if (dt <= 0) return { ...row, sampleGapSeconds: null, speedMetresPerSecond: null, turnDegreesPerSecond: null };
    // Each direction starts at the camera position of its own sample.
    const u = [previous.lx - previous.x, previous.ly - previous.y, previous.lz - previous.z];
    const v = [row.lx - row.x, row.ly - row.y, row.lz - row.z];
    const dot = u.reduce((sum, component, axis) => sum + component * v[axis], 0);
    const cosine = dot / (Math.hypot(...u) * Math.hypot(...v));
    return {
      ...row, sampleGapSeconds: dt,
      speedMetresPerSecond: Math.hypot(row.x - previous.x, row.y - previous.y, row.z - previous.z) / dt,
      turnDegreesPerSecond: Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI / dt,
    };
  });
}

function measuredTurn(rows) {
  const series = [];
  let max = 0, at = 0;
  for (const { t, sampleGapSeconds, turnDegreesPerSecond } of rows) {
    if (sampleGapSeconds == null || sampleGapSeconds > .1) continue;
    if (turnDegreesPerSecond > max) {
      max = turnDegreesPerSecond;
      at = t;
    }
    series.push([t, turnDegreesPerSecond]);
  }
  return { max, at, series };
}

function evaluateTrace(rows) {
  assert.ok(rows.length > 1, 'camera trace must contain more than one sample');
  const metrics = measureCameraPath(rows);
  metrics.turn = measuredTurn(rows);
  const nearestWall = Math.min(...rows.map(row => row.wallClearance));
  const allWallDistances = rows.every(row => Number.isFinite(row.wallClearance));
  const allGroundHits = rows.every(row => Number.isFinite(row.floorClearance));
  const nearestEdge = Math.min(...rows.map(row => row.edgeClearance));
  const lowEye = Math.min(...rows.map(row => row.floorClearance));
  const highEye = Math.max(...rows.map(row => row.floorClearance));
  const deviations = cameraPathViolations(metrics);
  if (!allWallDistances || nearestWall < CAMERA_LIMITS.clearanceMetres) {
    deviations.push(`wall clearance ${nearestWall.toFixed(2)} m must be at least ${CAMERA_LIMITS.clearanceMetres} m`);
  }
  if (!Number.isFinite(nearestEdge) || nearestEdge <= 0) {
    deviations.push(`floor support lost: signed edge clearance ${nearestEdge.toFixed(2)} m`);
  }
  if (!allGroundHits
      || lowEye < CAMERA_LIMITS.eyeMinMetres || highEye > CAMERA_LIMITS.eyeMaxMetres) {
    deviations.push(`walking eye height spans ${lowEye.toFixed(2)}–${highEye.toFixed(2)} m`);
  }
  return {
    samples: rows.length,
    from: rows[0].t,
    to: rows.at(-1).t,
    longestSampleGapSeconds: Math.max(...rows.slice(1).map((row, i) => row.t - rows[i].t)),
    peakMetresPerSecond: metrics.speed.max,
    peakDegreesPerSecond: metrics.turn.max,
    peakMetresPerSecondSquared: metrics.acceleration.max,
    nearestWallMetres: nearestWall,
    nearestEdgeMetres: nearestEdge,
    eyeHeightMetres: [lowEye, highEye],
    allGroundHits, allWallDistances, deviations,
  };
}

function checkRoute() {
  return Object.fromEntries(views.map(view => {
    const rows = addMeasuredMotion(routeSamples(view.phone));
    const report = evaluateTrace(rows);
    assert.ok(rows.every((row, i) => row.t === i / 60), `${view.name}: invalid route clock`);
    assert.deepEqual(report.deviations, [], view.name);
    return [view.name, report];
  }));
}

function sitePlan() {
  const samples = routeSamples(false);
  const bounds = [...ROUTE_FLOOR, ...ROUTE_WALL, ...samples.map(row => [row.x, row.z])];
  const xs = bounds.map(point => point[0]);
  const zs = bounds.map(point => point[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const metresWide = Math.max(...xs) - minX;
  const metresHigh = Math.max(...zs) - minZ;
  const scale = Math.min(665 / metresWide, 345 / metresHigh);
  const x = value => 120 + (value - minX) * scale;
  const z = value => 120 + (value - minZ) * scale;
  const svgPoint = ([px, pz]) => `${x(px).toFixed(2)},${z(pz).toFixed(2)}`;
  const points = list => list.map(svgPoint).join(' ');
  const markers = beats.map(([time], index) => {
    const row = sampleCloudCliffRoute(time, false);
    const px = x(row.x);
    const py = z(row.z);
    const offset = [25, 25, 27, -20, 33][index];
    return `<circle cx="${px}" cy="${py}" r="5" fill="#276473" stroke="white" stroke-width="1.5"/>
<text x="${px}" y="${py + offset}" text-anchor="middle">${time} s</text>`;
  }).join('\n');
  const [lampX, , lampZ] = ROUTE_LANTERN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="550" viewBox="0 0 900 550" font-family="system-ui,sans-serif" font-size="15">
<title>Cloud Cliff Court route preview site plan</title>
<rect width="900" height="550" fill="#f7f5ef"/>
<text x="35" y="44" font-size="24" font-weight="600">Cloud Cliff Court route preview</text>
<text x="35" y="68" fill="#4a5353">World metres · plan view · opposite rock face beyond the near platform</text>
<polygon points="${points(ROUTE_FLOOR)}" fill="#ded5be" stroke="#8d8270" stroke-width="2"/>
<polygon points="${points(ROUTE_WALL)}" fill="#64716d" stroke="#43504e" stroke-width="2"/>
<polyline points="${points(samples.filter((_, i) => i % 12 === 0).map(row => [row.x, row.z]))}" fill="none" stroke="#276473" stroke-width="3"/>
${markers}
<circle cx="${x(lampX)}" cy="${z(lampZ)}" r="5" fill="#9b5929" stroke="white" stroke-width="1.5"/>
<path d="M55 130v-26m-6 6 6-6 6 6" fill="none" stroke="#276473" stroke-width="2"/>
<text x="35" y="152">−Z / valley</text>
<path d="M35 497 h${5 * scale} m-${5 * scale} -4 v8 m${5 * scale} -8 v8" stroke="#43504e" fill="none"/>
<text x="35" y="522">5 m</text>
<text x="235" y="522" fill="#64716d">Inner wall</text>
<text x="355" y="522" fill="#655a46">Firm ground</text>
<text x="495" y="522" fill="#276473">Camera route</text>
<text x="645" y="522" fill="#9b5929">Lantern reference</text>
</svg>\n`;
}

function fixtureUrl(origin, { phone }, { night }) {
  const url = new URL(origin);
  url.search = new URLSearchParams({ phone: Number(phone), night: Number(night) });
  return url.href;
}

const page = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cloud Cliff Court | private route review</title>
<style>
html,body,#preview{margin:0;width:100%;height:100%;overflow:hidden;background:#161a1a}
canvas{display:block}
nav{position:fixed;left:1rem;bottom:1rem;display:flex;align-items:center;gap:.65rem;padding:.55rem;color:white;background:#171b1be6;border-radius:.35rem}
nav[hidden]{display:none}
button,output{font:1rem system-ui,sans-serif}
</style>
<div id="preview"></div>
<nav id="tools" aria-label="Route preview controls" hidden>
  <button id="play" type="button">Walk</button>
  <button id="skip" type="button">Skip</button>
  <output id="time">0 s</output>
</nav>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
<script type="module">
import { mountCloudCliffRoute } from '${routeUrl}';
const params = new URLSearchParams(location.search);
try {
  window.cloudCliff = await mountCloudCliffRoute({
    mount: document.getElementById('preview'),
    phone: params.get('phone') === '1',
    night: params.get('night') === '1',
  });
  if (params.get('review') === '1') {
    const route = window.cloudCliff;
    const reportTime = row => { document.getElementById('time').value = Math.floor(row.t) + ' s'; };
    document.getElementById('tools').hidden = false;
    document.getElementById('play').onclick = () => route.play({
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onSample: reportTime,
    });
    document.getElementById('skip').onclick = () => reportTime(route.skip());
  }
} catch (error) {
  window.cloudCliffError = error.message;
  throw error;
}
</script>`;

async function serveFixture() {
  const three = resolve(dirname(require.resolve('three')), '..');
  const assets = new Map([
    [routeUrl, [join(root, routeUrl), 'text/javascript']],
    [gorgeUrl, [join(root, gorgeUrl), 'text/javascript']],
    ['/three/three.module.js', [join(three, 'build/three.module.js'), 'text/javascript']],
    ...[
      'loaders/GLTFLoader.js', 'loaders/KTX2Loader.js',
      'utils/BufferGeometryUtils.js', 'utils/WorkerPool.js',
      'libs/ktx-parse.module.js', 'libs/zstddec.module.js', 'libs/meshopt_decoder.module.js',
    ].map(name => [`/three/addons/${name}`, [join(three, 'examples/jsm', name), 'text/javascript']]),
    [worldUrl + 'cloud-cliff-storm.glb.gzip', [join(worldDir, 'cloud-cliff-storm.glb.gzip'), 'model/gltf-binary', 'gzip']],
    [worldUrl + 'manifest.json', [join(worldDir, 'manifest.json'), 'application/json']],
    ...scanTextures.map(url => [url, [join(root, 'web/public', url), 'image/jpeg']]),
    ...[['basis_transcoder.js', 'text/javascript'], ['basis_transcoder.wasm', 'application/wasm']]
      .map(([name, type]) => [`/codecs/basis/${name}`, [join(root, 'web/public/codecs/basis', name), type]]),
  ]);
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    const { pathname } = new URL(request.url, 'http://127.0.0.1');
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
      return;
    }
    if (pathname === '/evidence-sheet') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html>');
      return;
    }
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    const [path, type, encoding] = asset;
    response.setHeader('Content-Type', type);
    if (encoding) response.setHeader('Content-Encoding', encoding);
    try {
      await pipeline(createReadStream(path), response);
    } catch (error) {
      response.destroy(error);
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    exposeOriginal(file, from = 'current') {
      assert.match(file, /^(desktop|phone)-(day|night)-[0-9]{2}-[a-z-]+\.png$/);
      assert.ok(from === 'current' || from === 'baseline');
      const path = `/evidence/${from}/${file}`;
      assets.set(path, [join(from === 'baseline' ? baselineDir : out, file), 'image/png']);
      return path;
    },
    close: () => new Promise((resolveClose, reject) => {
      server.close(error => error ? reject(error) : resolveClose());
    }),
  };
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function screenshot(tab, name, clip) {
  const bytes = await tab.screenshot({ path: join(out, name), clip, scale: 'css' });
  return { file: name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: hash(bytes) };
}

function cropAtBeat({ width, height }, seconds, pose) {
  const w = Math.floor(width * (seconds === 30 ? .83 : .72));
  const h = Math.floor(height * .60);
  const focalX = seconds === 30 ? pose.lanternPx.x : width * (seconds === 22 ? .36 : .50);
  const focalY = seconds === 30 ? pose.lanternPx.y - height * .12 : height * .52;
  return {
    x: Math.max(0, Math.min(width - w, Math.round(focalX - w / 2))),
    y: Math.max(0, Math.min(height - h, Math.round(focalY - h / 2))),
    width: w, height: h,
  };
}

async function readBaseline() {
  const reportBytes = await readFile(join(baselineDir, 'report.json'));
  assert.equal(hash(reportBytes), baseline.reportSha256, `baseline report changed since ${baseline.commit}`);
  const report = JSON.parse(reportBytes);
  assert.equal(report.mode, 'full');
  const receipts = await Promise.all(views.flatMap(view => looks.map(async look => {
    const context = report.receipts.find(row => row.view.name === view.name && row.look === look.name);
    assert.equal(context?.clock, look.clock, `baseline ${view.name}: wrong lighting preset`);
    const frames = await Promise.all(comparisonBeats.map(async ([seconds]) => {
      const image = context.images.find(frame => frame.pose.t === seconds);
      assert.ok(image?.crop, `baseline ${view.name} ${look.clock}: missing ${seconds} s frame or crop`);
      assert.deepEqual([image.width, image.height], [view.width, view.height]);
      assert.equal(image.crop.scale, 1);
      for (const { file, width, height, sha256 } of [image, image.crop]) {
        const bytes = await readFile(join(baselineDir, file));
        assert.equal(hash(bytes), sha256, `baseline ${file}: image changed`);
        assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [width, height], file);
      }
      const { file, width, height, sha256, crop, pose } = image;
      return [seconds, { file, width, height, sha256, crop, cameraPose: cameraPose(pose) }];
    }));
    return [`${view.name}-${look.name}`, Object.fromEntries(frames)];
  })));
  return Object.fromEntries(receipts);
}

async function drawSheet(browser, server, { title, note, headers, rows, file, width, height, imageHeight = 185 }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const tab = await context.newPage();
    await tab.goto(`${server.origin}/evidence-sheet`);
    const heading = headers.map(label => `<th>${label}</th>`).join('');
    const body = rows.map(({ view, clock, images }) => {
      const columns = images.map(({ file, from }) =>
        `<td><img src="${server.origin}${server.exposeOriginal(file, from)}" alt="${file}"></td>`).join('');
      return `<tr><th scope="row">${view.name}<br>${clock}<small>${view.width} × ${view.height}</small></th>${columns}</tr>`;
    }).join('');
    await tab.setContent(`<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>
*{box-sizing:border-box} body{margin:0;padding:24px;background:#171a1c;color:#e9e6df;font:16px system-ui,sans-serif}
h1{margin:0 0 4px;font-size:25px} p{margin:0 0 16px;color:#bababa}
table{width:100%;border-collapse:separate;border-spacing:8px 6px;table-layout:fixed}
th:first-child{width:92px;text-align:left} th{font-weight:600} small{display:block;color:#bababa;font-size:12px}
td{height:${imageHeight + 5}px;text-align:center;background:#202427} img{width:100%;height:${imageHeight}px;object-fit:contain;display:block}
</style><h1>${title}</h1><p>${note}</p>
<table><thead><tr><th>View</th>${heading}</tr></thead><tbody>${body}</tbody></table>`);
    await tab.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
    return await screenshot(tab, file);
  } finally {
    await context.close();
  }
}

function gorgeInFrame(row) {
  return row.valleyVisible === true && row.nearBankInFrame === true &&
    row.farBankInFrame === true && row.valleyBedInFrame === true;
}

function cameraPose({ t, x, y, z, lx, ly, lz, fov }) {
  return [t, x, y, z, lx, ly, lz, fov];
}

function continuousReveal(rows) {
  const window = rows.filter(row => row.t >= 24 && row.t <= 29);
  const segments = [];
  let current = null;
  for (const row of window) {
    const supported = Number.isFinite(row.floorClearance) && Number.isFinite(row.wallClearance);
    const visible = gorgeInFrame(row) && row.lanternInFrame === false && row.lanternVisible === false;
    if (!supported || !visible) {
      current = null;
      continue;
    }
    if (!current || row.t - current.to > .1) {
      current = { from: row.t, to: row.t, samples: 0 };
      segments.push(current);
    }
    current.to = row.t;
    current.samples++;
  }
  // Count only a continuous interval that contains the approved reveal beat.
  const segment = segments.find(part => part.from <= 26 && part.to >= 26);
  return {
    ...segment, seconds: segment ? segment.to - segment.from : 0,
    firstLanternFrame: rows.find(row => row.lanternVisible === true)?.t ?? null,
    sampleWindow: window,
  };
}

function checkRevealContract() {
  const rows = Array.from({ length: 301 }, (_, i) => {
    const t = 24 + i / 60;
    return {
      t, floorClearance: 1.62, wallClearance: 1.12,
      valleyVisible: true, nearBankInFrame: true, valleyBedInFrame: true, farBankInFrame: true,
      lanternInFrame: t >= 28, lanternVisible: t >= 28,
    };
  });
  const reveal = continuousReveal(rows);
  assert.ok(reveal.seconds >= 2 && reveal.to < 28);
  const atReveal = rows.findIndex(row => row.t === 26);
  for (const overrides of [
    { nearBankInFrame: false }, { valleyBedInFrame: false }, { farBankInFrame: false },
    { lanternInFrame: true, lanternVisible: false },
  ]) {
    const interrupted = rows.map((row, i) => i === atReveal ? { ...row, ...overrides } : row);
    assert.equal(continuousReveal(interrupted).seconds, 0);
  }
  const earlyLantern = rows.map((row, i) => i === 2 ? { ...row, lanternVisible: true } : row);
  assert.equal(continuousReveal(earlyLantern).firstLanternFrame, rows[2].t);
}

async function inspectJourney(tab, view) {
  const journey = await tab.evaluate(async () => {
    const preview = window.cloudCliff;
    const rows = [preview.seek(0)];
    const clipStart = 23;
    const clipFps = 30;
    let recordAttempted = false;
    let stream, track, recorder, recording;
    let recordError, recordStart, recordStartWall;
    let final, clip;

    function startClip(row) {
      recordAttempted = true;
      try {
        const canvas = document.querySelector('#preview canvas');
        if (!canvas) throw new Error('Private route canvas was not found');
        stream = canvas.captureStream(clipFps);
        [track] = stream.getVideoTracks();
        if (!track) throw new Error('Canvas capture did not create a video track');
        const mimeType = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
          .find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error('Chromium has no WebM MediaRecorder profile');
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
        const chunks = [];
        recording = new Promise(resolve => {
          recorder.addEventListener('dataavailable', event => {
            if (event.data.size > 0) chunks.push(event.data);
          });
          recorder.addEventListener('error', event => resolve({
            error: event.error?.message ?? 'Canvas MediaRecorder failed',
          }), { once: true });
          recorder.addEventListener('stop', () => resolve({
            blob: new Blob(chunks, { type: recorder.mimeType }),
          }), { once: true });
        });
        recorder.start();
        recordStart = row.t;
        recordStartWall = performance.now();
        track.requestFrame?.();
      } catch (error) {
        recordError = error.message;
      }
    }

    try {
      final = await preview.play({
        onSample: row => {
          rows.push(row);
          if (!recordAttempted && row.t >= clipStart) startClip(row);
        },
      });
      if (recordError || !recorder) {
        clip = { error: recordError ?? 'Normal playback never reached the clip start' };
      } else {
        // Keep the final normal-playback pose on the canvas long enough to encode it.
        track.requestFrame?.();
        await new Promise(resolve => setTimeout(resolve, 100));
        const captureSeconds = (performance.now() - recordStartWall) / 1000;
        if (recorder.state !== 'inactive') recorder.stop();
        const { blob, error } = await recording;
        if (error || !blob?.size) {
          clip = { error: error ?? 'Canvas MediaRecorder returned an empty WebM' };
        } else {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          }
          const canvas = document.querySelector('#preview canvas');
          clip = {
            data: btoa(binary), mimeType: blob.type, width: canvas.width, height: canvas.height,
            normalPlaybackFromSeconds: recordStart, normalPlaybackToSeconds: final.t,
            captureSeconds, requestedFramesPerSecond: clipFps,
            trackFramesPerSecond: track.getSettings().frameRate ?? null,
          };
        }
      }
    } finally {
      for (const mediaTrack of stream?.getTracks() ?? []) mediaTrack.stop();
    }
    const continuous = rows.at(-1).t === final.t ? rows : [...rows, final];
    const start = preview.seek(0);
    let moved;
    const motion = new Promise(resolve => { moved = resolve; });
    const pending = preview.play({ onSample: row => { if (row.t >= .5) moved(row); } });
    const beforeSkip = await motion;
    const skipped = preview.skip();
    const resolvedAfterSkip = await pending;
    return { continuous, final, start, beforeSkip, skipped, resolvedAfterSkip, clip };
  });
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await tab.evaluate(() => {
    const preview = window.cloudCliff;
    preview.seek(0);
    return preview.play({ reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  });
  assert.equal(journey.start.t, 0, `${view.name} entry clock`);
  for (const endpoint of [journey.skipped, journey.resolvedAfterSkip, reducedMotion]) {
    assert.deepEqual(cameraPose(endpoint), cameraPose(journey.final), `${view.name} endpoint parity`);
  }
  const traceFile = `trace-${view.name}.json`;
  const rows = addMeasuredMotion(journey.continuous);
  await writeFile(join(out, traceFile), JSON.stringify(rows));
  const revealFile = `reveal-${view.name}.json`;
  const { sampleWindow, ...reveal } = continuousReveal(rows);
  await writeFile(join(out, revealFile), JSON.stringify(sampleWindow));
  const { data, ...clipMetadata } = journey.clip;
  let clip = clipMetadata;
  if (data) {
    const bytes = Buffer.from(data, 'base64');
    const file = `clip-${view.name}-23s-30s.webm`;
    if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') {
      await writeFile(join(out, file), bytes);
      clip = { ...clipMetadata, file, bytes: bytes.length, sha256: hash(bytes) };
    } else {
      clip = { ...clipMetadata, error: 'Canvas recording is missing the WebM container marker' };
    }
  }
  return {
    traceFile, revealFile, reveal, clip, ...evaluateTrace(rows),
    endpoint: cameraPose(journey.final), skipAtSeconds: journey.beforeSkip.t, skipParity: true, reducedMotionParity: true,
  };
}

async function capture() {
  const planned = checkRoute();
  const beforeFrames = await readBaseline();
  const { chromium } = require('@playwright/test');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'site-plan.svg'), sitePlan());
  const server = await serveFixture();
  let browser;
  const receipts = [];
  let browserVersion, sheet;
  const comparisonSheets = {};
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
    });
    browserVersion = browser.version();
    for (const view of views) {
      for (const look of looks) {
        const context = await browser.newContext({
          viewport: { width: view.width, height: view.height },
          isMobile: view.phone, hasTouch: view.phone, deviceScaleFactor: 1,
        });
        try {
          const tab = await context.newPage();
          const errors = [];
          const warnings = [];
          tab.on('pageerror', error => errors.push(error.message));
          tab.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
            if (message.type() === 'warning') warnings.push(message.text());
          });
          tab.on('response', response => {
            if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
          });
          await tab.goto(fixtureUrl(server.origin, view, look));
          await tab.waitForFunction(() => Boolean(window.cloudCliff || window.cloudCliffError), { timeout: 30_000 })
            .catch(error => { throw new Error(`${error.message} ${errors.join('; ')}`); });
          const startError = await tab.evaluate(() => window.cloudCliffError ?? null);
          assert.equal(startError, null, errors.join('; '));
          const captureStart = `${view.name}-${look.name}`;
          const images = [];
          for (const [seconds, beat] of beats) {
            const pose = await tab.evaluate(t => window.cloudCliff.seek(t), seconds);
            const before = beforeFrames[captureStart][seconds];
            if (before) assert.deepEqual(cameraPose(pose), before.cameraPose, `${captureStart}: matched ${seconds} s camera`);
            const name = `${captureStart}-${String(seconds).padStart(2, '0')}-${beat}`;
            const image = await screenshot(tab, `${name}.png`);
            assert.equal(image.width, view.width);
            assert.equal(image.height, view.height);
            const beforeCrop = before?.crop;
            const clip = beforeCrop
              ? { x: beforeCrop.originPx[0], y: beforeCrop.originPx[1], width: beforeCrop.width, height: beforeCrop.height }
              : seconds >= 22 ? cropAtBeat(view, seconds, pose) : null;
            const crop = clip ? await screenshot(tab, `${name}-crop.png`, clip) : null;
            if (crop) assert.deepEqual([crop.width, crop.height], [clip.width, clip.height]);
            images.push({ ...image, crop: crop && { ...crop, originPx: [clip.x, clip.y], scale: 1 }, pose });
          }
          const reference = `reference-${captureStart}-source19-home.webp`;
          await copyFile(join(worldDir, `cover-${look.name}-${view.name}.webp`), join(out, reference));
          const trace = quick ? null : await inspectJourney(tab, { ...view, name: captureStart });
          const referenceSha256 = hash(await readFile(join(out, reference)));
          receipts.push({
            view, look: look.name, hour: look.hour, clock: look.clock,
            images, reference, referenceSha256, trace, errors, warnings,
          });
          console.log(`${captureStart}: ${images.length} originals${trace ? `, ${trace.samples} route samples` : ''}`);
        } finally {
          await context.close();
        }
      }
    }
    const labels = ['Entrance', 'Wall approach', 'Before shoulder', 'Valley reveal', 'Lantern'];
    sheet = await drawSheet(browser, server, {
      title: 'Cloud Cliff Court',
      note: 'Private route review · thumbnails fit their original aspect ratios',
      headers: beats.map(([t], i) => `${t} s · ${labels[i]}`), rows: receipts,
      file: 'contact-sheet.png', width: 1660, height: 1000,
    });
    for (const [seconds, label] of comparisonBeats) {
      const rows = receipts.map(({ view, look, clock, images }) => {
        const before = beforeFrames[`${view.name}-${look}`][seconds];
        const after = images.find(({ pose }) => pose.t === seconds);
        return { view, clock, images: [{ ...before, from: 'baseline' }, after] };
      });
      const comparison = await drawSheet(browser, server, {
        title: `Cloud Cliff Court · ${seconds} s ${label}`,
        note: 'Matched walk beat, viewport and lighting preset',
        headers: [`Before · ${baseline.commit}`, 'Round 4 · current'],
        rows,
        file: `comparison-${seconds}s.png`, width: 1240, height: 1240, imageHeight: 265,
      });
      comparisonSheets[seconds] = {
        ...comparison,
        pairs: rows.map(({ view, clock, images: [before, after] }) => ({
          view: view.name,
          clock,
          before: { file: before.file, sha256: before.sha256, crop: before.crop },
          after: { file: after.file, sha256: after.sha256, crop: after.crop },
        })),
      };
    }
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
  const inputs = await Promise.all([
    routeUrl.slice(1),
    gorgeUrl.slice(1),
    'tests/visual/cloud-cliff-route.mjs',
    'web/public/places/cloud-cliff/cloud-cliff-storm.glb.gzip',
    ...scanTextures.map(path => `web/public${path}`),
  ].map(async file => [file, hash(await readFile(join(root, file)))]));
  const report = {
    browserVersion, mode: quick ? 'frames-only' : 'full',
    inputSha256: Object.fromEntries(inputs),
    scope: 'Private engine fixture. 13:00 and 22:00 are fixed lighting presets. The original Home cover is a reference from its own viewpoint.',
    terrain: 'The near bank, valley floor and far bank must stay visible continuously around the 26 s beat while the lantern bounds remain outside the frame and the lantern is occluded or outside the view.',
    clips: 'Full captures record the rendered WebGL canvas during the same normal playback that produces the trace, from about 23 seconds through the 30-second hold.',
    sitePlan: 'site-plan.svg', contactSheet: sheet, comparisonSheets,
    baseline: { ...baseline, frames: beforeFrames },
    clearance: 'Runtime wall clearance measures nearest wall or spur triangle; floor clearance is the downward ray distance. Platform edge is a signed plan distance.',
    planned, receipts,
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const errors = [];
  for (const { view, clock, errors: browserErrors, warnings, images, trace } of receipts) {
    const name = `${view.name} ${clock}`;
    const requireEvidence = (test, message) => { if (!test) errors.push(`${name}: ${message}`); };
    requireEvidence(browserErrors.length === 0, browserErrors.join('; '));
    requireEvidence(warnings.length === 0, warnings.join('; '));
    if (trace) {
      requireEvidence(trace.deviations.length === 0, trace.deviations.join('; '));
      requireEvidence(trace.reveal.seconds >= 2,
        `continuous supported reveal at 26 s lasts ${trace.reveal.seconds.toFixed(3)} s (need at least 2)`);
      requireEvidence(trace.reveal.firstLanternFrame >= trace.reveal.to,
        'lantern approach must follow the visible gorge interval');
      requireEvidence(typeof trace.clip.file === 'string', trace.clip.error ?? 'normal-playback WebM is missing');
      requireEvidence(trace.clip.width === view.width && trace.clip.height === view.height,
        'normal-playback WebM must use the capture viewport dimensions');
      requireEvidence(trace.clip.normalPlaybackFromSeconds >= 23 && trace.clip.normalPlaybackFromSeconds <= 23.1 &&
        trace.clip.normalPlaybackToSeconds === 30, 'normal-playback WebM must cover approximately 23 to 30 seconds');
    }
    requireEvidence(images.slice(0, 3).every(({ pose }) =>
      pose.innerWallInFrame === true && pose.valleyVisible === false && pose.lanternVisible === false),
    'the inner wall must be framed and the valley hidden at 0, 12 and 22 s');
    const reveal = images[3].pose;
    requireEvidence(gorgeInFrame(reveal), 'near bank, valley floor and far bank must all be visible at 26 s');
    requireEvidence(reveal.lanternInFrame === false && reveal.lanternVisible === false,
      'lantern must stay outside the 26 s reveal');
    const final = images[4].pose;
    requireEvidence(final.lanternInFrame === true && final.lanternVisible === true, 'lantern must be visible at 30 s');
    requireEvidence(final.claspClear === true, 'the clasp front must clear the rock screen at 30 s');
    requireEvidence(images.every(({ pose }) => Number.isFinite(pose.floorClearance)),
      'all recorded poses must have mesh support below the eye');
  }
  assert.deepEqual(errors, [], errors.join('\n'));
}

if (process.argv.includes('--check')) {
  checkRevealContract();
  if (process.argv.includes('--check-baseline')) await readBaseline();
  console.log(JSON.stringify(checkRoute(), null, 2));
} else if (process.argv.includes('--serve')) {
  const server = await serveFixture();
  for (const view of views) {
    for (const look of looks) {
      const address = new URL(fixtureUrl(server.origin, view, look));
      address.searchParams.set('review', '1');
      console.log(`${view.name} ${look.clock}: ${address.href}`);
    }
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void server.close());
} else {
  await capture();
}
