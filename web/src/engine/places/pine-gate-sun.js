import daylight from '../../../../shared/pine-gate-daylight.json' with { type: 'json' };

const elevation = daylight.solarElevationDegrees * Math.PI / 180;
const azimuth = daylight.solarAzimuthDegrees * Math.PI / 180;
const horizon = Math.cos(elevation);

// Match the Cycles sky convention, then convert Blender (x, y, z) to glTF (x, z, -y).
export const pineDaySunDirection = Object.freeze([
  -horizon * Math.sin(azimuth), Math.sin(elevation), -horizon * Math.cos(azimuth),
]);
