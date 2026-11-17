// Equal-power overlap keeps the loop join on an ordinary adjacent sample pair.
export function seamlessNoiseLoop(channels: Float32Array[], rate: number, crossfadeSeconds = .25): Float32Array<ArrayBuffer>[] {
  const length = channels[0].length, overlap = Math.max(2, Math.round(rate * crossfadeSeconds));
  if (channels.some(channel => channel.length !== length) || length <= overlap * 2) throw new Error('The noise loop is too short.');
  return channels.map(channel => {
    const output = channel.slice(0, length - overlap);
    for (let i = 0; i < overlap; i++) {
      const t = i / (overlap - 1), smooth = t * t * (3 - 2 * t), angle = smooth * Math.PI / 2;
      output[i] = channel[length - overlap + i] * Math.cos(angle) + channel[i] * Math.sin(angle);
    }
    return output;
  });
}
