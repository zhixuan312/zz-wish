// Run under the S7 GPU lease. Only this fixture accelerates the real burn clock.
/* global Blob, document, FileReader, getComputedStyle, MediaRecorder, performance, window */
import { chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startPreview } from './preview.mjs';

const [output, ...filters] = process.argv.slice(2);
if (!output) throw new Error('Usage: node docs/sea-tide/ending-review.mjs NEW_OUTPUT_DIR [after-put-out ...]');
const baseline = 'e67f7a3';
const out = resolve(output);
const root = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);
const past = {};
const sourceHashes = {};
for (const relative of ['web/src/engine/scene.js', 'web/src/engine/places/sea-tide.js', 'web/src/engine/places/sea-tide-hood.js']) {
  const name = relative.split('/').at(-1);
  past[name] = (await run('git', ['show', baseline + ':' + relative], { cwd: root })).stdout;
  const current = await readFile(join(root, relative), 'utf8');
  const hash = source => createHash('sha256').update(source).digest('hex');
  sourceHashes[relative] = { before: hash(past[name]), after: hash(current) };
}
const durations = {
  'put-out': { flame: .12, ember: .35, aperture: 16, samples: [.25, 2.6, 6.1, 16.2], clipSeconds: 6.1 },
  exhausted: { flame: 2.6, ember: 3.8, aperture: 5.2, samples: [.25, 2.65, 3.9, 5.4], clipSeconds: 5.4 },
};
const viewport = { width: 390, height: 844 };
const buttons = (page, name) => page.getByRole('button', { name, exact: true });
const selectPlace = (page, name) => page.getByRole('radio', { name });
const sample = page => page.evaluate(() => window.__tideEndingSample());
const shot = (page, dir, name) => page.screenshot({ path: join(dir, name + '.png'), scale: 'css' });
const json = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const nearZero = amount => Math.abs(amount) <= 1e-6;

async function courtReady(page, placeId) {
  await page.waitForFunction(id => {
    const stage = document.querySelector('.court-loading')?.dataset.stage;
    const step = document.querySelector('.ui[data-screen="place"] .place-actions .primary');
    return stage === 'error' || (stage === 'ready' && step?.textContent?.trim() === 'Step inside' && !step.disabled
      && window.__tideDriftProbe?.().id === id
      && Number(getComputedStyle(document.querySelector('#fade')).opacity) <= .01);
  }, placeId, { polling: 80 });
  const diagnostics = await page.evaluate(() => ({
    stage: document.querySelector('.court-loading')?.dataset.stage, prepare: window.__tidePrepareError, preview: window.__tidePreviewError,
  }));
  if (diagnostics.stage !== 'ready') throw new Error('Court preparation failed: ' + JSON.stringify(diagnostics));
}

async function startTideBurn(page) {
  await buttons(page, 'Step inside').click();
  await page.waitForFunction(() => window.__walkProgress?.id === 'sea-tide' && window.__walkProgress.progress > .015);
  await buttons(page, 'Skip').click();
  const lighting = page.waitForResponse(response => response.url().endsWith('/api/candles') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^Light it / }).click();
  const response = await lighting;
  if (!response.ok()) throw new Error('Lighting HTTP ' + response.status());
  const candle = await response.json();
  await page.waitForFunction(() => window.__visualIgnition?.state === 'settled'
    && document.querySelector('.ui')?.dataset.screen === 'burning');
  return candle;
}

async function startClip(page) {
  await page.evaluate(() => {
    const stream = document.querySelector('#gl').captureStream(30);
    const mimeType = 'video/webm;codecs=vp8';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_100_000 });
    const chunks = [];
    const start = performance.now();
    recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
    window.__tideStopEndingClip = async () => {
      try {
        await new Promise((done, fail) => {
          recorder.onstop = done;
          recorder.onerror = event => fail(event.error);
          recorder.stop();
        });
        const blob = new Blob(chunks, { type: mimeType });
        return await new Promise((done, fail) => {
          const reader = new FileReader();
          reader.onload = () => done({ bytes: blob.size, seconds: (performance.now() - start) / 1000,
            encoded: reader.result.split(',')[1] });
          reader.onerror = fail;
          reader.readAsDataURL(blob);
        });
      } finally {
        for (const track of stream.getTracks()) track.stop();
      }
    };
    recorder.start(1000);
  });
}

