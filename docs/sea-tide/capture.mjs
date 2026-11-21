// Run under the S7 GPU lease. The fixture never listens outside loopback.
/* global document, getComputedStyle, performance, window */
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { promisify } from 'node:util';
import { startPreview } from './preview.mjs';
import { wallReturn } from '../../web/src/engine/places/sea-tide.js';
import { walkSeconds } from '../../web/src/engine/places/sea-tide-camera.js';

const output = process.env.TIDE_EVIDENCE_DIR;
if (!output) throw new Error('Set TIDE_EVIDENCE_DIR to the external S7 artifacts directory.');
const modeList = process.argv.slice(2);
const out = resolve(output);
const run = promisify(execFile);
const markersFor = phone => [
  ['last-enclosed', Number(process.env.TIDE_ENCLOSED_SECONDS ?? 18)],
  ['salt-wall', Number(process.env.TIDE_WALL_SECONDS ?? (phone ? 24.5 : 23.4))],
  ['harbour-reveal', Number(process.env.TIDE_REVEAL_SECONDS ?? 25.5)],
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900, phone: false },
  { name: 'phone', width: 390, height: 844, phone: true },
];
const looks = [{ name: 'day', hour: 13 }, { name: 'night', hour: 22 }];
const entranceDwells = { desktop: { day: .35, night: 2.15 }, phone: { day: 1.05, night: 3.05 } };
const screen = (page, state) => page.locator('.ui[data-screen="' + state + '"]').waitFor();
const button = (page, name) => page.getByRole('button', { name, exact: true });
const review = page => page.evaluate(() => window.__tideReview());
const json = (path, object) => writeFile(path, JSON.stringify(object, null, 2) + '\n');
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const dot = (a, b) => a.reduce((sum, component, i) => sum + component * b[i], 0);
const aim = row => [row.lx - row.actual[0], row.ly - row.actual[1], row.lz - row.actual[2]];
const angleDegrees = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (Math.hypot(...a) * Math.hypot(...b))))) * 180 / Math.PI;

// The envelopes describe the solid masonry bounding the lane at eye height.
// Distances are horizontal distances from the camera centre, before subtracting
// any camera body clearance allowance.
const laneWalls = [
  { name: 'east granite wall', x: [2.51, 3.49], z: [14, 34] },
  { name: 'west lane wall', x: [-3.49, -2.51], z: [12.5, 35] },
];

function wallEnvelopeDistances({ x, z }) {
  const distances = laneWalls.map(wall => {
    const dx = Math.max(0, wall.x[0] - x, x - wall.x[1]);
    const dz = Math.max(0, wall.z[0] - z, z - wall.z[1]);
    return [wall.name, Math.hypot(dx, dz)];
  });
  const [sx, sz] = wallReturn.start, [ex, ez] = wallReturn.end;
  const length = Math.hypot(ex - sx, ez - sz);
  const along = ((x - sx) * (ex - sx) + (z - sz) * (ez - sz)) / length;
  const across = ((z - sz) * (ex - sx) - (x - sx) * (ez - sz)) / length;
  distances.push(['descending return',
    Math.hypot(Math.max(0, -along, along - length), Math.max(0, Math.abs(across) - wallReturn.capWidth / 2))]);
  return distances;
}

