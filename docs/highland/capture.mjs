// Run only with the s9 GPU lease. Uses the regular UI, looping only over the
// requested viewport/hour combinations. Each combination starts a clean visit.
/* global document, Image, window */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { Vector3 } from 'three';
import { HIGH_WHITE_TRAVEL_SECONDS, highWhiteCameras } from '../../web/src/engine/places/highland-camera.js';
import { startPreview } from './preview.mjs';
import { highWhiteTraceMetrics } from './camera-audit.mjs';

const TARGETS = [
  ...[20, 21, 22, 23, 24, 25].map(seconds => ({ name: `threshold-${seconds}s`, seconds })),
  { name: 'open-court-26s', seconds: 26 },
  { name: 'open-court-29s', seconds: 29 },
];
const views = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true },
];
const output = resolve(process.argv[2] ?? 'artifacts/highland/matched');
const requested = process.argv.slice(3);
const baseline = requested.includes('--baseline');
const paired = requested.includes('--paired');
const referenceArg = requested.find(value => value.startsWith('--match='));
const match = referenceArg ? resolve(referenceArg.slice('--match='.length)) : null;
assert.ok(!referenceArg || referenceArg.length > '--match='.length, 'Set --match to the baseline output directory.');
assert.ok(!baseline || !match, 'Use --match on the candidate, not the baseline.');
assert.ok(!paired || (!baseline && !match), 'Use --paired by itself to save before and after together.');
assert.ok(!match || match !== output, 'The baseline and candidate output directories must be different.');
const filters = requested.filter(value => value !== '--baseline' && value !== '--paired' && value !== referenceArg);
const combinations = views.flatMap(view => [13, 22].map(hour => ({ ...view, hour, key: `${view.name}-${hour}` })));
assert.ok(filters.every(key => combinations.some(view => view.key === key)), 'Use desktop-13, desktop-22, phone-13 or phone-22.');
const selected = filters.length ? combinations.filter(view => filters.includes(view.key)) : combinations;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const angle = (a, b) => Math.acos(clamp(a.reduce((sum, value, i) => sum + value * b[i], 0), -1, 1)) * 180 / Math.PI;
const pngBytes = png => Buffer.from(png.slice(png.indexOf(',') + 1), 'base64');
const withoutPng = ({ png: _, ...camera }) => camera;
const cameras = highWhiteCameras((...args) => new Vector3(...args));

function exactPose(view) {
  const walk = cameras.createWalk(null, null, view.touch);
  return seconds => {
    const rig = { pos: new Vector3(), look: new Vector3() };
    walk(seconds / HIGH_WHITE_TRAVEL_SECONDS, rig);
    return { position: rig.pos.toArray(), look: rig.look.toArray(), fov: rig.fov };
  };
}

function poseDelta(a, b) {
  return {
    positionDeltaMetres: distance(a.position, b.position),
    directionDeltaDegrees: angle(a.direction, b.direction),
    fovDeltaDegrees: Math.abs(a.fov - b.fov),
  };
}

function posesMatch(delta) {
  return delta.positionDeltaMetres < .01 && delta.directionDeltaDegrees < .1 && delta.fovDeltaDegrees < .1;
}