async function saveClip(page, dir) {
  const { encoded, bytes, seconds } = await page.evaluate(() => window.__tideStopEndingClip());
  if (bytes <= 0 || seconds < 3) throw new Error('Ending clip is incomplete.');
  const file = join(dir, 'ending-continuous.webm');
  await writeFile(file, Buffer.from(encoded, 'base64'));
  return { file, bytes, seconds, scope: 'Continuous WebGL canvas from burning through the ending.' };
}

async function triggerEnding(page, preview, candle, ending) {
  const saving = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/(?:candles|runs)\/[^/]+\/end$/.test(response.url()));
  if (ending === 'put-out') {
    await buttons(page, 'Put out').click();
    await buttons(page, 'Put out and end').click();
  } else {
    preview.advanceBurnClockBy(candle.durationMs);
    await page.evaluate(duration => { window.__tideBurnOffsetMs = duration; }, candle.durationMs);
  }
  const resultTitle = ending === 'put-out' ? 'This lamp went out' : 'This lamp has burned down';
  await page.getByRole('heading', { name: resultTitle, exact: true }).waitFor();
  const response = await saving;
  if (!response.ok()) throw new Error('Settlement HTTP ' + response.status());
  const result = await response.json();
  const expected = ending === 'put-out' ? ['went_out', 'put_out'] : ['burned_down', 'complete'];
  if (result.status !== expected[0] || result.endReason !== expected[1]) {
    throw new Error('Unexpected persisted settlement: ' + JSON.stringify({ status: result.status, endReason: result.endReason }));
  }
  return { resultTitle, status: result.status, endReason: result.endReason, burnedMs: result.burnedMs, plannedMs: candle.durationMs };
}

async function waitEndingFrame(page, seconds) {
  await page.waitForFunction(target => window.__tideEndingSample().sinceSnuffSeconds >= target, seconds);
}

