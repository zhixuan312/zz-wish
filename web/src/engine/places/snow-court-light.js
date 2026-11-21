import projection from '../../../../shared/snow-court-backdrop.json' with { type: 'json' };
import lowSun from '../../../../shared/snow-court-low-sun.json' with { type: 'json' };
import directional from '../../../../shared/snow-court-directional-light.json' with { type: 'json' };

// The sky palette and the irradiance weights have independent jobs. The
// low western key casts a long shadow in the afternoon transport bank.
const keys = [
  // hour, night, warmth, blue hour, west bank, dawn peak, sunset peak
  [0,    1,   0,   0,   0,    0,   0],
  [4.5,  1,   0,   .2,  0,    0,   0],
  [6,   .54, .81, .63,  0,    1,   0],
  [7.5, .14, .24, .4,   0,   .27,  0],
  [9,   .025,0, .18, 0,    0,   0],
  [13,   0,   0,   0,   0,    0,   0],
  [14,   0,  .09,  0,   .12,  0,  .1],
  [16,   0,  .36,  0,   1,    0,  .45],
  [18,  .41, .96, .22,  1,    0,   1],
  [19.5,.93, .15, .64,  .33,  0,  .14],
  [22,   1,   0,   0,   0,    0,   0],
  [24,   1,   0,   0,   0,    0,   0],
];

function sampleSnowLight(date) {
  const hour = date.getHours() + (date.getMinutes() + (date.getSeconds() + date.getMilliseconds() / 1000) / 60) / 60;
  let i = 1;
  while (keys[i][0] <= hour && i < keys.length - 1) i++;
  const a = keys[i - 1], b = keys[i];
  const t = (hour - a[0]) / (b[0] - a[0]);
  const k = t * t * (3 - 2 * t);
  return [hour, ...a.slice(1).map((value, index) => value + (b[index + 1] - value) * k)];
}

function interpolateDirection(a, b, t) {
  return a.map((value, index) => value + (b[index] - value) * t);
}

function transition(value, start, end) {
  const fraction = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return fraction * fraction * (3 - 2 * fraction);
}

const directionalKeys = [
  [0, 'night'], [4.5, 'night'], [6, 'dawn'], [9, 'morning'],
  [13, null, projection.light.day], [16, null, lowSun], [18, 'evening'],
  [22, 'night'], [24, 'night'],
];

function directionalLook(hour) {
  const next = directionalKeys.findIndex(([time]) => time > hour);
  const [fromHour, fromName, fromBase] = directionalKeys[next - 1];
  const [toHour, toName, toBase] = directionalKeys[next];
  const amount = transition(hour, fromHour, toHour);
  const source = fromBase ?? directional.looks[fromName];
  const target = toBase ?? directional.looks[toName];
  const lerp = interpolateDirection(source.directionEngine, target.directionEngine, amount);
  const weights = fromName === toName ? [[fromName, 1]] : [[fromName, 1 - amount], [toName, amount]];
  const relight = weights.filter(([name, weight]) => name && weight > 0).map(([name, weight]) => ({ name, weight }));
  return { direction: lerp, relight };
}

export function snowCourtLight(date, useDirectional = false) {
  const [hour, n, g, blue, west, dawnPeak, sunsetPeak] = sampleSnowLight(date);
  // The sheltered pass receives diffuse early light. The dawn tint is
  // strongest in the sky and on the snow high above the court.
  const daylight = projection.light.day.directionEngine;
  const moon = projection.light.night.directionEngine;
  const solar = interpolateDirection(daylight, lowSun.directionEngine, west);
  const nightDirection = hour < 12 ? 1 - transition(hour, 4.25, 8) : transition(hour, 18, 20.75);
  const look = useDirectional ? directionalLook(hour) : null;
  const direction = look?.direction ?? interpolateDirection(solar, moon, nightDirection);
  const elev = direction[1] / daylight[1];
  const sunScale = (.35 + .65 * (look ? direction[1] : solar[1]) / daylight[1]) * (1 - n) + n;
  const morning = transition(hour, 7.3, 9) * (1 - transition(hour, 9, 12));
  const veranda = 1 - transition(hour, 6.25, 7.5) + transition(hour, 17.2, 17.95);
  return { n, g, blue, sunScale, lamp: .55 + .45 * n, haze: 1 + .42 * dawnPeak, elev, direction,
    dawn: hour < 12, discScale: 1 - .96 * dawnPeak, west, dawnPeak, sunsetPeak, morning, veranda,
    daySky: { top: 0x93b9d8, horizon: 0xe2edf6, weight: .54 * morning },
    ...(look && { relight: look.relight }) };
}

export function snowCourtBakedLight(date) {
  const [, n, , , west] = sampleSnowLight(date);
  return { n, g: west };
}
