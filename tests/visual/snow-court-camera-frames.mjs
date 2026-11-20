// Keep the live journey running uninterrupted. Decode and write selected
// frames after the recording stops so disk I/O cannot affect the walk.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const epochNow = () => (performance.timeOrigin + performance.now()) / 1000;
const rounded = value => Math.round(value * 1e6) / 1e6;
const pickedFrameLimit = 1800;
const fullCaptureFrameLimit = 6500;
const fullCaptureByteLimit = 200 * 1024 * 1024;
const importantStages = new Set(['chooser', 'ignition', 'settled']);

function nearest(ordered, target) {
  let lo = 0;
  let hi = ordered.length;
  while (lo < hi) {
    const middle = (lo + hi) >> 1;
    if (ordered[middle].timestamp < target) lo = middle + 1;
    else hi = middle;
  }
  const after = ordered[lo];
  const before = ordered[lo - 1];
  if (!before || (after && after.timestamp - target < target - before.timestamp)) return after;
  return before;
}

/**
 * Record a Chromium page's actual composited view, including the chooser UI.
 * Before clicking Step inside, await start() and mark('walk'). The caller
 * can pass the actual browser-side walk epoch to finish() when it has one.
 * All timestamps are Unix epoch seconds. Manifest t and actualT are relative
 * to the chosen walk origin. Non-integer samples prove brief UI states.
 */