function summarizeTrace(trace, contract, ending, verifyAperture) {
  if (trace.origin?.done !== (ending === 'exhausted')) throw new Error('No matching real snuff event in trace.');
  const before = trace.frames.filter(frame => frame.sinceSnuffSeconds === null).at(-1);
  const frames = trace.frames.filter(frame => frame.sinceSnuffSeconds !== null);
  const peak = selector => Math.max(...frames.map(selector));
  const firstDark = (selector, after) => frames.find(frame => frame.sinceSnuffSeconds >= after && nearZero(selector(frame)))?.sinceSnuffSeconds ?? null;
  const flameZero = firstDark(frame => frame.flamePower, contract.flame * .5);
  const bounceZero = firstDark(frame => frame.lights.bounce, contract.flame * .5);
  const emberZero = firstDark(frame => frame.wickEmber.visible ? frame.wickEmber.intensity : 0, contract.ember * .5);
  const apertureZero = firstDark(frame => frame.aperture.glow, contract.aperture - .3);
  const maxFrameGapSeconds = frames.reduce((maximum, frame, i) =>
    i ? Math.max(maximum, (frame.wallMs - frames[i - 1].wallMs) / 1000) : maximum, 0);
  // A capture frame can straddle the end of an animation. Size that allowance
  // around the endpoint rather than borrowing a frame gap from another step.
  function endpointMatches(seconds, target) {
    const beforeTarget = frames.filter(frame => frame.sinceSnuffSeconds < target).at(-1);
    const afterTarget = frames.find(frame => frame.sinceSnuffSeconds >= target);
    if (seconds === null || !beforeTarget || !afterTarget) return false;
    const oneFrame = afterTarget.sinceSnuffSeconds - beforeTarget.sinceSnuffSeconds;
    const tolerance = Math.max(oneFrame, 1 / 60) + .002;
    return seconds >= target - tolerance && seconds <= target + tolerance;
  }
  const postFlameTail = frames.find(frame => frame.sinceSnuffSeconds >= contract.flame + .07 && frame.aperture.glow > 1e-4);
  const tailNear = frames.reduce((closest, frame) => Math.abs(frame.sinceSnuffSeconds - (contract.flame + .27))
    < Math.abs((closest?.sinceSnuffSeconds ?? Infinity) - (contract.flame + .27)) ? frame : closest, null);
  const anchor = frames.reduce((closest, frame) => Math.abs(frame.sinceSnuffSeconds - .08)
    < Math.abs((closest?.sinceSnuffSeconds ?? Infinity) - .08) ? frame : closest, null);
  const compare = frames.reduce((closest, frame) => Math.abs(frame.sinceSnuffSeconds - 2.68)
    < Math.abs((closest?.sinceSnuffSeconds ?? Infinity) - 2.68) ? frame : closest, null);
  const measuredTauRatio = anchor?.aperture.glow > 0 ? compare.aperture.glow / anchor.aperture.glow : null;
  const expectedTauRatio = anchor && compare ? Math.exp(-(compare.sinceSnuffSeconds - anchor.sinceSnuffSeconds) / 2.6) : null;
  const nearest = target => frames.reduce((closest, frame) => Math.abs(frame.sinceSnuffSeconds - target)
    < Math.abs((closest?.sinceSnuffSeconds ?? Infinity) - target) ? frame : closest, null);
  const firstPoly = nearest(2.9);
  const lastPoly = nearest(4.35);
  const polynomialRatio = firstPoly?.aperture.glow > 0 ? lastPoly.aperture.glow / firstPoly.aperture.glow : null;
  const expectedPolynomialRatio = firstPoly && lastPoly
    ? (Math.max(0, 5.2 - lastPoly.sinceSnuffSeconds) / Math.max(.001, 5.2 - firstPoly.sinceSnuffSeconds)) ** 1.5 : null;
  const checks = {
    flameOnBeforeEnding: before?.flamePower > .02,
    flameEndpoint: endpointMatches(flameZero, contract.flame),
    bounceEndpoint: endpointMatches(bounceZero, contract.flame),
    emberEndpoint: endpointMatches(emberZero, contract.ember),
    aperturePresentAfterFlame: !verifyAperture || Boolean(postFlameTail && tailNear?.aperture.glow > 0),
    apertureEndpoint: !verifyAperture || endpointMatches(apertureZero, contract.aperture),
    exponentialTauMatches: !verifyAperture || ending !== 'put-out'
      || (measuredTauRatio !== null && Math.abs(measuredTauRatio - expectedTauRatio) <= .035),
    exhaustionPolynomialMatches: !verifyAperture || ending !== 'exhausted'
      || (polynomialRatio !== null && Math.abs(polynomialRatio - expectedPolynomialRatio) <= .035),
  };
  return { frames: frames.length, maxFrameGapSeconds, before, checks,
    observedSeconds: { flameZero, bounceZero, emberZero, apertureZero },
    peaks: { flame: peak(frame => frame.flamePower), ember: peak(frame => frame.wickEmber.intensity),
      bounce: peak(frame => frame.lights.bounce), apertureGlow: peak(frame => frame.aperture.glow),
      visibleSmokeSprites: peak(frame => frame.smoke?.visibleSprites ?? 0) },
    tail: { measuredTauRatio, expectedTauRatio, polynomialRatio, expectedPolynomialRatio, postFlameTailSecond: postFlameTail?.sinceSnuffSeconds ?? null },
    passed: Object.values(checks).every(Boolean) };
}

async function timeEnding(page, preview, candle, ending, dir, verifyAperture) {
  const contract = durations[ending];
  await shot(page, dir, 'burning-ui');
  await page.evaluate(() => window.__startTideEndingTrace());
  await page.waitForTimeout(120);
  await startClip(page);
  const settlement = await triggerEnding(page, preview, candle, ending);
  let video;
  const frames = [];
  for (const seconds of contract.samples) {
    await waitEndingFrame(page, seconds);
    const row = await sample(page);
    const stem = 'ending-' + seconds.toFixed(2).replace('.', '-') + 's';
    frames.push({ ...row, requestedSeconds: seconds, file: join(dir, stem + '.png') });
    await shot(page, dir, stem);
    if (seconds === contract.clipSeconds) video = await saveClip(page, dir);
  }
  const trace = await page.evaluate(() => window.__stopTideEndingTrace());
  await json(join(dir, 'frame-trace.json'), trace);
  const timing = summarizeTrace(trace, contract, ending, verifyAperture);
  return { settlement, timing, frames, video, trace: join(dir, 'frame-trace.json') };
}

function renderedResidual(row) {
  return row.visitorVisible && (!nearZero(row.flamePower) || !nearZero(row.aperture.glow)
    || row.wickEmber.visible || Object.values(row.lights).some(amount => !nearZero(amount)));
}

