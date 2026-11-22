// Run under the S7 GPU lease. All application requests stay on loopback.
/* global document, getComputedStyle, window */
import { chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { walkSeconds } from '../../web/src/engine/places/sea-tide-camera.js';
import { startPreview } from './preview.mjs';
import { installTideAudioTap } from './surf-audio-tap.mjs';

const output = process.env.TIDE_EVIDENCE_DIR;
if (!output) throw Error('Set TIDE_EVIDENCE_DIR to a new external S7 evidence directory.');
const out = resolve(output);
const cases = {
  'desktop-day': { width: 1440, height: 900, hour: 13 },
  'desktop-night': { width: 1440, height: 900, hour: 22 },
  'phone-day': { width: 390, height: 844, hour: 13 },
  'phone-night': { width: 390, height: 844, hour: 22 },
};
const args = process.argv.slice(2);
const names = args.filter(arg => !arg.startsWith('--'));
const flags = new Set(args.filter(arg => arg.startsWith('--')));
if (names.some(name => !Object.hasOwn(cases, name)) || names.length !== new Set(names).size
  || [...flags].some(flag => !['--lifecycle-all', '--no-lifecycle', '--no-viewport-video'].includes(flag))) {
  throw Error('Select unique desktop-day, desktop-night, phone-day, phone-night cases with optional review flags.');
}
const selected = names.length ? names : Object.keys(cases);
const lifecycleCases = flags.has('--no-lifecycle') ? [] : selected.filter(name =>
  selected.length === 1 || flags.has('--lifecycle-all') || ['desktop-day', 'phone-night'].includes(name));
const viewportVideo = !flags.has('--no-viewport-video');
const muxTool = process.env.TIDE_WEBM_MUX ?? 'ffmpeg';
const json = (file, data) => writeFile(file, JSON.stringify(data, null, 2) + '\n');
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const screen = (page, name) => page.locator('.ui[data-screen="' + name + '"]').waitFor();
const mark = (page, label) => page.evaluate(label => window.__tideAudio.mark(label), label);
const audio = page => page.evaluate(() => window.__tideAudio.sample());
const review = page => page.evaluate(() => window.__tideReview());
const db = rms => rms > 0 ? 20 * Math.log10(rms) : null;
const audibleDb = -60;
const audibleRms = 10 ** (audibleDb / 20);

async function entrance(page, id = 'sea-tide') {
  await page.waitForFunction(id => {
    const action = document.querySelector('.ui[data-screen="place"] .place-actions .primary');
    const stage = document.querySelector('.court-loading')?.dataset.stage;
    return stage === 'error' || (stage === 'ready' && action?.textContent?.trim() === 'Step inside'
      && !action.disabled && window.__tideDriftProbe?.()?.id === id
      && Number(getComputedStyle(document.querySelector('#fade')).opacity) <= .01);
  }, id, { polling: 100 });
  const state = await page.evaluate(() => ({
    stage: document.querySelector('.court-loading')?.dataset.stage,
    place: window.__tideDriftProbe?.()?.id,
    prepareError: window.__tidePrepareError,
    previewError: window.__tidePreviewError,
  }));
  if (state.stage !== 'ready' || state.place !== id) throw Error('Court did not open: ' + JSON.stringify(state));
  return state;
}

async function walking(page, fraction) {
  await page.waitForFunction(fraction => window.__walkProgress?.id === 'sea-tide'
    && window.__walkProgress.state === 'walking' && window.__walkProgress.progress >= fraction, fraction);
}

async function shot(page, dir, name) {
  const file = join(dir, name + '.png');
  const frame = await review(page);
  await page.screenshot({ path: file, scale: 'css' });
  return { file, ...frame };
}

function summarize(data, route, recording, frames) {
  const walk = route.filter(row => row.walkState === 'walking');
  const walkStartMs = walk[0]?.atMs;
  const withTime = row => row ? {
    clipSeconds: (row.atMs - recording.startedMs) / 1000,
    walkSeconds: (row.atMs - walkStartMs) / 1000,
    routeSeconds: row.walkProgress === undefined ? null : row.walkProgress * walkSeconds,
  } : null;
  const rows = data.readings.filter(row => row.walk?.id === 'sea-tide' && row.walk.state === 'walking');
  let firstAudible = null;
  let runStart = null;
  let lastAudibleMs = -Infinity;
  for (const row of rows) {
    const bus = row.surf.find(bus => bus.connected && bus.contextState === 'running'
      && bus.preMute.rms >= audibleRms && bus.atSpeaker.rms >= audibleRms);
    if (!bus) { runStart = null; continue; }
    if (row.atMs - lastAudibleMs > 175) runStart = null;
    runStart ??= { row, bus };
    lastAudibleMs = row.atMs;
    if (row.atMs - runStart.row.atMs >= 140) {
      firstAudible = { ...withTime(runStart.row), bus: runStart.bus.id, speakerRmsDbFS: db(runStart.bus.atSpeaker.rms),
        sustainedMs: row.atMs - runStart.row.atMs };
      break;
    }
  }
  const water = walk.find(row => row.water);
  const mouth = walk.find(row => row.mouth?.visible);
  let clearStart = null;
  let revealHoldSeconds = 0;
  for (const row of walk) {
    if (!row.mouth?.visible) { clearStart = null; continue; }
    clearStart ??= row.atMs;
    revealHoldSeconds = Math.max(revealHoldSeconds, (row.atMs - clearStart) / 1000);
  }
  const heardBeforeSeconds = firstAudible && water ? withTime(water).clipSeconds - firstAudible.clipSeconds : null;
  const mixRows = data.readings.filter(row => row.mix && row.atMs >= recording.startedMs && row.atMs <= recording.stoppedMs);
  const speakerWindow = (label, from, to) => {
    const samples = mixRows.filter(row => row.atMs >= from && row.atMs < to)
      .map(row => row.surf.find(bus => bus.connected)).filter(Boolean);
    const mean = read => samples.length ? samples.reduce((sum, value) => sum + read(value), 0) / samples.length : null;
    return { label, samples: samples.length, rmsDbFS: db(Math.sqrt(mean(bus => bus.atSpeaker.rms ** 2))),
      bodyCutoffHz: mean(bus => bus.bodyCutoffHz), foamCutoffHz: mean(bus => bus.foamCutoffHz) };
  };
  const windows = water ? [
    speakerWindow('enclosed lane', walkStartMs + 5000, water.atMs - 1000),
    speakerWindow('open harbour', mouth?.atMs, recording.stoppedMs),
  ] : [];
  const validLamp = frame => [frame?.lamp?.hoodBounds, frame?.lamp?.flameEnvelope].every(part => part?.inFrame && !part.underSheet);
  const validTips = frame => frame?.harbourTips?.length === 2 && frame.harbourTips.every(tip => tip?.visibleRays > 0);
  const checks = {
    capturedOpus: recording.audioTracks === 1 && recording.videoTracks === 1 && recording.opus && recording.video
      && recording.decoded?.channels >= 1 && recording.decoded.signal.some(signal => signal.rms > 0),
    heardBeforeWater: heardBeforeSeconds >= 1 && firstAudible.walkSeconds >= 0,
    heardBeforeMouth: Boolean(firstAudible && mouth && withTime(mouth).clipSeconds > firstAudible.clipSeconds),
    actualReveal: revealHoldSeconds >= 2 && validTips(frames.reveal) && validTips(frames.seated) && validTips(frames.burning),
    lampClear: validLamp(frames.seated) && validLamp(frames.burning),
    opensAcoustically: windows.length === 2 && windows[0].samples > 0 && windows[1].samples > 0
      && windows[1].foamCutoffHz >= 3 * windows[0].foamCutoffHz
      && windows[1].bodyCutoffHz >= 1.5 * windows[0].bodyCutoffHz,
    surfContinuesAtSeat: windows.every(window => window.samples > 0 && window.rmsDbFS !== null)
      && mixRows.some(row => row.screen === 'burning' && row.surf.some(bus => bus.connected && bus.atSpeaker.rms >= audibleRms)),
    noDuplicateSurf: data.events.filter(event => event.event === 'surf-attached').length === 1
      && mixRows.every(row => row.surf.filter(bus => bus.connected).length <= 1),
  };
  return { checks, firstAudible, firstWater: water ? { ...withTime(water), point: water.water } : null,
    firstMouth: withTime(mouth), heardBeforeSeconds, revealHoldSeconds, windows, walkFrames: walk.length,
    audibleRule: 'At least 140 ms of sustained Tide signal above -60 dBFS at the game speaker bus. Times share the browser performance clock. Water marks the first unoccluded in-frame pick from nine harbour samples.' };
}

async function muxViewport(dir, viewport, recording, timeline) {
  const audioStart = recording.timeOriginMs + recording.startedMs;
  const audioOffsetSeconds = (audioStart - timeline.firstViewportFrameEpochMs) / 1000;
  if (!(audioOffsetSeconds >= 0 && audioOffsetSeconds <= 1)) {
    throw Error('The viewport and game audio did not start on the same clock: ' + audioOffsetSeconds);
  }
  const file = join(dir, 'journey-ui-game-audio.webm');
  execFileSync(muxTool, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-n', '-i', viewport.file,
    '-itsoffset', audioOffsetSeconds.toFixed(3), '-i', recording.file,
    '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-shortest', file]);
  const bytes = await readFile(file);
  if (!bytes.includes('A_OPUS') || !bytes.includes('V_VP9')) throw Error('The synchronized UI clip has missing tracks.');
  return { file, size: bytes.length, audioOffsetSeconds,
    clock: 'First viewport frame epoch compared with the Web Audio recording start on performance.timeOrigin.' };
}

