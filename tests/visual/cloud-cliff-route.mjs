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
const out = join(root, quick ? 'artifacts/cloud-cliff-route-r2-quick' : 'artifacts/cloud-cliff-route-r2');
const routeUrl = '/web/src/engine/places/cloud-cliff-route.js';
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
const views = [
  { name: 'desktop', phone: false, width: 1440, height: 900 },
  { name: 'phone', phone: true, width: 390, height: 844 },
];
const looks = [{ name: 'day', night: false }, { name: 'night', night: true }];
const scanTextures = ['rock_pitted_mossy', 'stone_pavers'].flatMap(material =>
  ['diffuse', 'normal', 'roughness'].map(map => `/materials/scans/${material}/${map}.jpg`));

function routeSamples(phone) {
  return Array.from({ length: duration * 60 + 1 }, (_, index) =>
    sampleCloudCliffRoute(index / 60, phone));
}

function measuredTurn(rows) {
  const series = [];
  let max = 0, at = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i], dt = b.t - a.t;
    if (dt <= 0 || dt > .1) continue;
    // Each view direction starts at the camera position of its own sample.
    const u = [a.lx - a.x, a.ly - a.y, a.lz - a.z];
    const v = [b.lx - b.x, b.ly - b.y, b.lz - b.z];
    const dot = u.reduce((sum, component, axis) => sum + component * v[axis], 0);
    const cosine = dot / (Math.hypot(...u) * Math.hypot(...v));
    const rate = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI / dt;
    if (rate > max) {
      max = rate;
      at = b.t;
    }
    series.push([b.t, rate]);
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
    const rows = routeSamples(view.phone);
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
    ['/three/three.module.js', [join(three, 'build/three.module.js'), 'text/javascript']],
    ...[
      'loaders/GLTFLoader.js', 'loaders/KTX2Loader.js',
      'utils/BufferGeometryUtils.js', 'utils/WorkerPool.js',
      'libs/ktx-parse.module.js', 'libs/zstddec.module.js', 'libs/meshopt_decoder.module.js',
    ].map(name => [`/three/addons/${name}`, [join(three, 'examples/jsm', name), 'text/javascript']]),
    ...['cloud-cliff.glb.gzip', 'cloud-cliff-storm.glb.gzip']
      .map(name => [worldUrl + name, [join(worldDir, name), 'model/gltf-binary', 'gzip']]),
    ...['far-day.ktx2', 'far-night.ktx2', 'far-dusk.ktx2']
      .map(name => [worldUrl + name, [join(worldDir, name), 'image/ktx2']]),
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
    exposeOriginal(file) {
      assert.match(file, /^(desktop|phone)-(day|night)-[0-9]{2}-[a-z-]+\.png$/);
      const path = `/evidence/${file}`;
      assets.set(path, [join(out, file), 'image/png']);
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

async function contactSheet(browser, server, receipts) {
  const context = await browser.newContext({
    viewport: { width: 1660, height: 1000 }, deviceScaleFactor: 1,
  });
  try {
    const tab = await context.newPage();
    await tab.goto(`${server.origin}/evidence-sheet`);
    const labels = ['Entrance', 'Wall approach', 'Before shoulder', 'Valley reveal', 'Lantern'];
    const header = beats.map(([t], i) => `<th>${t} s · ${labels[i]}</th>`).join('');
    const rows = receipts.map(({ view, look, images }) => {
      const columns = images.map(({ file }) =>
        `<td><img src="${server.origin}${server.exposeOriginal(file)}" alt="${file}"></td>`).join('');
      return `<tr><th scope="row">${view.name}<br>${look}<small>${view.width} × ${view.height}</small></th>${columns}</tr>`;
    }).join('');
    await tab.setContent(`<!doctype html><meta charset="utf-8"><title>Cloud Cliff Court contact sheet</title>
<style>
*{box-sizing:border-box} body{margin:0;padding:24px;background:#171a1c;color:#e9e6df;font:16px system-ui,sans-serif}
h1{margin:0 0 4px;font-size:25px} p{margin:0 0 16px;color:#bababa}
table{width:100%;border-collapse:separate;border-spacing:8px 6px;table-layout:fixed}
th:first-child{width:92px;text-align:left} th{font-weight:600} small{display:block;color:#bababa;font-size:12px}
td{height:190px;text-align:center;background:#202427} img{width:100%;height:185px;object-fit:contain;display:block}
</style><h1>Cloud Cliff Court</h1><p>Private route review · day and night · thumbnails fit their original aspect ratios</p>
<table><thead><tr><th>View</th>${header}</tr></thead><tbody>${rows}</tbody></table>`);
    await tab.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
    return await screenshot(tab, 'contact-sheet.png');
  } finally {
    await context.close();
  }
}

function continuousReveal(rows) {
  const window = rows.filter(row => row.t >= 24 && row.t <= 29);
  const segments = [];
  let current = null;
  for (const row of window) {
    const supported = Number.isFinite(row.floorClearance) && Number.isFinite(row.wallClearance);
    const visible = row.valleyVisible === true && row.valleyBedInFrame === true;
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
    firstLanternFrame: rows.find(row => row.t > 26 && row.lanternInFrame === true)?.t ?? null,
    sampleWindow: window,
  };
}

async function inspectJourney(tab, view) {
  const journey = await tab.evaluate(async () => {
    const preview = window.cloudCliff;
    const rows = [preview.seek(0)];
    const final = await preview.play({ onSample: row => rows.push(row) });
    const continuous = rows.at(-1).t === final.t ? rows : [...rows, final];
    const start = preview.seek(0);
    let moved;
    const motion = new Promise(resolve => { moved = resolve; });
    const pending = preview.play({ onSample: row => { if (row.t >= .5) moved(row); } });
    const beforeSkip = await motion;
    const skipped = preview.skip();
    const resolvedAfterSkip = await pending;
    return { continuous, final, start, beforeSkip, skipped, resolvedAfterSkip };
  });
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await tab.evaluate(() => {
    const preview = window.cloudCliff;
    preview.seek(0);
    return preview.play({ reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  });
  const endpointFields = ({ t, x, y, z, lx, ly, lz, fov }) => [t, x, y, z, lx, ly, lz, fov];
  assert.equal(journey.start.t, 0, `${view.name} entry clock`);
  for (const endpoint of [journey.skipped, journey.resolvedAfterSkip, reducedMotion]) {
    assert.deepEqual(endpointFields(endpoint), endpointFields(journey.final), `${view.name} endpoint parity`);
  }
  const traceFile = `trace-${view.name}.json`;
  await writeFile(join(out, traceFile), JSON.stringify(journey.continuous));
  const revealFile = `reveal-${view.name}.json`;
  const { sampleWindow, ...reveal } = continuousReveal(journey.continuous);
  await writeFile(join(out, revealFile), JSON.stringify(sampleWindow));
  return {
    traceFile, revealFile, reveal, ...evaluateTrace(journey.continuous),
    endpoint: endpointFields(journey.final), skipAtSeconds: journey.beforeSkip.t, skipParity: true, reducedMotionParity: true,
  };
}

async function capture() {
  const planned = checkRoute();
  const { chromium } = require('@playwright/test');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'site-plan.svg'), sitePlan());
  const server = await serveFixture();
  let browser;
  const receipts = [];
  let browserVersion, sheet;
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
            const name = `${captureStart}-${String(seconds).padStart(2, '0')}-${beat}`;
            const image = await screenshot(tab, `${name}.png`);
            assert.equal(image.width, view.width);
            assert.equal(image.height, view.height);
            const clip = seconds >= 22 ? cropAtBeat(view, seconds, pose) : null;
            const crop = clip ? await screenshot(tab, `${name}-crop.png`, clip) : null;
            if (crop) assert.deepEqual([crop.width, crop.height], [clip.width, clip.height]);
            images.push({ ...image, crop: crop && { ...crop, originPx: [clip.x, clip.y], scale: 1 }, pose });
          }
          const reference = `reference-${captureStart}-source19-home.webp`;
          await copyFile(join(worldDir, `cover-${look.name}-${view.name}.webp`), join(out, reference));
          const trace = quick ? null : await inspectJourney(tab, { ...view, name: captureStart });
          const referenceSha256 = hash(await readFile(join(out, reference)));
          receipts.push({ view, look: look.name, images, reference, referenceSha256, trace, errors, warnings });
          console.log(`${captureStart}: ${images.length} originals${trace ? `, ${trace.samples} route samples` : ''}`);
        } finally {
          await context.close();
        }
      }
    }
    sheet = await contactSheet(browser, server, receipts);
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
  const inputs = await Promise.all([
    routeUrl.slice(1),
    'tests/visual/cloud-cliff-route.mjs',
    'web/public/places/cloud-cliff/cloud-cliff.glb.gzip',
    'web/public/places/cloud-cliff/cloud-cliff-storm.glb.gzip',
    ...scanTextures.map(path => `web/public${path}`),
  ].map(async file => [file, hash(await readFile(join(root, file)))]));
  const report = {
    browserVersion, mode: quick ? 'frames-only' : 'full',
    inputSha256: Object.fromEntries(inputs),
    scope: 'Engine fixture. The shipped reference is the original Home cover, from its own pose. No product chooser is shown.',
    sitePlan: 'site-plan.svg', contactSheet: sheet,
    clearance: 'Runtime wall clearance measures nearest wall triangle; floor clearance is the downward ray distance. Platform edge is a signed plan distance.',
    planned, receipts,
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const errors = [];
  for (const { view, look, errors: browserErrors, images, trace } of receipts) {
    const name = `${view.name} ${look}`;
    const requireEvidence = (test, message) => { if (!test) errors.push(`${name}: ${message}`); };
    requireEvidence(browserErrors.length === 0, browserErrors.join('; '));
    if (trace) {
      requireEvidence(trace.deviations.length === 0, trace.deviations.join('; '));
      requireEvidence(trace.reveal.seconds >= 2,
        `continuous supported reveal at 26 s lasts ${trace.reveal.seconds.toFixed(3)} s (need at least 2)`);
      requireEvidence(trace.reveal.firstLanternFrame > 26, 'lantern approach must follow the reveal');
    }
    requireEvidence(images.slice(0, 3).every(({ pose }) =>
      pose.innerWallInFrame === true && pose.valleyVisible === false && pose.lanternVisible === false),
    'the inner wall must be framed and the valley hidden at 0, 12 and 22 s');
    const reveal = images[3].pose;
    requireEvidence(reveal.valleyVisible === true && reveal.valleyBedInFrame === true,
      'opposite face and connected valley floor must be visible at 26 s');
    requireEvidence(reveal.lanternInFrame === false, 'lantern must stay outside the 26 s reveal');
    const final = images[4].pose;
    requireEvidence(final.lanternInFrame === true, 'lantern must be framed at 30 s');
    requireEvidence(images.every(({ pose }) => Number.isFinite(pose.floorClearance)),
      'all recorded poses must have mesh support below the eye');
  }
  assert.deepEqual(errors, [], errors.join('\n'));
}

if (process.argv.includes('--check')) {
  console.log(JSON.stringify(checkRoute(), null, 2));
} else if (process.argv.includes('--serve')) {
  const server = await serveFixture();
  for (const view of views) {
    for (const look of looks) {
      const address = new URL(fixtureUrl(server.origin, view, look));
      address.searchParams.set('review', '1');
      console.log(`${view.name} ${look.name}: ${address.href}`);
    }
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void server.close());
} else {
  await capture();
}
