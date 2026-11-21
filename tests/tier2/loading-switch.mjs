// Run against an isolated production server with a disposable database.
import { chromium } from 'playwright';

const base = new URL(process.argv[2]);
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.port === '8810') {
  throw new Error('Supply an isolated loopback production server.');
}
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'en-US',
  });
  await page.clock.setFixedTime(new Date('2026-06-21T13:00:00'));
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 2e6 / 8,
  });
  const snow = new Map();
  let epochOffset;
  session.on('Network.requestWillBeSent', ({ requestId, request, timestamp, wallTime }) => {
    if (epochOffset === undefined) epochOffset = wallTime - timestamp;
    const path = new URL(request.url).pathname;
    if (path.startsWith('/places/snow-roof/')) {
      snow.set(requestId, { path, start: timestamp, chunks: [] });
    }
  });
  session.on('Network.dataReceived', ({ requestId, timestamp, encodedDataLength }) => {
    snow.get(requestId)?.chunks.push({ timestamp, bytes: encodedDataLength });
  });
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Your wish').fill('A quiet journey.');
  await page.getByRole('button', { name: 'Set my wish', exact: true }).click();
  const pine = page.getByRole('radio', { name: /Pine Gate Steps/ });
  await pine.waitFor();
  const enter = page.getByRole('button', { name: 'Step inside', exact: true });
  const markClick = (locator, name) => locator.evaluate((element, mark) => {
    element.addEventListener('click', () => performance.mark(mark), { capture: true, once: true });
  }, name);
  await markClick(pine, 'select-pine');
  await pine.click();
  await enter.waitFor({ timeout: 120000 });
  await markClick(enter, 'enter-pine');
  await enter.click({ timeout: 120000 });
  const marks = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    select: performance.getEntriesByName('select-pine')[0].startTime,
    enter: performance.getEntriesByName('enter-pine')[0].startTime,
  }));
  const networkTime = ms => (marks.origin + ms) / 1000 - epochOffset;
  const begin = networkTime(marks.select), end = networkTime(marks.enter);
  const requests = [...snow.values()].filter(r => r.start <= end).map(r => ({
    path: r.path,
    startedAfterSelection: r.start >= begin,
    bodyBytesAfterSelection: r.chunks.filter(c => c.timestamp >= begin && c.timestamp <= end)
      .reduce((sum, c) => sum + c.bytes, 0),
  }));
  console.log(JSON.stringify({
    selectionMs: marks.select, entryClickMs: marks.enter,
    bodyBytesAfterSelection: requests.reduce((sum, r) => sum + r.bodyBytesAfterSelection, 0),
    requests,
  }, null, 2));
} finally {
  await browser.close();
}
