/* global AudioContext, AudioNode, Blob, document, FileReader, MediaRecorder, MediaStream, performance, window */

// Private Playwright init script. Fork the live graph at its speaker connections.
// The tap never routes audio back to the speaker or starts a product source.
export function installTideAudioTap() {
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  const masters = new Map();
  const tideBuses = [];
  const events = [];
  const readings = [];
  let recording;
  let timer;

  const emit = (event, data = {}) => events.push({ event, atMs: performance.now(), ...data });
  function meter(node) {
    const reader = node.context.createAnalyser();
    reader.fftSize = 4096;
    connect.call(node, reader);
    return reader;
  }

  function meterSamples(pcm) {
    let peak = 0;
    let power = 0;
    for (const sample of pcm) {
      peak = Math.max(peak, Math.abs(sample));
      power += sample ** 2;
    }
    return { peak, rms: Math.sqrt(power / pcm.length) };
  }

  function measure(reader) {
    const pcm = new Float32Array(reader.fftSize);
    reader.getFloatTimeDomainData(pcm);
    return meterSamples(pcm);
  }

  function attach(master) {
    if (!recording || master.tap || !master.connected || master.node.context.state === 'closed') return;
    const tap = master.node.context.createMediaStreamDestination();
    connect.call(master.node, tap);
    const input = recording.context.createMediaStreamSource(tap.stream);
    connect.call(input, recording.destination);
    connect.call(input, recording.mix);
    master.tap = { tap, input };
  }

  function detach(master) {
    if (!master.tap) return;
    const { tap, input } = master.tap;
    try { disconnect.call(master.node, tap); } catch { /* The product already disconnected all outputs. */ }
    disconnect.call(input);
    tap.stream.getTracks().forEach(track => track.stop());
    master.tap = null;
  }

  AudioNode.prototype.connect = function (...args) {
    const result = connect.apply(this, args);
    if (args[0] === this.context.destination) {
      let master = masters.get(this);
      if (!master) {
        master = { id: masters.size + 1, node: this, connected: true };
        masters.set(this, master);
      }
      master.connected = true;
      attach(master);
    }
    return result;
  };

  AudioNode.prototype.disconnect = function (...args) {
    const result = disconnect.apply(this, args);
    const master = masters.get(this);
    if (master && (!args.length || args[0] === this.context.destination)) {
      master.connected = false;
      detach(master);
      emit('master-detached', { master: master.id });
    }
    for (const bus of tideBuses) {
      if (this !== bus.node || !bus.connected || (args.length && args[0] !== bus.master.node)) continue;
      bus.connected = false;
      emit('surf-detached', { bus: bus.id, master: bus.master.id });
    }
    return result;
  };

  window.__tideCaptureBus = (output, node, body, foam) => {
    const master = masters.get(node);
    if (!master) throw Error('Tide surf must connect to a live game speaker bus.');
    const bus = { id: tideBuses.length + 1, node: output, master, body, foam, connected: true, reader: meter(output) };
    master.reader ??= meter(node);
    tideBuses.push(bus);
    emit('surf-attached', { bus: bus.id, master: master.id });
  };

  function sample() {
    return {
      atMs: performance.now(),
      screen: document.querySelector('.ui')?.dataset.screen,
      walk: window.__walkProgress ?? null,
      mix: recording ? measure(recording.mix) : null,
      surf: tideBuses.map(bus => ({
        id: bus.id,
        connected: bus.connected && bus.master.connected,
        contextState: bus.node.context.state,
        preMute: measure(bus.reader),
        atSpeaker: measure(bus.master.reader),
        masterGain: bus.master.node.gain?.value ?? null,
        bodyCutoffHz: bus.body.frequency.value,
        foamCutoffHz: bus.foam.frequency.value,
      })),
    };
  }

  function start() {
    if (recording) throw Error('The Tide game audio recorder is already running.');
    const mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) throw Error('VP8/Opus capture is unavailable.');
    const canvas = document.querySelector('#gl');
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const mix = context.createAnalyser();
    mix.fftSize = 4096;
    const video = canvas.captureStream(30);
    const stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 160_000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const resume = () => { void context.resume().catch(() => {}); };
    window.addEventListener('click', resume, { capture: true, once: true });
    resume();
    recording = { context, destination, mix, stream, recorder, chunks, resume, startedMs: performance.now(),
      timeOriginMs: performance.timeOrigin,
      canvas: [canvas.width, canvas.height] };
    masters.forEach(attach);
    recorder.start(1000);
    return recording.startedMs;
  }

  async function finish() {
    const { context, stream, recorder, chunks, resume, startedMs, timeOriginMs, canvas } = recording;
    const stoppedMs = performance.now();
    const info = { startedMs, stoppedMs, timeOriginMs, canvas, audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length, mimeType: recorder.mimeType, sampleRate: context.sampleRate };
    window.removeEventListener('click', resume, true);
    try {
      await new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = event => reject(event.error);
        recorder.stop();
      });
      const blob = new Blob(chunks, { type: 'video/webm' });
      let decoded;
      let deadline;
      try {
        const pcm = await Promise.race([
          context.decodeAudioData(await blob.arrayBuffer()),
          new Promise((_, reject) => {
            deadline = window.setTimeout(() => reject(Error('Opus decoding timed out.')), 5000);
          }),
        ]);
        decoded = { channels: pcm.numberOfChannels, seconds: pcm.duration,
          signal: Array.from({ length: pcm.numberOfChannels }, (_, i) => meterSamples(pcm.getChannelData(i))) };
      } catch (error) {
        decoded = { error: String(error) };
      } finally {
        window.clearTimeout(deadline);
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { ...info, bytes: blob.size, decoded, data };
    } finally {
      masters.forEach(detach);
      stream.getTracks().forEach(track => track.stop());
      recording = null;
      await context.close();
    }
  }

  window.__tideAudio = {
    start, finish, sample,
    running: () => recording?.context.state === 'running',
    mark: label => emit('mark', { label }),
    begin: () => { timer = window.setInterval(() => readings.push(sample()), 75); },
    read: () => {
      window.clearInterval(timer);
      return { events, readings };
    },
  };
}
