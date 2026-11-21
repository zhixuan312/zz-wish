const harbourShoals = [
  [26, -22, 10.2, 6.0], [38, -14, 8.2, 4.8],
  [49, -8, 7.2, 3.9], [61, -4.5, 6.4, 3.7],
  [27, 34, 10.8, 5.1], [42, 29, 8.2, 4.2],
  [54, 24, 7.6, 3.9], [67, 21, 6.6, 3.7],
];

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorld;
  uniform float uTime, uNight, uWarm;
  uniform vec3 uWaterDay, uWaterNight, uHorizonDay, uHorizonNight, uSkyDay, uSkyNight;
  uniform vec3 uFoamDay, uFoamNight, uSunDirection, uQuay;
  uniform vec4 uShoals[8];
  uniform vec4 uShoreRange;
  uniform sampler2D uShoreTex;
  #include <fog_pars_fragment>

  float hash(vec2 p) {
    vec3 q = fract(p.xyx * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  // Cubic value noise and its local gradient, returned from the same four
  // cells. A bump ends with its patch instead of spanning the channel.
  vec3 waterNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 curve = f * f * (3.0 - 2.0 * f);
    vec2 rate = 6.0 * f * (1.0 - f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return vec3(mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y),
      mix(b - a, d - c, curve.y) * rate.x,
      mix(c - a, d - b, curve.x) * rate.y);
  }

  vec2 rippleSlope(vec2 p, vec2 axis, vec2 spacing, vec2 travel) {
    vec2 across = vec2(-axis.y, axis.x);
    vec2 cells = vec2(dot(p, axis), dot(p, across)) / spacing - uTime * travel;
    vec2 pixelSpan = fwidth(cells);
    float visible = 1.0 - smoothstep(0.38, 1.5, max(pixelSpan.x, pixelSpan.y));
    vec2 gradient = waterNoise(cells).yz;
    return (axis * gradient.x + across * gradient.y * 0.76) * visible;
  }

  float nearShore(vec2 p) {
    vec2 quayDistance = vec2(abs(p.x - uQuay.x), max(0.0, max(uQuay.y - p.y, p.y - uQuay.z)));
    float distanceToShore = length(quayDistance);
    if (p.x >= uShoreRange.x && p.x <= uShoreRange.y) {
      float u = (p.x - uShoreRange.x) / (uShoreRange.y - uShoreRange.x);
      vec2 shores = mix(vec2(uShoreRange.z), vec2(uShoreRange.w),
        texture2D(uShoreTex, vec2((0.5 + u * 255.0) / 256.0, 0.5)).rg);
      vec2 approach = abs(p.y - shores);
      return min(distanceToShore, min(approach.x, approach.y));
    }
    for (int i = 0; i < 8; i++) {
      vec4 shoal = uShoals[i];
      vec2 scaled = (p - shoal.xy) / shoal.zw;
      float edge = abs(length(scaled) - 1.0) * min(shoal.z, shoal.w);
      distanceToShore = min(distanceToShore, edge);
    }
    return distanceToShore;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 toEye = cameraPosition - vWorld;
    vec3 viewDirection = normalize(toEye);
    float range = length(toEye);
    float shoreDistance = 12.0;
    if (p.x < 90.0 && p.x > 8.0 && abs(p.y - 8.5) < 37.0) shoreDistance = nearShore(p);
    float shoaling = 1.0 - smoothstep(0.7, 7.5, shoreDistance);

    // Local crossed chop at three scales. Pixel footprints suppress the
    // finer cells by distance and perspective before they can crawl or alias.
    float wind = waterNoise(p * 0.47 + vec2(uTime * 0.034, -uTime * 0.026)).x;
    vec2 swell = rippleSlope(p, vec2(0.91, 0.41), vec2(1.55, 1.18), vec2(0.61, 0.09));
    vec2 chop = rippleSlope(p + vec2(2.1, -4.7), vec2(0.52, -0.85), vec2(0.60, 0.96), vec2(0.38, -0.15));
    vec2 ruffle = rippleSlope(p + vec2(4.4, 2.9), vec2(0.77, 0.64), vec2(0.25, 0.39), vec2(0.71, 0.25));
    vec2 gradient = swell * mix(0.043, 0.028, shoaling);
    gradient += chop * (0.038 + 0.021 * wind + 0.022 * shoaling);
    gradient += ruffle * (0.026 + 0.021 * wind + 0.017 * shoaling);
    vec3 normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));

    vec3 horizon = mix(uHorizonDay, uHorizonNight, uNight);
    vec3 overhead = mix(uSkyDay, uSkyNight, uNight);
    vec3 body = mix(uWaterDay, uWaterNight, uNight);
    vec3 reflected = reflect(-viewDirection, normal);
    // Blend the sky over a broad angle so the grazing horizon cannot paint
    // a bright stripe on one side of every small change in surface normal.
    float skyElevation = smoothstep(-0.08, 0.68, reflected.y);
    vec3 incidentSky = mix(horizon * 0.73, overhead, skyElevation);
    float grazing = 1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.19 + 0.43 * pow(grazing, 4.0);
    vec3 colour = mix(body * mix(0.92, 1.06, wind), incidentSky, fresnel * (1.0 - 0.29 * shoaling));

    // Small highlights follow the sun and grazing sky within separate wind
    // cells. They remain subtle on the shaded or moonlit surface.
    vec2 glintCells = p * vec2(1.13, 1.68) + vec2(-uTime * 0.18, uTime * 0.11);
    vec2 glintSpan = fwidth(glintCells);
    float glintResolved = 1.0 - smoothstep(0.45, 1.55, max(glintSpan.x, glintSpan.y));
    float flecks = smoothstep(0.51, 0.86, waterNoise(glintCells).x) * glintResolved;
    vec3 halfway = normalize(viewDirection + uSunDirection);
    float sunGlint = pow(max(dot(normal, halfway), 0.0), 82.0);
    float skyGlint = smoothstep(0.015, 0.31, reflected.y) * pow(grazing, 2.1);
    vec3 glint = mix(vec3(0.48, 0.58, 0.53), vec3(0.30, 0.38, 0.46), uNight);
    glint = mix(glint, vec3(0.76, 0.49, 0.28), uWarm * 0.23);
    colour += glint * (sunGlint * 0.26 + skyGlint * 0.10) * flecks * (0.40 + 0.60 * wind);

    if (shoreDistance < 1.85) {
      float runs = waterNoise(p * 0.92 + vec2(uTime * 0.12, -uTime * 0.064)).x;
      float bubbles = waterNoise(p * 4.0 + vec2(-uTime * 0.26, uTime * 0.16)).x;
      float wash = 0.20 + 0.14 * sin(uTime * 1.7 + 5.3 * runs + p.y * 0.41 + p.x * 0.29);
      float breaker = 1.0 - smoothstep(0.032, 0.18, abs(shoreDistance - wash));
      float drain = 1.0 - smoothstep(0.05, 0.25, abs(shoreDistance - (0.52 + 0.40 * runs)));
      float gaps = smoothstep(0.53, 0.81, 0.53 * bubbles + 0.47 * runs);
      float foam = (breaker * 0.44 + drain * 0.24) * gaps * (1.0 - smoothstep(45.0, 110.0, range));
      colour = mix(colour, mix(uFoamDay, uFoamNight, uNight), min(foam, 0.48));
    }

    colour = mix(colour, horizon, 0.80 * smoothstep(130.0, 725.0, range));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function shoreLookup(THREE, waterlines) {
  if (!waterlines) return { texture: null, range: new THREE.Vector4(1, 0, 0, 1) };
  const size = 256;
  const left = Math.max(...waterlines.map(line => line[0][0]));
  const right = Math.min(...waterlines.map(line => line.at(-1)[0]));
  const levels = waterlines.flatMap(line => line.map(point => point[1]));
  const low = Math.min(...levels), high = Math.max(...levels);
  const data = new Uint8Array(size * 4);
  const segment = [0, 0];
  for (let index = 0; index < size; index++) {
    const x = THREE.MathUtils.lerp(left, right, index / (size - 1));
    for (const [bank, profile] of waterlines.entries()) {
      while (segment[bank] + 1 < profile.length - 1 && profile[segment[bank] + 1][0] < x) segment[bank]++;
      const a = profile[segment[bank]], b = profile[segment[bank] + 1];
      const z = THREE.MathUtils.lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
      data[index * 4 + bank] = Math.round(255 * (z - low) / (high - low));
    }
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, 1);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, range: new THREE.Vector4(left, right, low, high) };
}

