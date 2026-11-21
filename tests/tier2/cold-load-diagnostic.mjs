// Independent timing diagnostic: act as soon as the form is usable, never waiting for the engine's
// readiness flag. The old reference harness waited for `window.__ready` before typing, which hid the
// wait a real visitor meets. This run does not replace the cold-load matrix; it records one timeline.
//
// Marks, each with the cumulative transfer bytes at that instant:
//   input      the wish field exists and is editable
//   confirm    the wish is submitted and the form accepts it
//   step       Step inside reports enabled
//   walkFrame  the first animation frame after the walk starts in which the camera actually moved
//
// Usage: node tests/tier2/cold-load-diagnostic.mjs --base URL --out DIR [--condition desktop-slowcpu-20mbps]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const options = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1] ?? '']);
  return rows;
}, []));
const base = options.base ?? 'http://127.0.0.1:8899';
const out = options.out ?? 'tmp/cold-diagnostic';
mkdirSync(out, { recursive: true });

const CONDITIONS = {
  'desktop-fast': { w: 1440, h: 900, dpr: 2, cpu: 1, net: null, mobile: false },
  'desktop-slowcpu-20mbps': { w: 1440, h: 900, dpr: 2, cpu: 4,
    net: { latency: 40, down: 20e6 / 8, up: 5e6 / 8 }, mobile: false },
  'phone-4x-4g': { w: 390, h: 844, dpr: 3, cpu: 4,
    net: { latency: 150, down: 9e6 / 8, up: 2e6 / 8 }, mobile: true },
};
const name = options.condition ?? 'desktop-fast';
const condition = CONDITIONS[name];
if (!condition) throw new Error('Unknown condition: ' + name);

const en = (options.locale ?? 'en-US').startsWith('en');
const labels = {
  wish: en ? 'Your wish' : '你的愿望',
  submit: en ? 'Set my wish' : '许好了',
  step: en ? 'Step inside' : '走进院里',
  place: options.place ?? (en ? 'Pine Gate Steps' : '松门石阶'),
};

const browser = await chromium.launch({
  channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: condition.w, height: condition.h }, locale: options.locale ?? 'en-US',
  isMobile: condition.mobile, hasTouch: condition.mobile, deviceScaleFactor: condition.dpr,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (condition.net) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: condition.net.latency,
    downloadThroughput: condition.net.down, uploadThroughput: condition.net.up,
  });
}
if (condition.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: condition.cpu });

const requests = new Map();
let origin = null;
cdp.on('Network.requestWillBeSent', event => {
  if (origin === null) origin = event.timestamp;
  requests.set(event.requestId, { url: event.request.url, bytes: 0 });
});
cdp.on('Network.loadingFinished', event => {
  const row = requests.get(event.requestId);
  if (row) row.bytes = event.encodedDataLength;
});
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
page.setDefaultTimeout(300000);

const bytes = () => [...requests.values()].reduce((sum, row) => sum + (row.bytes || 0), 0);
const wall = Date.now();
const marks = {};
const mark = (label, extra = {}) => { marks[label] = { atMs: Date.now() - wall, bytes: bytes(), ...extra }; };

await page.goto(base, { waitUntil: 'domcontentloaded' });
// No readiness wait: the moment the field is editable is the moment a visitor can type.
const wish = page.getByLabel(labels.wish);
await wish.waitFor();
await page.waitForFunction(name => {
  const field = [...document.querySelectorAll('textarea,input')].find(node =>
    (node.getAttribute('aria-label') ?? '') === name || (node.labels?.[0]?.textContent ?? '').includes(name));
  return Boolean(field) && !field.disabled && !field.readOnly;
}, labels.wish);
mark('input');
await wish.fill('Measuring how long the court takes.');
await page.getByRole('button', { name: labels.submit, exact: true }).click();
mark('confirm');
await page.getByRole('radio', { name: new RegExp(labels.place) }).click().catch(() => {});

const step = page.getByRole('button', { name: labels.step, exact: true });
await step.waitFor();
await page.waitForFunction(name => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === name);
  return Boolean(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
}, labels.step);
mark('step');

// Walk start without engine hooks: the production build exposes no camera. Sample the canvas itself and
// call the first frame whose pixels differ materially from the settled step frame. A fade alone changes
// pixels slowly; a walk moves the whole view, so a coarse grid comparison distinguishes them.
await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  window.__walkProbe = { first: null, samples: 0, baseline: null };
  if (!canvas) return;
  const scratch = document.createElement('canvas');
  scratch.width = 48; scratch.height = 30;
  const g = scratch.getContext('2d', { willReadFrequently: true });
  const sample = () => {
    const probe = window.__walkProbe;
    const frame = g || null;
    try {
      g.drawImage(canvas, 0, 0, scratch.width, scratch.height);
      const now = g.getImageData(0, 0, scratch.width, scratch.height).data;
      if (probe.baseline === null) probe.baseline = now.slice();
      else if (probe.first === null) {
        let changed = 0, total = 0;
        for (let i = 0; i < now.length; i += 4) {
          const delta = Math.abs(now[i] - probe.baseline[i]) + Math.abs(now[i + 1] - probe.baseline[i + 1])
            + Math.abs(now[i + 2] - probe.baseline[i + 2]);
          if (delta > 24) changed++;
          total++;
        }
        // A tenth of the coarse grid moving is unmistakably the camera, not a fade.
        if (changed / total > .10) probe.first = performance.now();
      }
    } catch { /* a tainted or resized canvas is not fatal; try the next frame */ }
    probe.samples++;
    if (probe.first === null && probe.samples < 1800) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
await step.click();
await page.waitForFunction(() => window.__walkProbe?.first !== null, null, { timeout: 120000 });
mark('walkFrame');

const detail = await page.evaluate(() => ({
  samples: window.__walkProbe.samples,
  first: window.__walkProbe.first,
}));

const files = [...requests.values()].filter(row => row.bytes)
  .map(row => ({ url: row.url.replace(base, ''), kb: Math.round(row.bytes / 1024) }))
  .sort((a, b) => b.kb - a.kb);

const record = { condition: name, viewport: `${condition.w}x${condition.h}`, marks,
  frameSamples: detail.samples, requestCount: requests.size,
  top10: files.slice(0, 10), errors };
console.log(JSON.stringify({ ...record, top10: undefined }, null, 1));
writeFileSync(join(out, `${name}-diagnostic.json`), JSON.stringify(record, null, 2));
await browser.close();
