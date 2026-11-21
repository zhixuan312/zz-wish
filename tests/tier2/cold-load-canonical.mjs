// Canonical production cold-load baseline for One Light.
//
// One independent browser process per run, cache enabled (a real visitor's first visit has an empty
// cache, but the harness must not disable it, because that changes how the service worker and the
// preload hints behave). The journey is the default one: never click a place radio; assert Snow Roof is
// the checked place.
//
// Every mark carries wire bytes measured from CDP: Network.dataReceived accumulates partial bodies and
// Network.loadingFinished replaces that request's total with the authoritative encoded length, so a
// request still in flight at a mark contributes what had actually arrived.
//
// Shader counts and GLSL source bytes come from the same hooks perf-ref/shaders.cjs uses, installed with
// addInitScript; the production bundle is not touched.
//
// Usage: node tests/tier2/cold-load-canonical.mjs --out DIR --run-dir TMP [--runs 3] [--only NAME]
//        [--locale en-US] [--port 8902]
// --run-dir must be the worker tmp that safe-kill.sh authorises; the harness starts its own server there
// and records the pid, so cleanup never needs a process name or port.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const options = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1] ?? '']);
  return rows;
}, []));
// --base is optional: the harness starts its own server and uses that address.
const out = options.out ?? 'tmp/cold-canonical';
const runs = Number(options.runs ?? 3);
const locale = options.locale ?? 'en-US';
mkdirSync(out, { recursive: true });

const CONDITIONS = [
  { name: 'desktop-fast', w: 1440, h: 900, dpr: 2, cpu: 1, net: null, mobile: false },
  { name: 'desktop-slowcpu-20mbps', w: 1440, h: 900, dpr: 2, cpu: 4,
    net: { latency: 40, down: 20e6 / 8, up: 5e6 / 8 }, mobile: false },
  { name: 'phone-4x-4g', w: 390, h: 844, dpr: 3, cpu: 4,
    net: { latency: 150, down: 9e6 / 8, up: 2e6 / 8 }, mobile: true },
];
const wanted = options.only ? CONDITIONS.filter(condition => condition.name === options.only) : CONDITIONS;
if (!wanted.length) throw new Error('Unknown condition: ' + options.only);

const en = locale.startsWith('en');
const L = {
  wish: en ? 'Your wish' : '你的愿望',
  submit: en ? 'Set my wish' : '许好了',
  step: en ? 'Step inside' : '走进院里',
  snowRoof: en ? 'Snow Roof Court' : '雪瓦北院',
};