// The single depth-writing surface stays at the harbour's existing sea level.
// Shore distances affect only the last few metres of water beside each rock.
export function buildTideWater({ THREE, context }, { shoals = harbourShoals, quay = [13, -18, 35], waterlines } = {}) {
  const colour = value => ({ value: new THREE.Color(value) });
  const { texture, range } = shoreLookup(THREE, waterlines);
  if (texture) (context.disposers ??= []).push(() => texture.dispose());
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uNight: { value: 0 }, uWarm: { value: 0 },
    uWaterDay: colour(0x41605c), uWaterNight: colour(0x1b333d),
    uHorizonDay: colour(0xadbec5), uHorizonNight: colour(0x415572),
    uSkyDay: colour(0x657e90), uSkyNight: colour(0x2e4561),
    uFoamDay: colour(0xb6c7be), uFoamNight: colour(0x768c98),
    uSunDirection: { value: new THREE.Vector3() },
    uQuay: { value: new THREE.Vector3(...quay) },
    uShoals: { value: shoals.map(shape => new THREE.Vector4(...shape)) },
    uShoreRange: { value: range },
  }]);
  uniforms.uShoreTex = { value: texture };
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, fog: true,
    extensions: { derivatives: true },
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), material);
  sea.position.y = -2.8;
  sea.name = 'Tide Temple harbour water';
  sea.userData.cast = false;
  context.G.add(sea);
  const day = new THREE.Vector3();
  const night = new THREE.Vector3(0.95, 0.13, -0.5).normalize();
  function update(dt, time, light) {
    uniforms.uTime.value = time;
    uniforms.uNight.value = light?.n ?? 0;
    uniforms.uWarm.value = light?.g ?? 0;
    day.set(light?.dawn ? -0.6 : 0.6, Math.max(0.02, 0.45 * (light?.elev ?? 1)), -0.6).normalize();
    uniforms.uSunDirection.value.copy(day).lerp(night, uniforms.uNight.value).normalize();
  }
  update(0, 0, context.light);
  context.up.push(update);
  return sea;
}