async function journey(page, dir, problems, localHour) {
  const frames = {};
  frames.entrance = { ...await shot(page, dir, 'entrance-ui'), readiness: await entrance(page) };
  let recording;
  let running = false;
  let screenRunning = false;
  let viewport;
  const timeline = {};
  let combined;
  let data;
  let route;
  try {
    if (viewportVideo) {
      viewport = { file: join(dir, 'viewport-ui.webm'), ...page.viewportSize() };
      let signalFirstFrame;
      const first = new Promise(resolve => { signalFirstFrame = resolve; });
      await page.screencast.start({ path: viewport.file, size: { width: viewport.width, height: viewport.height },
        onFrame: ({ timestamp }) => signalFirstFrame(timestamp) });
      screenRunning = true;
      timeline.firstViewportFrameEpochMs = await Promise.race([first, delay(5000, null, { ref: false })]);
      if (!timeline.firstViewportFrameEpochMs) throw Error('The full viewport did not produce a first video frame.');
    }
    await page.evaluate(() => {
      window.__tideAudio.start();
      window.__tideAudio.begin();
      window.__startCameraTrace();
    });
    running = true;
    await page.waitForTimeout(400);
    await mark(page, 'step-inside');
    await button(page, 'Step inside').click();
    await page.waitForFunction(() => window.__tideAudio.running(), undefined, { timeout: 5000 });
    await walking(page, 8 / walkSeconds);
    frames.lane = await shot(page, dir, 'lane-ui');
    await walking(page, 25.5 / walkSeconds);
    frames.reveal = await shot(page, dir, 'harbour-reveal-ui');
    await screen(page, 'candle');
    await mark(page, 'chooser');
    frames.seated = await shot(page, dir, 'chooser-ui');
    await page.waitForTimeout(1000);
    await button(page, /^Light it /).click();
    await screen(page, 'burning');
    await page.waitForFunction(() => window.__visualIgnition?.state === 'settled');
    await mark(page, 'flame-settled');
    frames.burning = await shot(page, dir, 'burning-ui');
    await page.waitForTimeout(1500);
  } catch (error) {
    problems.push({ type: 'journey', error: error.stack ?? String(error) });
  } finally {
    data = await page.evaluate(() => window.__tideAudio.read());
    route = await page.evaluate(() => window.__stopCameraTrace());
    await json(join(dir, 'audio-trace.json'), data);
    await json(join(dir, 'camera-trace.json'), route);
    if (screenRunning) {
      await page.screencast.stop().catch(error => problems.push({ type: 'viewport video', error: String(error) }));
    }
    if (running) {
      const game = await page.evaluate(() => window.__tideAudio.finish())
        .catch(error => { problems.push({ type: 'game audio video', error: String(error) }); return null; });
      if (game) {
        const { data: encoded, ...details } = game;
        const bytes = Buffer.from(encoded, 'base64');
        const file = join(dir, 'journey-game-audio.webm');
        await writeFile(file, bytes);
        recording = { file, ...details, opus: bytes.includes('A_OPUS'), video: bytes.includes('V_VP8'),
          scope: 'Original canvas recording with the native game Web Audio mix.' };
        if (viewport) {
          try { combined = await muxViewport(dir, viewport, recording, timeline); }
          catch (error) { problems.push({ type: 'synchronized viewport video', error: String(error) }); }
        }
      }
    }
  }
  const summary = recording ? summarize(data, route, recording, frames) : null;
  for (const [check, passed] of Object.entries(summary?.checks ?? {})) {
    if (!passed) problems.push({ type: 'journey check', check });
  }
  return { localHour, frames, recording, viewport, combined, timeline, ...summary };
}

