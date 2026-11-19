import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, webkit } from '@playwright/test';
import Database from 'better-sqlite3';
import { remainingFuel, waxCutHeight } from '../../shared/wax.ts';
import { DICTS, fmtDuration } from '../../web/src/i18n.ts';
import { assertCaptureGpuHealthy, installCaptureGpuGuard } from './capture-preflight.mjs';
import { installLiveAudioAudit, sampleLiveAudio, sampleLiveAudioWindow } from './live-audio-audit.mjs';
import { instrumentPineScene, readDirectionOverview } from './pine-gate-scene-audit.mjs';
import { assertPineRuntimeImages, inspectPineHighBackdrop, measurePineRealismBase, pinePackagePath, readPinePreview, routePinePreview } from './pine-preview-delivery.mjs';

if (process.argv.includes('--help')) {
  console.log([
    'Run the Pine Gate visual journey against a local Vite dev server with the real API.',
    'Use the official GPU lease helper before running and release the lease afterward.',
    'Set DB_FILE to the dedicated pine-gate-capture-*.sqlite database under TMPDIR.',
    'BASE_URL defaults to http://127.0.0.1:8953 and GPU_LOCK_DIR to ../gpu.lock relative to the worktree.',
    'OUTPUT overrides the default output root, artifacts/pine-gate in the worktree.',
    'CAPTURE_MILESTONE=m1 runs desktop-en and phone-zh on Chrome.',
    'CAPTURE_MILESTONE=m3 runs both viewports and languages on Chrome and WebKit.',
    'CAPTURE_MILESTONE=quality captures a desktop and phone review set. Use QUALITY_PASS=preview or final.',
    'QUALITY_LABEL selects the quality output directory and defaults to QUALITY_PASS.',
    'CAPTURE_READINESS_ONLY=1 stops at Step inside. Use CAPTURE_READINESS_REPEATS=3 for independent browser launches.',
    'CAPTURE_AUDIO_COMPARE=1 compares the actual Pine and Snow AudioContext after lighting each place.',
    'CAPTURE_AMBIENT_ONLY=1 captures final-package place, unlit, burning, and mid-burn at PINE_HOUR.',
    'CAPTURE_PREVIEW_DIR and CAPTURE_PREVIEW_SHA256 select an eight-sample package under art/build/pine-gate.',
    'CAPTURE_DIRECTION_ONLY=1 saves six site review frames from day and night under quality/direction/QUALITY_LABEL.',
    'CAPTURE_DIRECTION_OVERVIEW is the JSON camera pose (space, position, look, fov) for the separate site overview.',
    'CAPTURE_REALISM_ONLY=1 captures two daytime desktop frames and records phone performance under quality/r1/QUALITY_LABEL.',
    'CAPTURE_REALISM_BASE_ONLY=1 pins the realism desktop frames to base assets by disabling desktop high-tier requests.',
    'CAPTURE_REQUIRE_BACKDROP=1 requires the offline Cycles plates and readiness under 5 seconds in both realism contexts.',
    'CAPTURE_BROWSER and CAPTURE_ONLY can select a single context. PINE_HOUR defaults to 22.',
  ].join('\n'));
  process.exit(0);
}

const worktree = fileURLToPath(new URL('../../', import.meta.url));
const outputRoot = resolve(process.env.OUTPUT ?? join(worktree, 'artifacts/pine-gate'));
const lockPath = resolve(process.env.GPU_LOCK_DIR ?? join(worktree, '../gpu.lock'));
const mode = process.env.CAPTURE_MILESTONE ?? 'm1';
assert(['m1', 'm3', 'quality'].includes(mode), 'CAPTURE_MILESTONE must be m1, m3 or quality.');
const quality = mode === 'quality';
const fullJourney = mode !== 'm1';
const readinessOnly = process.env.CAPTURE_READINESS_ONLY === '1';
const audioCompare = process.env.CAPTURE_AUDIO_COMPARE === '1';
const ambientOnly = process.env.CAPTURE_AMBIENT_ONLY === '1';
const directionOnly = process.env.CAPTURE_DIRECTION_ONLY === '1';
const realismOnly = process.env.CAPTURE_REALISM_ONLY === '1';
const realismBaseOnly = process.env.CAPTURE_REALISM_BASE_ONLY === '1';
const canvasDiagnostic = process.env.CAPTURE_REALISM_CANVAS_DIAGNOSTIC === '1';
const requireBackdrop = process.env.CAPTURE_REQUIRE_BACKDROP === '1';
assert(!realismOnly || directionOnly, 'The realism proof requires CAPTURE_DIRECTION_ONLY=1.');
assert(!realismBaseOnly || realismOnly, 'The base-only proof requires CAPTURE_REALISM_ONLY=1.');
assert(!canvasDiagnostic || realismOnly, 'The canvas diagnostic requires CAPTURE_REALISM_ONLY=1.');
assert(!requireBackdrop || realismOnly, 'The backdrop requirement is available for realism captures.');
const directionWalkFrames = realismOnly ? [['terrace-reveal-28s', 28]]
  : [['forest-06s', 6], ['ancient-pine-crest', 21.5], ['terrace-reveal-28s', 28]];
const dayFrames = [...directionWalkFrames.map(([name]) => name), ...(realismOnly ? [] : ['shrine-pavilion']), 'day-burning'];
const directionPasses = [
  { name: 'day', hour: 13, frames: dayFrames },
  ...(realismOnly ? [] : [{ name: 'night', hour: 22, frames: ['night-burning'] }]),
];
const directionMethod = realismOnly
  ? 'The 28 s release and settled daytime burning use native product cameras and real elapsed time at 1440 × 900. A separate pointed sky camera records the rendered solar disc after the main frames. A phone context measures readiness and render cadence. Panels are hidden only while taking screenshots.'
  : 'Two independent 1440 × 900 desktop contexts use the same private eight-sample package. The walk and both burning views use product cameras, the site overview uses a declared pose, and panels are hidden only while taking each screenshot.';
const directionOverview = directionOnly && !realismOnly ? readDirectionOverview(process.env.CAPTURE_DIRECTION_OVERVIEW) : null;
const readinessRepeats = Number(process.env.CAPTURE_READINESS_REPEATS ?? 1);
assert(!readinessOnly || quality, 'Readiness-only requires CAPTURE_MILESTONE=quality.');
assert(!audioCompare || (quality && !readinessOnly), 'Audio comparison requires quality mode without readiness-only.');
assert(Number.isInteger(readinessRepeats) && readinessRepeats >= 1 && readinessRepeats <= 3
  && (readinessOnly || readinessRepeats === 1), 'Use one to three repetitions in readiness-only mode.');
const holdCameraDrift = mode !== 'm3' && !directionOnly;
const qualityPass = process.env.QUALITY_PASS ?? 'preview';
assert(['preview', 'final'].includes(qualityPass), 'QUALITY_PASS must be preview or final.');
const preview = quality && qualityPass === 'preview';
const previewDir = process.env.CAPTURE_PREVIEW_DIR;
const previewSha = process.env.CAPTURE_PREVIEW_SHA256;
assert(preview || (!previewDir && !previewSha), 'The isolated preview override is available only for quality previews.');
assert(!directionOnly || (preview && !readinessOnly && !audioCompare && !ambientOnly),
  'Direction-only requires a quality preview on its own.');
assert(!ambientOnly || (quality && qualityPass === 'final' && !readinessOnly && !audioCompare),
  'Ambient-only requires final quality mode without readiness or audio-only capture.');
