// The private lookout sees a continuous heightfield. Both slopes and the
// stream-cut floor share vertices, and the same triangles drive visibility.
const ORIGIN_X = 10.2;
const ORIGIN_Z = 3.8;
const AXIS = -13.5 * Math.PI / 180;
const SIN = Math.sin(AXIS);
const COS = Math.cos(AXIS);

function range(first, last, step) {
  const values = [];
  for (let n = first; n <= last; n += step) values.push(n);
  return values;
}

const DEPTH = [-32, -16, -8, ...range(0, 236, 4), ...range(240, 570, 6),
  ...range(580, 1320, 12), ...range(1340, 1930, 24)];
const CROSS = [...range(-1056, -168, 24), ...range(-160, 160, 4), ...range(168, 1056, 24)];

function smooth(first, last, n) {
  const v = Math.max(0, Math.min(1, (n - first) / (last - first)));
  return v * v * (3 - 2 * v);
}

function channelAt(d) {
  return (6 * Math.sin(d / 55) + 14 * Math.sin(d / 133) - 8 * Math.sin(d / 218)) * smooth(9, 75, d);
}

function crossWidth(d) {
  return 8 + 13 * smooth(34, 430, d);
}

function gorgeHeight(d, side) {
  const offset = side - channelAt(d);
  const west = offset < 0;
  const face = Math.abs(offset);
  const floor = -12 - 105 * smooth(3, 91, d) + 26 * smooth(185, 460, d) + 69 * smooth(555, 1420, d);
  const meander = (west ? -1 : 1) * (3.8 * Math.sin(d / 49) + 2.2 * Math.sin(d / 20));
  const rise = Math.max(0, face - crossWidth(d) + meander);
  // The broken river shoulder and the two steep beds are separated by shelves.
  // Their spacing changes along each wall rather than generating twin ridges.
  const rockBeds = 8 * smooth(0, 7, rise) + 61 * smooth(6, 18, rise)
    + 12 * smooth(19, 30, rise) + 50 * smooth(28, 54, rise)
    + 30 * smooth(58, 97, rise) + 36 * smooth(115, 260, rise);
  const westProfile = .95 + .17 * Math.sin(d / 150) - .13 * Math.sin(d / 71);
  const eastProfile = .99 - .10 * Math.cos(d / 107) + .09 * Math.sin(d / 177);
  const sideHeight = rockBeds * (west ? westProfile : eastProfile) * smooth(9, 58, d);
  const ribs = (3.5 * Math.sin(d / 17 + side / 19) + 2.6 * Math.sin(d / 9 - side / 13)
    + 1.6 * Math.cos(side / 7 + d / 11)) * smooth(2, 29, rise) * smooth(20, 76, d);
  const headWall = 47 * smooth(600, 1030, d) * (1 - smooth(75, 288, face));
  return floor + sideHeight + ribs + headWall;
}

function worldAt(d, side, height) {
  return [ORIGIN_X + SIN * d + COS * side, height, ORIGIN_Z - COS * d + SIN * side];
}

function toGrid({ x, y, z }) {
  const dx = x - ORIGIN_X, dz = z - ORIGIN_Z;
  return [SIN * dx - COS * dz, COS * dx + SIN * dz, y];
}

function cell(axis, value) {
  let lo = 0, hi = axis.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] > value) hi = mid;
    else lo = mid;
  }
  return lo;
}

function crossingParameters(axis, from, delta, values) {
  if (Math.abs(delta) < 1e-10) return;
  const low = Math.min(from, from + delta), high = Math.max(from, from + delta);
  for (let i = cell(axis, low) + 1; i < axis.length && axis[i] < high; i++) {
    const t = (axis[i] - from) / delta;
    if (t > 0 && t < 1) values.push(t);
  }
}