function endpointGap(a, b) {
  if (!a || !b) return null;
  const dot = a.direction.reduce((sum, value, i) => sum + value * b.direction[i], 0);
  return { positionMetres: Math.hypot(...a.position.map((value, i) => value - b.position[i])),
    aimDegrees: Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI, fovDegrees: Math.abs(a.fov - b.fov) };
}

async function lifecycle(page, dir, normal, problems) {
  const samples = {};
  const frames = {};
  let rejectedLightRequests = 0;
  const settled = async label => {
    await page.waitForTimeout(650);
    await mark(page, label);
    samples[label] = await audio(page);
  };
  const back = async (id = 'sea-tide') => {
    await button(page, 'Back outside').click();
    await entrance(page, id);
  };
  const skipAt = async (fraction, label, picture = false) => {
    await button(page, 'Step inside').click();
    await walking(page, fraction);
    await mark(page, 'skip-' + label);
    await button(page, 'Skip').click();
    await screen(page, 'candle');
    await settled(label);
    if (picture) frames[label] = await shot(page, dir, label);
  };
  await page.evaluate(() => window.__tideAudio.begin());
  try {
    await settled('initial-entrance');
    await skipAt(.015, 'early-seated', true);
    await button(page, 'Mute').click();
    await settled('muted');
    await button(page, 'Sound on').click();
    await settled('resumed');
    await back();
    await settled('back-outside');
    await skipAt(.91, 'late-seated', true);
    await back();
    await page.getByRole('radio', { name: /^Bamboo Rain/ }).click();
    await entrance(page, 'bamboo-rain');
    await settled('bamboo-entrance');
    await button(page, 'Step inside').click();
    await button(page, 'Skip').click();
    await screen(page, 'candle');
    await settled('bamboo-seated');
    await back('bamboo-rain');
    await page.getByRole('radio', { name: /^Tide Temple/ }).click();
    await entrance(page);
    await settled('tide-entrance-again');
    await skipAt(.015, 'tide-seated-again');
    await page.route('**/api/candles', route => {
      rejectedLightRequests++;
      return route.abort('failed');
    }, { times: 1 });
    await button(page, /^Light it /).click();
    await page.getByText('Could not light it. Please try again.', { exact: true }).waitFor();
    await settled('failed-light');
    await button(page, /^Light it /).click();
    await screen(page, 'burning');
    await page.waitForFunction(() => window.__visualIgnition?.state === 'settled');
    await settled('retried-light');
    await button(page, 'Put out').click();
    await button(page, 'Put out and end').click();
    await screen(page, 'result');
    await settled('put-out');
  } catch (error) {
    problems.push({ type: 'lifecycle', error: error.stack ?? String(error) });
  }
  const data = await page.evaluate(() => window.__tideAudio.read());
  await json(join(dir, 'lifecycle-trace.json'), data);
  const active = key => samples[key]?.surf.filter(bus => bus.connected) ?? [];
  const live = key => active(key).length === 1 && active(key)[0].atSpeaker.rms >= audibleRms;
  const quiet = key => Boolean(samples[key] && !active(key).length);
  const skipMixMs = key => {
    const marked = data.events.find(row => row.label === 'skip-' + key);
    const firstSeatedMix = data.readings.find(row => row.atMs >= marked?.atMs
      && row.surf.some(bus => bus.connected && bus.foamCutoffHz >= 2100));
    return firstSeatedMix ? firstSeatedMix.atMs - marked.atMs : null;
  };
  const mixHandoff = { earlyMs: skipMixMs('early-seated'), lateMs: skipMixMs('late-seated') };
  const gap = {
    early: endpointGap(normal?.frames.seated?.camera, frames['early-seated']?.camera),
    late: endpointGap(normal?.frames.seated?.camera, frames['late-seated']?.camera),
  };
  const checks = {
    earlySkip: live('early-seated'),
    lateSkip: live('late-seated'),
    skipMix: Object.values(mixHandoff).every(value => value !== null && value < 500)
      && Math.abs((active('early-seated')[0]?.foamCutoffHz ?? 0) - active('late-seated')[0]?.foamCutoffHz) < 70,
    endpointParity: Object.values(gap).every(value => value && value.positionMetres < .015
      && value.aimDegrees < .35 && value.fovDegrees < .1),
    mute: active('muted').length === 1 && active('muted')[0].atSpeaker.peak <= 1e-6
      && active('muted')[0].preMute.rms > 0,
    resume: live('resumed') && active('resumed')[0]?.id === active('early-seated')[0]?.id,
    return: quiet('initial-entrance') && quiet('back-outside') && live('late-seated')
      && active('late-seated')[0]?.id !== active('early-seated')[0]?.id,
    courtSwitch: quiet('bamboo-entrance') && quiet('bamboo-seated') && quiet('tide-entrance-again') && live('tide-seated-again')
      && active('tide-seated-again')[0]?.id !== active('late-seated')[0]?.id,
    lightRetry: rejectedLightRequests === 1 && live('failed-light') && live('retried-light')
      && [active('failed-light')[0]?.id, active('retried-light')[0]?.id].every(id => id === active('tide-seated-again')[0]?.id),
    putOut: quiet('put-out'),
    noOverlap: data.readings.every(row => row.surf.filter(bus => bus.connected).length <= 1),
  };
  for (const [check, passed] of Object.entries(checks)) {
    if (!passed) problems.push({ type: 'lifecycle check', check });
  }
  return { checks, samples, frames, endpointDeltas: gap, mixHandoff, rejectedLightRequests };
}