// The passage solid occupies z=27.15..28. The camera passes between the stone
// jambs at x=±1.15, under the 2.8 m opening. The paving top is y=.12 here.
const opening = { walls: [27.15, 28], halfWidth: 1.15, ceiling: 2.8, floor: .12 };
function measureTrace(rows) {
  const gaps = rows.slice(1).map((end, index) => {
    const start = rows[index];
    const gapMs = end.stampMs - start.stampMs;
    assert.ok(gapMs > 0 && end.walkSeconds >= start.walkSeconds, 'Travel must be continuous and chronological');
    return gapMs;
  });
  const crossing = rows.filter(({ position: p }) => p[2] >= opening.walls[0] && p[2] <= opening.walls[1]);
  assert.ok(crossing.length, 'No rendered frame inside the physical doorway');
  const doorway = {
    firstWalkSecond: crossing[0].walkSeconds, lastWalkSecond: crossing.at(-1).walkSeconds,
    eyeHeightMetres: [Math.min(...crossing.map(({ position: p }) => p[1])), Math.max(...crossing.map(({ position: p }) => p[1]))],
    nearestJambMetres: Math.min(...crossing.map(({ position: p }) => opening.halfWidth - Math.abs(p[0]))),
    lintelMetres: Math.min(...crossing.map(({ position: p }) => opening.ceiling - p[1])),
    floorMetres: Math.min(...crossing.map(({ position: p }) => p[1] - opening.floor)),
  };
  assert.ok(doorway.firstWalkSecond >= 22 && doorway.lastWalkSecond <= 26, 'The camera crossed the opening outside the scheduled 22–26 s segment');
  assert.ok(doorway.eyeHeightMetres.every(height => Math.abs(height - 1.66) < .02), 'Pass the doorway at walking eye height');
  assert.ok(Math.min(doorway.nearestJambMetres, doorway.lintelMetres, doorway.floorMetres) > .2, 'Camera eye entered the passage solids or grazed an edge');
  const authoredTravel = rows.filter(row => row.walkState === 'walking');
  const final = authoredTravel.at(-1);
  const first = rows[0].stampMs;
  const metrics = highWhiteTraceMetrics(rows.map(frame => {
    const [x, y, z] = frame.position;
    const [dx, dy, dz] = frame.direction;
    return { t: (frame.stampMs - first) / 1000, walkSeconds: frame.walkSeconds,
      x, y, z, lx: x + dx, ly: y + dy, lz: z + dz, fov: frame.fov };
  }));
  const staticTail = rows.filter(row => row.walkState === 'done');
  assert.ok(metrics.nearestStructure.metres > .2, 'Camera eye entered a checked structure or grazed an edge');
  return {
    frames: rows.length, largestRenderGapMs: Math.max(...gaps),
    peakWalkSpeedMetresPerSecond: metrics.peakWalkSpeed.value,
    peakSeatSpeedMetresPerSecond: metrics.peakSeatSpeed.value,
    peakTurnDegreesPerSecond: metrics.peakTurn.value,
    doorway, path: metrics,
    tail: {
      secondsAfterAuthoredTravel: (rows.at(-1).stampMs - final.stampMs) / 1000,
      maxDriftMetres: Math.max(0, ...staticTail.map(row => distance(row.position, final.position))),
      maxTurnDegrees: Math.max(0, ...staticTail.map(row => angle(row.direction, final.direction))),
    },
  };
}

function watchErrors(page, issues) {
  page.on('pageerror', error => issues.push({ type: 'page', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error' && /webgl|shader error/i.test(message.text()))
      issues.push({ type: 'graphics', message: message.text() });
  });
  page.on('response', response => {
    if (response.status() >= 400) issues.push({ type: 'http', status: response.status(), url: response.url() });
  });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText;
    if (reason !== 'net::ERR_ABORTED') issues.push({ type: 'request', reason, url: request.url() });
  });
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const choose = page => page.getByRole('tab', { name: 'Ready-made', exact: true });
const nextStill = (page, pose = null) => page.evaluate(target => window.__highlandReview.nextStill(target), pose);

async function startVisit(page, click) {
  await page.getByLabel('Your wish').fill('May this small light keep someone company.');
  await click(button(page, 'Set my wish'));
  await click(page.getByRole('radio', { name: /^High White Court/ }));
  await waitEntrance(page);
}

async function waitEntrance(page) {
  await page.waitForFunction(() => {
    const title = document.querySelector('.ui[data-screen="place"] .tname');
    const step = document.querySelector('.ui[data-screen="place"] .place-actions .primary');
    const fade = document.querySelector('#fade');
    return title?.firstChild?.textContent === 'High White Court' && step && !step.disabled
      && fade && Number(window.getComputedStyle(fade).opacity) < .01 && window.__highlandReview?.read().position;
  });
}

async function seat(page) {
  const tab = choose(page);
  await tab.waitFor({ timeout: 120_000 });
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
  const camera = await nextStill(page);
  const sheet = await page.locator('.candle-sheet').boundingBox();
  assert.ok(camera.lamp?.visibleDepth && sheet, 'Missing rendered lamp or Ready-made controls');
  return { ...camera, sheet };
}

async function ignite(page, click, directory) {
  await click(page.getByRole('button', { name: /^Light it/ }));
  await page.getByTestId('with-you').waitFor();
  await page.waitForFunction(() => window.__visualIgnition?.state === 'settled');
  const camera = await nextStill(page);
  const bytes = await page.screenshot({ path: join(directory, 'seated-lit.png'), scale: 'css' });
  await click(button(page, 'Put out'));
  await click(button(page, 'Put out and end'));
  return { camera, bytes };
}