const reviewLabel = process.env.QUALITY_LABEL ?? qualityPass;
assert(reviewLabel.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reviewLabel), 'Use a lowercase hyphenated QUALITY_LABEL.');
const base = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:8953/');
assert(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)
  && Number(base.port) >= 8950 && Number(base.port) <= 8999, 'Use an isolated capture server on ports 8950–8999.');
const gpuLock = await stat(lockPath).catch(() => null);
assert(gpuLock?.isDirectory(), 'Acquire the exclusive GPU lock before launching.');
assert(process.env.DB_FILE, 'Set DB_FILE to the isolated capture database.');
const dbPath = await realpath(process.env.DB_FILE);
const dbRelative = relative(await realpath(tmpdir()), dbPath);
assert(!isAbsolute(dbRelative) && !dbRelative.startsWith('..') && /^pine-gate-capture-.*\.sqlite$/.test(basename(dbPath)),
  'Use an isolated pine-gate-capture-*.sqlite database under TMPDIR.');
const browserOnly = process.env.CAPTURE_BROWSER;
const contextOnly = process.env.CAPTURE_ONLY;
const hour = Number(process.env.PINE_HOUR ?? 22);
assert(Number.isFinite(hour) && hour >= 0 && hour < 24, 'PINE_HOUR must be in [0,24).');
const suite = (mode === 'm3' ? ['chromium', 'webkit'] : ['chromium'])
  .filter(name => !browserOnly || name === browserOnly);
const sizes = [
  { name: 'desktop', width: 1440, height: 900, phone: false },
  { name: 'phone', width: 390, height: 844, phone: true },
].flatMap(size => {
  const languages = mode === 'm3' ? ['en', 'zh'] : [size.phone ? 'zh' : 'en'];
  return languages.map(language => ({ ...size, language, label: size.name + '-' + language }));
}).filter(size => (!contextOnly || size.label === contextOnly) && (!directionOnly || realismOnly || size.label === 'desktop-en'));
const contexts = directionOnly ? sizes.flatMap(size => directionPasses.map(direction => ({ ...size, direction })))
  : audioCompare ? sizes.flatMap(size => ['pine-gate', 'snow-roof'].map(placeId => ({ ...size, placeId }))) : sizes;
assert(suite.length && sizes.length, 'No matching capture context.');
const siteReviewRoot = join(outputRoot, 'quality', realismOnly ? 'r1' : 'direction');
const output = directionOnly ? join(siteReviewRoot, reviewLabel)
  : quality
  ? join(outputRoot, 'quality', reviewLabel, 'pine')
  : join(outputRoot, mode === 'm3' && (contextOnly || browserOnly || hour !== 22)
    ? ['m3-smoke', browserOnly, contextOnly, 'hour-' + hour].filter(Boolean).join('-') : mode);
let delivery = null;
let previewPackage = null;
const manifestUrl = new URL(`${pinePackagePath}manifest.json`, base);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const solarConfigPath = 'shared/pine-gate-daylight.json';
const solarConfigBytes = realismOnly ? await readFile(join(worktree, solarConfigPath)) : null;
const backdropConfigPath = 'shared/pine-gate-backdrop.json';
const backdropConfigBytes = realismOnly ? await readFile(join(worktree, backdropConfigPath)) : null;
async function readPublicManifest() {
  const response = await fetch(manifestUrl);
  assert(response.ok, 'The public Pine Gate bake manifest is missing.');
  return Buffer.from(await response.arrayBuffer());
}
if (fullJourney) {
  const bytes = await readPublicManifest();
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert(!manifest.partialPreview && manifest.bake?.samples === 64, 'The ordinary server must serve the final 64-sample package.');
  const publicManifestSha256 = hash(bytes);
  if (preview) {
    previewPackage = await readPinePreview(worktree, previewDir, previewSha);
    if (requireBackdrop) assert(previewPackage.backdrop, 'The approved preview must declare the offline Cycles backdrop.');
    if (realismBaseOnly) assert(previewPackage.backdrop?.high, 'The base-only proof requires a candidate with the desktop high tier.');
    delivery = { preview, samples: previewPackage.samples, manifestSha256: previewPackage.manifestSha256,
      publicManifestSha256, transport: 'Private Playwright request routes for the candidate Pine Gate files.' };
    if (realismOnly) delivery.realismBase = await measurePineRealismBase(worktree, previewPackage, manifest);
  } else delivery = { preview, samples: 64, manifestSha256: publicManifestSha256 };
}
if (directionOnly) {
  await mkdir(siteReviewRoot, { recursive: true });
  await mkdir(output);
} else await mkdir(output, { recursive: true });
const report = {
  mode,
  ...(directionOnly ? { directionHours: directionPasses.map(pass => pass.hour) } : { hour }),
  ...(process.env.CAPTURE_SOURCE_REV ? { sourceRev: process.env.CAPTURE_SOURCE_REV } : {}),
  ...(process.env.CAPTURE_CODE_SHA ? { codeSha256: process.env.CAPTURE_CODE_SHA } : {}),
  ...(readinessOnly ? { readinessOnly, readinessRepeats } : {}),
  ...(quality ? { reviewLabel } : {}),
  ...(quality && !readinessOnly && !audioCompare && !ambientOnly && !directionOnly ? { matchedEndingShapes: true } : {}),
  ...(directionOnly ? { directionOnly, frames: directionPasses.flatMap(pass => pass.frames), directionOverview, directionMethod } : {}),
  ...(realismOnly ? { realismOnly } : {}),
  ...(realismBaseOnly ? { realismBaseOnly } : {}),
  ...(solarConfigBytes ? { solarConfig: { file: solarConfigPath, sha256: hash(solarConfigBytes), ...JSON.parse(solarConfigBytes) } } : {}),
  ...(backdropConfigBytes ? { backdropConfig: { file: backdropConfigPath, sha256: hash(backdropConfigBytes), ...JSON.parse(backdropConfigBytes) } } : {}),
  ...(ambientOnly ? { ambientOnly } : {}),
  ...(audioCompare ? { audioCompare, audioSourceSha256: createHash('sha256').update(await readFile(join(worktree, 'web/src/sound.ts'))).digest('hex') } : {}),
  delivery,
  clock: directionOnly ? `Local visual hours ${directionPasses.map(pass => pass.hour).join(' and ')} are held constant in their respective contexts. Walk, ignition and candle age use real elapsed time.`
    : 'Local visual hour ' + hour + ' held constant. Controlled client and matching isolated server start times accelerate progress; render animation uses real frame timestamps.',
  cameraDrift: holdCameraDrift ? 'held for still comparisons' : 'product default',
  viewport: 'Phone is viewport and touch emulation. WebKit freehand uses a trusted mouse stroke.',
  runs: [],
};
const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const db = new Database(dbPath, { fileMustExist: true, timeout: 5000 });
const adjustStart = db.prepare("UPDATE candles SET started_at = started_at - ? WHERE id = ? AND place_id = 'pine-gate' AND status = 'burning'");
const scenarios = {
  en: { wish: 'Let the next small step be steady.', label: 'Your wish', pine: 'Pine Gate Steps', snow: 'Snow Roof Court' },
  zh: { wish: '愿下一步走得稳一点。', label: '你的愿望', pine: '松门石阶', snow: '雪瓦北院' },
};
const bi = (en, zh) => new RegExp(en + '|' + zh);
const matchStage = (page, screen) => expect(page.locator('.ui')).toHaveAttribute('data-screen', screen, { timeout: 60_000 });
const history = page => page.evaluate(async () => {
  const response = await fetch('/api/me/candles');
  if (!response.ok) throw new Error('Record read failed: ' + response.status);
  return (await response.json()).candles;
});
const candleResponse = (page, path) => page.waitForResponse(response =>
  response.request().method() === 'POST' && new URL(response.url()).pathname === path);

