import { dayPart } from '../../../../shared/dayPart.ts';

export function bellLaneLocalHour(date: Date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function smoothstep(value: number, low: number, high: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function bellLaneShutterOffset(shop: number, side: number) {
  return shop * .045 + side * .08;
}

export function bellLaneShutterOpening(hour: number) {
  return smoothstep(hour, 5.25, 7.9) * (1 - smoothstep(hour, 17, 19.2));
}

export function bellLaneSweepGain(date: Date) {
  if (dayPart(date) !== 'dawn') return 0;
  // The east shop row lets out the sound as its first working shutter opens.
  const opening = bellLaneShutterOpening(bellLaneLocalHour(date) + bellLaneShutterOffset(2, 1));
  return 5.2 * smoothstep(opening, .045, .24);
}

export function bellLaneSweepOffset(walkSeconds: number, duration: number) {
  // If decoding starts late, hear the part of the sweep this walk has reached.
  const offset = walkSeconds - 2.25;
  return offset >= 0 && offset < duration && walkSeconds < 12 ? offset : null;
}