await mkdir(out);
const outcome = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), selected,
  lifecycleCases, viewportVideo, cases: {}, problems: [] };
let preview;
let server;
let browser;
try {
  await json(join(out, 'run-pids.json'), { fixture: process.pid });
  preview = await startPreview({ surfReview: true, includeDriftControl: true });
  server = await chromium.launchServer({ channel: 'chrome', host: '127.0.0.1',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  await json(join(out, 'run-pids.json'), { fixture: process.pid, chrome: server.process().pid });
  browser = await chromium.connect(server.wsEndpoint());
  for (const name of selected) {
    const { width, height, hour } = cases[name];
    const dir = join(out, name);
    await mkdir(dir);
    const problems = [];
    const evidence = { name, viewport: [width, height], hour, problems };
    async function withApp(label, action) {
      const phone = name.startsWith('phone-');
      const context = await browser.newContext({ viewport: { width, height }, locale: 'en-US',
        timezoneId: 'Asia/Singapore', deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
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
          if (response.status() >= 400 && response.url().startsWith(preview.url)) {
            problems.push({ type: 'HTTP error', status: response.status(), url: response.url().slice(preview.url.length) });
          }
        });
        await page.addInitScript(installTideAudioTap);
        await page.clock.setFixedTime(new Date(`2026-11-22T${hour}:00:00+08:00`));
        await page.goto(preview.url);
        await page.getByLabel('Your wish', { exact: true }).fill('For a safe crossing home.');
        await button(page, 'Set my wish').click();
        await entrance(page);
        return await action(page);
      } catch (error) {
        problems.push({ type: 'UI run', error: error.stack ?? String(error) });
        await page?.screenshot({ path: join(dir, label + '-failed-ui.png'), scale: 'css', timeout: 5000 }).catch(() => {});
        return null;
      } finally {
        await context.close();
      }
    }
    evidence.journey = await withApp('journey', page => journey(page, dir, problems, hour));
    if (lifecycleCases.includes(name)) {
      evidence.lifecycle = await withApp('lifecycle', page => lifecycle(page, dir, evidence.journey, problems));
    }
    await json(join(dir, 'review.json'), evidence);
    outcome.cases[name] = { file: join(dir, 'review.json'), problems };
    console.log(name, JSON.stringify({ journey: evidence.journey?.checks, lifecycle: evidence.lifecycle?.checks, problems }));
  }
} catch (error) {
  outcome.problems.push({ type: 'run', error: error.stack ?? String(error) });
} finally {
  const cleanup = { fixturePid: process.pid, chromePid: server?.process().pid };
  for (const [key, resource] of [['browser', browser], ['chrome', server], ['preview', preview]]) {
    if (!resource) continue;
    try { await resource.close(); cleanup[key] = 'closed'; }
    catch (error) { outcome.problems.push({ type: 'cleanup', resource: key, error: String(error) }); }
  }
  cleanup.chromeExitCode = server?.process().exitCode;
  cleanup.chromeSignal = server?.process().signalCode;
  await json(join(out, 'cleanup.json'), cleanup);
  await json(join(out, 'capture.json'), outcome);
}
if (outcome.problems.length || Object.values(outcome.cases).some(value => value.problems.length)) process.exitCode = 1;