function assertNearestCamera(measured, expected) {
  const distance = (a, b) => Math.hypot(...a.map((axis, i) => axis - b[i]));
  assert(distance(measured.position, expected.position) < .015, 'Camera positions differ by at least 1.5 cm.');
  assert(distance(measured.direction, expected.direction) < .015, 'Camera headings differ by at least 0.86 degrees.');
  assert(Math.abs(measured.fov - expected.fov) < .05, 'Camera FOVs differ by at least 0.05 degrees.');
}

async function observeWishInput(field) {
  await field.evaluate(field => field.addEventListener('input', () => {
    window.__placeReadinessWishAt = performance.now();
  }, { once: true }));
}

async function observePlaceReadiness(radio) {
  await radio.evaluate(radio => {
    const place = radio.closest('.ui[data-screen="place"]');
    const progress = place.querySelector('.court-loading');
    const enter = place.querySelector('.place-actions .btn.primary');
    const stages = [];
    let click = null;
    let enabled = null;
    let previous = '';
    const record = at => {
      const snapshot = { stage: progress.dataset.stage, selected: radio.getAttribute('aria-checked') === 'true', enabled: !enter.disabled };
      const key = JSON.stringify(snapshot);
      if (key !== previous) stages.push({ at, ...snapshot });
      previous = key;
      if (snapshot.selected && snapshot.enabled) enabled ??= at;
    };
    const observer = new MutationObserver(() => { if (click !== null) record(performance.now()); });
    radio.addEventListener('click', () => {
      click = performance.now();
      record(click);
      observer.observe(place, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'data-stage', 'disabled'] });
    }, { capture: true, once: true });
    window.__readPlaceReadiness = () => {
      observer.disconnect();
      delete window.__readPlaceReadiness;
      const observed = performance.now();
      const barrier = enabled ?? observed;
      const origin = click ?? observed;
      const resources = performance.getEntriesByType('resource').flatMap(entry => {
        const url = new URL(entry.name);
        const selectedPlaceAsset = url.pathname.startsWith('/places/pine-gate/');
        const otherPlaceWork = /^\/places\/snow-roof\//.test(url.pathname) && entry.responseEnd >= origin;
        const loader = /(?:basis[_-]|ktx2|zstddec|meshopt|loadPlace|prefetchPlace|nativeAgX|places\/pine-gate\.js)/i.test(url.pathname);
        if (entry.startTime > barrier || !(selectedPlaceAsset || otherPlaceWork || loader)) return [];
        return [{ url: url.pathname, type: entry.initiatorType, startMs: entry.startTime - origin,
          headersMs: entry.responseStart ? entry.responseStart - origin : null, endMs: entry.responseEnd - origin,
          transferBytes: entry.transferSize, bodyBytes: entry.encodedBodySize, selectedPlaceAsset }];
      });
      const pineEnds = resources.filter(resource => resource.selectedPlaceAsset && resource.endMs <= barrier - origin).map(resource => resource.endMs);
      const lastPineEnd = pineEnds.length ? Math.max(...pineEnds) : null;
      const marks = performance.getEntriesByType('mark')
        .filter(mark => /^one-light:(pine-gate|snow-roof):/.test(mark.name) && mark.startTime <= barrier)
        .map(mark => ({ name: mark.name, elapsedMs: mark.startTime - origin }));
      const wishAt = window.__placeReadinessWishAt;
      return { wishInputAtMs: wishAt ?? null, clickAtMs: click, enabledAtMs: enabled, observedAtMs: observed,
        wishToEnabledMs: wishAt !== undefined && enabled !== null ? enabled - wishAt : null,
        clickToEnabledMs: click !== null && enabled !== null ? enabled - click : null,
        lastPineResponseEndMs: lastPineEnd, afterLastPineResponseMs: lastPineEnd === null ? null : barrier - origin - lastPineEnd,
        stages: stages.map(({ at, ...state }) => ({ elapsedMs: at - origin, ...state })), resources, marks };
    };
  });
}

async function drawProfile(context, page, touch, browserName) {
  const pad = page.locator('.pad');
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  assert(box, 'The drawing pad must be visible.');
  const points = [[.33, .19], [.25, .42], [.28, .78], [.68, .78], [.73, .55], [.62, .24], [.33, .19]]
    .map(([x, y]) => ({ x: Math.round(box.x + box.width * x), y: Math.round(box.y + box.height * y) }));
  if (touch && browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      for (const [index, point] of points.slice(1).entries()) {
        const start = points[index];
        for (let step = 1; step <= 12; step++) {
          const x = start.x + (point.x - start.x) * step / 12;
          const y = start.y + (point.y - start.y) * step / 12;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        }
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  } else {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 12 });
    await page.mouse.up();
  }
}