export async function createSnowCourtCameraFrames(page, {
  outputDir, width = 720, height = 450, quality = 65, everyNthFrame = 6, maxOffsetSeconds = .35, measurePresented,
} = {}) {
  if (!outputDir) throw new Error('A Snow Court frame output directory is required.');
  const directory = resolve(outputDir);
  const session = await page.context().newCDPSession(page);
  const received = [];
  const boundaries = [];
  const visibility = [];
  const errors = [];
  let started;
  let running = false;
  let closed = false;
  let dropped = 0;
  let bufferedBytes = 0;
  let settleWaiter;

  const onFrame = ({ data, metadata, sessionId }) => {
    // Acknowledge before any selection, decode or filesystem work.
    void session.send('Page.screencastFrameAck', { sessionId }).catch(error => {
      if (!closed) errors.push(String(error));
    });
    if (!running) return;
    if (received.length >= (measurePresented ? fullCaptureFrameLimit : pickedFrameLimit)
      || (measurePresented && bufferedBytes + data.length > fullCaptureByteLimit)) {
      dropped++;
      return;
    }
    const stamped = Number.isFinite(metadata?.timestamp) && metadata.timestamp > 0;
    const timestamp = stamped ? metadata.timestamp : epochNow();
    received.push({ data, timestamp, stamped });
    bufferedBytes += data.length;
    settleWaiter?.(timestamp);
  };
  const onVisibility = ({ visible }) => visibility.push({ visible, timestamp: epochNow() });
  session.on('Page.screencastFrame', onFrame);
  session.on('Page.screencastVisibilityChanged', onVisibility);

  async function close() {
    if (closed) return;
    closed = true;
    try {
      if (running) await session.send('Page.stopScreencast');
    } finally {
      running = false;
      session.off('Page.screencastFrame', onFrame);
      session.off('Page.screencastVisibilityChanged', onVisibility);
      await session.detach().catch(() => {});
    }
  }

  async function start() {
    if (running || closed) throw new Error('This Snow Court screencast cannot be started twice.');
    try {
      await mkdir(directory, { recursive: true });
      started = epochNow();
      running = true;
      await session.send('Page.startScreencast', {
        format: 'jpeg', quality, maxWidth: width, maxHeight: height, everyNthFrame,
      });
    } catch (error) {
      await close().catch(() => {});
      throw error;
    }
  }

  function mark(stage, { timestamp, elapsedSeconds, snapshot } = {}) {
    if (!running || closed || typeof stage !== 'string' || !stage) {
      throw new Error('Mark a named stage while the Snow Court screencast is running.');
    }
    const time = timestamp ?? (elapsedSeconds === undefined ? epochNow() : started + elapsedSeconds);
    if (!Number.isFinite(time)) throw new Error('Invalid Snow Court stage timestamp.');
    boundaries.push({ stage, timestamp: time, ...(snapshot === undefined ? {} : { snapshot }) });
    return time;
  }

  async function waitForFrameAt(timestamp, timeout) {
    if (received.some(frame => frame.timestamp >= timestamp) || timeout <= 0) return;
    await new Promise(done => {
      const complete = () => { clearTimeout(timer); settleWaiter = undefined; done(); };
      const timer = setTimeout(complete, timeout);
      settleWaiter = value => { if (value >= timestamp) complete(); };
    });
  }

  async function finish({ walkStartTimestamp, endTimestamp, settleWaitMs = 480, assessFrames = true } = {}) {
    if (!running || closed) throw new Error('Start the Snow Court screencast before finishing.');
    const walk = boundaries.find(row => row.stage === 'walk');
    const origin = walkStartTimestamp ?? walk?.timestamp ?? started;
    const end = endTimestamp ?? boundaries.findLast(row => row.stage === 'settled')?.timestamp ?? epochNow();
    if (!Number.isFinite(origin) || !Number.isFinite(end) || end < origin) {
      await close();
      throw new Error('Invalid Snow Court frame interval.');
    }
    await waitForFrameAt(end, settleWaitMs);
    await close();
    if (!received.length) throw new Error('Chromium sent no Snow Court screencast frames.');
    if (errors.length || dropped) throw new Error(`Snow Court screencast transport failed. Dropped: ${dropped}. ${errors.join('; ')}`);
    received.sort((a, b) => a.timestamp - b.timestamp);
    if (walkStartTimestamp !== undefined && walk) walk.timestamp = origin;
    const marks = [...boundaries].sort((a, b) => a.timestamp - b.timestamp);
    const stageAt = timestamp => marks.findLast(row => row.timestamp <= timestamp)?.stage ?? 'before-walk';
    const extent = end - origin;
    const picks = [];
    const missing = [];
    const permitted = received.filter(frame => frame.timestamp >= origin);
    for (let t = 0; t <= Math.floor(extent); t++) {
      const frame = nearest(permitted, origin + t);
      if (!frame || Math.abs(frame.timestamp - origin - t) > maxOffsetSeconds) {
        missing.push({ t, stage: stageAt(origin + t), kind: 'second',
          ...(frame ? { nearestOffsetSeconds: rounded(frame.timestamp - origin - t) } : {}) });
        continue;
      }
      picks.push({ t, frame, kind: 'second' });
    }

    // Automation can pass through the chooser in less than one second.
    // Keep distinct evidence of such a state even when no integer sees it.
    for (const [index, mark] of marks.entries()) {
      if (mark.timestamp < origin || mark.timestamp > end || !importantStages.has(mark.stage)) continue;
      if (picks.some(({ frame }) => stageAt(frame.timestamp) === mark.stage) && mark.stage !== 'settled') continue;
      const until = Math.min(marks[index + 1]?.timestamp ?? Infinity, mark.timestamp + maxOffsetSeconds);
      const frame = received.find(row => row.timestamp >= mark.timestamp && row.timestamp < until);
      const t = rounded(mark.timestamp - origin);
      if (!frame) {
        missing.push({ t, stage: mark.stage, kind: 'stage' });
      } else if (!picks.some(selected => selected.frame === frame)) {
        picks.push({ t, frame, kind: 'stage' });
      }
    }
    picks.sort((a, b) => a.t - b.t || Number(a.kind === 'stage') - Number(b.kind === 'stage'));
    const rows = [];
    for (const { t, frame, kind } of picks) {
      // A stage boundary may share an integer target. Prefer its already
      // recorded entry to a duplicate time in the contact sheet manifest.
      if (rows.some(row => row.t === t)) continue;
      const body = Buffer.from(frame.data, 'base64');
      if (body[0] !== 0xff || body[1] !== 0xd8) throw new Error('Expected a Chromium JPEG screencast frame.');
      const file = `frame-${String(rows.length).padStart(3, '0')}.jpg`;
      await writeFile(join(directory, file), body, { flag: 'wx' });
      rows.push({ t, file, kind, stage: stageAt(frame.timestamp), targetStage: stageAt(origin + t),
        actualT: rounded(frame.timestamp - origin), offsetSeconds: rounded(frame.timestamp - origin - t),
        frameTimestamp: frame.timestamp, timestampSource: frame.stamped ? 'cdp-swap' : 'host-receive',
        sha256: createHash('sha256').update(body).digest('hex') });
    }
    const presented = [];
    let darkest;
    if (measurePresented && assessFrames) {
      const observed = received.filter(frame => frame.timestamp >= origin && frame.timestamp <= end);
      for (let i = 0; i < observed.length; i += 48) {
        const batch = observed.slice(i, i + 48);
        const measurements = await measurePresented(batch.map(frame => frame.data));
        if (measurements.length !== batch.length || !measurements.every(Number.isFinite)) {
          throw new Error('Snow Court luminance audit missed a compositor frame.');
        }
        for (const [index, frame] of batch.entries()) {
          const measurement = { timestamp: frame.timestamp, stamped: frame.stamped, stage: stageAt(frame.timestamp),
            luminance: measurements[index] };
          presented.push(measurement);
          if (!darkest || measurement.luminance < darkest.measurement.luminance) darkest = { measurement, frame };
        }
      }
    }
    let darkestPresented;
    if (darkest) {
      const file = 'darkest-presented.jpg';
      const body = Buffer.from(darkest.frame.data, 'base64');
      await writeFile(join(directory, file), body, { flag: 'wx' });
      darkestPresented = { file, sha256: createHash('sha256').update(body).digest('hex'), ...darkest.measurement };
    }
    const manifest = join(directory, 'frames.json');
    const data = { version: 1, source: 'Chromium Page.startScreencast', outputFormat: 'jpeg',
      capture: { maxWidth: width, maxHeight: height, quality, everyNthFrame },
      timing: { origin: walkStartTimestamp !== undefined ? 'instrumented-walk' : walk ? 'walk-marker' : 'capture-start',
        walkStartTimestamp: origin, recordingStartTimestamp: started, endTimestamp: end,
        durationSeconds: rounded(extent), maxOffsetSeconds },
      stageBoundaries: marks.map(({ timestamp, ...state }) => ({ ...state, timestamp, t: rounded(timestamp - origin) })),
      visibility, receivedFrames: received.length, framesWithoutSwapTimestamp: received.filter(frame => !frame.stamped).length,
      missing, frames: rows, ...(darkestPresented ? { darkestPresented } : {}) };
    await writeFile(manifest, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    return { manifest, ...data, ...(measurePresented ? { presented } : {}) };
  }

  return { start, mark, finish, abort: close };
}
