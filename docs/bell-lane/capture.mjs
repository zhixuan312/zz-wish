// Use the existing project Chrome/Metal test setup, with normal App controls.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startPreview } from './preview.mjs';
import { cameraAudit, cameraPeaks, liveCameraAudit } from './camera-audit.mjs';

const out = resolve(process.argv[2] ?? 'artifacts/bell-lane/round-1');
const picks = process.argv.slice(3);
await mkdir(out, { recursive: true });
const preview = await startPreview();
let browser;
const shots = [];
const problems = [];

function instrument() {
  // Tap the real street master after the doorway filter. The ordinary
  // destination still receives the original connection.
  const original = AudioNode.prototype.connect;
  const graphs = [];
  const clips = [];
  const upstream = new WeakMap();
  AudioNode.prototype.connect = function (destination, ...indices) {
    const result = original.call(this, destination, ...indices);
    if (destination instanceof AudioNode) upstream.set(destination, this);
    if (this instanceof StereoPannerNode && destination instanceof GainNode) {
      const c = this.context;
      const meter = c.createAnalyser();
      meter.fftSize = 2048;
      original.call(destination, meter);
      const monitor = c.createMediaStreamDestination();
      original.call(destination, monitor);
      const doorGain = upstream.get(this);
      const doorFilter = upstream.get(doorGain);
      graphs.push({ meter, monitor, c, master: destination, panner: this, doorGain, doorFilter });
      if (window.__recordBellLane) {
        const canvas = document.querySelector('#gl');
        const source = canvas.captureStream(30);
        const muxed = new MediaStream([...source.getVideoTracks(), ...monitor.stream.getAudioTracks()]);
        const rec = new MediaRecorder(muxed, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 5_000_000 });
        const chunks = [];
        rec.ondataavailable = event => chunks.push(event.data);
        rec.start();
        clips.push({ rec, source, chunks });
        window.__recordBellLane = false;
      }
    }
    return result;
  };
  window.__armBellLaneRecording = () => { window.__recordBellLane = true; };
  window.__finishBellLaneRecording = async () => {
    const { rec, source, chunks } = clips.at(-1);
    await new Promise(done => { rec.onstop = done; rec.stop(); });
    for (const track of source.getTracks()) track.stop();
    const blob = new Blob(chunks, { type: 'video/webm' });
    return await new Promise(done => {
      const reader = new FileReader();
      reader.onload = () => done(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };
  window.__reviewBellLaneAudio = () => graphs.map(({ meter, master, panner, c, doorGain, doorFilter }) => {
    const values = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(values);
    return {
      rms: Math.sqrt(values.reduce((sum, x) => sum + x * x, 0) / values.length),
      master: master.gain.value, pan: panner.pan.value, state: c.state,
      doorGain: doorGain.gain.value, cutoffHz: doorFilter.frequency.value,
    };
  });
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const screen = (page, state) => page.locator('.ui[data-screen="' + state + '"]').waitFor({ timeout: 80000 });
const ready = page => page.waitForFunction(() => document.querySelector('.ui[data-screen="place"] .court-loading[data-stage="ready"]'));
const audio = page => page.evaluate(() => window.__reviewBellLaneAudio());
const waitWalk = (page, seconds) => page.waitForFunction(value => window.__walkProgress?.progress >= value / 30, seconds, { timeout: 60000 });

async function snap(page, directory, name, seconds = null) {
  const path = join(directory, name + '.png');
  const { png, ...camera } = await page.evaluate(async seconds => {
    let timer;
    try {
      return await Promise.race([window.__captureBellFrame(seconds), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('No Bell Lane frame at ' + seconds)), 45000);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }, seconds);
  await writeFile(path, Buffer.from(png, 'base64'));
  shots.push({ file: path, ...camera });
  return camera;
}

async function exerciseAudio(page) {
  const check = {};
  await button(page, 'Back outside').click();
  await ready(page);
  await page.waitForTimeout(450);
  check.returnedOutside = await audio(page);
  await button(page, 'Step inside').click();
  await waitWalk(page, 2.6);
  check.reentryOutside = await audio(page);
  await button(page, 'Mute').click();
  await page.waitForTimeout(420);
  check.muted = await audio(page);
  await button(page, 'Sound on').click();
  await page.waitForTimeout(420);
  check.unmuted = await audio(page);
  await button(page, 'Skip').click();
  await screen(page, 'candle');
  await page.waitForTimeout(320);
  check.skipped = await audio(page);
  await button(page, 'Back outside').click();
  await ready(page);
  await page.getByRole('radio', { name: /^Snow Roof Court/ }).click();
  await ready(page);
  await page.waitForTimeout(550);
  check.switched = await audio(page);
  assert.equal(check.reentryOutside.length, 2);
  assert.equal(check.returnedOutside[0].rms, 0);
  assert.equal(check.muted.at(-1).rms, 0);
  assert.ok(check.unmuted.at(-1).rms > 0);
  assert.ok(check.skipped.at(-1).rms > 0);
  assert.ok(check.skipped.at(-1).doorGain < check.reentryOutside.at(-1).doorGain * .45);
  assert.ok(check.skipped.at(-1).cutoffHz < 400);
  assert.ok(check.switched.every(graph => graph.rms === 0));
  await page.getByRole('radio', { name: /^Lane's End Bell Court/ }).click();
  await ready(page);
  await button(page, 'Step inside').click();
  await button(page, 'Skip').click();
  await screen(page, 'candle');
  return check;
}

try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const mode of ['desktop', 'phone']) for (const look of ['day', 'night']) {
    const name = mode + '-' + look;
    if (picks.length && !picks.includes(name)) continue;
    const phone = mode === 'phone', directory = join(out, name);
    await mkdir(directory, { recursive: true });
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      locale: 'en-US', timezoneId: 'Asia/Singapore', isMobile: phone, hasTouch: phone, deviceScaleFactor: 1,
    });
    try {
      await context.addInitScript(instrument);
      const page = await context.newPage();
      const bellManifests = [];
      page.on('request', request => { if (request.url().includes('/places/bell-lane/manifest.json')) bellManifests.push(request.url()); });
      page.on('pageerror', error => problems.push({ name, error: String(error) }));
      page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(preview.url)) problems.push({ name, status: response.status(), url: response.url().replace(preview.url, '') }); });
      await page.clock.setFixedTime(new Date(look === 'day' ? '2026-11-21T13:00:00+08:00' : '2026-11-21T22:00:00+08:00'));
      await page.goto(preview.url);
      await page.getByLabel('Your wish', { exact: true }).fill('May there always be a light for the way home.');
      await button(page, 'Set my wish').click();
      await button(page, 'Step inside').waitFor({ timeout: 80000 });
      await page.waitForFunction(() => window.__ready && document.querySelector('.court-loading[data-stage="ready"]') &&
        window.__pineRenderCamera?.position.z > 43);
      await page.waitForTimeout(430);
      await snap(page, directory, 'entrance');
      const record = look === 'day';
      await page.evaluate(record => {
        window.__startCameraTrace();
        if (record) window.__armBellLaneRecording();
      }, record);
      await button(page, 'Step inside').click();
      const soundRows = {};
      await waitWalk(page, 12);
      soundRows.eaves = await audio(page);
      const passing = await snap(page, directory, 'passing-window', 16.75);
      await waitWalk(page, 22);
      soundRows.approach = await audio(page);
      await snap(page, directory, 'threshold', 24.2);
      soundRows.door = await audio(page);
      await snap(page, directory, 'open-court-26s', 26.3);
      soundRows.court = await audio(page);
      await snap(page, directory, 'open-court-29s', 29.5);
      await screen(page, 'candle');
      await page.screenshot({ path: join(directory, 'chooser-ready-made.png'), scale: 'css' });
      const chooser = { readyMade: await page.evaluate(() => window.__bellReviewWindow()) };
      if (record) {
        const encoded = await page.evaluate(() => window.__finishBellLaneRecording());
        await writeFile(join(directory, 'continuous-walk.webm'), Buffer.from(encoded, 'base64'));
      }
      assert.equal(soundRows.eaves.length, 1);
      assert.equal(soundRows.court.length, 1);
      assert.ok(soundRows.eaves[0].cutoffHz > 2600);
      assert.ok(soundRows.court[0].cutoffHz < 400);
      assert.ok(soundRows.court[0].doorGain < soundRows.eaves[0].doorGain * .45);
      const actual = await page.evaluate(() => window.__stopCameraTrace());
      const journey = mode === 'desktop' && look === 'day'
        ? await exerciseAudio(page) : undefined;
      const drawn = phone === (look === 'day');
      if (drawn) {
        await page.getByRole('tab', { name: /^Draw/ }).click();
        const size = await page.locator('canvas.pad').boundingBox();
        await page.mouse.move(size.x + size.width * .22, size.y + size.height * .82);
        await page.mouse.down();
        for (const [x, y] of [[.19, .62], [.24, .36], [.32, .15], [.65, .15], [.73, .36], [.78, .59], [.74, .82]]) {
          await page.mouse.move(size.x + size.width * x, size.y + size.height * y, { steps: 4 });
        }
        await page.mouse.up();
        await page.screenshot({ path: join(directory, 'chooser-draw.png'), scale: 'css' });
        chooser.draw = await page.evaluate(() => window.__bellReviewWindow());
        await page.getByRole('tab', { name: /^Ready-made/ }).click();
        await page.screenshot({ path: join(directory, 'chooser-restored.png'), scale: 'css' });
        chooser.restored = await page.evaluate(() => window.__bellReviewWindow());
        await page.getByRole('tab', { name: /^Draw/ }).click();
      }
      await page.getByRole('button', { name: /^Light it/ }).click({ timeout: 20000 });
      await screen(page, 'burning');
      await page.waitForFunction(() => window.__visualIgnition?.state === 'wick-contact');
      const contact = await page.evaluate(() => window.__visualIgnition);
      assert.ok(contact.wickContactMetres <= .001);
      await snap(page, directory, 'taper-contact');
      await writeFile(join(directory, 'taper-contact.json'), JSON.stringify({ drawn, ...contact }, null, 2));
      await page.waitForFunction(() => window.__visualIgnition?.state === 'settled');
      const seatedFrame = await snap(page, directory, 'seated');
      await page.screenshot({ path: join(directory, 'seated-with-controls.png'), scale: 'css' });
      soundRows.seated = await audio(page);
      const { walkMetrics, arrivalMetrics, seated, rows } = cameraAudit(phone);
      const { observed, chart } = liveCameraAudit(actual);
      await writeFile(join(directory, 'camera.json'), JSON.stringify({ actual, observed, rows, walk: cameraPeaks(walkMetrics), arrival: cameraPeaks(arrivalMetrics), seated }, null, 2));
      await writeFile(join(directory, 'camera-curves.svg'), chart);
      await writeFile(join(directory, 'audio.json'), JSON.stringify({ walk: soundRows, lifecycle: journey }, null, 2));
      await writeFile(join(directory, 'chooser.json'), JSON.stringify(chooser, null, 2));
      assert.deepEqual(bellManifests, []);
      assert.equal(chooser.readyMade.wickCovered, false);
      assert.equal(chooser.readyMade.windowCovered, false);
      if (drawn) assert.equal(chooser.restored.wickCovered, false);
      assert.ok(passing.landmark?.visible, 'the window mesh must be visible while passing');
      assert.ok(seatedFrame.landmark?.visible, 'the window mesh must be visible through the door');
      assert.equal(passing.landmark.windowId, seatedFrame.landmark.windowId);
      console.log(name, 'captured');
    } catch (error) {
      problems.push({ name, error: error.stack ?? String(error) });
      console.error(name, error);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await preview.close();
  await writeFile(join(out, 'capture.json'), JSON.stringify({ shots, problems }, null, 2));
}
if (problems.length) {
  console.log(problems);
  process.exitCode = 1;
}