async function exerciseDraw(page, dir) {
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  const pad = page.locator('.pad');
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error('The Draw pad is not rendered.');
  // The Tier 2 pointer flow with a symmetric stepped shoulder and flared foot.
  // Tide preserves the radially turned pottery shape around its vertical axis.
  const outline = [[.36, .18], [.36, .31], [.29, .37], [.29, .55], [.20, .69], [.20, .78],
    [.80, .78], [.80, .69], [.71, .55], [.71, .37], [.64, .31], [.64, .18]];
  const point = ([x, y]) => [box.x + x * box.width, box.y + y * box.height];
  await page.mouse.move(...point(outline[0]));
  await page.mouse.down();
  for (const next of outline.slice(1)) await page.mouse.move(...point(next), { steps: 18 });
  await page.mouse.up();
  const samples = {};
  for (const [name, label, rgb] of [['red', 'Red gauze', 0xa82a1c], ['ivory', 'Ivory gauze', 0xf2e4c4]]) {
    const swatch = page.getByRole('radio', { name: label, exact: true });
    await swatch.click();
    await page.waitForFunction(color => {
      const profile = window.__tideDrawProfile();
      return profile?.inputRGB === color && profile.sourceRows.length > 6;
    }, rgb);
    const profile = await page.evaluate(() => window.__tideDrawProfile());
    const file = join(dir, 'draw-' + name + '-ui.png');
    await page.screenshot({ path: file, scale: 'css' });
    const bare = await page.addStyleTag({ content: '.ui { visibility: hidden !important; }' });
    let unobscured;
    try {
      unobscured = join(dir, 'draw-' + name + '-hood.png');
      await page.screenshot({ path: unobscured, scale: 'css' });
    } finally {
      await bare.evaluate(node => node.remove());
    }
    samples[name] = { ...profile, file, unobscured, selected: await swatch.getAttribute('aria-checked') === 'true' };
  }
  const span = values => Math.max(...values) - Math.min(...values);
  const { red, ivory } = samples;
  const centreShiftDrawMetres = span(red.sourceRows.map(row => row.cx));
  const validSections = red.crossSections.filter(section => section.points > 0);
  const centreShiftHoodMetres = validSections.length ? span(validSections.map(section => section.centerX)) : null;
  const checks = {
    distinctSelectedClayTints: red.selected && ivory.selected && red.inputRGB !== ivory.inputRGB
      && Math.hypot(...red.clayLinearRGB.map((channel, i) => channel - ivory.clayLinearRGB[i])) > .005,
    sameSilhouetteAcrossTints: JSON.stringify(red.crossSections) === JSON.stringify(ivory.crossSections),
    varyingProfileWidth: validSections.length >= 3 && span(validSections.map(section => section.widthX)) > .004,
    flaredFootAndNarrowShoulder: validSections.length >= 3 && validSections[0].widthX > validSections.at(-1).widthX + .01,
  };
  const evidence = { ...samples, centreShiftDrawMetres, centreShiftHoodMetres, checks, passed: Object.values(checks).every(Boolean) };
  await json(join(dir, 'draw-colour.json'), evidence);
  return evidence;
}

async function exerciseSwitch(page, preview, candle, dir) {
  await page.evaluate(() => window.__startTideEndingTrace());
  const settlement = await triggerEnding(page, preview, candle, 'put-out');
  await waitEndingFrame(page, .21);
  const beforeSwitch = await sample(page);
  await buttons(page, 'Another lamp for this wish').click();
  await selectPlace(page, /^Bamboo Rain Cloister/).click();
  await courtReady(page, 'bamboo-rain');
  const bamboo = await sample(page);
  await shot(page, dir, 'switched-bamboo');
  await selectPlace(page, /^Tide Temple/).click();
  await courtReady(page, 'sea-tide');
  const reentry = await sample(page);
  await buttons(page, 'Step inside').click();
  await page.waitForFunction(() => window.__walkProgress?.id === 'sea-tide' && window.__walkProgress.progress > .015);
  await buttons(page, 'Skip').click();
  await page.locator('.ui[data-screen="candle"]').waitFor();
  const chooser = await sample(page);
  await shot(page, dir, 'reentry-chooser');
  const trace = await page.evaluate(() => window.__stopTideEndingTrace());
  await json(join(dir, 'switch-trace.json'), trace);
  const switched = trace.frames.filter(frame => frame.placeId === 'bamboo-rain');
  const switchLagSeconds = switched.length ? switched[0].sinceSnuffSeconds : null;
  const draw = await exerciseDraw(page, dir);
  const checks = {
    switchedBeforeNaturalThermalExpiry: switchLagSeconds !== null && switchLagSeconds < durations['put-out'].aperture,
    apertureActiveOnExit: beforeSwitch.aperture.glow > 1e-4,
    noResidualInBamboo: switched.length > 0 && switched.every(frame => !renderedResidual(frame)),
    reenteredWithoutVisibleResidual: !renderedResidual(reentry),
    chooserRestartsDark: chooser.visitorVisible && !renderedResidual(chooser),
    drawProfileAndColour: draw.passed,
  };
  return { settlement, beforeSwitch, bamboo, reentry, chooser, switchLagSeconds, matches: checks,
    draw: { passed: draw.passed, checks: draw.checks, file: join(dir, 'draw-colour.json') },
    passed: Object.values(checks).every(Boolean), trace: join(dir, 'switch-trace.json') };
}

