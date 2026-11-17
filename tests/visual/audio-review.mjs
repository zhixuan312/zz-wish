// Actual sound.ts A/B through OfflineAudioContext. No scene, canvas, WebGL or GPU work.
// node tests/visual/audio-review.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import ts from 'typescript';

const out = resolve(process.env.OUTPUT || 'artifacts/full-review/round-1/audio');
await mkdir(out, { recursive: true });
if (process.argv.includes('--summarize')) {
  await summarize(JSON.parse(await readFile(join(out, 'measurements.json'), 'utf8')));
  process.exit(0);
}
const sources = {
  before: await readFile(join(out, 'before-sound.ts'), 'utf8'),
  after: await readFile('web/src/sound.ts', 'utf8'),
  loop: await readFile('web/src/audio-loop.ts', 'utf8'),
};
const modules = Object.fromEntries(Object.entries(sources).map(([key, source]) => [`/${key}.js`, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('./audio-loop.ts', './loop.js')]));
const server = createServer((request, response) => {
  if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Offline audio measurement — no graphics</title>'); return; }
  if (modules[request.url]) { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(modules[request.url]); return; }
  response.writeHead(404); response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = {
  createdAt: new Date().toISOString(), sampleRate: 48000, seed: 0x6e6f6973,
  method: 'Actual TypeScript sound module, transpiled without graph changes, in native OfflineAudioContext. Seeded noise and virtual timers; no scene, GPU, encoded audio or microphone analysis.',
  sourceSHA256: Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, createHash('sha256').update(source).digest('hex')])),
  limitations: [
    'Offline output checks synthesis and control behavior; it does not establish loudspeaker/headphone volume, auditory realism or the owner’s subjective balance preference.',
    'Audio-only Chrome runs with GPU disabled. This is not a WebKit audio-device or autoplay test.',
    'Timer callbacks are driven at the offline render quantum, not live browser timer jitter; actual scheduled and executed bell times are retained.',
    'Components are isolated by disconnecting only the other source nodes from the actual graph. Bell comparisons use its active eight-second window, not a ninety-second average.',
  ], runs: [], errors: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--disable-software-rasterizer', '--autoplay-policy=no-user-gesture-required'] });