export function createGorgeSurface() {
  // Store the same Float32 heights used by the renderer. The two halves of a
  // quad are interpolated separately rather than bilinearly smoothing the bed.
  const heights = new Float32Array(DEPTH.length * CROSS.length);
  for (const [row, d] of DEPTH.entries()) {
    for (const [col, side] of CROSS.entries()) heights[row * CROSS.length + col] = gorgeHeight(d, side);
  }

  function heightAt(d, side) {
    const row = cell(DEPTH, d), col = cell(CROSS, side);
    const td = (d - DEPTH[row]) / (DEPTH[row + 1] - DEPTH[row]);
    const ts = (side - CROSS[col]) / (CROSS[col + 1] - CROSS[col]);
    const a = row * CROSS.length + col;
    const topLeft = heights[a], topRight = heights[a + 1];
    const bottomLeft = heights[a + CROSS.length], bottomRight = heights[a + CROSS.length + 1];
    if (td + ts <= 1) return topLeft + td * (bottomLeft - topLeft) + ts * (topRight - topLeft);
    return bottomRight + (1 - td) * (topRight - bottomRight) + (1 - ts) * (bottomLeft - bottomRight);
  }

  function pointAt(d, side) {
    return worldAt(d, side, heightAt(d, side));
  }

  function blocksSegment(origin, target) {
    const [d0, s0, y0] = toGrid(origin), [d1, s1, y1] = toGrid(target);
    const dd = d1 - d0, ds = s1 - s0, dy = y1 - y0;
    const steps = [0, 1];
    crossingParameters(DEPTH, d0, dd, steps);
    crossingParameters(CROSS, s0, ds, steps);
    steps.sort((a, b) => a - b);

    const belowGround = t => heightAt(d0 + dd * t, s0 + ds * t) > y0 + dy * t + 1e-4;
    if (belowGround(0)) return true;
    for (let i = 1; i < steps.length; i++) {
      const start = steps[i - 1], end = steps[i];
      if (end - start < 1e-8) continue;
      if (belowGround(end)) return true;
      const mid = (start + end) / 2;
      const row = cell(DEPTH, d0 + dd * mid), col = cell(CROSS, s0 + ds * mid);
      const depthSpan = DEPTH[row + 1] - DEPTH[row], crossSpan = CROSS[col + 1] - CROSS[col];
      const derivative = dd / depthSpan + ds / crossSpan;
      if (Math.abs(derivative) < 1e-9) continue;
      // Within each triangle, the difference between ray and terrain is
      // linear. Also check the internal diagonal at which the slope changes.
      const diagonal = (1 - (d0 - DEPTH[row]) / depthSpan - (s0 - CROSS[col]) / crossSpan) / derivative;
      if (diagonal > start && diagonal < end && belowGround(diagonal)) return true;
    }
    return false;
  }

  return { heights, pointAt, blocksSegment };
}

export const GORGE_PROBES = {
  nearBank: [181, channelAt(181) - crossWidth(181) - 18],
  valleyBed: [414, channelAt(414)],
  farBank: [323, channelAt(323) + crossWidth(323) + 20],
};

export function addCloudCliffGorge(THREE, scene, rock) {
  const surface = createGorgeSurface();
  const positions = [], colours = [], indices = [];
  const shade = new THREE.Color();
  const bedrock = new THREE.Color(0x796f64), bedding = new THREE.Color(0x9c927d);
  const upper = new THREE.Color(0x6a7770), channel = new THREE.Color(0x526363);
  for (const [row, d] of DEPTH.entries()) {
    for (const [col, side] of CROSS.entries()) {
      const i = row * CROSS.length + col;
      const y = surface.heights[i];
      positions.push(...worldAt(d, side, y));
      const centre = Math.abs(side - channelAt(d));
      const layers = Math.sin((y + .046 * d + .12 * side) * .48 + .66 * Math.sin(d / 39));
      const grain = .5 + .5 * Math.sin(side / 23 + d / 29);
      shade.copy(bedrock).lerp(bedding, .21 + .26 * Math.max(0, layers) + .1 * grain);
      shade.lerp(upper, .66 * smooth(-24, 84, y) + .13 * grain);
      shade.lerp(channel, .81 * (1 - smooth(2, 10, centre)));
      colours.push(shade.r, shade.g, shade.b);
      if (row && col) {
        indices.push(i - CROSS.length - 1, i - CROSS.length, i - 1,
          i - CROSS.length, i, i - 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uGorgeRock = { value: rock.map };
    shader.vertexShader = `varying vec3 vGorgePosition;
      ${shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGorgePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`)}`;
    shader.fragmentShader = `uniform sampler2D uGorgeRock;
      varying vec3 vGorgePosition;
      ${shader.fragmentShader.replace('#include <map_fragment>', `
        vec3 surfaceNormal = abs(normalize(cross(dFdx(vGorgePosition), dFdy(vGorgePosition))));
        vec3 weights = pow(surfaceNormal, vec3(4.0));
        weights /= weights.x + weights.y + weights.z;
        vec3 p = vGorgePosition;
        p.x += sin(p.z * 0.047) * 4.0;
        p.z += sin(p.x * 0.035) * 5.0;
        vec3 colourX = texture2D(uGorgeRock, p.zy / 27.0).rgb;
        vec3 colourY = texture2D(uGorgeRock, p.xz / 33.0).rgb;
        vec3 colourZ = texture2D(uGorgeRock, p.xy / 28.0).rgb;
        float grain = dot(weights.x * colourX + weights.y * colourY + weights.z * colourZ,
          vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= mix(0.57, 1.22, clamp(grain * 2.8, 0.0, 1.0));
      `)}`;
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Connected Cloud Cliff gorge';
  scene.add(mesh);
  return { mesh, ...surface };
}
