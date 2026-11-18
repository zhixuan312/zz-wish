// Capture-only live-device observation. Install before navigation; no audio is
// created until the product itself constructs an AudioContext from a real tap.
export function installLiveAudioAudit() {
  const Native = window.AudioContext || window.webkitAudioContext;
  const contexts = [], events = [];
  const nativeNow = performance.now.bind(performance);
  const now = () => window.__captureNativeNow?.() ?? nativeNow();
  const event = (type, data = {}) => { events.push({ type, at: now(), ...data }); };
  if (!Native) { window.__liveAudioAudit = { available: false, snapshot: () => ({ available: false, contexts: [], events: [] }) }; return; }
  const Wrapped = new Proxy(Native, {
    construct(Target, args) {
      const context = Reflect.construct(Target, args), index = contexts.length;
      const entry = { context, index, createdAt: now(), activation: { active: navigator.userActivation?.isActive ?? null, hasBeenActive: navigator.userActivation?.hasBeenActive ?? null }, gains: [], masters: [] };
      contexts.push(entry); event('constructed', { context: index, state: context.state, activation: entry.activation });
      context.addEventListener('statechange', () => event('statechange', { context: index, state: context.state, audioTime: context.currentTime }));
      for (const name of ['resume', 'suspend', 'close']) {
        const native = context[name].bind(context);
        context[name] = (...args) => {
          event(name, { context: index, state: context.state, audioTime: context.currentTime, activation: navigator.userActivation?.isActive ?? null });
          const result = native(...args);
          result.then(() => event(`${name}-resolved`, { context: index, state: context.state, audioTime: context.currentTime }), error => event(`${name}-rejected`, { context: index, message: String(error) }));
          return result;
        };
      }
      const createGain = context.createGain.bind(context);
      context.createGain = (...args) => {
        const gain = createGain(...args), record = { id: entry.gains.length, gain, connected: false, automation: [], analyser: null };
        entry.gains.push(record);
        for (const name of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelAndHoldAtTime', 'cancelScheduledValues']) {
          if (typeof gain.gain[name] !== 'function') continue;
          const native = gain.gain[name].bind(gain.gain);
          gain.gain[name] = (...args) => { record.automation.push({ method: name, args, audioTime: context.currentTime, at: now() }); return native(...args); };
        }
        const connect = gain.connect.bind(gain), disconnect = gain.disconnect.bind(gain);
        gain.connect = (...args) => {
          const result = connect(...args);
          if (args[0] === context.destination) {
            record.connected = true;
            if (!record.analyser) {
              try { record.analyser = context.createAnalyser(); record.analyser.fftSize = 2048; connect(record.analyser); }
              catch (error) { event('audit-analyser-unavailable', { context: index, message: String(error) }); }
              entry.masters.push(record);
            }
            event('master-connected', { context: index, gain: record.id, audioTime: context.currentTime });
          }
          return result;
        };
        gain.disconnect = (...args) => {
          if (!args.length || args[0] === context.destination) {
            record.connected = false;
            if (entry.masters.includes(record)) event('master-disconnected', { context: index, gain: record.id, audioTime: context.currentTime });
          }
          return disconnect(...args);
        };
        return gain;
      };
      return context;
    },
  });
  window.AudioContext = Wrapped;
  if (window.webkitAudioContext === Native) window.webkitAudioContext = Wrapped;
  window.__liveAudioAudit = {
    available: true,
    snapshot() {
      return { available: true, at: now(), contexts: contexts.map(entry => ({
        index: entry.index, createdAt: entry.createdAt, activation: entry.activation, state: entry.context.state,
        sampleRate: entry.context.sampleRate, currentTime: entry.context.currentTime, baseLatency: entry.context.baseLatency ?? null, outputLatency: entry.context.outputLatency ?? null,
        masters: entry.masters.map(record => {
          let meter = null;
          if (record.analyser) {
            const data = new Float32Array(record.analyser.fftSize); record.analyser.getFloatTimeDomainData(data);
            let peak = 0, square = 0; for (const value of data) { peak = Math.max(peak, Math.abs(value)); square += value * value; }
            meter = { samples: data.length, peak, rms: Math.sqrt(square / data.length) };
          }
          return { id: record.id, connectedToDestination: record.connected, gainValue: record.gain.gain.value, automation: record.automation.slice(-24), meter };
        }),
      })), events: events.slice(-160) };
    },
  };
}

export async function sampleLiveAudio(page, { samples = 4, intervalMs = 100 } = {}) {
  const readings = [];
  for (let i = 0; i < samples; i++) {
    readings.push(await page.evaluate(() => window.__liveAudioAudit?.snapshot() ?? { available: false, error: 'The capture audit was not installed.' }));
    if (i + 1 < samples) await page.waitForTimeout(intervalMs);
  }
  const meters = readings.flatMap(reading => reading.contexts?.flatMap(context => context.masters.map(master => master.meter).filter(Boolean)) ?? []);
  return { readings, peak: meters.length ? Math.max(...meters.map(meter => meter.peak)) : null,
    running: readings.some(reading => reading.contexts?.some(context => context.state === 'running')),
    connectedMasters: readings.at(-1)?.contexts?.reduce((sum, context) => sum + context.masters.filter(master => master.connectedToDestination).length, 0) ?? 0,
    note: 'Actual live AudioContext state/automation plus a parallel, non-audible analyser on each product master. This is an electrical signal check, not microphone/speaker proof or a performance window.' };
}

export async function sampleLiveAudioWindow(page, { startSeconds, durationSeconds, intervalMs }) {
  // Anchor to the current master so viewport-specific work before the sample cannot shift the audio phase.
  const endSeconds = startSeconds + durationSeconds;
  const readings = await page.evaluate(({ startSeconds, endSeconds, intervalMs }) => new Promise(resolve => {
    const samples = [];
    const deadline = performance.now() + (endSeconds + 5) * 1000;
    const timer = setInterval(() => {
      const snapshot = window.__liveAudioAudit?.snapshot();
      const context = snapshot?.contexts.findLast(entry => entry.state === 'running'
        && entry.masters.some(master => master.connectedToDestination));
      const master = context?.masters.findLast(entry => entry.connectedToDestination);
      const start = master?.automation.find(entry => entry.method === 'setValueAtTime');
      const age = start ? context.currentTime - start.audioTime : null;
      if (age !== null && age >= startSeconds && age < endSeconds && master.meter) {
        samples.push({ ageSeconds: age, sampleRate: context.sampleRate, masterGain: master.gainValue, ...master.meter });
      }
      if (age >= endSeconds || performance.now() >= deadline) {
        clearInterval(timer);
        resolve(samples);
      }
    }, intervalMs);
  }), { startSeconds, endSeconds, intervalMs });
  const firstAgeSeconds = readings[0]?.ageSeconds ?? null;
  const lastAgeSeconds = readings.at(-1)?.ageSeconds ?? null;
  const expectedReadings = durationSeconds * 1000 / intervalMs;
  const complete = readings.length >= expectedReadings * .85
    && firstAgeSeconds <= startSeconds + .5 && lastAgeSeconds >= endSeconds - .5;
  return {
    startSeconds, endSeconds, firstAgeSeconds, lastAgeSeconds, intervalMs, complete,
    rms: readings.length ? Math.sqrt(readings.reduce((sum, reading) => sum + reading.rms ** 2, 0) / readings.length) : null,
    peak: readings.length ? Math.max(...readings.map(reading => reading.peak)) : null,
    readings,
  };
}
