import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import site from '../../shared/snow-roof-court-site.json' with { type: 'json' };
import { readSnowCourtWalkLightmaps } from '../../web/src/engine/baked/snowCourtManifest.js';
import { assertCaptureGpuHealthy, installCaptureGpuGuard } from './capture-preflight.mjs';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { instrumentPineScene } from './pine-gate-scene-audit.mjs';

const placeId = 'snow-roof';
const packagePath = '/places/snow-roof/';
const viewport = { width: 1440, height: 900 };
const regions = ['altar', 'court', 'gate', 'hall'];
const passes = ['day', 'dusk', 'night', 'lamp'];
const p2 = process.argv.includes('--p2');
const milestone = p2 ? 'P2' : 'P1';
const contexts = [{ hour: 13, look: 'day', walk: true }, { hour: 22, look: 'night', walk: p2 }];
const walkFrame = (look, name) => p2 ? `${look}-${name}` : name;
const expectedFrames = p2 ? contexts.flatMap(({ look }) => [
  `${look}-entrance`, ...site.keyFrames.map(({ name }) => walkFrame(look, name)), `${look}-burning`,
]) : [...site.keyFrames.map(frame => frame.name), 'day-burning', 'night-burning'];
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const isDigest = value => /^[a-f0-9]{64}$/.test(value);
const worktree = fileURLToPath(new URL('../../', import.meta.url));
const worktreePath = await realpath(worktree);
const locker = join(worktreePath, '../gpu.lock');

if (process.argv.includes('--help')) {
  console.log('BASE_URL=http://127.0.0.1:8965 DB_FILE=<private SQLite file under TMPDIR> OUTPUT=<new absolute directory> CAPTURE_PREVIEW_DIR=<staged LOW8 directory> CAPTURE_PREVIEW_SHA256=<manifest SHA-256> node tests/visual/snow-p1-capture.mjs [--p2]');
  console.log('Use --p2 for an entrance, full thirty-second walk and settled burning at both 13:00 and 22:00.');
  console.log('Acquire the GPU lease as s1 before running. The local API and Vite must already be running.');
  process.exit(0);
}
assert.deepEqual(process.argv.slice(2), p2 ? ['--p2'] : [], 'Use --help or --p2.');

function required(name) {
  const value = process.env[name];
  assert(value, `Set ${name} explicitly.`);
  return value;
}

function absolute(name) {
  const value = required(name);
  assert(isAbsolute(value), `${name} must be an absolute path.`);
  return value;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith('../');
}

const base = new URL(required('BASE_URL'));
assert(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)
  && Number(base.port) >= 8950 && Number(base.port) <= 8999 && base.pathname === '/'
  && !base.username && !base.password && !base.search && !base.hash, 'Use a private loopback capture server on ports 8950–8999.');
const scratch = await realpath(tmpdir());
const databasePath = await realpath(absolute('DB_FILE'));
assert(inside(scratch, databasePath) && (await stat(databasePath)).isFile(), 'DB_FILE must be a private local SQLite file under TMPDIR.');
const output = absolute('OUTPUT');
const candidate = await realpath(absolute('CAPTURE_PREVIEW_DIR'));
assert(inside(join(worktreePath, 'art/build'), candidate) || inside(scratch, candidate),
  'The isolated preview must live under this worktree’s ignored art/build or the private TMPDIR.');
const expectedSha = required('CAPTURE_PREVIEW_SHA256');
assert(isDigest(expectedSha), 'Invalid CAPTURE_PREVIEW_SHA256.');

async function leaseIdentity() {
  const lock = await lstat(locker);
  assert(lock.isDirectory() && (await readFile(join(locker, 'owner'), 'utf8')).trim() === 's1',
    'Acquire the exclusive Snow Roof capture GPU lease as s1.');
  return `${lock.dev}:${lock.ino}`;
}

const captureLease = await leaseIdentity();
const verifyLease = async () => assert.equal(await leaseIdentity(), captureLease, 'The GPU lease changed during capture.');
const manifestUri = new URL(`${packagePath}manifest.json`, base);