function summarizeTrace(rows) {
  if (rows.length < 30) throw new Error('Continuous journey trace is incomplete.');
  const first = rows[0];
  let peakTurn = { degreesPerSecond: 0 };
  const speed = { walk: { metresPerSecond: 0 }, other: { metresPerSecond: 0 } };
  let visibleSince = null, revealHoldSeconds = 0, occludedMouthFrames = 0;
  let verifiedReveal;
  let minimum = { metres: Infinity };
  let collisions = 0;
  for (const [i, row] of rows.entries()) {
    const [x, y, z] = row.actual;
    if (row.mouth?.projected && !row.mouth.visible) occludedMouthFrames++;
    if (row.walkState === 'walking' && row.mouth?.visible) {
      visibleSince ??= row;
      const duration = row.t - visibleSince.t;
      if (duration > revealHoldSeconds) {
        revealHoldSeconds = duration;
        verifiedReveal = { fromWalkSecond: visibleSince.walkProgress * walkSeconds, toWalkSecond: row.walkProgress * walkSeconds };
      }
    } else visibleSince = null;
    for (const [name, metres] of wallEnvelopeDistances({ x, z })) {
      if (metres === 0) collisions++;
      if (metres < minimum.metres) minimum = { metres, wall: name, elapsedSeconds: row.t - first.t, position: [x, y, z] };
    }
    const prev = rows[i - 1];
    if (!prev || row.t <= prev.t) continue;
    const interval = row.t - prev.t;
    const elapsedSeconds = row.t - first.t;
    const degreesPerSecond = angleDegrees(aim(row), aim(prev)) / interval;
    const metresPerSecond = distance(row.actual, prev.actual) / interval;
    const stage = row.walkState === 'walking' || prev.walkState === 'walking' ? 'walk' : 'other';
    if (degreesPerSecond > peakTurn.degreesPerSecond) peakTurn = { degreesPerSecond, elapsedSeconds };
    if (metresPerSecond > speed[stage].metresPerSecond) speed[stage] = { metresPerSecond, elapsedSeconds };
  }
  return { frames: rows.length, seconds: rows.at(-1).t - first.t, minFov: Math.min(...rows.map(row => row.fov)),
    maxFov: Math.max(...rows.map(row => row.fov)), peakTurn, speed, revealHoldSeconds, verifiedReveal, occludedMouthFrames,
    clearance: { envelopes: laneWalls, wallReturn, minimum, intersectingFrameWallPairs: collisions } };
}

const eyeHeightLimits = { minimumMetres: 1.50, maximumMetres: 1.70 };
const deckHeightLimits = { minimumY: .114, maximumY: .128, minimumNormalY: .999 };
const openingSeconds = 1.5;

function summarizeEyeHeight(rows) {
  const walking = rows.filter(row => row.walkState === 'walking').map(row => ({
    walkSecond: row.walkProgress * walkSeconds,
    cameraWorldPosition: row.actual,
    deck: row.deck,
  }));
  const opening = walking.filter(row => row.walkSecond <= openingSeconds);
  const hasDeck = ({ deck }) => deck && deck.y >= deckHeightLimits.minimumY
    && deck.y <= deckHeightLimits.maximumY && deck.normalY >= deckHeightLimits.minimumNormalY;
  const outsideEyeLimits = ({ deck }) => deck.eyeMetres < eyeHeightLimits.minimumMetres - 1e-6
    || deck.eyeMetres > eyeHeightLimits.maximumMetres + 1e-6;
  function summarize(samples) {
    const deckSamples = samples.filter(hasDeck);
    const heights = deckSamples.map(row => row.deck.eyeMetres);
    return {
      frameCount: samples.length,
      firstWalkSecond: samples[0]?.walkSecond ?? null,
      lastWalkSecond: samples.at(-1)?.walkSecond ?? null,
      longestIntervalSeconds: samples.reduce((maximum, row, i) => i === 0
        ? maximum : Math.max(maximum, row.walkSecond - samples[i - 1].walkSecond), 0),
      unverifiedDeckFrames: samples.length - deckSamples.length,
      outsideEyeLimitsFrames: deckSamples.filter(outsideEyeLimits).length,
      minimumEyeMetres: heights.length ? Math.min(...heights) : null,
      maximumEyeMetres: heights.length ? Math.max(...heights) : null,
      deckSurfaceY: deckSamples.length ? { minimum: Math.min(...deckSamples.map(row => row.deck.y)),
        maximum: Math.max(...deckSamples.map(row => row.deck.y)) } : null,
    };
  }
  const total = summarize(walking);
  const first1_5Seconds = summarize(opening);
  const complete = opening.length >= 6 && first1_5Seconds.firstWalkSecond <= .1
    && first1_5Seconds.lastWalkSecond >= openingSeconds - .1
    && total.lastWalkSecond >= walkSeconds - .1;
  return {
    measurement: 'Per rendered frame, actual camera position minus the upward deck face hit by a vertical ray.',
    eyeHeightLimits, deckHeightLimits, complete, total,
    first1_5Seconds: { ...first1_5Seconds, samples: opening },
    passed: complete && total.unverifiedDeckFrames === 0 && total.outsideEyeLimitsFrames === 0,
  };
}

