// Run under the S7 GPU lease. Use a fresh evidence directory for the pairs.
/* global document, getComputedStyle, window */
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { COLORS, DEFAULT_COLOR, DEFAULT_MINUTES, PRESET_SHAPES, sizedPreset } from '../../shared/rules.ts';
import { startPreview } from './preview.mjs';

const [receipts, output, ...args] = process.argv.slice(2);
if (!receipts || !output || resolve(receipts) === resolve(output)) {
  throw new Error('Usage: node docs/sea-tide/matched-compare.mjs NEW_CAPTURE_DIR NEW_COMPARE_DIR [--shoreline [--seated-only]] [desktop-day ...]');
}
const shoreline = args.includes('--shoreline');
const seatedOnly = args.includes('--seated-only');
if (seatedOnly && !shoreline) throw new Error('--seated-only requires --shoreline');
const filter = args.filter(arg => arg !== '--shoreline' && arg !== '--seated-only');
const baseline = shoreline ? '86834b5' : '039a7ee';
const paths = { world: 'web/src/engine/places/sea-tide.js', water: 'web/src/engine/places/sea-tide-water.js' };
const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function compareSource(path) {
  const prior = (await exec('git', ['show', baseline + ':' + path], { cwd: root })).stdout;
  const present = await readFile(join(root, path), 'utf8');
  return { prior, present, receipt: { path, before: sha256(prior), after: sha256(present) } };
}
const [world, water] = await Promise.all([compareSource(paths.world), shoreline ? compareSource(paths.water) : null]);
const animationSecond = 7.25;
const offer = { kind: 'shade', rows: sizedPreset(PRESET_SHAPES.shade[0].rows, DEFAULT_MINUTES),
  color: COLORS.shade[DEFAULT_COLOR.shade] };
const cases = ['desktop-day', 'desktop-night', 'phone-day', 'phone-night'].filter(name => !filter.length || filter.includes(name));
if (!cases.length) throw new Error('No matching comparison case.');
const json = (file, data) => writeFile(file, JSON.stringify(data, null, 2) + '\n');
const sources = {};
for (const name of cases) {
  const evidence = JSON.parse(await readFile(join(receipts, name, 'review.json'), 'utf8'));
  if (!evidence.shots?.['harbour-reveal']?.camera || !evidence.shots?.chooser?.camera) {
    throw new Error('No captured match poses in ' + name);
  }
  const phone = name.startsWith('phone');
  const shots = seatedOnly ? [] : [{ label: 'water-reveal', pose: evidence.shots['harbour-reveal'].camera, offer: null }];
  if (shoreline) {
    const seated = evidence.shots.burning?.camera;
    if (!seated) throw new Error('No real settled burning pose in ' + name);
    shots.push({ label: 'seated-water', pose: seated, preserveLitLamp: true });
  } else if (phone) shots.push({ label: 'phone-harbour-at-chooser-pose', pose: evidence.shots.chooser.camera, offer });
  sources[name] = { viewport: evidence.viewport, localHour: evidence.localHour, phone, shots };
}

