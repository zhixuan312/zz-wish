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

function bendWeight(d) {
  return smooth(416, 434, d) * (1 - smooth(476, 504, d));
}

function brokenFace(d, westDistance) {
  const alongJoint = d + .63 * (westDistance - 27);
  const wall = smooth(19, 30, westDistance) * (1 - smooth(44, 66, westDistance));
  const slab = smooth(422, 440, alongJoint) * (1 - smooth(447, 455, alongJoint));
  const seam = smooth(447, 453, alongJoint) * (1 - smooth(455, 466, alongJoint));
  return wall * (16 * slab - 6 * seam);
}

function screeFan(d, westDistance) {
  const alongFan = d + .55 * (westDistance - 20);
  return smooth(435, 446, alongFan) * (1 - smooth(464, 478, alongFan))
    * smooth(7, 23, westDistance) * (1 - smooth(30, 42, westDistance));
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
  const fracturedBank = brokenFace(d, -offset) + 7.5 * screeFan(d, -offset);
  return floor + sideHeight + ribs + headWall + fracturedBank;
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

function scatterBendScree(THREE, scene, surface, rock) {
  const count = 29;
  const gravel = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ map: rock.map ?? null, roughness: 1, flatShading: true }),
    count,
  );
  gravel.name = 'Cloud Cliff bend scree';
  const chip = new THREE.Object3D();
  const tint = new THREE.Color();
  const drift = (i, salt) => {
    const sample = Math.sin(i * 71.91 + salt * 19.73) * 104729;
    return sample - Math.floor(sample);
  };
  for (let i = 0; i < count; i++) {
    const westDistance = 9 + 25 * drift(i, 1);
    const d = 443 + 20 * drift(i, 2) - .55 * (westDistance - 20);
    const span = (.5 + 1.8 * drift(i, 3)) * (.65 + .9 * smooth(10, 29, westDistance));
    const height = span * (.47 + .45 * drift(i, 4));
    const [x, y, z] = surface.pointAt(d, channelAt(d) - westDistance);
    chip.position.set(x, y + .12 * height, z);
    chip.rotation.set(.3 * (drift(i, 5) - .5), 2 * Math.PI * drift(i, 6), .53 * (drift(i, 7) - .5));
    chip.scale.set(span, height, span * (.58 + .28 * drift(i, 8)));
    chip.updateMatrix();
    gravel.setMatrixAt(i, chip.matrix);
    gravel.setColorAt(i, tint.setHex(0xa99d8a).multiplyScalar(.73 + .50 * drift(i, 9)));
  }
  scene.add(gravel);
}

export function addCloudCliffGorge(THREE, scene, rock) {
  const surface = createGorgeSurface();
  const positions = [], colours = [], bank = [], indices = [];
  const shade = new THREE.Color();
  const bedrock = new THREE.Color(0x796f64), bedding = new THREE.Color(0x9c927d);
  const upper = new THREE.Color(0x6a7770), channel = new THREE.Color(0x526363);
  const freshRock = new THREE.Color(0x77756e), scree = new THREE.Color(0x9a9180);
  for (const [row, d] of DEPTH.entries()) {
    const centreline = channelAt(d), bend = bendWeight(d);
    for (const [col, side] of CROSS.entries()) {
      const i = row * CROSS.length + col;
      const y = surface.heights[i];
      positions.push(...worldAt(d, side, y));
      const offset = side - centreline;
      const relief = brokenFace(d, -offset);
      const layers = Math.sin((y + .046 * d + .12 * side) * .48 + .66 * Math.sin(d / 39));
      const grain = .5 + .5 * Math.sin(side / 23 + d / 29);
      shade.copy(bedrock).lerp(bedding, .21 + .26 * Math.max(0, layers) + .1 * grain);
      shade.lerp(upper, .66 * smooth(-24, 84, y) + .13 * grain);
      shade.lerp(channel, .81 * (1 - smooth(2, 10, Math.abs(offset))) * (1 - bend));
      shade.lerp(freshRock, .7 * smooth(2, 12, Math.abs(relief)));
      shade.multiplyScalar(1 - .24 * smooth(1, 5, -relief));
      shade.lerp(scree, .58 * screeFan(d, -offset));
      colours.push(shade.r, shade.g, shade.b);
      bank.push(offset, bend, smooth(1, 11, Math.abs(relief)));
      if (row && col) {
        indices.push(i - CROSS.length - 1, i - CROSS.length, i - 1,
          i - CROSS.length, i, i - 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('gorgeBank', new THREE.Float32BufferAttribute(bank, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uGorgeRock = { value: rock.map };
    shader.vertexShader = `attribute vec3 gorgeBank;
      varying vec3 vGorgeBank;
      varying vec3 vGorgePosition;
      ${shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vGorgeBank = gorgeBank;
        vGorgePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`)}`;
    shader.fragmentShader = `uniform sampler2D uGorgeRock;
      varying vec3 vGorgeBank;
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

        float offset = vGorgeBank.x - 1.15 * vGorgeBank.y;
        float distanceFromWater = abs(offset) - mix(5.1, 3.3, vGorgeBank.y);
        float wet = 1.0 - smoothstep(-0.32, 0.36, distanceFromWater);
        float shingle = 1.0 - smoothstep(0.28, offset < 0.0 ? 4.6 : 2.4, distanceFromWater);
        vec3 river = vec3(0.035, 0.057, 0.063) * (0.91 + 0.09 * sin(p.z * 0.31));
        vec3 gravel = vec3(0.22, 0.20, 0.16) * (0.78 + 0.34 * grain);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(gravel, river, wet), shingle * vGorgeBank.y);
      `).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec3 facet = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        normal = normalize(mix(normal, facet, vGorgeBank.z * 0.69));
      `)}`;
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Connected Cloud Cliff gorge';
  scene.add(mesh);
  scatterBendScree(THREE, scene, surface, rock);
  return { mesh, ...surface };
}