// The harness owns its server: it starts it, records the pid, and stops it in the same finally block
// that closes the browser. Nothing outside this file needs to kill a process by name or port.
function startServer(port, dbFile, repo, runDir) {
  // The process runs with its working directory under the shared tmp, which safe-kill.sh authorises for
  // this worker, so the recorded pid can always be stopped the sanctioned way. The server resolves
  // web/dist from the repository, so the repository is passed through the environment.
  const child = spawn('node', [join(repo, 'server/main.ts')], {
    cwd: runDir,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_FILE: dbFile,
      ONE_LIGHT_REPO: repo },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', chunk => log.push(String(chunk)));
  child.stderr.on('data', chunk => log.push(String(chunk)));
  return { child, port, log };
}

async function waitForServer(port, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/places/stats`);
      if (response.ok) return true;
    } catch { /* not listening yet */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

const environment = {
  wallTime: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  chrome: execFileSync('sh', ['-c',
    '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --version'], { encoding: 'utf8' }).trim(),
  gpu: execFileSync('sh', ['-c', 'system_profiler SPDisplaysDataType 2>/dev/null | grep -m1 Chipset'], { encoding: 'utf8' }).trim(),
  neighbours: execFileSync('sh', ['-c',
    'pgrep -fl "playwright|blender|vite.js" | grep -v cold-load || true'], { encoding: 'utf8' }).trim(),
};

// Hooks from perf-ref/shaders.cjs: program link count and GLSL source bytes, plus a frame clock for
// percentiles. Buffered observers survive the whole run.
const INIT = () => {
  const marks = { longTasks: [], frames: [], links: 0, srcBytes: 0, contexts: 0, firstDraw: null, homeFrame: null };
  window.__s = marks;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) marks.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  const P = WebGL2RenderingContext.prototype;
  const link = P.linkProgram;
  P.linkProgram = function (program) { marks.links++; return link.call(this, program); };
  const source = P.shaderSource;
  P.shaderSource = function (shader, text) {
    // UTF-8 bytes, not code units: GLSL is measured as the driver receives it.
    marks.srcBytes += new TextEncoder().encode(String(text)).length;
    return source.call(this, shader, text);
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (/webgl/.test(String(type))) marks.contexts++;
    return getContext.call(this, type, attributes);
  };
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const draw = P[name];
    P[name] = function (...args) {
      if (marks.firstDraw === null) marks.firstDraw = Math.round(performance.now());
      return draw.apply(this, args);
    };
  }
  const settle = () => {
    if (marks.homeFrame !== null) return;
    if (marks.firstDraw === null) { requestAnimationFrame(settle); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (marks.homeFrame === null) marks.homeFrame = Math.round(performance.now());
    }));
  };
  requestAnimationFrame(settle);
  // A rolling frame clock; the harness reads it at each mark.
  let last = 0;
  const clock = now => {
    if (last) marks.frames.push(now - last);
    last = now;
    if (marks.frames.length < 4000) requestAnimationFrame(clock);
  };
  requestAnimationFrame(clock);
};

// Pins the wall clock so the daylight pass is 13:00 on every run.
const CLOCK = () => {
  const RealDate = Date;
  const fixed = new RealDate(2026, 10, 21, 13, 0, 0).getTime();
  const offset = fixed - RealDate.now();
  // eslint-disable-next-line no-global-assign
  window.Date = class extends RealDate {
    constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(RealDate.now() + offset); }
    static now() { return RealDate.now() + offset; }
  };
};

const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(1);
};

async function runOnce(target, condition, run, phase) {
  // An independent browser process per run: no shared profile, no shared HTTP cache on disk.
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const record = { condition: condition.name, run, phase,
    viewport: `${condition.w}x${condition.h}`, locale, cpuThrottle: condition.cpu,
    network: condition.net ?? 'unlimited', cacheEnabled: true };
  try {
    const context = await browser.newContext({
      viewport: { width: condition.w, height: condition.h }, locale,
      isMobile: condition.mobile, hasTouch: condition.mobile, deviceScaleFactor: condition.dpr,
    });
    await context.addInitScript(INIT);
    await context.addInitScript(CLOCK);
    const page = await context.newPage();

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    if (condition.net) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: condition.net.latency,
        downloadThroughput: condition.net.down, uploadThroughput: condition.net.up,
      });
    }
    if (condition.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: condition.cpu });

    // Wire accounting: partial bytes per request, replaced by the encoded total when it finishes.
    const requests = new Map();
    const failedHttp = [];
    let origin = null;
    cdp.on('Network.requestWillBeSent', event => {
      if (origin === null) origin = event.timestamp;
      requests.set(event.requestId, { url: event.request.url, start: event.timestamp, partial: 0,
        done: null, failed: null });
    });
    cdp.on('Network.dataReceived', event => {
      const row = requests.get(event.requestId);
      if (row) row.partial += event.dataLength ?? 0;
    });
    cdp.on('Network.loadingFinished', event => {
      const row = requests.get(event.requestId);
      if (row) { row.done = event.timestamp; row.partial = event.encodedDataLength; }
    });
    cdp.on('Network.responseReceived', event => {
      if (event.response.status >= 400) failedHttp.push({ url: event.response.url, status: event.response.status });
    });
    cdp.on('Network.loadingFailed', event => {
      const row = requests.get(event.requestId);
      if (row) row.failed = event.errorText;
      failedHttp.push({ url: row?.url ?? event.requestId, status: 'failed', error: event.errorText });
    });

    const errors = [];
    page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
    page.setDefaultTimeout(300000);
    const bytes = () => [...requests.values()].reduce((sum, row) => sum + (row.partial || 0), 0);
    const inFlight = () => [...requests.values()].filter(row => row.done === null).length;
    const wall = Date.now();
    const at = () => Date.now() - wall;
    // One line per stage, flushed immediately: a slow stage must be visible, not look like a hang.
    const progress = stage => console.log(`  [${condition.name} run ${run} ${phase}] ${stage} `
      + `+${at()}ms ${Math.round(bytes() / 1048576 * 10) / 10}MB`);

    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(L.wish).waitFor();
    record.input = { ms: at(), bytes: bytes() };

    // Two paths, never mixed in one number. The canonical path waits for the engine's readiness flag
    // before typing, matching perf-ref/measure.cjs. The immediate path types the moment the field is
    // editable, which is when a visitor who does not wait would type; it is recorded separately.
    if (phase === 'canonical') {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
      record.ready = { ms: at(), bytes: bytes(), inFlight: inFlight() };
    }
    progress('ready');
    record.home = { ms: at(), bytes: bytes() };

    // Home stage, captured where it happens: the cover poster is in the DOM here and removes itself
    // 700 ms after ready, so a snapshot taken after Step enabled would always find nothing.
    const readCover = () => page.evaluate(() => {
      const poster = document.getElementById('cover-poster');
      if (!poster) return { present: false };
      const picture = poster.querySelector('img');
      const style = getComputedStyle(poster);
      return { present: true, ready: poster.dataset?.ready ?? null,
        opacity: style.opacity, visibility: style.visibility, display: style.display,
        image: picture ? { complete: picture.complete, naturalWidth: picture.naturalWidth,
          naturalHeight: picture.naturalHeight } : null };
    });
    record.homeCover = await readCover();
    record.homeShaders = await page.evaluate(() => ({
      links: window.__s.links, glslBytes: window.__s.srcBytes, contexts: window.__s.contexts,
      firstDraw: window.__s.firstDraw, homeFrame: window.__s.homeFrame,
      longTaskCount: window.__s.longTasks.length,
      longTaskTotalMs: Math.round(window.__s.longTasks.reduce((sum, task) => sum + task[1], 0)),
      longTaskMaxMs: Math.round(Math.max(0, ...window.__s.longTasks.map(task => task[1]))),
      frames: window.__s.frames.slice(-240),
    }));
    record.homeFrames = { p50: percentile(record.homeShaders.frames, .5),
      p95: percentile(record.homeShaders.frames, .95), count: record.homeShaders.frames.length };
    delete record.homeShaders.frames;
    record.homeShot = `${condition.name}-run-${run}-${phase}-home.png`;
    await page.screenshot({ path: join(out, record.homeShot) });
    record.readyAtInput = await page.evaluate(() => window.__ready === true);

    // The default place must already be Snow Roof; this harness never chooses one. The place panel is
    // only in the DOM once the wish screen is up, so read the radios after submitting.
    const places = () => page.evaluate(() => [...document.querySelectorAll('[role=radio]')]
      .filter(node => node.classList.contains('place'))
      .map(node => ({ label: (node.getAttribute('aria-label') ?? node.textContent ?? '').trim(),
        checked: node.getAttribute('aria-checked') })));
    record.placesAtReady = await places();

    await page.getByLabel(L.wish).fill('Measuring how long the court takes.');
    await page.getByRole('button', { name: L.submit, exact: true }).click();
    record.confirm = { ms: at(), bytes: bytes() };
    await page.locator('[role=radio].place').first().waitFor({ timeout: 60000 });
    record.places = await places();
    const checkedNow = record.places.filter(place => place.checked === 'true');
    record.checkedPlace = checkedNow[0]?.label ?? null;
    record.snowRoofChecked = checkedNow.length === 1 && checkedNow[0].label.includes(L.snowRoof.split(' ')[0]);
    if (!record.snowRoofChecked) throw new Error('Default place is not Snow Roof: ' + JSON.stringify(record.places));

    const step = page.getByRole('button', { name: L.step, exact: true });
    await step.waitFor();
    await page.waitForFunction(name => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === name);
      return Boolean(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    }, L.step);
    record.step = { ms: at(), bytes: bytes(), inFlight: inFlight() };

    const snapshot = await page.evaluate(() => ({
      links: window.__s.links, srcBytes: window.__s.srcBytes, contexts: window.__s.contexts,
      firstDraw: window.__s.firstDraw, homeFrame: window.__s.homeFrame,
      longTasks: window.__s.longTasks, frames: window.__s.frames.slice(-240),
      canvas: (() => { const c = document.querySelector('canvas'); return c && [c.width, c.height]; })(),
      poster: (() => {
        const poster = document.querySelector('.poster, [data-ready]');
        if (!poster) return null;
        const style = getComputedStyle(poster);
        return { ready: poster.dataset?.ready ?? null, opacity: style.opacity,
          visible: style.visibility !== 'hidden' && style.display !== 'none' };
      })(),
    }));
    // Step stage, kept apart from home: counters and cover are read here only to show what changed.
    record.stepShaders = { links: snapshot.links, glslBytes: snapshot.srcBytes, contexts: snapshot.contexts };
    record.stepFrames = { p50: percentile(snapshot.frames, .5), p95: percentile(snapshot.frames, .95),
      count: snapshot.frames.length };
    record.stepLongTask = { count: snapshot.longTasks.length,
      totalMs: Math.round(snapshot.longTasks.reduce((sum, task) => sum + task[1], 0)),
      maxMs: Math.round(Math.max(0, ...snapshot.longTasks.map(task => task[1]))) };
    record.canvas = snapshot.canvas;
    record.stepCover = snapshot.poster;
    progress('step');
    record.stepShot = `${condition.name}-run-${run}-${phase}-step.png`;
    await page.screenshot({ path: join(out, record.stepShot) });

    // Walk: the click, the first frame the picture actually moves, and the chooser, each separate. The
    // production build exposes no camera, so movement is read from the canvas with a settle delay that
    // skips the fade, requiring four consecutive changed frames. A timeout is recorded as a failure, not
    // silently as a missing value.
    // Movement must not be inferred from the fade. The page's #fade element is the one real
    // stage signal the production build leaves in the DOM: the walk fades in, and only after that
    // opacity reaches 0 does the camera travel. The probe therefore arms itself on the fade
    // clearing, then requires four consecutive frames whose coarse grid differs materially from the
    // first post-fade frame. The result is labelled a canvas proxy, because the production build
    // exposes no camera pose.
    const walkProbe = page.evaluate(() => new Promise(resolve => {
      const probe = { armed: false, first: null, samples: 0, baseline: null, streak: 0,
        fadeSeen: null, fadeCleared: null, framesAfterArm: 0 };
      window.__walkProbe = probe;
      const canvas = document.querySelector('canvas');
      const fade = document.getElementById('fade');
      if (!canvas) { resolve(false); return; }
      const scratch = document.createElement('canvas');
      scratch.width = 48; scratch.height = 30;
      const g = scratch.getContext('2d', { willReadFrequently: true });
      const startedAt = performance.now();
      const sample = () => {
        const now = performance.now();
        // Watch the fade: it becomes opaque for the transition, then clears.
        if (fade) {
          const opacity = Number(getComputedStyle(fade).opacity);
          if (opacity > .05 && probe.fadeSeen === null) probe.fadeSeen = now - startedAt;
          if (probe.fadeSeen !== null && opacity <= .05 && !probe.armed) {
            probe.fadeCleared = now - startedAt;
            probe.armed = true;
          }
        } else if (!probe.armed && now - startedAt > 700) {
          // No fade element at all: fall back to a fixed settle delay, still labelled a proxy.
          probe.armed = true;
        }
        if (probe.armed) {
          probe.framesAfterArm++;
          try {
            g.drawImage(canvas, 0, 0, scratch.width, scratch.height);
            const pixels = g.getImageData(0, 0, scratch.width, scratch.height).data;
            if (probe.baseline === null) probe.baseline = pixels.slice();
            else {
              let changed = 0, total = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                const delta = Math.abs(pixels[i] - probe.baseline[i])
                  + Math.abs(pixels[i + 1] - probe.baseline[i + 1])
                  + Math.abs(pixels[i + 2] - probe.baseline[i + 2]);
                if (delta > 24) changed++;
                total++;
              }
              probe.streak = changed / total > .10 ? probe.streak + 1 : 0;
              if (probe.streak >= 4) { probe.first = now - startedAt; resolve(true); return; }
              probe.baseline = pixels.slice();
            }
          } catch { /* resized canvas */ }
        }
        probe.samples++;
        if (probe.samples < 6000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    // The probe resolves only when movement is found, so install it and click; awaiting it here would
    // deadlock, because nothing moves until the click.
    const probeInstalled = walkProbe.then(() => true).catch(() => false);
    record.walkClick = { ms: at(), bytes: bytes() };
    await step.click();
    let walkMoved = true;
    try {
      await page.waitForFunction(() => window.__walkProbe?.first !== null, null, { timeout: 90000 });
    } catch (error) {
      walkMoved = false;
      record.walkFailure = String(error?.message ?? error).slice(0, 160);
    }
    await probeInstalled.catch(() => false);
    const probeState = await page.evaluate(() => window.__walkProbe && ({
      armed: window.__walkProbe.armed, fadeSeenMs: window.__walkProbe.fadeSeen,
      fadeClearedMs: window.__walkProbe.fadeCleared, firstProxyMs: window.__walkProbe.first,
      framesAfterArm: window.__walkProbe.framesAfterArm, samples: window.__walkProbe.samples,
    }));
    progress('walk');
    record.walkProbe = probeState;
    record.walkMovement = walkMoved
      ? { harnessMs: at(), navProxyMs: probeState?.firstProxyMs, bytes: bytes(),
        basis: 'canvas-proxy',
        note: 'First sustained change after the #fade element clears. The production build exposes no '
          + 'camera pose, so this is a picture proxy, not a measured camera displacement.',
        fadeClearedMs: probeState?.fadeClearedMs, framesAfterArm: probeState?.framesAfterArm }
      : { harnessMs: null, navProxyMs: null, bytes: null, failed: true, basis: 'canvas-proxy' }

    // The chooser is a separate stage; waiting for it is not a movement measure.
    // The duration radio is labelled by fmtDuration: "10 min" in English, "10 分钟" in Chinese.
    const chooser = page.locator('[role=radio]').filter({ hasText: en ? /10\s*min/i : /10\s*分钟/ }).first();
    // The chooser arrives only after the walk finishes, which is 30 s of authored travel plus the load
    // itself; the phone condition needs well over a minute of wall time.
    let chooserShown = true;
    try { await chooser.waitFor({ timeout: 180000 }); }
    catch (error) { chooserShown = false; record.chooserFailure = String(error?.message ?? error).slice(0, 160); }
    record.chooser = chooserShown ? { ms: at(), bytes: bytes() } : { ms: null, bytes: null, failed: true };

    // Burning: answer the duration chooser, then light the candle and read frame percentiles inside the
    // settled burning view. The light control only exists after the chooser is answered.
    progress('chooser');
    record.chooserClicked = false;
    if (chooserShown) {
      record.chooserClicked = await chooser.click({ timeout: 60000 }).then(() => true).catch(() => false);
    }
    await page.waitForTimeout(1500);

    // Burning stage: light the visitor's candle and read frame times and counters inside the settled view.
    const light = page.getByRole('button', { name: en ? /Light it/ : /点亮这一盏/ }).first();
    record.burning = null;
    try {
      await light.waitFor({ timeout: 60000 });
      const before = await page.evaluate(() => ({ frames: window.__s.frames.length, links: window.__s.links }));
      await light.click({ timeout: 30000 });
      await page.waitForTimeout(4000);
      const burning = await page.evaluate(() => ({
        frames: window.__s.frames.slice(-180), links: window.__s.links,
        contextLost: document.querySelector('canvas')?.getContext('webgl2')?.isContextLost?.() ?? null,
      }));
      record.burning = {
        frames: { p50: percentile(burning.frames, .5), p95: percentile(burning.frames, .95),
          count: burning.frames.length },
        linksAdded: burning.links - before.links, contextLost: burning.contextLost,
        shot: `${condition.name}-run-${run}-${phase}-burning.png`,
      };
      await page.screenshot({ path: join(out, record.burning.shot) });
    } catch (error) {
      record.burning = { failed: true, reason: String(error?.message ?? error).slice(0, 160) };
    }

    progress('burning');
    // Same-context revisit: reload and repeat the journey to Step inside with the cache warm. Wire bytes
    // start again at the reload: the counter below is the first visit's total and must not be inherited.
    const revisitBytesBase = bytes();
    const revisitRequestsBase = requests.size;
    const revisitWall = Date.now();
    const revisitBytes = () => bytes() - revisitBytesBase;
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(L.wish).waitFor();
    record.revisitInput = { ms: Date.now() - revisitWall, bytes: revisitBytes(),
      requestsSinceReload: requests.size - revisitRequestsBase };
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
    await page.getByLabel(L.wish).fill('Measuring how long the court takes.');
    await page.getByRole('button', { name: L.submit, exact: true }).click();
    const again = page.getByRole('button', { name: L.step, exact: true });
    await again.waitFor();
    await page.waitForFunction(name => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === name);
      return Boolean(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    }, L.step);
    record.revisitStep = { ms: Date.now() - revisitWall, bytes: revisitBytes(), inFlight: inFlight(),
      requestsSinceReload: requests.size - revisitRequestsBase };

    progress('revisit');
    record.requests = { started: requests.size, failed: [...requests.values()].filter(row => row.failed).length,
      failedHttp: failedHttp.length, inFlightAtStep: record.step.inFlight };
    record.failedHttp = failedHttp.slice(0, 20);
    record.top15 = [...requests.values()].filter(row => row.partial)
      .map(row => ({ url: row.url.replace(target, ''), kb: Math.round(row.partial / 1024),
        startS: origin === null ? null : +(row.start - origin).toFixed(2),
        doneS: row.done === null ? null : +(row.done - origin).toFixed(2) }))
      .sort((a, b) => b.kb - a.kb).slice(0, 15);
    record.errors = errors;
    record.wallMs = Date.now() - wall;
    return record;
  } finally {
    // try/finally: the browser process always closes, even when a mark times out.
    await browser.close().catch(() => {});
  }
}

const all = [];
const port = Number(options.port ?? 8902);
const dbFile = join(out, 'cold-load.db');
// A run directory inside the shared tmp: both the server's cwd and its database live there, so
// safe-kill.sh authorises the recorded pid. server/main.ts resolves web/dist from its working
// directory, so a `web` symlink to the repository points it at the real build without touching product
// code or serving anything outside the tmp tree.
// The authorised tmp directory is configuration, never a literal path: --run-dir points at the worker's
// tmp (safe-kill.sh only authorises server processes whose working directory is inside it), and
// $ONE_LIGHT_TMP is the fallback the repository's own scripts use.
const allowedTmp = options['run-dir'] ?? process.env.ONE_LIGHT_TMP;
if (!allowedTmp) {
  throw new Error('Pass --run-dir (the worker tmp that safe-kill.sh authorises) or set ONE_LIGHT_TMP.');
}
const runDir = join(allowedTmp, 'cold-load-run');
mkdirSync(runDir, { recursive: true });
// The server resolves web/dist from its working directory, so point it at this run's build. The link is
// checked after creation: a symlink to a different tree would make every measurement describe some
// other build.
const webLink = join(runDir, 'web');
try { execFileSync('rm', ['-f', webLink]); } catch { /* absent */ }
execFileSync('ln', ['-s', join(process.cwd(), 'web'), webLink]);
const linkedTo = execFileSync('readlink', [webLink], { encoding: 'utf8' }).trim();
if (linkedTo !== join(process.cwd(), 'web')) {
  throw new Error(`web symlink points at ${linkedTo}, not this build`);
}
const builtIndex = join(linkedTo, 'dist', 'index.html');
const builtStat = execFileSync('sh', ['-c', `test -f ${JSON.stringify(builtIndex)} && echo ok || echo missing`], { encoding: 'utf8' }).trim();
if (builtStat !== 'ok') throw new Error('No built index at ' + builtIndex + '; run npm run build first.');
const server = startServer(port, dbFile, process.cwd(), runDir);
let exitCode = 0;
try {
  if (!await waitForServer(port)) throw new Error('The harness server never answered on ' + port
    + ': ' + server.log.join('').slice(-500));
  const target = options.base ?? `http://127.0.0.1:${port}`;
  environment.base = target;
  environment.serverPid = server.child.pid;

  for (const condition of wanted) {
    for (let run = 1; run <= runs; run++) {
      for (const phase of ['canonical', 'immediate']) {
        const record = await runOnce(target, condition, run, phase);
        if (phase === 'immediate') {
          record.note = 'Immediate fill: typed as soon as the field was editable, then waited for Step inside.';
        }
        all.push(record);
        console.log(JSON.stringify({ condition: record.condition, run, phase,
          home: record.home?.ms, step: record.step?.ms, bytes: record.step?.bytes,
          checked: record.checkedPlace, snowRoof: record.snowRoofChecked }));
        writeFileSync(join(out, `${condition.name}-run-${run}-${phase}.json`), JSON.stringify(record, null, 2));
      }
    }
  }
  writeFileSync(join(out, 'all.json'), JSON.stringify({ environment, runs: all }, null, 2));
} catch (error) {
  exitCode = 1;
  console.error('RUN FAILED', error?.message ?? error);
  writeFileSync(join(out, 'failure.json'), JSON.stringify({ environment, error: String(error?.message ?? error) }, null, 2));
} finally {
  // H7: stop exactly the process this file started, by its recorded pid, then remove its database.
  try { server.child.kill('SIGTERM'); } catch { /* already gone */ }
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const suffix of ['', '-shm', '-wal']) {
    try { execFileSync('rm', ['-f', dbFile + suffix]); } catch { /* absent */ }
  }
  writeFileSync(join(out, 'server.log'), server.log.join(''));
}
process.exit(exitCode);