async function capture(page, dir, name) {
  const frame = await review(page);
  if (!frame) throw new Error('Tide is not the rendered scene during ' + name);
  const path = join(dir, name + '.png');
  await page.screenshot({ path, scale: 'css', timeout: 25_000 });
  return { file: path, ...frame };
}

async function crop(dir, frame, name, point, maxWidth, maxHeight) {
  if (!point?.inFrame) return null;
  const [fullWidth, fullHeight] = frame.screenSize;
  const width = Math.min(fullWidth, maxWidth), height = Math.min(fullHeight, maxHeight);
  const x = Math.max(0, Math.min(fullWidth - width, Math.round(point.pixel[0] - width / 2)));
  const y = Math.max(0, Math.min(fullHeight - height, Math.round(point.pixel[1] - height / 2)));
  const file = join(dir, name + '-crop.png');
  await run('/usr/bin/sips', ['--cropToHeightWidth', String(height), String(width),
    '--cropOffset', String(y), String(x), frame.file, '--out', file]);
  return { file, source: frame.file, x, y, width, height };
}

function endpointDelta(normal, skip) {
  const a = normal.camera.rig, b = skip.camera.rig;
  return { positionMetres: distance(a.position, b.position),
    aimDegrees: angleDegrees(a.look.map((v, i) => v - a.position[i]), b.look.map((v, i) => v - b.position[i])),
    fovDegrees: Math.abs(normal.camera.fov - skip.camera.fov) };
}

const entranceState = () => {
  const action = document.querySelector('.ui[data-screen="place"] .place-actions .primary');
  return {
    visibleHook: typeof window.__tideSceneVisible,
    tideVisible: window.__tideSceneVisible?.(),
    prepareError: window.__tidePrepareError,
    previewError: window.__tidePreviewError,
    court: document.querySelector('.tname')?.textContent,
    loadStage: document.querySelector('.court-loading')?.dataset.stage,
    actionLabel: action?.textContent?.trim(),
    actionDisabled: action?.disabled,
    fadeOpacity: getComputedStyle(document.querySelector('#fade')).opacity,
  };
};

async function entrance(page) {
  try {
    await page.waitForFunction(() => {
      const stage = document.querySelector('.court-loading')?.dataset.stage;
      const action = document.querySelector('.ui[data-screen="place"] .place-actions .primary');
      return stage === 'error' || (stage === 'ready' && action?.textContent?.trim() === 'Step inside'
        && !action.disabled && window.__tideSceneVisible?.()
        && Number(getComputedStyle(document.querySelector('#fade')).opacity) <= .01);
    }, null, { polling: 100 });
  } catch (error) {
    throw new Error('Timed out waiting for Tide entrance: ' + JSON.stringify(await page.evaluate(entranceState)),
      { cause: error });
  }
  const state = await page.evaluate(entranceState);
  if (state.loadStage !== 'ready' || state.actionDisabled || !state.tideVisible) {
    throw new Error('Tide court failed to prepare: ' + JSON.stringify(state));
  }
  return state;
}