await mkdir(output, { recursive: true });
const report = { sourceCapture: resolve(receipts), baseline, worldModule: paths.world,
  beforeSourceSha256: world.receipt.before, afterSourceSha256: world.receipt.after, animationSecond,
  modules: { world: world.receipt, ...(water ? { water: water.receipt } : {}) },
  scope: 'Tide A/B at matching actual route poses, local time and animation phase. Scene-only PNGs. The source capture contains the normal walk and actual UI.',
  cases: {}, problems: [] };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const variant of [
    { name: 'before', world: world.prior, water: water?.prior },
    { name: 'after', world: world.present, water: water?.present },
  ]) {
    const preview = await startPreview({ tideWorldSource: variant.world, tideWaterSource: variant.water, matchedPose: true });
    try {
      for (const [name, item] of Object.entries(sources)) {
        const [width, height] = item.viewport;
        const context = await browser.newContext({ viewport: { width, height },
          locale: 'en-US', timezoneId: 'Asia/Singapore', isMobile: item.phone, hasTouch: item.phone, deviceScaleFactor: 1 });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(60_000);
          page.on('pageerror', error => report.problems.push({ type: 'page error', case: name, variant: variant.name, error: String(error) }));
          page.on('console', message => {
            if (/THREE.WebGLProgram|WebGL: INVALID_/i.test(message.text())) {
              report.problems.push({ type: 'renderer error', case: name, variant: variant.name, error: message.text() });
            }
          });
          page.on('response', response => {
            if (response.status() >= 400 && response.url().startsWith(preview.url)) {
              report.problems.push({ type: 'HTTP error', case: name, variant: variant.name, status: response.status(),
                path: response.url().slice(preview.url.length) });
            }
          });
          await page.clock.setFixedTime(new Date('2026-11-22T' + item.localHour + ':00:00+08:00'));
          await page.goto(preview.url);
          await page.getByLabel('Your wish', { exact: true }).fill('For a safe crossing home.');
          await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
          await page.waitForFunction(() => {
            const stage = document.querySelector('.court-loading')?.dataset.stage;
            return stage === 'error' || (stage === 'ready' && window.__tideSceneVisible?.()
              && Number(getComputedStyle(document.querySelector('#fade')).opacity) <= .01);
          }, null, { polling: 100 });
          const failure = await page.evaluate(() => window.__tidePrepareError ?? window.__tidePreviewError ?? null);
          if (failure) throw new Error(failure);
          for (const shot of item.shots) {
            if (shot.preserveLitLamp) {
              await page.evaluate(() => window.__tideReleaseMatchedPose());
              await page.getByRole('button', { name: 'Step inside', exact: true }).click();
              await page.waitForFunction(() => window.__walkProgress?.id === 'sea-tide'
                && window.__walkProgress?.state === 'walking' && window.__walkProgress?.progress > .015);
              await page.getByRole('button', { name: 'Skip', exact: true }).click();
              await page.getByRole('button', { name: /^Light it / }).click();
              await page.waitForFunction(() => window.__visualIgnition?.state === 'settled'
                && document.querySelector('.ui')?.dataset.screen === 'burning');
            }
            const actual = await page.evaluate(pose => window.__tideSetMatchedPose(pose),
              { ...shot.pose, animationSecond, offer: shot.offer, preserveLitLamp: shot.preserveLitLamp });
            const directory = join(output, name, shot.label);
            await mkdir(directory, { recursive: true });
            const file = join(directory, variant.name + '.png');
            const hiddenUI = await page.addStyleTag({ content: '.ui { visibility: hidden !important; }' });
            try {
              await page.screenshot({ path: file, scale: 'css', timeout: 25_000 });
            } finally {
              await hiddenUI.evaluate(node => node.remove());
            }
            const entry = report.cases[name] ??= {};
            const pair = entry[shot.label] ??= { requestedPose: shot.pose, viewport: item.viewport, localHour: item.localHour };
            pair[variant.name] = { file, actual };
          }
          console.log(variant.name, name);
        } catch (error) {
          report.problems.push({ type: 'capture error', case: name, variant: variant.name, error: error.stack ?? String(error) });
        } finally {
          await context.close();
        }
      }
    } finally {
      await preview.close();
    }
  }

  function separation(a, b) {
    return Math.hypot(...a.map((value, index) => value - b[index]));
  }
  for (const [name, shots] of Object.entries(report.cases)) for (const [label, pair] of Object.entries(shots)) {
    if (!pair.before || !pair.after) {
      report.problems.push({ type: 'missing pair', case: name, shot: label });
      continue;
    }
    const before = pair.before.actual.camera, after = pair.after.actual.camera, expected = pair.requestedPose;
    const poseDifference = (one, two) => ({ positionMetres: separation(one.position, two.position),
      viewingDirectionVectorDelta: separation(one.direction, two.direction), fieldOfViewDegrees: Math.abs(one.fov - two.fov) });
    pair.deltas = { between: poseDifference(before, after), beforeToRequested: poseDifference(before, expected),
      afterToRequested: poseDifference(after, expected) };
    if (Object.values(pair.deltas).some(delta => Object.values(delta).some(value => value > 1e-6))) {
      report.problems.push({ type: 'unmatched pose', case: name, shot: label, deltas: pair.deltas });
    }
    const beforeState = pair.before.actual.matchedState, afterState = pair.after.actual.matchedState;
    const seated = label === 'seated-water';
    pair.animationMatch = beforeState.animationSecond === animationSecond && afterState.animationSecond === animationSecond
      && beforeState.enginePhase === afterState.enginePhase
      && separation(beforeState.waterTextureOffset, afterState.waterTextureOffset) <= 1e-8
      && (!shoreline || (beforeState.waterPhase === animationSecond && afterState.waterPhase === animationSecond
        && beforeState.nightMix === afterState.nightMix));
    pair.litMatch = seated ? beforeState.enginePhase === 'burning' && afterState.enginePhase === 'burning'
      && beforeState.wickIntensity > 0 && afterState.wickIntensity > 0
      && Math.abs(beforeState.wickIntensity - afterState.wickIntensity) <= 1e-6
      && beforeState.wickFlickerSeed === afterState.wickFlickerSeed : null;
    if (!pair.animationMatch || pair.litMatch === false) {
      report.problems.push({ type: 'unmatched animation or lamp', case: name, shot: label, beforeState, afterState });
    }
    const [screenWidth, screenHeight] = pair.viewport;
    const { mouth, sea, harbourTips, lamp } = pair.after.actual;
    const waterAnchor = sea.find(point => point.inFrame && !point.occluder) ?? mouth;
    if (!(label === 'water-reveal' ? waterAnchor : mouth).inFrame) {
      report.problems.push({ type: 'off-camera crop landmark', case: name, shot: label });
      continue;
    }
    const foreground = seated && lamp?.base.inFrame ? lamp.base.pixel
      : sea[0].inFrame ? sea[0].pixel : [screenWidth * .5, screenHeight * .68];
    const tipPixels = harbourTips.filter(tip => tip?.pixels.length).flatMap(tip => tip.pixels);
    const distancePixels = tipPixels.length
      ? [tipPixels.reduce((sum, point) => sum + point[0], 0) / tipPixels.length, Math.min(mouth.pixel[1], ...tipPixels.map(point => point[1])) - 20]
      : mouth.pixel;
    const regions = shoreline ? [
      { key: 'foreground', centre: foreground, width: screenWidth < 500 ? 320 : 600, height: 295 },
      { key: 'channel-water', centre: waterAnchor.pixel, width: screenWidth < 500 ? 288 : 570, height: 288 },
      { key: 'distant-coast', centre: distancePixels, width: screenWidth < 500 ? 350 : 680, height: 255 },
    ] : [{ key: 'crop', centre: label === 'water-reveal' ? waterAnchor.pixel : mouth.pixel,
      width: screenWidth < 500 ? 288 : 560, height: 314 }];
    pair.nativeCrops = {};
    for (const region of regions) {
      const width = Math.min(screenWidth, region.width), height = Math.min(screenHeight, region.height);
      const x = Math.max(0, Math.min(screenWidth - width, Math.round(region.centre[0] - width / 2)));
      const y = Math.max(0, Math.min(screenHeight - height, Math.round(region.centre[1] - height / 2)));
      const receipt = { x, y, width, height, files: {} };
      for (const variant of ['before', 'after']) {
        const crop = join(output, name, label, variant + '-' + region.key + '.png');
        await exec('/usr/bin/sips', ['--cropToHeightWidth', String(height), String(width), '--cropOffset', String(y), String(x),
          pair[variant].file, '--out', crop]);
        receipt.files[variant] = crop;
      }
      pair.nativeCrops[region.key] = receipt;
      if (!shoreline) pair.nativeCrop = receipt;
    }
  }
} finally {
  try {
    await browser.close();
  } finally {
    await json(join(output, 'matched-comparison.json'), report);
  }
}
if (report.problems.length) {
  console.error(report.problems);
  process.exitCode = 1;
}
