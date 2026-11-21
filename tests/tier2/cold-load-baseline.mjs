// Production cold-load baseline for One Light.
//
// One fresh browser context per run, cache disabled, so every measurement starts from zero bytes. The
// clock starts at navigation and each mark is read at the moment the visitor could act on it, matching
// what the performance review asks for: home's first complete frame, the wish trigger, and the moment
// Step inside becomes clickable. Network bytes count every request the browser made, finished or still
// in flight, so a slow condition cannot look cheap by stopping early.
//
// Usage: node tests/tier2/cold-load-baseline.mjs --base http://127.0.0.1:8899 --out DIR [--runs 3]
//        [--only desktop-fast] [--locale zh-CN]
// Prints one JSON line per run and writes the raw set to DIR.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const options = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1] ?? '']);
  return rows;
}, []));

const base = options.base ?? 'http://127.0.0.1:8899';
const out = options.out ?? 'tmp/cold-load';
const runs = Number(options.runs ?? 3);
const locale = options.locale ?? 'en-US';
mkdirSync(out, { recursive: true });

// The three conditions the review fixed. Throughputs are bytes per second, as CDP expects.
const CONDITIONS = [
  { name: 'desktop-fast', w: 1440, h: 900, dpr: 2, cpu: 1, net: null, mobile: false },
  { name: 'desktop-slowcpu-20mbps', w: 1440, h: 900, dpr: 2, cpu: 4,
    net: { latency: 40, down: 20e6 / 8, up: 5e6 / 8 }, mobile: false },
  { name: 'phone-4x-4g', w: 390, h: 844, dpr: 3, cpu: 4,
    net: { latency: 150, down: 9e6 / 8, up: 2e6 / 8 }, mobile: true },
];

const wanted = options.only ? CONDITIONS.filter(condition => condition.name === options.only) : CONDITIONS;
if (!wanted.length) throw new Error('Unknown condition: ' + options.only);

const en = locale.startsWith('en');
const labels = {
  wish: en ? 'Your wish' : '你的愿望',
  wishSubmit: en ? 'Set my wish' : '许好了',
  stepInside: en ? 'Step inside' : '走进院里',
  place: options.place ?? (en ? 'Pine Gate Steps' : '松门石阶'),
};

const browser = await chromium.launch({
  channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const results = [];

for (const condition of wanted) {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({
      viewport: { width: condition.w, height: condition.h }, locale,
      isMobile: condition.mobile, hasTouch: condition.mobile, deviceScaleFactor: condition.dpr,
    });
    // Marks measured inside the page: long tasks, the first real draw, and the home frame.
    await context.addInitScript(() => {
      const marks = { longTasks: [], firstDraw: null, homeFrame: null };
      window.__loadMarks = marks;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) marks.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
      }).observe({ type: 'longtask', buffered: true });
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) {
          if (marks.firstDraw === null) marks.firstDraw = Math.round(performance.now());
          return original.apply(this, args);
        };
      }
      // Home's first complete frame: after the first draw, two animation frames, then a paint.
      const settle = () => {
        if (marks.homeFrame !== null) return;
        if (marks.firstDraw === null) { requestAnimationFrame(settle); return; }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (marks.homeFrame === null) marks.homeFrame = Math.round(performance.now());
        }));
      };
      requestAnimationFrame(settle);
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

    // Every request, finished or not. A request still in flight at a mark counts with zero additional
    // bytes, which is honest: it had not delivered them yet.
    const requests = new Map();
    let origin = null;
    cdp.on('Network.requestWillBeSent', event => {
      if (origin === null) origin = event.timestamp;
      requests.set(event.requestId, { url: event.request.url, start: event.timestamp, bytes: 0 });
    });
    cdp.on('Network.loadingFinished', event => {
      const row = requests.get(event.requestId);
      if (row) row.bytes = event.encodedDataLength;
    });
    cdp.on('Network.loadingFailed', event => {
      const row = requests.get(event.requestId);
      if (row) row.failed = event.errorText;
    });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
    page.setDefaultTimeout(300000);

    const wall = Date.now();
    const since = () => Date.now() - wall;
    const bytes = () => [...requests.values()].reduce((sum, row) => sum + (row.bytes || 0), 0);

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(labels.wish).waitFor();
    const homeMs = since(), homeBytes = bytes();

    await page.getByLabel(labels.wish).fill('Measuring how long the court takes.');
    const wishMs = since();
    await page.getByRole('button', { name: labels.wishSubmit, exact: true }).click();
    await page.getByRole('radio', { name: new RegExp(labels.place) }).click().catch(() => {});

    const step = page.getByRole('button', { name: labels.stepInside, exact: true });
    await step.waitFor();
    await page.waitForFunction(name => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === name);
      return Boolean(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    }, labels.stepInside);
    const stepMs = since(), stepBytes = bytes();

    const marks = await page.evaluate(() => window.__loadMarks);
    const info = await page.evaluate(() => {
      const place = document.querySelector('[data-place]')?.dataset.place ?? null;
      const programs = (() => {
        try {
          const gl = document.querySelector('canvas')?.getContext('webgl2');
          return gl ? gl.getParameter(gl.CURRENT_PROGRAM) ? 1 : 0 : null;
        } catch { return null; }
      })();
      const heap = performance.memory ? {
        usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
        totalMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1),
      } : null;
      return { place, programs, heap };
    });

    const files = [...requests.values()].filter(row => row.bytes)
      .map(row => ({ url: row.url.replace(base, ''), kb: Math.round(row.bytes / 1024),
        doneS: origin === null ? null : +(row.start - origin).toFixed(2) }))
      .sort((a, b) => b.kb - a.kb);

    const record = {
      condition: condition.name, run, viewport: `${condition.w}x${condition.h}`, locale,
      cpuThrottle: condition.cpu, network: condition.net ?? 'unlimited',
      homeMs, homeBytes, wishMs, stepMs, stepBytes,
      firstDrawMs: marks.firstDraw, homeFrameMs: marks.homeFrame,
      longTaskTotalMs: Math.round(marks.longTasks.reduce((sum, task) => sum + task[1], 0)),
      longTaskMaxMs: Math.round(Math.max(0, ...marks.longTasks.map(task => task[1]))),
      longTaskCount: marks.longTasks.length,
      requestCount: requests.size, failedRequests: [...requests.values()].filter(row => row.failed).length,
      place: info.place, heap: info.heap,
      top15: files.slice(0, 15), errors,
    };

    // Warm visit: the same place again in the same context, so caches are populated. This is the
    // contrast the review asks for, not a second cold number.
    await step.click();
    await page.waitForTimeout(6000);
    const warmStart = Date.now();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(labels.wish).waitFor();
    record.warmHomeMs = Date.now() - warmStart;

    results.push(record);
    console.log(JSON.stringify({ ...record, top15: undefined }));
    writeFileSync(join(out, `${condition.name}-run-${run}.json`), JSON.stringify(record, null, 2));
    await context.close();
  }
}

writeFileSync(join(out, 'all.json'), JSON.stringify(results, null, 2));
await browser.close();