async function captureCase(browser, preview, size, look, dir) {
  const recording = process.env.TIDE_RECORD_WALKS === '1' && look.name === 'day';
  const videoSize = size.phone ? { width: 390, height: 844 } : { width: 864, height: 540 };
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    locale: 'en-US', timezoneId: 'Asia/Singapore', isMobile: size.phone, hasTouch: size.phone, deviceScaleFactor: 1,
    ...(recording ? { recordVideo: { dir: tmpdir(), size: videoSize } } : {}),
  });
  const problems = [];
  const shots = {};
  const markers = markersFor(size.phone);
  let page;
  try {
    page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on('pageerror', error => problems.push({ type: 'page error', error: String(error) }));
    page.on('console', message => {
      if (/THREE.WebGLProgram|WebGL: INVALID_/i.test(message.text())) {
        problems.push({ type: 'renderer error', error: message.text() });
      }
    });
    page.on('response', response => {
      if (response.status() < 400 || !response.url().startsWith(preview.url)) return;
      problems.push({ type: 'HTTP error', status: response.status(), url: response.url().slice(preview.url.length) });
    });
    await page.clock.setFixedTime(new Date('2026-11-22T' + look.hour + ':00:00+08:00'));
    await page.goto(preview.url);
    await page.getByLabel('Your wish', { exact: true }).fill('For a safe crossing home.');
    await button(page, 'Set my wish').click();
    const initialEntrance = await entrance(page);
    shots.entrance = { ...await capture(page, dir, 'entrance'), readiness: initialEntrance };

    await button(page, 'Step inside').click();
    await page.waitForFunction(() => window.__walkProgress?.id === 'sea-tide'
      && window.__walkProgress?.state === 'walking' && window.__walkProgress.progress > .015);
    const skipStart = await review(page);
    await button(page, 'Skip').click();
    await screen(page, 'candle');
    shots.skip = await capture(page, dir, 'skip-endpoint');
    await button(page, 'Back outside').click();
    const returnEntrance = await entrance(page);

    const dwellSeconds = entranceDwells[size.name][look.name];
    await page.waitForTimeout(dwellSeconds * 1000);
    await page.evaluate(() => window.__startCameraTrace());
    const clickMs = await page.evaluate(() => performance.now());
    await button(page, 'Step inside').click();
    for (const [name, at] of markers) {
      await page.waitForFunction(({ at, walkSeconds }) => window.__walkProgress?.id === 'sea-tide'
        && window.__walkProgress.progress >= at / walkSeconds, { at, walkSeconds });
      shots[name] = await capture(page, dir, name);
    }
    await screen(page, 'candle');
    const chooserMs = await page.evaluate(() => performance.now());
    shots.chooser = await capture(page, dir, 'chooser-ready-made');
    await page.getByRole('button', { name: /^Light it / }).click();
    await screen(page, 'burning');
    await page.waitForFunction(() => window.__visualIgnition?.state === 'settled');
    shots.burning = await capture(page, dir, 'lit-recess');
    const actual = await page.evaluate(() => window.__stopCameraTrace());
    await json(join(dir, 'camera-trace.json'), actual);
    const eyeHeight = summarizeEyeHeight(actual);
    await json(join(dir, 'walk-eye-height.json'), eyeHeight);
    if (!eyeHeight.passed) problems.push({
      type: 'walk eye height or deck', complete: eyeHeight.complete, ...eyeHeight.total,
    });
    const delta = endpointDelta(shots.chooser, shots.skip);
    const crops = (await Promise.all([
      crop(dir, shots['salt-wall'], 'salt-wall', shots['salt-wall'].salt.find(point => point.inFrame && !point.occluder), 290, 260),
      crop(dir, shots['harbour-reveal'], 'harbour-mouth', shots['harbour-reveal'].mouth, 480, 300),
      crop(dir, shots.burning, 'lit-hood', shots.burning.lamp?.base, 280, 240),
    ])).filter(Boolean);
    const marks = Object.fromEntries(markers.map(([name, requested]) => [name, {
      requested, observedAtProbe: shots[name].walk?.progress * walkSeconds, state: shots[name].walk?.state,
    }]));
    const trace = summarizeTrace(actual);
    for (const [stage, limit] of [['walk', 1.8], ['other', 1.4]]) {
      if (trace.speed[stage].metresPerSecond > limit) problems.push({ type: 'speed limit', stage, limit, ...trace.speed[stage] });
    }
    if (trace.revealHoldSeconds < 2) problems.push({ type: 'reveal hold', seconds: trace.revealHoldSeconds });
    const boundsClear = value => Boolean(value?.inFrame && !value.underSheet);
    const shoreClear = frame => frame.harbourTips?.length === 2
      && frame.harbourTips.every(tip => (tip?.visibleRays ?? 0) > 0);
    for (const frame of ['harbour-reveal', 'chooser', 'burning']) {
      if (!shoreClear(shots[frame])) problems.push({ type: 'harbour tips not both visible', frame, tips: shots[frame].harbourTips });
    }
    const evidence = { viewport: [size.width, size.height], localHour: look.hour, marks, shots, crops, returnEntrance, dwellSeconds,
      normalWalkToChooserSeconds: (chooserMs - clickMs) / 1000, skipStart: skipStart.walk, endpointDelta: delta,
      video: recording ? join(dir, 'continuous-review.webm') : null,
      observations: {
        concealedSeaSampleCount: shots['last-enclosed'].sea.filter(point => point.inFrame && !point.occluder).length,
        revealMouthInView: shots['harbour-reveal'].mouth.inFrame && !shots['harbour-reveal'].mouth.occluder,
        chooserMouthAboveSheet: shots.chooser.mouth.inFrame && !shots.chooser.mouth.occluder && !shots.chooser.mouth.underSheet,
        chooserHoodBaseAboveSheet: Boolean(shots.chooser.lamp?.base.inFrame && !shots.chooser.lamp.base.underSheet),
        chooserWickAboveSheet: boundsClear(shots.chooser.lamp?.wick),
        chooserWholeHoodClear: boundsClear(shots.chooser.lamp?.hoodBounds),
        chooserWholeFlameEnvelopeClear: boundsClear(shots.chooser.lamp?.flameEnvelope),
        litWholeHoodClear: boundsClear(shots.burning.lamp?.hoodBounds),
        litWholeFlameEnvelopeClear: boundsClear(shots.burning.lamp?.flameEnvelope),
        litMouthInView: shots.burning.mouth.inFrame && !shots.burning.mouth.occluder,
        lampContactMetres: shots.burning.lamp?.contactMetres,
        chooserMargins: {
          mouth: shots.chooser.mouth.uiMargins,
          hood: shots.chooser.lamp?.hoodBounds?.uiMargins,
          flame: shots.chooser.lamp?.flameEnvelope?.uiMargins,
        },
      },
      trace: { ...trace, eyeHeight: { passed: eyeHeight.passed, complete: eyeHeight.complete,
        ...eyeHeight.total, first1_5SecondsFrames: eyeHeight.first1_5Seconds.frameCount } }, problems };
    await json(join(dir, 'review.json'), evidence);
    return evidence;
  } catch (error) {
    problems.push({ type: 'capture error', error: error.stack ?? String(error) });
    await page?.screenshot({ path: join(dir, 'failed-state.png'), scale: 'css', timeout: 5_000 }).catch(() => {});
    await json(join(dir, 'review.json'), { shots, problems });
    return { problems };
  } finally {
    const video = page?.video();
    await context.close();
    if (video) {
      await video.saveAs(join(dir, 'continuous-review.webm'));
      await video.delete();
    }
  }
}

await mkdir(out, { recursive: true });
const preview = await startPreview();
const summary = {};
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const size of viewports) for (const look of looks) {
    const name = size.name + '-' + look.name;
    if (modeList.length && !modeList.includes(name)) continue;
    const dir = join(out, name);
    await mkdir(dir, { recursive: true });
    summary[name] = await captureCase(browser, preview, size, look, dir);
    console.log(name, summary[name].observations ?? summary[name].problems);
  }
  if (!Object.keys(summary).length) throw new Error('No matching capture case.');
} finally {
  try {
    await browser?.close();
  } finally {
    await preview.close();
    await json(join(out, 'capture.json'), summary);
  }
}
if (Object.values(summary).some(evidence => evidence.problems.length)) process.exitCode = 1;
