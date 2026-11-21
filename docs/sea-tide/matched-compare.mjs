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

const [receipts, output, ...filter] = process.argv.slice(2);
if (!receipts || !output || resolve(receipts) === resolve(output)) {
  throw new Error('Usage: node docs/sea-tide/matched-compare.mjs NEW_CAPTURE_DIR NEW_COMPARE_DIR [desktop-day ...]');
}
const baseline = '039a7ee';
const path = 'web/src/engine/places/sea-tide.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
const prior = await exec('git', ['show', baseline + ':' + path], { cwd: root });
const present = await readFile(join(root, path), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
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
  const shots = [{ label: 'water-reveal', pose: evidence.shots['harbour-reveal'].camera, offer: null }];
  if (phone) shots.push({ label: 'phone-harbour-at-chooser-pose', pose: evidence.shots.chooser.camera, offer });
  sources[name] = { viewport: evidence.viewport, localHour: evidence.localHour, phone, shots };
}

await mkdir(output, { recursive: true });
const report = { sourceCapture: resolve(receipts), baseline, worldModule: path,
  beforeSourceSha256: sha256(prior.stdout), afterSourceSha256: sha256(present), animationSecond,
  scope: 'Tide world module A/B at matching actual route poses and the same local time. Scene only. See the source capture for normal operation and actual chooser UI.',
  cases: {}, problems: [] };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const variant of [{ name: 'before', source: prior.stdout }, { name: 'after' }]) {
    const preview = await startPreview({ tideWorldSource: variant.source, matchedPose: true });
    try {
      for (const [name, item] of Object.entries(sources)) {
        const [width, height] = item.viewport;
        const context = await browser.newContext({ viewport: { width, height },
          locale: 'en-US', timezoneId: 'Asia/Singapore', isMobile: item.phone, hasTouch: item.phone, deviceScaleFactor: 1 });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(60_000);
          page.on('pageerror', error => report.problems.push({ type: 'page error', case: name, variant: variant.name, error: String(error) }));
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
          await page.addStyleTag({ content: '.ui { visibility: hidden !important; }' });
          for (const shot of item.shots) {
            const actual = await page.evaluate(pose => window.__tideSetMatchedPose(pose),
              { ...shot.pose, animationSecond, offer: shot.offer });
            const directory = join(output, name, shot.label);
            await mkdir(directory, { recursive: true });
            const file = join(directory, variant.name + '.png');
            await page.screenshot({ path: file, scale: 'css', timeout: 25_000 });
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
    const [screenWidth, screenHeight] = pair.viewport;
    const landmark = label === 'water-reveal'
      ? pair.after.actual.sea.find(point => point.inFrame && !point.occluder) ?? pair.after.actual.mouth
      : pair.after.actual.mouth;
    if (!landmark.inFrame) {
      report.problems.push({ type: 'off-camera crop landmark', case: name, shot: label });
      continue;
    }
    const width = Math.min(screenWidth, screenWidth < 500 ? 288 : 560), height = Math.min(screenHeight, 314);
    const x = Math.max(0, Math.min(screenWidth - width, Math.round(landmark.pixel[0] - width / 2)));
    const y = Math.max(0, Math.min(screenHeight - height, Math.round(landmark.pixel[1] - height / 2)));
    pair.nativeCrop = { x, y, width, height, files: {} };
    for (const variant of ['before', 'after']) {
      const crop = join(output, name, label, variant + '-crop.png');
      await exec('/usr/bin/sips', ['--cropToHeightWidth', String(height), String(width), '--cropOffset', String(y), String(x),
        pair[variant].file, '--out', crop]);
      pair.nativeCrop.files[variant] = crop;
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