function centredCrop(cx, cy, width, height, view) {
  width = Math.min(width, view.width); height = Math.min(height, view.height);
  return {
    x: clamp(Math.round(cx - width / 2), 0, view.width - width),
    y: clamp(Math.round(cy - height / 2), 0, view.height - height), width, height,
  };
}

async function crop(page, bytes, rect, destination) {
  const png = await page.evaluate(async ({ base64, rect }) => {
    const source = new Image(); source.src = `data:image/png;base64,${base64}`; await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = rect.width; canvas.height = rect.height;
    canvas.getContext('2d').drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    return canvas.toDataURL('image/png');
  }, { base64: bytes.toString('base64'), rect });
  await writeFile(destination, pngBytes(png));
}

async function compareToBaseline(report, referenceDir) {
  const path = join(referenceDir, report.view.key, 'report.json');
  const reference = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(reference.failure, undefined, `Baseline failed: ${path}`);
  assert.equal(reference.source.mode, 'baseline', `Expected a baseline report: ${path}`);
  assert.equal(reference.source.cameraSha256, report.source.cameraSha256, 'Camera source must match.');
  const stages = { seated: poseDelta(reference.seated, report.seated), lit: poseDelta(reference.lit, report.lit) };
  for (const [name, delta] of Object.entries(stages)) assert.ok(posesMatch(delta), `Actual ${name} pose differs across runs.`);
  const images = report.scenes.map(scene => {
    const original = reference.scenes.find(frame => frame.name === scene.name);
    assert.ok(original?.capturePose, `Missing baseline pose for ${scene.name}`);
    assert.deepEqual(original.capturePose, scene.capturePose, `Diagnostic camera differs at ${scene.name}.`);
    return { name: scene.name, liveTriggerDeltaSeconds: (scene.walkSeconds ?? 0) - (original.walkSeconds ?? 0) };
  });
  return { path, exactDiagnosticPoses: images, actualUiPoses: stages, cropRects: reference.crops };
}