async function ordinaryManifest() {
  const response = await fetch(manifestUri, { cache: 'no-store' });
  assert(response.ok, `The ordinary local Snow Roof manifest returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.place, placeId);
  assert.equal(manifest.bake?.samples, 64);
  assert(!manifest.partialPreview, 'The ordinary local Snow Roof must retain its final package.');
  return sha(bytes);
}

async function localAsset(name) {
  assert(/^[a-z0-9][a-z0-9._-]*$/.test(name), `Invalid candidate asset path ${name}.`);
  const path = join(candidate, name);
  assert((await lstat(path)).isFile(), `Expected a regular local file at ${path}.`);
  return readFile(path);
}

const manifestBytes = await localAsset('manifest.json');
assert.equal(sha(manifestBytes), expectedSha, 'The staged manifest SHA-256 differs from the expected input.');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.place, placeId);
assert.equal(manifest.snowCourt?.revision, site.revision, 'The staged manifest is missing the rebuilt Snow Roof revision.');
assert.equal(manifest.partialPreview, true);
assert.equal(manifest.bake?.samples, 8);
assert(isDigest(manifest.bakeFingerprint) && isDigest(manifest.bake.sourceBlendSha256),
  'Expected authored and baked source SHA-256 receipts.');
assert.deepEqual(Object.keys(manifest.lightmaps).sort(), regions);

const files = new Map(manifest.files.map(file => [file.uri, file]));
assert.equal(files.size, manifest.files.length, 'Duplicate candidate URI.');
assert(!files.has('manifest.json') && files.has(manifest.scene), 'Missing scene or duplicate candidate manifest.');
const maps = {};
for (const region of regions) for (const pass of passes) {
  const map = manifest.lightmaps[region][pass];
  assert(map?.samples === 8 && map.bakeDevice === 'METAL' && map.denoiseDevice === 'METAL',
    `Expected a real eight-sample Metal bake and Metal denoise for ${region}/${pass}.`);
  assert(map.bakeFingerprint === manifest.bakeFingerprint && isDigest(map.masterSha256),
    `Source or master receipt mismatch for ${region}/${pass}.`);
  assert.equal(files.get(map.uri)?.bytes, map.bytes, `Missing declared ${region}/${pass} payload.`);
  maps[`${region}/${pass}`] = { uri: map.uri, bytes: map.bytes, samples: map.samples,
    bakeDevice: map.bakeDevice, denoiseDevice: map.denoiseDevice, masterSha256: map.masterSha256 };
}
assert.equal(new Set(Object.values(maps).map(map => map.uri)).size, 16, 'Expected all 16 distinct lightmaps.');
const walkMaps = readSnowCourtWalkLightmaps(manifest);
const walkMapUris = Object.values(walkMaps ?? {}).flatMap(row => Object.values(row).map(({ full }) => full.uri));
const softMapUris = Object.values(walkMaps ?? {}).flatMap(row => Object.values(row).map(({ soft }) => soft.uri));

function backdropUris(tier, extensions) {
  assert(tier?.encoding === 'log2-8-8' && isDigest(tier.encodedReceiptSha256),
    'Each backdrop needs verified encoded Cycles plates.');
  assert(Number.isSafeInteger(tier.width) && tier.width > 0
    && Number.isSafeInteger(tier.height) && tier.height > 0, 'Invalid backdrop dimensions.');
  assert.deepEqual(Object.keys(tier.layers).sort(), ['cloud', 'far', 'mid']);
  const names = Object.values(tier.layers);
  assert(names.every(uri => extensions.some(extension => uri.endsWith(extension)) && files.has(uri)),
    'Missing or invalid declared backdrop image.');
  return names;
}

const backdrop = manifest.backdrop;
assert.equal(backdrop?.siteSha256, sha(await readFile(join(worktreePath, 'shared/snow-roof-court-site.json'))),
  'The staged backdrop belongs to a different site configuration.');
assert.equal(backdrop?.projectionSha256, sha(await readFile(join(worktreePath, 'shared/snow-court-backdrop.json'))),
  'The staged backdrop belongs to a different projection.');
const plateUris = {
  base: backdropUris(backdrop, ['.webp']),
  night: backdropUris(backdrop?.night, ['.webp']),
  ...(backdrop?.walk ? { walk: backdropUris(backdrop.walk, ['.ktx2']) } : {}),
  ...(backdrop?.high ? { high: backdropUris(backdrop.high, ['.webp', '.ktx2']) } : {}),
};
assert.equal(new Set(Object.values(plateUris).flat()).size, Object.values(plateUris).flat().length,
  'Each backdrop tier must declare separate verified images.');
const assets = new Map([['manifest.json', { body: manifestBytes, contentType: 'application/json' }]]);
for (const [name, file] of files) {
  const body = await localAsset(name);
  assert(body.length > 0 && body.length === file.bytes && sha(body) === file.sha256, `Candidate asset changed: ${name}.`);
  const contentType = name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream';
  assets.set(name, { body, contentType, version: file.sha256 });
}

const sourceStart = await fingerprintCaptureSource(worktreePath);
const installedUri = 'web/public/places/snow-roof/manifest.json';
const installedSha = sourceStart.files.find(file => file.path === installedUri)?.sha256;
assert.equal(await ordinaryManifest(), installedSha, 'Vite is serving a different Snow Roof install from the stated worktree.');
const revision = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath, encoding: 'utf8' }).trim();
const report = {
  ...(p2 ? { milestone } : {}),
  base: base.href, sourceRev: revision(), sourceSha256: sourceStart.aggregateSha256,
  preview: { directory: candidate, revision: manifest.snowCourt.revision, manifestSha256: expectedSha,
    authoringBlendSha256: manifest.bake.sourceBlendSha256, bakeFingerprint: manifest.bakeFingerprint, maps, plateUris,
    ...(walkMaps ? { walkLightmaps: walkMaps } : {}),
    budget: manifest.budget, totalCandidateBytes: [...assets.values()].reduce((total, asset) => total + asset.body.length, 0) },
  ordinaryManifestSha256: installedSha, viewport, captures: [], contexts: [], errors: [], httpErrors: [], viteUpdates: [],
  readinessMisses: [],
};
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
const reportPath = join(output, 'report.json');
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
await save();

function instrument(source) {
  let transformed = instrumentPineScene(source, { walkClock: true, directionCamera: true, lighting: true });
  const steps = [
    [/const light\s*=\s*daylight\(\),\s*lightKey\s*=\s*JSON\.stringify\(light\);/g, 'scene-build', true],
    [/await P\.build\(t,\s*context\);/g, 'assets-ready'],
    [/if\s*\(context\.baked\?\.staticLampShadow\)\s*await context\.baked\.staticLampShadow\.capture\(renderer,\s*context\.baked\.group\);/g, 'static-shadow-ready'],
    [/await renderer\.compileAsync\(stage,\s*stageCamera\);(?=\s*if\s*\(P\.bakedLighting)/g, 'first-compile-ready'],
    [/renderer\.setRenderTarget\(warm\);\s*renderer\.render\(stage,\s*stageCamera\);/g, 'warm-render-ready'],
    [/cachedPlaces\.set\(t\.id,\s*candidate\);/g, 'preview-ready', true],
  ];
  for (const [pattern, label, before] of steps) {
    assert.equal([...transformed.matchAll(pattern)].length, 1, 'Snow Court timing hook no longer matches: ' + label);
    const call = `if(t.id === 'snow-roof') performance.mark('snow-p1:${label}');`;
    transformed = transformed.replace(pattern, statement => before ? `${call}\n  ${statement}` : `${statement}\n  ${call}`);
  }
  const frame = /^([ \t]*)function frame\(stamp\s*=\s*performance\.now\(\)\)\s*\{/gm;
  assert.equal([...transformed.matchAll(frame)].length, 1, 'The Snow Roof scene identity hook no longer matches the app.');
  return transformed.replace(frame, match => `window.__snowP1Capture = () => ({
  revision: place?.baked?.manifest?.snowCourt?.revision ?? null,
  lights: window.__pineCaptureLighting(),
  camera: window.__pineCaptureCamera(),
  walk: window.__walkProgress ?? null,
  clock: window.__pineCaptureWalkClock ?? null,
  ignition: window.__visualIgnition ?? null,
  backdropVisible: place?.baked?.backdrop?.group?.visible ?? null,
  backdrop: place?.baked?.backdrop?.group?.children.map(layer => ({
    name: layer.name,
    width: layer.material.uniforms.uPlate.value.image.width,
    upgradeMix: layer.material.uniforms.uUpgradeMix.value,
    nightMix: layer.material.uniforms.uNightMix.value,
    ${p2 ? `nightWidth: layer.material.uniforms.uNightPlate.value.image.width,
    nightWeight: layer.material.uniforms.uNightWeight.value,
    nightResident: layer.material.uniforms.uNightPlate.value !== layer.material.uniforms.uPlate.value,` : ''}
  })) ?? null,
  screen: document.querySelector('.ui')?.dataset.screen ?? null,
  hour: new Date().getHours(),
});
${match}`);
}

function storedCandle(id) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT place_id AS placeId, duration_ms AS durationMs, status, shape FROM candles WHERE id = ?').get(id);
  } finally {
    db.close();
  }
}

function checkEntrance(state) {
  const { position, look, fov } = site.walk[0];
  const forward = look.map((component, axis) => component - position[axis]);
  const length = Math.hypot(...forward);
  assert.equal(state.screen, 'place', 'Capture the view from the actual place screen.');
  assert.equal(state.camera.phase, 'place', 'The renderer has not reached the product’s place phase.');
  assert(Math.hypot(...state.camera.position.map((component, axis) => component - position[axis])) < .01
    && Math.hypot(...state.camera.direction.map((component, axis) => component - forward[axis] / length)) < .01
    && Math.abs(state.camera.fov - fov) < .01, 'The place camera differs from the authored entrance.');
  assert(state.backdrop?.length === 3 && state.backdrop.every(layer => !layer.nightResident && layer.nightMix === 0),
    'Night plates must remain deferred on the place screen.');
}

async function captureContext(browser, { hour, look, walk }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.setDefaultTimeout(50_000);
  const result = { hour, look, requested: [], captures: [] };
  report.contexts.push(result);
  let entered = false;
  const error = (kind, value) => report.errors.push({ hour, kind, text: String(value?.stack ?? value) });
  const served = new Set();
  const button = name => page.getByRole('button', { name });
  const state = () => page.evaluate(() => window.__snowP1Capture());

  async function screenshot(name, time = null, entrance = false) {
    await verifyLease();
    await assertCaptureGpuHealthy(page);
    const before = await state();
    assert.equal(before.revision, site.revision, 'The app is not rendering the rebuilt Snow Roof.');
    assert.equal(before.hour, hour);
    assert.equal(before.lights?.placeId, placeId);
    assert.equal(before.lights.agx, true, 'Expected the product’s native AgX view.');
    assert(before.lights.loadedPasses.includes(look) && before.lights.loadedPasses.includes('lamp'),
      `Expected the active ${look} and lamp banks.`);
    assert(before.lights.weights[look === 'day' ? 2 : 0] > .5, `The ${look} bank is not dominant.`);
    assert(before.camera.position.every(Number.isFinite) && before.camera.direction.every(Number.isFinite)
      && Number.isFinite(before.camera.fov) && !before.camera.overview, 'Expected the current product camera.');
    if (entrance) {
      assert(p2 && !entered, 'Capture the P2 entrance before clicking Step inside.');
      checkEntrance(before);
      if (walkMaps) {
        assert.deepEqual(before.lights.walkLightmaps?.native, [], 'Initial entry must use the soft interior lightmaps.');
        for (const row of Object.values(walkMaps)) {
          for (const pass of [look, 'lamp']) assert(served.has(row[pass].soft.uri), 'The app has no verified soft interior pass.');
        }
      }
    } else if (time !== null) {
      assert(before.walk?.id === placeId && before.walk.state === 'walking' && before.clock?.id === placeId
        && before.clock.durationSeconds === site.walkSeconds, 'Expected the native thirty-second authored walk.');
      assert(before.clock.seconds >= time && before.clock.seconds <= time + .6, `Missed the ${time}s authored walk moment.`);
      if (time === 28) {
        const [x, , z] = before.camera.position;
        assert(z > site.hall.front && z < site.gate.center[2] - site.gate.depth / 2 && x > site.court.west && x < site.court.east,
          'The reveal camera must be in the open court between the gate and hall.');
        if (p2 && look === 'night') {
          assert(plateUris.night.every(uri => served.has(uri)), 'Expected all declared night plates by the 28s reveal.');
          assert(before.backdrop?.length === 3 && before.backdrop.every(layer =>
            layer.nightResident && layer.nightMix === 1 && layer.nightWeight === 1 && layer.nightWidth === backdrop.night.width),
          'The independent night plates must be fully visible at the authored 28s reveal.');
        }
        if (p2 && walkMaps) {
          assert(walkMapUris.every(uri => served.has(uri)), 'Expected the declared interior banks by the 28s reveal.');
          for (const pass of [look, 'lamp']) {
            assert(before.lights.walkLightmaps?.native.includes(pass), 'The app is still using a soft interior lightmap at the reveal.');
          }
        }
      }
    } else {
      assert.equal(before.screen, 'burning');
      assert.equal(before.ignition?.state, 'settled');
    }
    if (time === 28 || time === null) assert.equal(before.backdropVisible, true, 'The authored layered landscape is not active.');
    const file = `${name}.png`;
    const bytes = await page.screenshot({ path: join(output, file), scale: 'css',
      ...(entrance ? {} : { style: '.ui { visibility: hidden !important; }' }) });
    assert(bytes.subarray(0, 8).equals(pngSignature) && bytes.toString('ascii', 12, 16) === 'IHDR');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [viewport.width, viewport.height]);
    const after = await state();
    if (entrance) checkEntrance(after);
    if (time !== null) {
      assert(after.clock?.id === placeId && after.clock.seconds >= before.clock.seconds && after.clock.seconds <= time + .9,
        `The screenshot crossed the ${time}s walk moment.`);
    }
    report.captures.push({ name, file, sha256: sha(bytes), hour, targetWalkSeconds: time, before, after });
    result.captures.push(name);
    console.log(`SNOW_${milestone}_FRAME`, name, file, time === null ? `hour=${hour}` : `seconds=${before.clock.seconds.toFixed(3)}`);
    await save();
  }

  try {
    await context.addInitScript(installCaptureGpuGuard);
    await context.addInitScript(hour => {
      Date.prototype.getHours = () => hour;
      Date.prototype.getMinutes = () => 0;
    }, hour);
    page.on('pageerror', value => error('runtime', value));
    page.on('console', message => { if (message.type() === 'error') error('console', message.text()); });
    page.on('crash', () => error('crash', 'The app page crashed.'));
    page.on('response', response => {
      if (response.status() >= 400) report.httpErrors.push({ hour, status: response.status(), url: response.url() });
    });
    page.on('websocket', socket => {
      if (new URL(socket.url()).host !== base.host) return;
      socket.on('framereceived', ({ payload }) => {
        let frame;
        try { frame = JSON.parse(payload.toString()); } catch { return; }
        if (['update', 'full-reload', 'prune'].includes(frame.type)) report.viteUpdates.push({ hour, frame });
      });
    });
    await page.route(url => url.origin === base.origin && url.pathname.startsWith(packagePath), async route => {
      const url = new URL(route.request().url());
      const name = url.pathname.slice(packagePath.length);
      const asset = assets.get(name);
      const version = url.searchParams.get('v');
      if (!asset || route.request().method() !== 'GET'
        || (name === 'manifest.json' ? url.search !== '' : version !== asset.version)) {
        error('asset-route', `Rejected undeclared or mismatched candidate request: ${url.pathname}.`);
        await route.abort('blockedbyclient');
        return;
      }
      result.requested.push({ name, afterEntry: entered });
      await route.fulfill({ status: 200, body: asset.body, contentType: asset.contentType, headers: { 'cache-control': 'no-store' } });
      served.add(name);
    });
    await page.route(url => url.origin === base.origin && url.pathname === '/src/engine/scene.js', async route => {
      try {
        const response = await route.fetch();
        assert(response.ok(), `Scene source returned HTTP ${response.status()}.`);
        const source = await response.text();
        const sourceSha256 = sha(source);
        report.servedSceneSha256 ??= sourceSha256;
        assert.equal(sourceSha256, report.servedSceneSha256, 'Vite served changed scene source.');
        await route.fulfill({ response, body: instrument(source) });
      } catch (value) {
        error('scene-route', value);
        await route.abort('failed');
      }
    });

    await page.goto(base.href);
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(() => document.fonts.ready);
    result.gpu = await page.evaluate(() => {
      const gl = window.__renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
    assert(typeof result.gpu === 'string' && !/SwiftShader|llvmpipe|Software Rasterizer/i.test(result.gpu),
      `Expected the actual GPU, received ${result.gpu}.`);
    await page.getByLabel('Your wish').fill('May light find the traveller on the snowy pass.');
    const start = performance.now();
    await button(/^Set my wish$/).click();
    const court = page.getByRole('radio', { name: /^Snow Roof Court(?: ·|$)/ });
    if (await court.count() && await court.getAttribute('aria-checked') !== 'true') await court.click();
    const enter = button(/^Step inside$/);
    try {
      await Promise.race([
        expect(enter).toBeEnabled({ timeout: 30_000 }),
        page.getByText('The court could not be prepared. Please try again.', { exact: true })
          .waitFor({ timeout: 30_000 }).then(() => { throw new Error('The app reported that the Snow Roof preview could not be prepared.'); }),
      ]);
    } finally {
      result.stepInsideMs = performance.now() - start;
      result.placeUi = (await page.locator('.ui').innerText()).slice(0, 350);
      result.preparation = await page.evaluate(() => performance.getEntriesByType('mark')
        .filter(mark => mark.name.startsWith('snow-p1:')).map(({ name, startTime }) => ({ name, startTime })));
    }
    if (result.stepInsideMs > 5000) report.readinessMisses.push({ hour, stepInsideMs: result.stepInsideMs });
    assert(served.has('manifest.json') && served.has(manifest.scene), 'The app did not request the verified candidate manifest and model.');
    if (p2) {
      await page.waitForFunction(position => {
        const state = window.__snowP1Capture?.();
        const fade = document.getElementById('fade');
        return state?.screen === 'place' && state.lights?.placeId === 'snow-roof'
          && state.camera.phase === 'place' && state.camera.position.every((value, axis) => Math.abs(value - position[axis]) < .01)
          && fade && Number(getComputedStyle(fade).opacity) === 0;
      }, site.walk[0].position);
      await screenshot(`${look}-entrance`, null, true);
    }
    const deferredPlates = [...plateUris.night, ...(plateUris.walk ?? []), ...(plateUris.high ?? []), ...walkMapUris];
    assert(!result.requested.some(({ name, afterEntry }) => !afterEntry && deferredPlates.includes(name)),
      'A deferred image was requested before entry.');
    if (walkMaps) assert(softMapUris.some(uri => served.has(uri)), 'No verified soft interior map arrived before entry.');
    const walkStarted = performance.now();
    entered = true;
    await enter.click();
    if (walk) {
      for (const { name, time } of site.keyFrames) {
        await page.waitForFunction(time => {
          const clock = window.__pineCaptureWalkClock;
          return clock?.id === 'snow-roof' && clock.seconds >= time && window.__walkProgress?.state === 'walking';
        }, time, { timeout: 35_000 });
        await screenshot(walkFrame(look, name), time);
      }
      await page.waitForFunction(() => window.__walkProgress?.id === 'snow-roof' && window.__walkProgress.state === 'done');
      result.walkMs = performance.now() - walkStarted;
      assert(result.walkMs >= 29_500, 'The authored walk finished substantially before thirty seconds.');
    } else {
      await button(/^Skip$/).click();
    }
    // The 30-second walk ends at the court reveal. The real app then takes
    // another 5.6 seconds to cross the court and stop at the choice table.
    await expect(page.locator('.ui')).toHaveAttribute('data-screen', 'candle', { timeout: walk ? 7000 : 5000 });
    await page.getByRole('radio', { name: 'Red gauze', exact: true }).click();
    await page.getByRole('radio', { name: '1 h', exact: true }).click();
    const [posted] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/candles'),
      button(/^Light it(?: ·|$)/).click(),
    ]);
    assert(posted.ok(), `Lighting returned HTTP ${posted.status()}.`);
    const candle = await posted.json();
    assert(candle.id && candle.placeId === placeId && candle.shape?.kind === 'shade' && candle.status === 'burning'
      && candle.durationMs === 3_600_000, 'The server did not start the one-hour Snow Roof gauze lamp.');
    const persisted = storedCandle(candle.id);
    assert(persisted?.placeId === placeId && persisted.status === 'burning' && persisted.durationMs === candle.durationMs,
      'The expected candle was not written to the explicitly isolated database.');
    assert.deepEqual(JSON.parse(persisted.shape), candle.shape);
    result.candle = { id: candle.id, shape: candle.shape, durationMs: candle.durationMs, status: candle.status };
    await expect(page.getByTestId('with-you')).toBeVisible();
    await page.waitForFunction(() => window.__visualIgnition?.state === 'settled' && window.__visualIgnition.progress === 1);
    if (look === 'night') {
      await page.waitForFunction(() => {
        const layers = window.__snowP1Capture?.().backdrop;
        return layers?.length === 3 && layers.every(layer => layer.nightMix === 1);
      });
    }
    const expectedPlates = look === 'night' ? [...plateUris.base, ...plateUris.night] : plateUris.base;
    assert(expectedPlates.every(uri => served.has(uri)), `The browser did not load the declared ${look} backdrop.`);
    await screenshot(`${look}-burning`);
    result.served = [...served];
    assert.deepEqual(report.errors.filter(row => row.hour === hour), [], 'Runtime errors during capture.');
    assert.deepEqual(report.httpErrors.filter(row => row.hour === hour), [], 'HTTP errors during capture.');
    assert.deepEqual(report.viteUpdates.filter(row => row.hour === hour), [], 'Vite reloaded during capture.');
  } catch (value) {
    error('capture', value);
    throw value;
  } finally {
    await context.close();
    await save();
  }
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  report.browser = browser.version();
  for (const review of contexts) await captureContext(browser, review);
  assert.deepEqual(report.captures.map(frame => frame.name), expectedFrames);
  assert.deepEqual(report.readinessMisses, [], 'Step inside must become enabled within five seconds.');
  assert.notEqual(report.contexts[0].candle.id, report.contexts[1].candle.id, 'Use two actual independent lamps.');
  assert.deepEqual(report.contexts[0].candle.shape, report.contexts[1].candle.shape, 'Use the same red gauze design in both views.');
} catch (value) {
  if (!report.errors.some(row => row.kind === 'capture')) report.errors.push({ kind: 'launcher', text: String(value?.stack ?? value) });
  process.exitCode = 1;
} finally {
  await browser?.close();
  try {
    await verifyLease();
    const sourceEnd = await fingerprintCaptureSource(worktreePath);
    report.sourceEndSha256 = sourceEnd.aggregateSha256;
    report.sourceUnchanged = report.sourceSha256 === report.sourceEndSha256 && report.sourceRev === revision();
    report.ordinaryManifestUnchanged = await ordinaryManifest() === installedSha;
    assert(report.sourceUnchanged && report.ordinaryManifestUnchanged, 'App source or installed Snow Roof changed during capture.');
  } catch (value) {
    report.errors.push({ kind: 'integrity', text: String(value?.stack ?? value) });
    process.exitCode = 1;
  }
  await save();
  console.log(`SNOW_${milestone}_RESULT`, JSON.stringify({ report: reportPath, frames: report.captures.length, sourceRev: report.sourceRev,
    manifestSha256: expectedSha, errors: report.errors.length, httpErrors: report.httpErrors.length, sourceReloads: report.viteUpdates.length }));
}