async function capture(browser, browserName, size, trial) {
  const { language, label, phone, width, height, direction } = size;
  const visualHour = direction?.hour ?? hour;
  const placeId = size.placeId ?? 'pine-gate';
  const pine = placeId === 'pine-gate';
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: phone && fullJourney ? 2 : 1,
    locale: language === 'zh' ? 'zh-CN' : 'en-US', hasTouch: phone, isMobile: phone,
  });
  const path = mode === 'm3' ? join(output, browserName, label) : join(output, label);
  const run = { browser: browserName, version: browser.version(), label,
    ...(audioCompare ? { placeId, viewport: [width, height], deviceScaleFactor: phone ? 2 : 1 } : {}),
    ...(direction ? { direction: direction.name, visualHour, viteUpdates: [] } : {}),
    ...(realismOnly && phone ? { realismPerformanceOnly: true, viewport: [width, height], deviceScaleFactor: 2 } : {}),
    ...(readinessOnly ? { trial } : {}), shots: [], records: [], errors: [] };
  report.runs.push(run);
  if (!run.realismPerformanceOnly) await mkdir(path, { recursive: true });
  try {
    await context.addInitScript(installCaptureGpuGuard);
    if (quality) await context.addInitScript(installLiveAudioAudit);
    await context.addInitScript(({ hour, holdCameraDrift }) => {
      Date.prototype.getHours = () => Math.floor(hour);
      Date.prototype.getMinutes = () => Math.floor((hour % 1) * 60);
      Date.prototype.getSeconds = () => 0;
      Date.prototype.getMilliseconds = () => 0;
      const nativeNow = performance.now.bind(performance);
      let offset = 0;
      performance.now = () => nativeNow() + offset;
      window.__advanceVisualClock = delta => { offset += delta; };
      if (holdCameraDrift) window.__visualFreezeCamera = true;
    }, { hour: visualHour, holdCameraDrift });
    const page = await context.newPage();
    page.setDefaultTimeout(65_000);
    page.on('pageerror', error => run.errors.push({ kind: 'runtime', text: error.stack ?? error.message }));
    page.on('console', message => {
      if (message.type() === 'error') run.errors.push({ kind: 'console', text: message.text() });
    });
    if (realismOnly) run.obsoleteVistaRequests = [];
    const highUris = new Set(Object.values(previewPackage?.backdrop?.high?.files ?? {}).map(file => file.uri));
    const highTreeUri = previewPackage?.backdrop?.high?.trees?.uri;
    if (highTreeUri) highUris.add(highTreeUri);
    let entryStartedAt = null;
    if (realismOnly && highUris.size) {
      run.highBackdropRequests = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin !== base.origin || !url.pathname.startsWith(pinePackagePath)) return;
        const uri = url.pathname.slice(pinePackagePath.length);
        if (highUris.has(uri)) run.highBackdropRequests.push({ uri, afterEntryMs: entryStartedAt === null ? null : performance.now() - entryStartedAt });
      });
    }
    page.on('response', response => {
      if (response.status() >= 400) run.errors.push({ kind: 'http', status: response.status(), url: response.url() });
      if (realismOnly && response.ok()) {
        const url = new URL(response.url());
        if (url.origin === base.origin && /\/pine-gate-(?:vista|elevation\.data)\.js$/.test(url.pathname)) run.obsoleteVistaRequests.push(url.pathname);
      }
    });
    page.on('crash', () => run.errors.push({ kind: 'crash' }));
    if (direction) page.on('websocket', socket => {
      if (new URL(socket.url()).host !== base.host) return;
      socket.on('framereceived', ({ payload }) => {
        const frame = typeof payload === 'string' ? payload : payload.toString('utf8');
        if (!frame.startsWith('{')) return;
        let message;
        try { message = JSON.parse(frame); } catch { return; }
        if (['update', 'full-reload', 'prune'].includes(message.type)) {
          run.viteUpdates.push(message);
          run.errors.push({ kind: 'source-drift', text: frame });
        }
      });
    });
    if (previewPackage) {
      run.previewFetchedFiles = [];
      await routePinePreview(page, base, previewPackage, text => run.errors.push({ kind: 'preview', text }), name => {
        if (!run.previewFetchedFiles.includes(name)) run.previewFetchedFiles.push(name);
      });
    }
    const sceneAudit = {
      readiness: quality && !audioCompare,
      cadence: fullJourney && phone && !readinessOnly && !audioCompare && !ambientOnly,
      lighting: !!delivery && !audioCompare && !readinessOnly,
      walkClock: direction?.name === 'day' && !phone,
      directionCamera: !!direction,
      solarProbe: realismOnly && !phone,
      backdropProbe: realismOnly,
      realismBaseOnly: realismBaseOnly && !phone,
      canvasDiagnostic: canvasDiagnostic && !phone,
    };
    if (Object.values(sceneAudit).some(Boolean)) {
      await page.route(url => url.pathname === '/src/engine/scene.js', async route => {
        const response = await route.fetch();
        let source;
        try {
          assert(response.ok(), `Scene request failed with HTTP ${response.status()}.`);
          const servedSource = await response.text();
          if (direction) {
            const fingerprint = hash(servedSource);
            run.sceneSha256 ??= fingerprint;
            assert.equal(fingerprint, run.sceneSha256, 'Vite served drifted scene source during this context.');
          }
          source = instrumentPineScene(servedSource, sceneAudit);
        } catch (error) {
          run.errors.push({ kind: 'instrumentation', text: String(error) });
          await route.fulfill({ response });
          return;
        }
        await route.fulfill({ response, body: source });
      });
    }

    const button = name => page.getByRole('button', { name });
    const radio = name => page.getByRole('radio', { name });
    const wakeControls = async () => {
      if (await page.locator('.ui').getAttribute('data-controls-idle') !== 'true') return;
      if (phone) await page.touchscreen.tap(8, height / 2);
      else {
        await page.mouse.move(8, height / 2);
        await page.mouse.move(12, height / 2);
      }
    };
    const act = async locator => {
      await wakeControls();
      return phone ? locator.tap() : locator.click();
    };
    const lightButton = button(bi('^Light it', '^点亮这一盏'));
    const { wish, label: wishLabel, pine: pineName, snow: snowName } = scenarios[language];
    let activeId = null;
    const captureShot = async (name, extra = {}) => {
      await assertCaptureGpuHealthy(page);
      const snapshot = await page.evaluate(() => {
        const hud = document.querySelector('.hud-bottom');
        const hudOpacity = hud ? Number(getComputedStyle(hud).opacity) : null;
        return {
          screen: document.querySelector('.ui')?.dataset.screen,
          hudOpacity,
          controlsVisible: !!hud?.querySelector('.ctl') && hudOpacity > .99,
          result: document.querySelector('[data-testid="result-title"]')?.textContent?.trim(),
          resultLead: document.querySelector('[data-testid="result-title"] + p')?.textContent?.trim(),
          elapsedLabel: document.querySelector('[data-testid="with-you"]')?.textContent?.trim(),
          wax: window.__visualPineWax?.() ?? null,
          smoke: window.__visualWickPlume?.() ?? null,
          walk: window.__walkProgress ?? null,
          walkClock: window.__pineCaptureWalkClock ?? null,
          ignition: window.__visualIgnition ?? null,
          ...(window.__pineCaptureCamera ? { camera: window.__pineCaptureCamera() } : {}),
          ...(window.__pineCaptureSolar ? { solar: window.__pineCaptureSolar() } : {}),
          ...(window.__pineCaptureBackdrop ? { pineImages: window.__pineCaptureBackdrop() } : {}),
          canvas: [window.__renderer.domElement.width, window.__renderer.domElement.height],
          viewportOverflow: [...document.querySelectorAll('.ui button, .ui textarea, .ui h1, .ui h2')]
            .filter(item => {
              const rect = item.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && (rect.left < -2 || rect.right > innerWidth + 2);
            }).map(item => item.textContent.trim()),
        };
      });
      const file = join(path, name + '.png');
      if (fullJourney && snapshot.wax) assert.equal(snapshot.wax.baked, true, 'Active Pine Gate scene must be baked.');
      const bytes = await page.screenshot({ path: file, scale: 'css',
        ...(directionOnly ? { style: '.ui { visibility: hidden !important; }' } : {}) });
      if (canvasDiagnostic && !phone) {
        const uri = await page.evaluate(() => new Promise(resolve => { window.__pineReadCanvas = resolve; }));
        assert(uri.startsWith('data:image/png;base64,'), 'Could not read the composed Pine Gate canvas.');
        const diagnostics = join(output, 'diagnostics');
        await mkdir(diagnostics, { recursive: true });
        const canvasFile = join(diagnostics, name + '-canvas.png');
        const canvasBytes = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
        await writeFile(canvasFile, canvasBytes);
        extra.canvasDiagnostic = { file: relative(output, canvasFile), sha256: hash(canvasBytes) };
      }
      let directionProof = {};
      if (direction) {
        const pixels = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
        const walkClockAfter = await page.evaluate(() => window.__pineCaptureWalkClock ?? null);
        assert.deepEqual(pixels, [1440, 900]);
        directionProof = { pixels, walkClockAfter };
      }
      run.shots.push({ file: relative(output, file), sha256: createHash('sha256').update(bytes).digest('hex'),
        candleId: activeId, ...snapshot, ...extra, ...directionProof });
      console.log(browserName, label, name, JSON.stringify(snapshot.wax));
      await save();
      return { ...snapshot, ...directionProof };
    };
    const captureSolarDiagnostic = async () => {
      const original = await page.evaluate(() => window.__pineCaptureCamera());
      const diagnostic = join(output, 'diagnostics');
      await mkdir(diagnostic, { recursive: true });
      const file = join(diagnostic, 'solar-disc.png');
      await page.evaluate(() => window.__pineCaptureSolarView(true));
      try {
        await assertCaptureGpuHealthy(page);
        const readSolar = () => page.evaluate(() => ({ camera: window.__pineCaptureCamera(), solar: window.__pineCaptureSolar() }));
        const before = await readSolar();
        const png = await page.screenshot({ path: file, scale: 'css', style: '.ui { visibility: hidden !important; }' });
        const after = await readSolar();
        const pixels = [png.readUInt32BE(16), png.readUInt32BE(20)];
        run.solarDiagnostic = { file: relative(output, file), sha256: hash(png), pixels, before, after };
        assert.deepEqual(pixels, [1440, 900]);
        assert(before.solar.diagnostic && after.solar.diagnostic);
        assertNearestCamera(before.camera, after.camera);
      } finally {
        await page.evaluate(() => window.__pineCaptureSolarView(false));
        const restored = await page.evaluate(() => window.__pineCaptureCamera());
        if (run.solarDiagnostic) run.solarDiagnostic.restoredCamera = restored;
        assertNearestCamera(restored, original);
      }
    };
    const waitWax = (fn, arg) => page.waitForFunction(fn, arg, { polling: 50, timeout: 15_000 });
    const captureDiagnostic = async (name, view) => {
      await waitWax(() => {
        const hud = document.querySelector('.hud-bottom');
        return document.querySelector('.ui')?.dataset.controlsIdle === 'true'
          && hud && Number(getComputedStyle(hud).opacity) < .01;
      });
      await page.evaluate(view => window[view](), view);
      try {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const diagnostic = await captureShot(name);
        assert(diagnostic.hudOpacity !== null && diagnostic.hudOpacity < .01, 'The candle diagnostic must be clear of the burning HUD.');
      } finally {
        await page.evaluate(() => window.__visualPineCloseupRestore());
      }
    };
    const travel = async (skip, journey = false) => {
      const started = performance.now();
      entryStartedAt = started;
      await act(button(bi('^Step inside$', '^走进院里$')));
      if (skip) await act(button(bi('^Skip$', '^跳过$')));
      if (direction?.name === 'day' && !phone) {
        for (const [name, target] of directionWalkFrames) {
          await page.waitForFunction(target => {
            const clock = window.__pineCaptureWalkClock;
            return clock?.id === 'pine-gate' && clock.seconds >= target && window.__walkProgress?.state === 'walking';
          }, target, { timeout: 35_000, polling: 30 });
          const shot = await captureShot(name, { targetWalkSeconds: target });
          assert(shot.walkClock.durationSeconds === 30 && shot.walk.state === 'walking' && !shot.camera.overview,
            'The walk frame must come from the unmodified thirty-second journey.');
          assert(shot.walkClock.seconds >= target && shot.walkClock.seconds <= target + .6, `Missed the ${target}s walk beat.`);
          assert(shot.walkClockAfter.seconds <= target + .9, `The screenshot crossed the ${target}s walk beat.`);
        }
      } else if (journey) {
        for (const [name, target] of [['walk-25', .25], ['walk-50', .5], ['walk-75', .75]]) {
          await page.waitForFunction(target => {
            const state = window.__walkProgress;
            return state?.id === 'pine-gate' && state.progress >= target;
          }, target, { timeout: 35_000, polling: 50 });
          await captureShot(name);
        }
      }
      await matchStage(page, 'candle');
      if (journey || directionOnly) run.walkDurationMs = performance.now() - started;
    };
    const choose = async (custom = false) => {
      if (custom) {
        await act(page.getByRole('tab', { name: bi('^Draw$', '^自己画$') }));
        await drawProfile(context, page, phone, browserName);
      } else {
        await act(radio(bi('^Pillar$', '^方墩$')));
        await act(radio(bi('^1 h$', '^1 小时$')));
      }
      await act(radio(custom ? bi('^Beeswax$', '^蜂蜡$') : bi('^Ivory$', '^象牙$')));
      await expect(lightButton).toBeEnabled();
      await waitWax(() => window.__visualPineWax?.()?.remaining === 1);
      if (phone || fullJourney) await page.waitForTimeout(1300);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const light = async (captureChoreography = false) => {
      const [response] = await Promise.all([candleResponse(page, '/api/candles'), act(lightButton)]);
      assert(response.ok(), 'Lighting request failed with HTTP ' + response.status());
      const active = await response.json();
      assert.equal(active.placeId, 'pine-gate');
      assert.equal(active.shape.kind, 'candle');
      assert.equal(active.status, 'burning');
      assert(active.id, 'The lighting response did not identify a candle.');
      activeId = active.id;
      if (captureChoreography) {
        await waitWax(requireContact => {
          const ignition = window.__visualIgnition;
          if (ignition?.state !== 'igniting') return false;
          if (!requireContact) return ignition.progress >= .085;
          return ignition.progress >= .09 && ignition.progress <= .1044
            && Number.isFinite(ignition.wickContactMetres) && ignition.wickContactMetres < .003;
        }, quality);
        const ignition = await captureShot('ignition');
        if (quality) assert(Number.isFinite(ignition.ignition?.wickContactMetres)
          && ignition.ignition.wickContactMetres < .003, 'The ignition flame must meet the actual wick.');
        await waitWax(() => window.__visualIgnition?.state === 'spreading');
        await captureShot('spreading');
      }
      await expect(page.getByTestId('with-you')).toBeVisible();
      await page.waitForFunction(() => window.__visualIgnition?.state === 'settled', null, { timeout: 30_000, polling: 50 });
      if (captureChoreography) await captureShot('settled');
      return active;
    };
    const advance = async (active, delta) => {
      assert.equal(adjustStart.run(delta, active.id).changes, 1, 'The isolated active candle was not updated.');
      await page.evaluate(delta => window.__advanceVisualClock(delta), delta);
    };
    const advanceToProgress = async (active, target) => {
      const remaining = await page.evaluate(() => window.__visualPineWax?.()?.remaining);
      assert(Number.isFinite(remaining), 'The active candle did not expose its remaining wax.');
      const delta = Math.round((target - (1 - remaining)) * active.durationMs);
      assert(delta > 0, 'The burn is already past the requested progress.');
      await advance(active, delta);
    };
    const measureBurnCadence = async () => {
      if (!fullJourney || !phone) return;
      await page.waitForTimeout(1000);
      await assertCaptureGpuHealthy(page);
      run.performance = await page.evaluate(() => new Promise(resolve => {
        const clock = () => performance.timeOrigin + performance.now();
        const frames = [];
        const started = clock();
        window.__pineMeasureFrame = () => frames.push(clock());
        setTimeout(() => {
          delete window.__pineMeasureFrame;
          const durationMs = clock() - started;
          const intervals = frames.slice(1).map((stamp, index) => stamp - frames[index]).sort((a, b) => a - b);
          resolve({
            frames: frames.length, durationMs, fps: frames.length / durationMs * 1000,
            p95FrameMs: intervals[Math.floor(intervals.length * .95)] ?? null,
            drawingBuffer: [window.__renderer.domElement.width, window.__renderer.domElement.height],
            visible: document.visibilityState === 'visible',
          });
        }, 10_000);
      }));
      console.log(browserName, label, 'burn cadence', JSON.stringify(run.performance));
      assert(run.performance.visible && run.performance.frames > 0, 'No visible composer frame timing was captured.');
    };
    const waitProgress = target => waitWax(target => {
      const wax = window.__visualPineWax?.();
      return wax && Math.abs((1 - wax.remaining) - target) < .006;
    }, target);
    const advanceVisibleBurn = async (active, target) => {
      const hud = page.getByTestId('with-you');
      const previous = await hud.textContent();
      await advanceToProgress(active, target);
      await waitProgress(target);
      await expect(hud).not.toHaveText(previous);
    };
    const settleRecord = async (active, status, endReason) => {
      await expect(page.getByText(bi('^Saved$', '^记录已保存$'), { exact: true })).toBeVisible();
      const settled = (await history(page)).find(candle => candle.id === active.id);
      assert.equal(settled?.status, status);
      assert.equal(settled.endReason, endReason);
      assert.deepEqual(settled.shape, active.shape);
      assert.equal(settled.durationMs, active.durationMs);
      run.records.push({ id: settled.id, status, endReason, durationMs: settled.durationMs,
        burnedMs: settled.burnedMs, shape: settled.shape });
      return settled;
    };

    await page.goto(base.href);
    await page.waitForFunction(() => window.__ready === true);
    await assertCaptureGpuHealthy(page);
    run.gpu = await page.evaluate(() => {
      const gl = window.__renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    await page.evaluate(() => document.fonts.ready);
    if (fullJourney && !readinessOnly && !audioCompare && !ambientOnly && !directionOnly) await captureShot('home');
    const wishField = page.getByLabel(wishLabel);
    if (fullJourney && !audioCompare) await observeWishInput(wishField);
    await wishField.fill(wish);
    await act(button(bi('^Set my wish$', '^许好了$')));
    const pineRadio = radio(new RegExp('^' + pineName));
    if (audioCompare) {
      const selected = pine ? pineRadio : radio(new RegExp('^' + snowName));
      if (await selected.getAttribute('aria-checked') !== 'true') await act(selected);
      await expect(selected).toHaveAttribute('aria-checked', 'true');
      await expect(button(bi('^Step inside$', '^走进院里$'))).toBeEnabled({ timeout: 60_000 });
      await travel(true);
      await act(radio(bi('^1 h$', '^1 小时$')));
      const [response] = await Promise.all([candleResponse(page, '/api/candles'), act(lightButton)]);
      assert(response.ok(), 'Lighting request failed with HTTP ' + response.status());
      const candle = await response.json();
      assert.equal(candle.placeId, placeId);
      assert.equal(candle.durationMs, 3_600_000);
      await matchStage(page, 'burning');
      run.audio = await sampleLiveAudioWindow(page, { startSeconds: 30, durationSeconds: 15, intervalMs: 125 });
      assert(run.audio.complete && run.audio.rms > 0 && run.audio.peak < .99, 'Live matched audio coverage or level check failed.');
      await assertCaptureGpuHealthy(page);
      assert.deepEqual(run.errors, []);
      console.log(browserName, label, placeId, 'matched audio', JSON.stringify({ rms: run.audio.rms, peak: run.audio.peak, readings: run.audio.readings.length }));
      return;
    }
    if (fullJourney) await observePlaceReadiness(pineRadio);
    const selectStarted = performance.now();
    await act(pineRadio);
    await expect(pineRadio).toHaveAttribute('aria-checked', 'true');
    if (fullJourney) {
      try {
        await expect(button(bi('^Step inside$', '^走进院里$'))).toBeEnabled({ timeout: 60_000 });
        run.placeReadyMs = performance.now() - selectStarted;
      } finally {
        run.placeReadiness = await page.evaluate(() => window.__readPlaceReadiness?.());
      }
      if (sceneAudit.readiness) {
        assert(run.placeReadiness?.marks.some(mark => mark.name === 'one-light:pine-gate:build-finished'),
          'Did not observe the Pine Gate build phase marks.');
      }
      if (previewPackage) {
        assert(['manifest.json', previewPackage.scene].every(file => run.previewFetchedFiles.includes(file)),
          'The browser did not request the isolated Pine preview manifest and model.');
      }
      if (realismOnly) {
        run.readyPineImages = await page.evaluate(() => window.__pineCaptureBackdrop());
        assertPineRuntimeImages(run.readyPineImages, previewPackage, run.previewFetchedFiles);
        const beforeEntry = inspectPineHighBackdrop(run.readyPineImages, previewPackage, run.previewFetchedFiles);
        if (beforeEntry) {
          run.highBackdrop = { beforeEntry };
          assert.equal(beforeEntry.status, 'base', 'High backdrop must not load before Step inside.');
          assert.deepEqual(run.highBackdropRequests, [], 'High backdrop must not request assets before Step inside.');
        }
      }
      if (readinessOnly) {
        assert(Number.isFinite(run.placeReadiness.wishToEnabledMs) && Number.isFinite(run.placeReadiness.clickToEnabledMs),
          'Did not observe wish input, place click, and enable events.');
        console.log(browserName, label, 'trial', trial, 'place readiness ms', JSON.stringify({
          endToEnd: run.placeReadyMs, clickToEnabled: run.placeReadiness.clickToEnabledMs,
          wishToEnabled: run.placeReadiness.wishToEnabledMs, afterLastPineResponse: run.placeReadiness.afterLastPineResponseMs,
        }));
        assert.deepEqual(run.errors, []);
        return;
      }
      if (sceneAudit.lighting) {
        run.lighting = await page.evaluate(() => window.__pineCaptureLighting?.());
        const expected = { 13: ['day', 2], 18: ['dusk', 1], 22: ['night', 0] }[visualHour];
        assert(run.lighting?.placeId === 'pine-gate' && run.lighting.agx && run.lighting.loadedPasses.includes('lamp'),
          'Pine Gate must be active with native AgX and the lamp pass.');
        if (expected) {
          const [pass, index] = expected;
          assert(run.lighting.loadedPasses.includes(pass) && run.lighting.weights[index] > .5,
            `Pine Gate must use the ${pass} bank at visual hour ${visualHour}.`);
        }
      }
      if (!directionOnly) await captureShot('place');
    }
    if (direction) {
      await travel(direction.name === 'night' || run.realismPerformanceOnly);
      await choose();
      if (directionOverview && direction.name === 'day') {
        const previous = await page.evaluate(() => window.__pineCaptureCamera());
        const pose = await page.evaluate(view => window.__pineCaptureOverview(view), directionOverview);
        try {
          const overview = await captureShot('shrine-pavilion', { overviewPose: pose });
          assert(overview.camera.overview && overview.camera.phase === 'candle');
          assertNearestCamera(overview.camera, pose);
        } finally {
          await page.evaluate(() => window.__pineCaptureOverview(null));
        }
        assertNearestCamera(await page.evaluate(() => window.__pineCaptureCamera()), previous);
      }
      const candle = await light();
      assert.equal(candle.durationMs, 3_600_000);
      run.directionCandle = { id: candle.id, shape: candle.shape, durationMs: candle.durationMs };
      if (run.realismPerformanceOnly) {
        await measureBurnCadence();
        run.settledWax = await page.evaluate(() => window.__visualPineWax?.());
        assert(run.settledWax?.baked && run.settledWax.state === 'burning');
        assert.deepEqual(run.shots, []);
      } else {
        const niche = await captureShot(`${direction.name}-burning`);
        assert(niche.wax.state === 'burning' && niche.wax.remaining > .99 && niche.ignition.state === 'settled');
        assert(niche.camera.phase === 'burning' && !niche.camera.overview);
        assert.deepEqual(run.shots.map(shot => basename(shot.file, '.png')), direction.frames);
        if (realismOnly) {
          await captureSolarDiagnostic();
          const portrait = await page.evaluate(async shape => {
            const sceneUrl = '/src/engine/scene.js';
            const { renderLampThumbnail } = await import(sceneUrl);
            // This portrait uses the refined tray without a directional sun mask.
            return renderLampThumbnail(shape, { state: 'burning', remaining: .65, width: 160, height: 200 });
          }, candle.shape);
          const png = Buffer.from(portrait.replace(/^data:image\/png;base64,/, ''), 'base64');
          assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
          assert.equal(png.readUInt32BE(16), 160);
          assert.equal(png.readUInt32BE(20), 200);
          const file = join(output, 'diagnostics', 'refined-tray-portrait.png');
          await writeFile(file, png);
          run.trayPortrait = { file: relative(output, file), width: 160, height: 200 };
        }
      }
      if (realismOnly) {
        const burningWax = run.settledWax ?? run.shots.find(shot => basename(shot.file) === 'day-burning.png')?.wax;
        assert(burningWax && burningWax.framedFraction >= .20 && burningWax.framedFraction <= .25,
          'The visitor wax alone must occupy 20–25% of the burning frame height.');
        assert.deepEqual(run.obsoleteVistaRequests, [], 'Pine must not request the old DEM renderer or elevation field.');
        run.settledPineImages = await page.evaluate(() => window.__pineCaptureBackdrop());
        assertPineRuntimeImages(run.settledPineImages, previewPackage, run.previewFetchedFiles, true);
        for (const shot of run.shots) assertPineRuntimeImages(shot.pineImages, previewPackage, run.previewFetchedFiles, true);
        if (run.highBackdrop) {
          const inspectHigh = state => inspectPineHighBackdrop(state, previewPackage, run.previewFetchedFiles);
          const settled = inspectHigh(run.settledPineImages);
          // The per-shot samplers distinguish a base reveal or burn from a later successful upgrade.
          const shots = Object.fromEntries(run.shots.map(shot => [basename(shot.file), inspectHigh(shot.pineImages)]));
          Object.assign(run.highBackdrop, { settled, shots });
          const baseOnly = phone || realismBaseOnly;
          if (baseOnly) {
            assert.equal(settled.status, 'base', 'The base-tier context must remain on the base backdrop.');
            assert.deepEqual(run.highBackdropRequests, [], 'The base-tier context must never request any high-tier assets.');
            for (const [name, state] of Object.entries(shots)) {
              assert.equal(state.status, 'base', `${name} switched away from the base backdrop.`);
            }
          } else {
            assert(run.highBackdropRequests.every(request => request.afterEntryMs !== null), 'High backdrop requested before entering.');
            assert.deepEqual(new Set(run.highBackdropRequests.map(request => request.uri)), highUris);
            assert.equal(settled.status, 'active', 'Desktop did not finish the optional high backdrop upgrade.');
            for (const [name, state] of Object.entries(shots)) {
              assert.equal(state.status, 'active', `${name} was captured before the high backdrop upgrade finished.`);
            }
          }
          if (highTreeUri) {
            assert.deepEqual(run.readyPineImages.nativeTrees, [], 'Native trees installed before the walk.');
            const mounts = run.readyPineImages.nativeTreeMounts;
            assert(mounts.some(mount => mount.node === 'PineRidgeNative') && mounts.some(mount => mount.node === 'PineYoungNative'));
            const expected = new Map(mounts.map(mount => [mount.node, mount.position]));
            const baseCrowns = run.readyPineImages.baseCrowns;
            if (baseCrowns) {
              assert(baseCrowns.visible, 'The needle crowns must cover the three rooted positions before entry.');
              assert.deepEqual(baseCrowns.mounts, mounts.map(mount => ({
                name: mount.node, position: mount.position, height: mount.height,
              })));
            }
            for (const state of [...run.shots.map(shot => shot.pineImages), run.settledPineImages]) {
              if (baseCrowns) assert.equal(state.baseCrowns.visible, baseOnly, 'Only one crown tier can be visible at the review cameras.');
              const trees = state.nativeTrees;
              if (baseOnly) {
                assert.deepEqual(trees, [], 'The base-tier context installed desktop tree geometry.');
                continue;
              }
              assert.deepEqual(trees.map(tree => tree.name).sort(), [...expected.keys()].sort());
              for (const tree of trees) assert.deepEqual(tree.position, expected.get(tree.name));
              assert(trees.every(tree => tree.triangles > 50_000 && tree.scale > 0),
                'The native crowns are missing geometry or an authored mount.');
            }
          }
        }
        assert(Number.isFinite(run.placeReadiness.wishToEnabledMs) && run.placeReadiness.wishToEnabledMs > 0);
        if (requireBackdrop) assert(run.placeReadiness.wishToEnabledMs <= 5000, 'Wish to Step inside took more than 5 seconds.');
      }
      assert.deepEqual(run.errors, []);
      return;
    }
    if (ambientOnly) {
      await travel(true);
      await choose();
      const unlit = await captureShot('unlit');
      assert.equal(unlit.wax.state, 'unlit');
      const candle = await light();
      await captureShot('burn-00', { targetProgress: 0 });
      await advanceVisibleBurn(candle, .5);
      await captureShot('burn-50', { targetProgress: .5 });
      await captureDiagnostic('candle-contact', '__visualPineContactView');
      assert.deepEqual(run.errors, []);
      return;
    }
    await travel(!fullJourney, fullJourney);
    const freehand = phone && !quality;
    await choose(freehand);
    const unlit = await captureShot('unlit', { choice: freehand ? 'freehand' : 'preset' });
    assert.equal(unlit.wax.state, 'unlit');

    const complete = await light(fullJourney);
    assert.equal(complete.shape.rows.length > 2, freehand);
    await waitProgress(0);
    const early = await captureShot('burn-00', { targetProgress: 0 });
    await measureBurnCadence();
    if (quality) await captureDiagnostic('burn-far', '__visualPineFarView');
    if (fullJourney) {
      await wakeControls();
      await expect(page.locator('.ui')).toHaveAttribute('data-controls-idle', 'false');
      await expect.poll(() => page.locator('.hud-bottom').evaluate(hud => Number(getComputedStyle(hud).opacity))).toBeGreaterThan(.99);
      const burning = await captureShot('burn-controls', { targetProgress: 0 });
      assert(burning.controlsVisible, 'The burning screenshot must show the actual controls.');
    }
    if (quality) {
      const signal = await sampleLiveAudio(page, { samples: 12, intervalMs: 150 });
      const meters = signal.readings.flatMap(reading => reading.contexts.flatMap(
        context => context.masters.map(master => master.meter).filter(Boolean)));
      const rms = Math.sqrt(meters.reduce((sum, meter) => sum + meter.rms ** 2, 0) / (meters.length || 1));
      assert(signal.running && signal.connectedMasters && signal.peak > 0, 'No live Pine Gate ambience was observed.');
      assert(signal.peak < .99, 'Pine Gate audio peaked near clipping.');
      const matchedWindow = await sampleLiveAudioWindow(page, { startSeconds: 30, durationSeconds: 15, intervalMs: 125 });
      run.audio = { ...signal, rms, matchedWindow };
      if (matchedWindow.complete) assert(matchedWindow.peak < .99, 'Pine Gate audio peaked near clipping in the matched window.');
      else console.warn(browserName, label, 'The matched audio window did not have full coverage.');
    }
    await advanceVisibleBurn(complete, .5);
    const middle = await captureShot('burn-50', { targetProgress: .5 });
    if (quality) {
      await captureDiagnostic('candle-closeup', '__visualPineCloseup');
      await captureDiagnostic('candle-contact', '__visualPineContactView');
    }
    await advanceVisibleBurn(complete, .95);
    const final = await captureShot('burn-95', { targetProgress: .95 });
    assert(early.wax.bodyHeight > middle.wax.bodyHeight && middle.wax.bodyHeight > final.wax.bodyHeight && final.wax.bodyHeight > 0);
    await advanceToProgress(complete, 1 + 1000 / complete.durationMs);
    await expect(page.getByTestId('result-title')).toHaveText(bi('burned down', '燃尽了'));
    const burned = await settleRecord(complete, 'burned_down', 'complete');
    assert.equal(burned.burnedMs, complete.durationMs);
    await waitWax(() => window.__visualPineWax?.()?.remaining === 0 && !window.__visualWickPlume?.());
    const done = await captureShot('burned-down');
    assert.equal(done.wax.state, 'burned_down');
    assert.equal(done.wax.bodyHeight, 0);
    assert(done.wax.trace);

    await act(button(bi('^Another lamp for this wish$', '^再为此愿点一盏$')));
    activeId = null;
    await travel(true);
    await choose(!phone && !quality);
    const extinguished = await light();
    assert.notEqual(extinguished.id, complete.id, 'Each ending needs its own actual candle.');
    if (quality) {
      assert.equal(complete.durationMs, 3600000, 'Quality comparisons use the one-hour preset.');
      assert.equal(extinguished.durationMs, complete.durationMs);
      assert.deepEqual(extinguished.shape, complete.shape);
      run.matchedEndings = { burnedDownId: complete.id, putOutId: extinguished.id };
    }
    await advanceToProgress(extinguished, .42);
    await waitProgress(.42);
    await act(button(bi('^Put out$', '^熄灭$')));
    if (mode === 'm3') await captureShot('put-out-confirm');
    const [endResponse, out] = await Promise.all([
      candleResponse(page, '/api/candles/' + extinguished.id + '/end'),
      (async () => {
        await act(button(bi('^Put out and end$', '^熄灭并结束$')));
        await waitWax(requireContact => {
          const plume = window.__visualWickPlume?.();
          if (plume?.mode !== 'sudden' || plume.visibleSprites <= 0) return false;
          const age = plume.currentTime - plume.startedAt;
          if (!requireContact) return age >= .65;
          return age >= .7 && age <= .85 && Number.isFinite(plume.nearestSmokeMetres) && plume.nearestSmokeMetres < .008;
        }, quality);
        return captureShot('went-out', { targetProgress: .42 });
      })(),
    ]);
    assert(endResponse.ok(), 'Put-out request failed with HTTP ' + endResponse.status());
    const flight = await endResponse.json();
    await expect(page.getByTestId('result-title')).toHaveText(bi('went out', '就到这里'));
    const stopped = await settleRecord(extinguished, 'went_out', 'put_out');
    assert.deepEqual(stopped, flight, 'The put-out response and subsequent record must agree.');
    assert(Math.abs(flight.burnedMs / flight.durationMs - .42) < .012, 'Went-out result diverged from remaining wax amount.');
    const remaining = remainingFuel(flight.burnedMs, flight.durationMs);
    const savedCut = waxCutHeight(flight.shape.rows, remaining);
    assert.equal(out.wax.state, 'went_out');
    assert(Math.abs(out.wax.cutHeight - savedCut) < .00001, 'The settled cut and record cut must agree.');
    const dictionary = DICTS[language];
    assert.equal(out.resultLead, dictionary.outLead(fmtDuration(flight.burnedMs, dictionary, true)));
    if (quality) assert(Number.isFinite(out.smoke?.nearestSmokeMetres)
      && out.smoke.nearestSmokeMetres < .008, 'The put-out smoke must stay connected to the actual wick.');
    run.putOut = { candleId: flight.id, burnedMs: flight.burnedMs, durationMs: flight.durationMs,
      resultLead: out.resultLead, remaining, waxCutMetres: savedCut };
    if (fullJourney) {
      await waitWax(() => !window.__visualWickPlume?.());
      await captureShot('went-out-cooled');
    }

    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    await expect(page.getByTestId('with-you')).toHaveCount(0);
    await act(button(bi('^My Lamps$', '^我的灯$')));
    const records = page.getByTestId('record');
    await expect(records).toHaveCount(2);
    await expect(records.filter({ hasText: bi('Went out', '已熄灭') })).toHaveCount(1);
    await expect(records.filter({ hasText: bi('Burned down', '已燃尽') })).toHaveCount(1);
    const restored = (await history(page)).find(candle => candle.id === extinguished.id);
    assert.deepEqual(restored, stopped);
    for (const status of ['went_out', 'burned_down']) {
      const thumbnail = records.locator('[data-lamp-state="' + status + '"][data-ready="true"] img');
      await thumbnail.scrollIntoViewIfNeeded();
      await expect(thumbnail).toBeVisible({ timeout: 15_000 });
    }
    run.refreshVerified = true;
    if (mode === 'm3') {
      await page.locator('.panel').evaluate(panel => panel.scrollTo({ top: 0 }));
      await captureShot('my-lamps-after-refresh', { candleId: null, candleIds: [complete.id, extinguished.id] });
    }
    assert.deepEqual(run.errors, []);
  } catch (error) {
    run.errors.push({ kind: 'capture', text: error.stack ?? String(error) });
    throw error;
  } finally {
    await context.close();
    await save();
  }
}

try {
  let failures = 0;
  for (const name of suite) {
    const options = name === 'chromium'
      ? { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
      : {};
    const launch = () => (name === 'chromium' ? chromium : webkit).launch(options);
    const groups = readinessOnly ? contexts.map(size => [size]) : [contexts];
    for (let trial = 1; trial <= readinessRepeats; trial++) for (const group of groups) {
      const browser = await launch();
      try {
        for (const size of group) {
          try {
            await capture(browser, name, size, trial);
          } catch (error) {
            failures++;
            console.error(name, size.label, error.stack ?? error.message);
          }
        }
      } finally {
        await browser.close();
      }
    }
  }
  if (previewPackage) {
    const publicAfter = hash(await readPublicManifest());
    report.delivery.publicManifestUnchanged = publicAfter === report.delivery.publicManifestSha256;
    assert(report.delivery.publicManifestUnchanged, 'The ordinary final Pine manifest changed during the isolated preview.');
  }
  if (directionOnly && !failures) {
    const [day, second] = report.runs;
    assert.equal(report.runs.length, 2);
    assert.equal(day?.direction, 'day');
    assert.match(day.sceneSha256, /^[a-f0-9]{64}$/);
    assert.equal(day.sceneSha256, second.sceneSha256, 'The two contexts loaded different Vite scene sources.');
    assert.notEqual(day.directionCandle.id, second.directionCandle.id, 'Each lighting needs its own actual candle.');
    assert.deepEqual(day.directionCandle.shape, second.directionCandle.shape);
    assert.equal(day.directionCandle.durationMs, second.directionCandle.durationMs);
    if (realismOnly) {
      assert(second.realismPerformanceOnly && second.direction === 'day' && second.performance.visible);
    } else {
      assert.equal(second.direction, 'night');
      assertNearestCamera(day.shots.at(-1).camera, second.shots.at(-1).camera);
    }
    report.directionVerified = true;
  }
  console.log('Ran ' + report.runs.length + ' contexts, captured ' + report.runs.reduce((n, run) => n + run.shots.length, 0) + ' screenshots, ' + failures + ' failed contexts.');
  if (failures) process.exitCode = 1;
} finally {
  db.close();
  await save();
}
