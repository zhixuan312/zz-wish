// Opt-in real-ending evidence. The caller owns the browser/GPU lease and
// supplies the real UI action (or actual accelerated product completion).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertCaptureGpuHealthy } from './capture-preflight.mjs';

export async function captureEndingPlume({ page, directory, stage, trigger, seconds = 12 }) {
  if (seconds < 10 || seconds > 15) throw new Error('Use a bounded 10–15 second ending window.');
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => {
    if (typeof window.__visualWickPlume !== 'function') throw new Error('The frozen source has no actual wick-plume hook.');
    const now = window.__captureNativeNow ?? performance.now.bind(performance);
    if (window.__visualWickPlume()) throw new Error('A previous plume is still active; ending evidence needs a new actual run.');
    const trace = { armedAt: now(), firstRunAt: null, firstObservedAt: null, sourceClockStart: null, pollingMs: 50, samples: [] };
    window.__endingPlumeCapture = trace;
    trace.timer = setInterval(() => {
      const state = window.__visualWickPlume(), at = now();
      if (state && trace.firstRunAt === null) {
        trace.firstObservedAt = at;
        trace.sourceClockStart = state.startedAt;
        // Calibrate the native observation clock from the actual plume clock,
        // so a slow first render is recorded rather than treated as time zero.
        trace.firstRunAt = at - Math.max(0, state.currentTime - state.startedAt) * 1000;
      }
      trace.samples.push({ at, elapsedMs: trace.firstRunAt === null ? null : at - trace.firstRunAt,
        sourceElapsedMs: state ? (state.currentTime - state.startedAt) * 1000 : null, state });
    }, 50);
    // Hold the actual product camera, while the wick, plume, light and cloth
    // keep their normal physical clocks. This is a motion diagnostic hold.
    const controls = { lockCamera: true, pauseTweens: false, freezeScene: false, freezeFlame: false, freezeLampMotion: false, hideParticles: false };
    window.__endingPlumePreviousControls = window.__flickerLab ? Object.fromEntries(Object.keys(controls).map(key => [key, window.__flickerLab[key]])) : null;
    if (window.__flickerLab) Object.assign(window.__flickerLab, controls);
  });
  const frames = []; let failure = null;
  try {
    // UI result rendering/audio waits must not delay the first smoke capture.
    const triggered = Promise.resolve().then(trigger); void triggered.catch(() => {});
    const started = page.waitForFunction(() => window.__endingPlumeCapture.firstRunAt !== null, null, { polling: 50, timeout: 15000 });
    await Promise.race([started, triggered.then(() => started)]);
    for (const target of [.25, .8, 1.5, 2.6, 3.9, 4.8, 6, 8, seconds]) {
      if (target > seconds) continue;
      await page.waitForFunction(target => {
        const trace = window.__endingPlumeCapture, now = window.__captureNativeNow ?? performance.now.bind(performance);
        return now() - trace.firstRunAt >= target * 1000;
      }, target, { polling: 50, timeout: (seconds + 10) * 1000 });
      const metadata = await page.evaluate(() => {
        const trace = window.__endingPlumeCapture, now = window.__captureNativeNow ?? performance.now.bind(performance);
        const plume = window.__visualWickPlume();
        return { elapsedMs: now() - trace.firstRunAt, sourceElapsedMs: plume ? (plume.currentTime - plume.startedAt) * 1000 : null,
          plume, camera: window.__captureCameraState?.() ?? null, screen: document.querySelector('.ui')?.dataset.screen ?? null };
      });
      const file = `${directory}/${stage}-${String(target).replace('.', '_')}s.png`;
      await assertCaptureGpuHealthy(page);
      await page.screenshot({ path: file });
      frames.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex'), requestedSeconds: target, ...metadata });
    }
    await triggered;
  } catch (error) {
    failure = error.stack ?? String(error); throw error;
  } finally {
    const trace = await page.evaluate(() => {
      const trace = window.__endingPlumeCapture; clearInterval(trace.timer); delete trace.timer;
      if (window.__flickerLab && window.__endingPlumePreviousControls) Object.assign(window.__flickerLab, window.__endingPlumePreviousControls);
      delete window.__endingPlumePreviousControls;
      return trace;
    }).catch(error => ({ readbackError: String(error) }));
    await writeFile(`${directory}/${stage}.json`, JSON.stringify({ stage, seconds, failure,
      role: 'Held actual product ending; physical plume animation remains live. Native targets are calibrated from the actual source plume clock; sourceElapsedMs also records its rendered physical age.', frames, trace,
      limits: 'First observation uses50ms polling and source-clock calibration; JavaScript scheduling and screenshot delay are retained in actual elapsed values. Metadata is sampled immediately before each screenshot. The PNGs and continuous journey video require visual inspection for readability. This is not a performance benchmark or an endurance burn.' }, null, 2) + '\n');
  }
  return frames;
}
