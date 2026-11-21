/**
 * Build a private production fixture and replay it in hardware Chromium.
 * Use the same harness to build a clean baseline and a clean candidate.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { build } from 'vite';
import { installLoadingShaderProgramTrace } from './loading-shaders-program-trace.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/loading-shader-parity.json', import.meta.url)));
const args = parseArgs({ allowPositionals: true, options: {
  checkout: { type: 'string' }, url: { type: 'string' }, root: { type: 'string' }, side: { type: 'string' },
  mode: { type: 'string', default: 'parity' }, match: { type: 'string' }, exclude: { type: 'string' },
  'ready-only': { type: 'boolean' },
} });
const [command] = args.positionals;
const { mode, side } = args.values;
const checkout = resolve(args.values.checkout ?? '.');
assert(['build', 'capture', 'check-source'].includes(command),
  'Use build, capture or check-source. Pass --checkout and --mode parity|timing|trace.');
assert(['parity', 'timing', 'trace'].includes(mode));
const git = (...params) => execFileSync('git', ['-C', checkout, ...params], { encoding: 'utf8' }).trim();
const hash = input => createHash('sha256').update(input).digest('hex');
const sourceRev = git('rev-parse', 'HEAD');
const sourceSha256 = hash(git('ls-tree', '-r', 'HEAD', 'web', 'shared', 'server', 'package-lock.json'));
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Run with a clean tracked checkout.');
const buildReceipt = { sourceRev, sourceSha256, mode: mode === 'parity' ? 'parity' : 'production' };
assert(!args.values['ready-only'] || mode !== 'parity', 'Pixel parity requires the three court stages.');

function instrumentScene(input) {
  // These are test-only compile-time anchors present in both fbe82e3 and the candidate.
  const replaceOnce = (source, pattern, replacement, label) => {
    assert.equal([...source.matchAll(pattern)].length, 1, 'Could not locate ' + label + ' in the production source.');
    return source.replace(pattern, replacement);
  };
  let source = replaceOnce(input, /^const renderer = new THREE\.WebGLRenderer\([\s\S]*?preserveDrawingBuffer: keepDrawingBuffer \}\);/gm,
    line => line + `
window.__loadingShaderStats = () => {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    resident: renderer.info.programs.length,
    hardware: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    programs: renderer.info.programs.map(program => ({
      id: program.id, name: program.name, key: program.cacheKey, usedTimes: program.usedTimes,
      traceId: window.__loadingShaderTrace?.programId(program.program) ?? null,
    })),
  };
};
if (window.__loadingShaderTrace) {
  const trace = window.__loadingShaderTrace;
  const compile = renderer.compileAsync.bind(renderer);
  trace.mark('renderer-created');
  let sequence = 0;
  renderer.compileAsync = (...parameters) => {
    const target = renderer.getRenderTarget();
    const detail = { sequence: ++sequence, target: target ? [target.width, target.height] : null,
      override: parameters[0].overrideMaterial?.type ?? null };
    trace.mark('compileAsync:start', detail);
    return compile(...parameters).then(result => {
      trace.mark('compileAsync:ready', detail);
      return result;
    });
  };
}`, 'renderer construction');
  source = replaceOnce(source, /^ {2}const elapsed = stamp - lastRender;$/gm,
    "  const elapsed = window.__loadingParity?.advance(phase, place?.id) ?? stamp - lastRender;", 'render frame timing');
  source = replaceOnce(source, /^ {2}if \(sampleFrames < 180 &&/gm,
    '  if (!window.__loadingParity && sampleFrames < 180 &&', 'automatic quality assessment');
  source = replaceOnce(source, /^ {2}wind \*= Math\.exp\(-dt \* 2\.8\); clockTime \+= dt>0\?Math\.max\(0,elapsed\/1000\):0; const time = clockTime;$/gm,
    line => line.replace('const time = clockTime;', 'const time = window.__loadingParity?.visualTime(phase) ?? clockTime;'),
    'animation clock');
  source = replaceOnce(source, /^ {2}const walk = tween\(P\.walkSeconds \?\? 14, \(k\) => \{$/gm,
    line => line + `
    window.__loadingParity?.walk(k * (P.walkSeconds ?? 14));
    window.__loadingFrameObservations?.walk(k * (P.walkSeconds ?? 14));`, 'real walk tween');
  source = replaceOnce(source, /^ {2}const mark = \(state, progress, evidence\) => \{$/gm,
    line => line + `
    window.__loadingParity?.ignition(state, progress);
    window.__loadingFrameObservations?.ignition(state);`, 'real ignition state');
  source = replaceOnce(source, /^ {4}if \(mine\.parts\?\.pineWax\) level = THREE\.MathUtils\.clamp\(waxFuel\?\.\(\) \?\? targetLevel, 0, 1\);$/gm,
    '    if (mine.parts?.pineWax) level = THREE.MathUtils.clamp(window.__loadingParity?.waxFuel ?? waxFuel?.() ?? targetLevel, 0, 1);',
    'wick fuel clock');
  source = replaceOnce(source, /^ {2}composer\.render\(\);(?=\r?\n\})/gm,
    line => line + `
  window.__loadingFrameObservations?.draw(phase, place?.id, stamp);
  window.__loadingParity?.afterDraw({
    renderer, camera, phase, place: place?.id, quality,
    lighting: place?.baked?.lightingState(), clock: window.__loadingParity.visualTime(phase),
  });`,
    'main composer draw');
  return source;
}

if (command === 'check-source') {
  const instrumented = instrumentScene(await readFile(join(checkout, 'web/src/engine/scene.js'), 'utf8'));
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: instrumented });
  console.log('LOADING_SOURCE_ANCHORS', sourceRev);
} else if (command === 'build') {
  const shared = '/Users/xuan/OpenBot/Shared/one-light';
  assert(checkout.startsWith(shared + '/tmp/s1/'), 'Build only an owned detached verification checkout.');
  const owner = (await readFile(join(shared, 'gpu.lock/owner'), 'utf8')).trim();
  assert.equal(owner, 's1', 'Acquire the S1 GPU lease before a build.');
  process.chdir(checkout);
  process.env.VITE_E2E_HOOKS = mode === 'parity' ? '1' : '0';
  process.env.ONE_LIGHT_VITE_CACHE = join(checkout, '.loading-vite-cache');
  await build({
    configFile: join(checkout, 'web/vite.config.ts'),
    mode: 'production',
    plugins: [{
      name: 'local-loading-shader-fixture',
      enforce: 'pre',
      transform(code, id) {
        if (id === join(checkout, 'web/src/engine/scene.js')) return instrumentScene(code);
      },
    }],
  });
  execFileSync(process.execPath, ['scripts/compress.mjs'], { stdio: 'inherit' });
  await writeFile(join(checkout, 'web/dist/__loading-fixture-build.json'), JSON.stringify(buildReceipt));
  console.log('LOADING_BUILT', JSON.stringify(buildReceipt));
} else {
  await run();
}

function installWallClock({ wallTime, seed }) {
  const ActualDate = Date;
  const pinned = new ActualDate(wallTime);
  for (const name of ['getHours', 'getMinutes', 'getSeconds', 'getMilliseconds']) {
    const value = pinned[name]();
    if (typeof value === 'number') ActualDate.prototype[name] = () => value;
  }
  const drawRows = {};
  const clicks = {};
  let walkTime = 0, ignitionStage = '';
  window.__loadingFrameObservations = {
    click(name) { clicks[name] = performance.now(); },
    walk(seconds) { walkTime = seconds; },
    ignition(state) { ignitionStage = state; },
    get settled() { return ignitionStage === 'settled'; },
    draw(phase, place, stamp) {
      const key = phase + ':' + place;
      const frames = drawRows[key] ??= [];
      if (frames.length === 0) window.__loadingShaderTrace?.mark('first-draw:' + key);
      if (frames.length < 120) frames.push({ stamp, presentedAt: performance.now(), walkTime, ignitionStage });
    },
    report() { return { drawRows, clicks }; },
  };
  if (seed === null) return;
  let state = seed;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  let current = '', ordinal = 0, walkSeconds = 0, settleFrame = 0, ignitionState = '';
  let waiting = null;
  const animationStep = 1000 / 60;
  window.__loadingParity = {
    waxFuel: 1,
    advance(phase, place) {
      const key = phase + ':' + place;
      if (key !== current) { current = key; ordinal = 0; }
      ordinal++;
      if (phase === 'wish' || phase === 'place') return 0;
      if (phase === 'candle' && ordinal > 100) return 0;
      if (phase === 'burning' && ignitionState === 'settled') {
        if (settleFrame >= 12) return 0;
        settleFrame++;
      }
      return animationStep;
    },
    visualTime(phase) {
      return phase === 'wish' || phase === 'place' ? 1
        : phase === 'travel' ? walkSeconds : phase === 'candle' ? 37
          : ignitionState !== 'settled' ? 37 + ordinal / 60 : 60 + settleFrame / 60;
    },
    walk(seconds) { walkSeconds = seconds; },
    ignition(state) { ignitionState = state; },
    get chooserReady() { return current.startsWith('candle:') && ordinal >= 100; },
    request(stage, place) {
      if (waiting) throw Error('One fixture draw may be pending.');
      return new Promise(resolve => { waiting = { stage, place, resolve }; });
    },
    afterDraw({ renderer, camera, phase, place, quality, lighting, clock }) {
      if (!waiting || waiting.place !== place) return;
      const { stage } = waiting;
      const ui = document.querySelector('.ui');
      const fade = document.querySelector('#fade');
      const fadeGone = fade && Number(getComputedStyle(fade).opacity) < .001;
      if (stage === 'cover-first-visible' && (phase !== 'wish' || !fadeGone)) return;
      if (stage === 'place-first-visible' && (phase !== 'place' || !fadeGone
        || !ui?.querySelector('.place-actions .primary:enabled'))) return;
      if (stage === 'walk-28s' && (phase !== 'travel' || walkSeconds < 28 - 1e-8 || walkSeconds > 28.02)) return;
      if (stage === 'burning-settled' && (phase !== 'burning' || ignitionState !== 'settled'
        || settleFrame !== 12 || !ui?.querySelector('[data-testid="with-you"]'))) return;
      const gl = renderer.getContext();
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const row = width * 4;
      const pixels = new Uint8Array(row * height);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const topDown = new Uint8Array(pixels.length);
      for (let y = 0; y < height; y++) topDown.set(pixels.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
      const chunks = [];
      for (let i = 0; i < topDown.length; i += 16384) chunks.push(String.fromCharCode(...topDown.subarray(i, i + 16384)));
      const frame = { phase, ordinal: stage === 'walk-28s' ? 1680 : stage === 'burning-settled' ? 12 : 0,
        cameraWorld: camera.matrixWorld.toArray(), cameraProjection: camera.projectionMatrix.toArray(),
        drawingBuffer: [width, height], clock, walkSeconds, lighting };
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      const hardware = gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      waiting.resolve({ rgba: btoa(chunks.join('')), frame, quality, renderer: hardware });
      waiting = null;
    },
  };
}

async function run() {
  assert(args.values.url && args.values.root && side);
  assert(['before', 'before-repeat', 'after'].includes(side));
  if (side !== 'after') assert.equal(sourceRev, fixture.baseline);
  const shared = '/Users/xuan/OpenBot/Shared/one-light';
  const lock = join(shared, 'gpu.lock');
  const leaseOwner = await readFile(join(lock, 'owner'), 'utf8');
  assert.equal(leaseOwner.trim(), 's1', 'Acquire the S1 GPU lease before a capture.');
  const origin = new URL(args.values.url);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  assert(Number(origin.port) >= 8950 && Number(origin.port) <= 8999);
  const response = await fetch(new URL('/__loading-fixture-build.json', origin));
  assert.equal(response.status, 200, 'The private server must serve this fixture build.');
  assert.deepEqual(await response.json(), buildReceipt, 'The HTTP app is from a different checkout or fixture mode.');
  const root = resolve(args.values.root);
  await mkdir(root, { recursive: true });
  if (mode === 'parity') {
    const file = join(root, 'run.json');
    const run = JSON.parse(await readFile(file, 'utf8').catch(error => {
      if (error.code !== 'ENOENT' || side !== 'before') throw error;
      return '{"schemaVersion":1}';
    }));
    const key = side === 'after' ? 'candidate' : 'baseline';
    const value = { sourceRev, sourceSha256 };
    if (run[key]) assert.deepEqual(run[key], value);
    else run[key] = value;
    await writeFile(file, JSON.stringify(run, null, 2) + '\n');
  }
  const caseKey = item => [item.place, item.viewport, item.hour].join('/');
  const cases = fixture.cases.filter(item => (!args.values.match || caseKey(item).includes(args.values.match))
    && caseKey(item) !== args.values.exclude);
  assert(cases.length, 'The case filter matched no fixture cells.');
  // A single baseline case is the determinism pilot. Run its repeat in an independent Chrome.
  const pilot = mode === 'parity' && side === 'before' && args.values.match && cases.length === 1;
  for (const captureSide of pilot ? ['before', 'before-repeat'] : [side]) {
    const report = [];
    const filter = [args.values.match, args.values.exclude].filter(Boolean).join(':');
    const name = [mode, captureSide, ...(filter ? [hash(filter).slice(0, 8)] : [])].join('-') + '.json';
    for (const item of cases) {
      const browser = await chromium.launch({ channel: 'chrome' });
      try {
        const row = await captureCase(browser, origin, item, root, captureSide);
        report.push(row);
        console.log('LOADING_SHADER_CASE', captureSide, caseKey(item), row.stepInsideMs ?? '', row.atReady?.resident ?? '', row.errors.length);
        await writeFile(join(root, name), JSON.stringify(report, null, 2) + '\n');
        assert.equal(row.errors.length, 0, 'Runtime or HTTP errors were recorded.');
      } finally { await browser.close(); }
    }
  }
  if (mode === 'parity' && args.values.match && cases.length === 1 && (pilot || side === 'before-repeat')) {
    execFileSync(process.execPath, [new URL('./loading-shaders-pixel-diff.mjs', import.meta.url).pathname,
      root, '--baseline-only', '--match=' + caseKey(cases[0])], { stdio: 'inherit' });
  }
}

async function captureCase(browser, origin, item, root, captureSide) {
  const [width, height] = fixture.dimensions[item.viewport];
  const phone = item.viewport === 'phone';
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, locale: item.locale === 'zh' ? 'zh-CN' : 'en-US',
    timezoneId: fixture.timezone, ...(phone ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const errors = [];
  const row = { key: [item.place, item.viewport, item.hour].join('/'), sourceRev, sourceSha256,
    manifestSha256: item.manifestSha256, errors };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', result => { if (result.status() >= 400) errors.push('HTTP ' + result.status() + ' ' + result.url()); });
  if (mode === 'trace') await context.addInitScript(installLoadingShaderProgramTrace);
  await context.addInitScript(installWallClock, { wallTime: item.wallTime, seed: mode === 'parity' ? 9031 : null });
  const manifestRoute = '/places/' + item.place + '/manifest.json';
  const servedManifests = [];
  page.on('response', result => {
    const url = new URL(result.url());
    if (url.origin === origin.origin && url.pathname === manifestRoute && result.ok()) {
      servedManifests.push(result.body().then(hash));
    }
  });
  const verifyServed = async () => {
    assert(servedManifests.length, 'The visitor page did not consume the pinned manifest.');
    const receipts = new Set(await Promise.all(servedManifests));
    assert.deepEqual([...receipts], [item.manifestSha256]);
    row.browserManifestSha256 = item.manifestSha256;
  };
  try {
    let releaseManifest;
    const manifestGate = new Promise(resolve => { releaseManifest = resolve; });
    if (item.role === 'visitor-choice') {
      await page.route(url => url.pathname === manifestRoute, async route => {
        await manifestGate;
        await route.continue();
      });
    }
    await page.goto(origin.href);
    const readStats = async name => page.evaluate(label => {
      const stats = window.__loadingShaderStats();
      window.__loadingShaderTrace?.mark(label, { resident: stats.resident });
      return stats;
    }, name);
    const view = async stage => {
      if (mode !== 'parity') return;
      const draw = await page.evaluate(async ({ stage, place }) => Promise.race([
        window.__loadingParity.request(stage, place),
        new Promise((_, reject) => setTimeout(() => reject(Error('No matching draw for ' + stage)), 90_000)),
      ]), { stage, place: item.place });
      assert.deepEqual(draw.frame.drawingBuffer, [width, height]);
      assert(!/swiftshader|software|llvmpipe/i.test(draw.renderer), 'Use real hardware rendering.');
      const rgba = Buffer.from(draw.rgba, 'base64');
      const dir = join(root, item.place, item.viewport, String(item.hour).padStart(2, '0') + '-00', stage);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, captureSide + '.rgba'), rgba, { flag: 'wx' });
      const receipt = { schemaVersion: 1, side: captureSide, placeId: item.place,
        viewport: { width, height, deviceScaleFactor: 1 }, hour: item.hour, stage, wallTime: item.wallTime,
        sourceRev, sourceSha256, manifestSha256: item.manifestSha256, rgbaSha256: hash(rgba),
        frame: draw.frame, renderer: draw.renderer, quality: draw.quality };
      await writeFile(join(dir, captureSide + '.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    };
    const translation = item.locale === 'zh';
    const wish = page.getByRole('textbox').first();
    if (item.role === 'cover-control') {
      await page.waitForFunction(() => window.__loadingShaderStats &&
        (document.getElementById('cover-poster')?.dataset.ready === 'true'
          || !document.getElementById('cover-poster')
            && getComputedStyle(document.querySelector('#fade')).opacity === '0'));
      await verifyServed();
      await view('cover-first-visible');
      row.atReady = await readStats('cover-visible');
      row.trace = mode === 'trace' ? await page.evaluate(() => window.__loadingShaderTrace.snapshot()) : undefined;
      return row;
    }
    const start = performance.now();
    await wish.fill(translation ? '愿山路平安' : 'May the journey be safe.');
    await page.getByRole('button', { name: translation ? '许好了' : 'Set my wish' }).click();
    if (item.place === 'pine-gate') {
      await page.getByRole('radio', { name: translation ? /松门石阶/ : /Pine Gate Steps/ }).click();
    }
    releaseManifest();
    const enter = page.getByRole('button', { name: translation ? /走进院里/ : 'Step inside' });
    await expect(enter).toBeEnabled({ timeout: 90_000 });
    row.stepInsideMs = performance.now() - start;
    await verifyServed();
    await view('place-first-visible');
    row.atReady = await readStats('court-ready');
    if (args.values['ready-only']) {
      if (mode === 'trace') row.trace = await page.evaluate(() => window.__loadingShaderTrace.snapshot());
      return row;
    }
    await page.evaluate(() => window.__loadingShaderTrace?.mark('step-inside-click'));
    await enter.evaluate(button => button.addEventListener('click',
      () => window.__loadingFrameObservations.click('step-inside'), { once: true, capture: true }));
    await enter.click();
    await view('walk-28s');
    const choose = page.locator('.ui[data-screen="candle"]');
    await choose.waitFor({ timeout: 90_000 });
    if (mode === 'parity') await page.waitForFunction(() => window.__loadingParity.chooserReady);
    row.atChooser = await readStats('first-chooser');
    await page.getByRole('radio', { name: translation ? '10 分钟' : '10 min' })
      .first().click();
    const lightIt = page.locator('.candle-actions .primary');
    await expect(lightIt).toBeEnabled();
    await lightIt.evaluate(button => button.addEventListener('click',
      () => window.__loadingFrameObservations.click('light'), { once: true, capture: true }));
    await lightIt.click();
    await expect(page.getByTestId('with-you')).toBeVisible({ timeout: 90_000 });
    await view('burning-settled');
    if (mode !== 'parity') await page.waitForFunction(() => window.__loadingFrameObservations.settled);
    row.atBurning = await readStats('burning-visible');
    row.frameTiming = await page.evaluate(() => window.__loadingFrameObservations.report());
    if (mode === 'trace') row.trace = await page.evaluate(() => window.__loadingShaderTrace.snapshot());
  } catch (error) {
    errors.push(error.stack ?? String(error));
  } finally { await context.close(); }
  return row;
}