async function capture(browser, preview, view, outputDir, referenceDir) {
  const directory = join(outputDir, view.key);
  await mkdir(directory, { recursive: true });
  const issues = [];
  const viewport = { width: view.width, height: view.height };
  const context = await browser.newContext({
    viewport, locale: 'en-US', deviceScaleFactor: 1, hasTouch: view.touch,
    isMobile: view.touch, reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  watchErrors(page, issues);
  page.setDefaultTimeout(80_000);
  const click = locator => view.touch ? locator.tap() : locator.click();
  const report = { view, source: preview.source, issues, scenes: [] };
  const pose = exactPose(view);
  const targets = TARGETS.map(target => ({ ...target, pose: pose(target.seconds) }));
  const originals = new Map();
  async function saveScene(name, frame) {
    report.scenes.push({ name, ...withoutPng(frame) });
    const bytes = pngBytes(frame.png);
    assert.equal(bytes.readUInt32BE(16), view.width, 'Render must have native viewport width');
    assert.equal(bytes.readUInt32BE(20), view.height, 'Render must have native viewport height');
    originals.set(name, bytes);
    await writeFile(join(directory, `${name}.png`), bytes);
  }

  try {
    // Freeze just the local clock fields the renderer reads. Animation frames,
    // click timing, wall time and burn accounting still use the real clock.
    await page.addInitScript(hour => {
      Date.prototype.getHours = () => hour;
      Date.prototype.getMinutes = () => 0;
      Date.prototype.getSeconds = () => 0;
    }, view.hour);
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await startVisit(page, click);
    await saveScene('entrance', await nextStill(page, pose(0)));

    await page.evaluate(steps => window.__highlandReview.start(steps), targets);
    await click(button(page, 'Step inside'));
    report.seated = await seat(page);
    const trace = await page.evaluate(() => window.__highlandReview.stop());
    const { samples, frames } = trace;
    assert.deepEqual(trace.missed, [], 'All timed render captures must be present');
    assert.ok(samples[0].walkSeconds < 1 && samples.at(-1).walkSeconds === HIGH_WHITE_TRAVEL_SECONDS, 'Trace must cover the entire authored camera movement');
    report.trace = measureTrace(samples);
    await writeFile(join(directory, 'camera-trace.json'), `${JSON.stringify(samples, null, 2)}\n`);
    for (const frame of frames) {
      assert.ok(frame.walkSeconds - frame.targetSeconds < .4, `Capture too late: ${frame.name}`);
      await saveScene(frame.name, frame);
    }
    const seatedBytes = await page.screenshot({ path: join(directory, 'seated-ready-made.png'), scale: 'css' });
    const { lamp, sheet } = report.seated;
    report.readyMade = {
      lampInsideViewport: lamp.left >= 0 && lamp.right <= view.width && lamp.top >= 0 && lamp.bottom <= view.height,
      lampOverlapsSheet: lamp.left < sheet.x + sheet.width && lamp.right > sheet.x
        && lamp.top < sheet.y + sheet.height && lamp.bottom > sheet.y,
    };
    report.crops = {
      doorway: centredCrop(view.width * .5, view.height * .5, view.width, view.touch ? 540 : 630, view),
      reveal: centredCrop(view.width * .5, view.height * .43, view.touch ? 330 : 720, view.touch ? 480 : 450, view),
      lamp: centredCrop((lamp.left + lamp.right) / 2, (lamp.top + lamp.bottom) / 2,
        Math.ceil(lamp.right - lamp.left) + 52, Math.ceil(lamp.bottom - lamp.top) + 52, view),
    };
    await click(button(page, 'Back outside'));
    await waitEntrance(page);
    await page.evaluate(() => window.__highlandReview.start([]));
    await click(button(page, 'Step inside'));
    await page.waitForFunction(() => window.__highlandReview.read().walkState === 'walking');
    await click(button(page, 'Skip'));
    const skipped = await seat(page);
    await page.evaluate(() => window.__highlandReview.stop());
    report.skip = {
      pose: skipped,
      ...poseDelta(skipped, report.seated),
    };
    assert.ok(posesMatch(report.skip), 'Skip must end at the same Ready-made pose');

    const { camera: lit, bytes: litBytes } = await ignite(page, click, directory);
    report.lit = lit;
    assert.ok(posesMatch(poseDelta(report.seated, lit)), 'The lit frame moved away from the Ready-made pose');

    if (referenceDir) {
      report.match = await compareToBaseline(report, referenceDir);
      report.crops = report.match.cropRects;
    }
    for (const { name, seconds } of TARGETS) {
      const rect = seconds <= 26 ? report.crops.doorway : report.crops.reveal;
      await crop(page, originals.get(name), rect, join(directory, `crop-${name}.png`));
    }
    await crop(page, seatedBytes, report.crops.lamp, join(directory, 'crop-seated-lamp.png'));
    await crop(page, litBytes, report.crops.lamp, join(directory, 'crop-lit-lamp.png'));
    assert.ok(report.readyMade.lampInsideViewport && !report.readyMade.lampOverlapsSheet,
      'The full lamp must clear the actual Ready-made sheet');
    assert.ok(report.trace.peakTurnDegreesPerSecond <= 25.1, 'The turn must stay at or below 25°/s within sample tolerance');
    assert.ok(report.trace.peakWalkSpeedMetresPerSecond <= 1.8, 'The live walk must stay at or below 1.8 m/s');
    assert.ok(report.trace.peakSeatSpeedMetresPerSecond <= 1.4, 'The live seat approach must stay at or below 1.4 m/s');
    assert.deepEqual(issues, [], 'No page, request or HTTP errors');
  } catch (error) {
    report.failure = error.stack;
    await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await writeFile(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await context.close();
  }
  console.log(`${view.key}: ${report.trace.frames} frames, ${report.trace.peakTurnDegreesPerSecond.toFixed(2)}°/s peak turn, no errors`);
}

const failures = [];
async function captureBatch(browser, isBaseline, outputDir, referenceDir) {
  const preview = await startPreview({ baseline: isBaseline });
  try {
    console.log(`${isBaseline ? 'Baseline' : 'Candidate'}: ${outputDir}`);
    for (const view of selected) {
      try { await capture(browser, preview, view, outputDir, referenceDir); }
      catch (error) { failures.push({ view: view.key, message: error.message }); console.error(view.key, error); }
    }
  } finally {
    await preview.close();
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  if (paired) {
    const before = join(output, 'before');
    await captureBatch(browser, true, before, null);
    if (failures.length === 0) await captureBatch(browser, false, join(output, 'after'), before);
  } else {
    await captureBatch(browser, baseline, output, match);
  }
} finally {
  await browser.close();
}
if (failures.length) process.exitCode = 1;