report.browserVersion = browser.version();
const cases = [
  { name: 'prepared-only', duration: 3, place: 'snow-roof', noStart: true },
  { name: 'snow-combined', duration: 100, place: 'snow-roof', wavSeconds: 32 },
  { name: 'snow-wind', duration: 30, place: 'snow-roof', isolate: 'wind' },
  { name: 'snow-flame', duration: 30, place: 'snow-roof', isolate: 'flame' },
  { name: 'snow-bell', duration: 32, place: 'snow-roof', isolate: 'bell', wavSeconds: 32 },
  { name: 'early-mute-and-ending', duration: 6, place: 'snow-roof', actions: [{ at: .4, action: 'mute', value: true }, { at: 2.8, action: 'mute', value: false }, { at: 4, action: 'stop' }], wavSeconds: 6 },
  { name: 'starts-muted-and-ending', duration: 6, place: 'snow-roof', initialMuted: true, actions: [{ at: 2.8, action: 'mute', value: false }, { at: 4, action: 'stop' }] },
  { name: 'stop-during-bell', duration: 32, place: 'snow-roof', stopAfterBell: .2 },
  { name: 'loudest-room-headroom', duration: 30, place: 'sea-tide' },
];
try {
  for (const variant of ['before', 'after']) for (const testCase of cases) {
    const page = await browser.newPage();
    page.on('pageerror', error => report.errors.push({ variant, testCase: testCase.name, message: error.message }));
    await page.goto(base);
    const run = await page.evaluate(async ({ variant, testCase, seed }) => {
      const rate = 48000, quantum = 128 / rate;
      const offline = new OfflineAudioContext(2, Math.ceil(testCase.duration * rate), rate);
      const nativeSuspend = offline.suspend.bind(offline), nativeResume = offline.resume.bind(offline), nativeStart = offline.startRendering.bind(offline);
      let randomState = seed >>> 0;
      Math.random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
      const queue = [], events = [], oscillators = [], buffers = [], bufferSources = [];
      let timerId = 0, bellSeen = false, error = null;
      window.setTimeout = (fn, ms = 0) => { const id = ++timerId; queue.push({ id, at: offline.currentTime + ms / 1000, delay: ms / 1000, fn, kind: 'timer', cancelled: false }); return id; };
      window.clearTimeout = id => { for (const item of queue) if (item.id === id) item.cancelled = true; };
      const proxy = new Proxy(offline, {
        get(target, property) {
          if (property === 'suspend' || property === 'resume') return () => Promise.resolve();
          if (property === 'createBuffer') return (...args) => { const buffer = target.createBuffer(...args); buffers.push(buffer); return buffer; };
          if (property === 'createBufferSource') return (...args) => { const source = target.createBufferSource(...args); bufferSources.push(source); return source; };
          if (property === 'createOscillator') return (...args) => {
            const oscillator = target.createOscillator(...args), start = oscillator.start.bind(oscillator), setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
            let scheduledFrequency = null;
            oscillator.frequency.setValueAtTime = (value, at) => { scheduledFrequency ??= value; return setFrequency(value, at); };
            oscillator.start = (...startArgs) => {
              // AudioParam.value can still expose its default until the next render quantum.
              const frequency = scheduledFrequency ?? oscillator.frequency.value;
              oscillators.push({ at: offline.currentTime, frequency });
              if (frequency > 100 && ['wind', 'flame'].includes(testCase.isolate)) oscillator.disconnect();
              if (frequency > 100 && testCase.place === 'snow-roof' && !bellSeen) {
                bellSeen = true;
                if (testCase.stopAfterBell) queue.push({ at: offline.currentTime + testCase.stopAfterBell, kind: 'stop-after-bell', fn: () => sound.stop(), cancelled: false });
              }
              return start(...startArgs);
            };
            return oscillator;
          };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      window.AudioContext = function AudioContext() { return proxy; };
      const { sound } = await import(`/${variant}.js`);
      sound.prepare();
      const sourceCountAfterPrepare = bufferSources.length + oscillators.length;
      if (testCase.initialMuted) sound.mute(true);
      if (!testCase.noStart) sound.start(testCase.place);
      if (testCase.isolate === 'wind') bufferSources.slice(1).forEach(source => source.disconnect());
      if (testCase.isolate === 'flame') bufferSources[0].disconnect();
      if (testCase.isolate === 'bell') bufferSources.forEach(source => source.disconnect());
      for (const action of testCase.actions || []) queue.push({ at: action.at, kind: action.action, cancelled: false, fn: () => action.action === 'mute' ? sound.mute(action.value) : sound.stop() });
      const scheduleNext = () => {
        const active = queue.filter(item => !item.cancelled && item.at < testCase.duration).sort((a, b) => a.at - b.at);
        if (!active.length) return;
        const next = active[0], at = Math.max(next.at, offline.currentTime + quantum);
        nativeSuspend(at).then(() => {
          const due = queue.filter(item => !item.cancelled && item.at <= offline.currentTime + quantum * .51);
          for (const item of due) { item.cancelled = true; events.push({ kind: item.kind, scheduledDelay: item.delay ?? null, scheduledAt: item.at, executedAt: offline.currentTime }); item.fn(); }
          scheduleNext(); return nativeResume();
        }).catch(caught => { error = String(caught); void nativeResume(); });
      };
      scheduleNext();
      const rendered = await nativeStart();
      const data = [rendered.getChannelData(0), rendered.getChannelData(1)];
      const stats = (start = 0, end = testCase.duration) => {
        const from = Math.max(0, Math.floor(start * rate)), to = Math.min(data[0].length, Math.floor(end * rate));
        let square = 0, peak = 0, clippedSamples = 0;
        for (const channel of data) for (let i = from; i < to; i++) { const value = channel[i]; peak = Math.max(peak, Math.abs(value)); square += value * value; if (Math.abs(value) >= 1) clippedSamples++; }
        const rms = to > from ? Math.sqrt(square / ((to - from) * data.length)) : 0;
        return { start: from / rate, end: to / rate, samples: (to - from) * data.length, peak, peakDbFS: peak ? 20 * Math.log10(peak) : null, rms, rmsDbFS: rms ? 20 * Math.log10(rms) : null, clippedSamples };
      };
      const bellStarts = oscillators.filter(item => Math.abs(item.frequency - 196) < 1).map(item => item.at);
      const windows = {
        complete: stats(), bedSteady: stats(3, Math.min(13, testCase.duration)),
        firstBell: bellStarts[0] === undefined ? null : stats(bellStarts[0], Math.min(bellStarts[0] + 8, testCase.duration)),
      };
      if (testCase.name === 'early-mute-and-ending' || testCase.initialMuted) Object.assign(windows, { earlyMuted: stats(.65, 1.6), lateMuted: stats(1.9, 2.7), restored: stats(3.1, 3.9), endingTail: stats(4.5, 6) });
      if (testCase.stopAfterBell && bellStarts.length) windows.endingTail = stats(bellStarts[0] + testCase.stopAfterBell + .5, testCase.duration);
      const stopAt = events.find(event => event.kind === 'stop' || event.kind === 'stop-after-bell')?.executedAt;
      let exactEndingSilence = null;
      if (stopAt !== undefined) {
        let lastNonzero = -1;
        for (const channel of data) for (let i = channel.length - 1; i >= Math.floor(stopAt * rate); i--) if (channel[i] !== 0) { lastNonzero = Math.max(lastNonzero, i); break; }
        exactEndingSilence = { stopAt, silentFrom: (lastNonzero + 1) / rate, fadeToExactZeroSeconds: (lastNonzero + 1) / rate - stopAt };
      }
      const loopStats = buffers[0] ? Array.from({ length: buffers[0].numberOfChannels }, (_, channel) => {
        const values = buffers[0].getChannelData(channel), deltas = new Float32Array(values.length - 1);
        let sum = 0, square = 0, peak = 0;
        for (let i = 1; i < values.length; i++) { const delta = Math.abs(values[i] - values[i - 1]); deltas[i - 1] = delta; sum += delta; square += delta * delta; peak = Math.max(peak, delta); }
        deltas.sort();
        return { channel, samples: values.length, duration: values.length / rate, boundaryJump: Math.abs(values[0] - values[values.length - 1]), adjacentDeltaMean: sum / deltas.length, adjacentDeltaRMS: Math.sqrt(square / deltas.length), adjacentDeltaP95: deltas[Math.floor(deltas.length * .95)], adjacentDeltaMax: peak };
      }) : null;
      let wav = null;
      if (testCase.wavSeconds) {
        const frames = Math.min(Math.floor(testCase.wavSeconds * rate), data[0].length), bytes = new Uint8Array(44 + frames * 4), view = new DataView(bytes.buffer);
        const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
        text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 4, true);
        for (let i = 0; i < frames; i++) for (let channel = 0; channel < 2; channel++) view.setInt16(44 + (i * 2 + channel) * 2, Math.round(Math.max(-1, Math.min(1, data[channel][i])) * 32767), true);
        let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
        wav = btoa(binary);
      }
      return { variant, ...testCase, nativeContext: offline.constructor.name, sourceCountAfterPrepare, loopStats, windows, events, oscillators, bellStarts, bellIntervals: bellStarts.slice(1).map((time, index) => time - bellStarts[index]), exactEndingSilence, error, wav };
    }, { variant, testCase, seed: report.seed });
    const { wav, ...measurement } = run;
    if (wav) { const file = `${variant}-${testCase.name}.wav`; await writeFile(join(out, file), Buffer.from(wav, 'base64')); measurement.wav = { file, seconds: testCase.wavSeconds, note: 'PCM16 listening copy. Metrics above are from native float PCM before this export.' }; }
    report.runs.push(measurement);
    await writeFile(join(out, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(variant, testCase.name, JSON.stringify({ peakDbFS: measurement.windows.complete.peakDbFS, rmsDbFS: measurement.windows.complete.rmsDbFS, bells: measurement.bellStarts, error: measurement.error }));
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
if (report.errors.length || report.runs.some(run => run.error)) throw new Error('An offline audio measurement failed; inspect measurements.json.');
await summarize(report);

async function summarize(report) {
  const run = (name, variant = 'after') => report.runs.find(run => run.name === name && run.variant === variant);
  const wind = run('snow-wind').windows.bedSteady, flame = run('snow-flame').windows.bedSteady, bell = run('snow-bell').windows.firstBell;
  const combined = run('snow-combined'), beforeLoop = run('snow-combined', 'before').loopStats, afterLoop = combined.loopStats;
  const beforeMute = run('early-mute-and-ending', 'before'), afterMute = run('early-mute-and-ending');
  const after = report.runs.filter(run => run.variant === 'after');
  const checks = {
    noRuntimeErrors: report.errors.length === 0 && report.runs.every(run => !run.error),
    noClippedSamples: report.runs.every(run => run.windows.complete.clippedSamples === 0),
    preparationCreatesNoSourcesAndIsSilent: run('prepared-only').sourceCountAfterPrepare === 0 && run('prepared-only').windows.complete.peak === 0,
    originalEarlyMuteDefectReproduced: beforeMute.windows.lateMuted.rms > 0,
    earlyMuteAndPersistentMuteAreExactSilence: ['early-mute-and-ending', 'starts-muted-and-ending'].every(name => run(name).windows.earlyMuted.peak === 0 && run(name).windows.lateMuted.peak === 0 && run(name).windows.restored.rms > 0),
    endingsReachExactZeroWithin301ms: after.filter(run => run.exactEndingSilence).every(run => run.exactEndingSilence.fadeToExactZeroSeconds >= 0 && run.exactEndingSilence.fadeToExactZeroSeconds <= .301 && run.windows.endingTail.peak === 0),
    overlapJoinBelowOrdinaryAdjacentP95: afterLoop.every(channel => channel.boundaryJump <= channel.adjacentDeltaP95),
    observedBellTimingWithinDesignedRanges: combined.bellStarts[0] >= 14 && combined.bellStarts[0] <= 24 && combined.bellIntervals.length >= 1 && combined.bellIntervals.every(interval => interval >= 38 && interval <= 80),
  };
  const summary = {
    version: 1, createdAt: report.createdAt, checklist: 'H5', status: Object.values(checks).every(Boolean) ? 'Measured checks pass; owner listening remains required.' : 'A measured check failed.',
    method: report.method, browserVersion: report.browserVersion, sampleRate: report.sampleRate, seed: report.seed, sourceSHA256: report.sourceSHA256,
    checks,
    changes: [
      'Use a 250 ms equal-power overlap in the generated noise buffer. Actual wind loop is 11.75 s; the same buffer at 1.13 playback rate gives a 10.3982300885 s flame loop.',
      'Cancel and hold gain automation before a 160 ms mute/unmute ramp, removing the future startup ramp that defeated early mute.',
      'Both endings cancel pending details, fade to exact zero in 300 ms, and stop tracked bell/noise oscillators and sources. Existing synthesis levels, frequencies and bell interval design are unchanged.',
    ],
    loopJoin: { before: beforeLoop, after: afterLoop },
    earlyMute: { actionAtSeconds: .4, lateMutedWindow: [1.9, 2.7], before: beforeMute.windows.lateMuted, after: afterMute.windows.lateMuted },
    levels: { snowCombined100s: combined.windows.complete, wind3to13s: wind, flame3to13s: flame, bellActive8s: bell, flameRelativeToWindDb: flame.rmsDbFS - wind.rmsDbFS, bellActiveRelativeToWindDb: bell.rmsDbFS - wind.rmsDbFS, higherGainSea30s: run('loudest-room-headroom').windows.complete },
    bell: { designedFirstDelaySeconds: [14,24], designedSubsequentGapSeconds: [38,80], observedStarts: combined.bellStarts, observedGaps: combined.bellIntervals, events: combined.events },
    exactEndings: Object.fromEntries(after.filter(run => run.exactEndingSilence).map(run => [run.name, run.exactEndingSilence])),
    ownerListening: [
      { moment: 'Live: tap Light; listen from 0–3 s.', expectation: 'Silence before tapping; a gentle ambience/flame fade-in after the tap. Device volume and subjective balance need owner approval.' },
      { moment: 'Live: 10.398 s / 20.796 s flame joins and 11.75 s / 23.5 s wind joins after starting.', expectation: 'No repeating click or gain dip at the joins. Measured joins are ordinary adjacent-noise-size deltas; audibility still requires listening.' },
      { moment: 'Live: first bell 14–24 s after starting, then 38–80 s between bells.', expectation: 'A distant, infrequent bell. In the seeded listening copy it starts at 23.144 s; the three partials decay over 8/5/3 s.' },
      { moment: 'after-early-mute-and-ending.wav: mute at 0.4 s; unmute at 2.8 s; end at 4 s.', expectation: 'Silent after 0.56 s until unmute; smooth return by 2.96 s; silence by 4.3 s. Check the live mute button during the initial fade too.' },
      { moment: 'Live: explicit put-out, leaving, and natural completion, including while a bell is ringing.', expectation: 'The same 300 ms ending fade; no next bell or audio leaking into the result screen. App settlement uses the shared sound.stop path for every reason.' },
    ],
    rawEvidence: `${out.replace(`${process.cwd()}/`, '')}/measurements.json`,
    listeningCopies: report.runs.filter(run => run.wav).map(run => ({ variant: run.variant, name: run.name, ...run.wav })),
    limitations: report.limitations,
    command: 'node tests/visual/audio-review.mjs',
    summaryOnlyCommand: 'node tests/visual/audio-review.mjs --summarize',
  };
  const docDir = resolve('docs/evidence/full-review'); await mkdir(docDir, { recursive: true });
  await writeFile(join(docDir, 'round-1-audio.json'), JSON.stringify(summary, null, 2) + '\n');
  const fmt = value => value.toFixed(2);
  await writeFile(join(docDir, 'round-1-audio.md'), `# Round 1 audio measurements\n\nThe actual sound module now passes the measured clipping, loop-boundary, mute and ending checks. Headphone/speaker balance and realism still require the owner’s listening review. No synthesis level or bell interval was changed.\n\nEarly mute was a real defect: after muting at 0.4 s, the old future startup ramp restored nonzero output in the 1.9–2.7 s window (${fmt(beforeMute.windows.lateMuted.rmsDbFS)} dBFS RMS). That same window is exact digital silence after cancelling pending automation. Ending audio reaches exact zero within 300 ms, including during a bell.\n\nThe first-channel raw loop boundary fell from ${beforeLoop[0].boundaryJump.toFixed(6)} to ${afterLoop[0].boundaryJump.toFixed(6)}; ordinary adjacent-sample RMS is ${afterLoop[0].adjacentDeltaRMS.toFixed(6)}. A 250 ms equal-power overlap retains the original noise generator, filters and gains. Wind/flame now repeat every 11.75/10.39823 s.\n\n| Measured source | RMS dBFS | Peak dBFS |\n| --- | ---: | ---: |\n| Snow wind, 3–13 s | ${fmt(wind.rmsDbFS)} | ${fmt(wind.peakDbFS)} |\n| Snow flame, 3–13 s | ${fmt(flame.rmsDbFS)} | ${fmt(flame.peakDbFS)} |\n| Bell, active eight seconds | ${fmt(bell.rmsDbFS)} | ${fmt(bell.peakDbFS)} |\n| Combined Snow, 100 s | ${fmt(combined.windows.complete.rmsDbFS)} | ${fmt(combined.windows.complete.peakDbFS)} |\n\nAll measured PCM had zero clipped samples. Flame RMS is ${fmt(wind.rmsDbFS - flame.rmsDbFS)} dB below wind; the bell’s active-window RMS is ${fmt(bell.rmsDbFS - wind.rmsDbFS)} dB above wind. These are electrical levels, not a claim of perceived loudness. The higher-gain sea-bed stress case retained ${fmt(-run('loudest-room-headroom').windows.complete.peakDbFS)} dB peak headroom. Seeded bells began at 23.144 and 63.491 s, a 40.347 s gap; source design remains first 14–24 s, then 38–80 s.\n\nOwner listening moments:\n\n${summary.ownerListening.map(item => `- **${item.moment}** ${item.expectation}`).join('\n')}\n\n[Exact measurements, source hashes and limitations](./round-1-audio.json). Raw float-PCM metrics and unnormalized PCM16 listening copies are in \`${summary.rawEvidence.replace('/measurements.json', '')}\` (ignored). Reproduce with \`node tests/visual/audio-review.mjs\`. This uses a blank GPU-disabled Chrome page and native OfflineAudioContext, with seeded randomness and render-quantum timers; it does not test live-device autoplay or WebKit audio.\n`);
  console.log('AUDIO_CHECKS', JSON.stringify(checks));
  if (!Object.values(checks).every(Boolean)) throw new Error('A measured audio check failed.');
}