async function runCase(browser, preview, variant, scenario) {
  const name = variant + '-' + scenario;
  const dir = join(out, name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport, locale: 'en-US', timezoneId: 'Asia/Singapore', isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  });
  const problems = [];
  let page;
  try {
    page = await context.newPage();
    page.setDefaultTimeout(55_000);
    page.on('pageerror', error => problems.push(String(error)));
    page.on('console', message => {
      if (/THREE.WebGLProgram|WebGL: INVALID_/i.test(message.text())) problems.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(preview.url)) {
        problems.push(response.status() + ' ' + response.url().slice(preview.url.length));
      }
    });
    await page.clock.setFixedTime(new Date('2026-11-22T22:00:00+08:00'));
    await page.goto(preview.url);
    await page.getByLabel('Your wish', { exact: true }).fill('For a safe crossing home.');
    await buttons(page, 'Set my wish').click();
    await courtReady(page, 'sea-tide');
    if (scenario === 'switch') {
      await selectPlace(page, /^Bamboo Rain Cloister/).click();
      await courtReady(page, 'bamboo-rain');
      await selectPlace(page, /^Tide Temple/).click();
      await courtReady(page, 'sea-tide');
    }
    const candle = await startTideBurn(page);
    const result = scenario === 'switch' ? await exerciseSwitch(page, preview, candle, dir)
      : await timeEnding(page, preview, candle, scenario, dir, variant === 'after');
    if (!(result.passed ?? result.timing.passed)) problems.push('One or more ending evidence checks failed.');
    const evidence = { variant, scenario, viewport, localHour: 22, ...result, problems };
    await json(join(dir, 'review.json'), evidence);
    return evidence;
  } catch (error) {
    problems.push(error.stack ?? String(error));
    await page?.screenshot({ path: join(dir, 'failed-state.png'), scale: 'css', timeout: 5_000 }).catch(() => {});
    await json(join(dir, 'review.json'), { variant, scenario, problems });
    return { variant, scenario, problems };
  } finally {
    await context.close();
  }
}

const scenarioSets = { before: ['put-out', 'exhausted'], after: ['put-out', 'exhausted', 'switch'] };
const chosen = Object.entries(scenarioSets).flatMap(([variant, scenarios]) =>
  scenarios.map(scenario => variant + '-' + scenario)).filter(name => !filters.length || filters.includes(name));
if (!chosen.length) throw new Error('No matching ending comparison cases.');
await mkdir(out, { recursive: true });
const report = { baseline, sourceHashes, scope: '390×844 phone at 22:00, loopback only. The natural burn timer is advanced on client and server; animation time is real.', cases: {} };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const [variant, scenarios] of Object.entries(scenarioSets)) {
    const selected = scenarios.filter(scenario => chosen.includes(variant + '-' + scenario));
    if (!selected.length) continue;
    const preview = await startPreview({ endingReview: true, endingSources: variant === 'before' ? past : undefined,
      includeDriftControl: selected.includes('switch') });
    try {
      for (const scenario of selected) {
        const name = variant + '-' + scenario;
        const evidence = await runCase(browser, preview, variant, scenario);
        report.cases[name] = evidence;
        console.log(name, evidence.problems.length ? evidence.problems : evidence.timing?.observedSeconds ?? evidence.matches);
      }
    } finally {
      await preview.close();
    }
  }
} finally {
  try {
    await browser.close();
  } finally {
    await json(join(out, 'ending-comparison.json'), report);
  }
}
if (Object.values(report.cases).some(entry => entry.problems.length)) process.exitCode = 1;
