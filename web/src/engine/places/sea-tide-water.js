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
  #include <fog_pars_fragment>

  float hash(vec2 p) {
    vec3 q = fract(p.xyx * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  vec2 slope(vec2 p, vec2 direction, float k, float speed, float stretch) {
    float phase = dot(p, direction) * k + uTime * speed;
    float resolved = 1.0 - smoothstep(0.35, 1.7, fwidth(phase));
    return direction * cos(phase) * stretch * resolved;
  }

  float nearShore(vec2 p) {
    vec2 quayDistance = vec2(abs(p.x - uQuay.x), max(0.0, max(uQuay.y - p.y, p.y - uQuay.z)));
    float distanceToShore = length(quayDistance);
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

    // Irregular incoming swell, crossed by shorter wind ripples. Perspective
    // and derivative filtering preserve the larger crests farther offshore.
    vec2 wash = vec2(sin(p.y * 0.19 + p.x * 0.07), sin(p.x * 0.13 - p.y * 0.16));
    vec2 water = p + 0.9 * wash;
    float swellPatch = noise(p * vec2(0.29, 0.17) + vec2(uTime * 0.055, 0.0));
    vec2 gradient = slope(water, vec2(0.96, 0.28), 0.57, 0.92, 0.055);
    gradient += slope(water, vec2(0.81, -0.59), 0.99, 1.21, 0.045);
    gradient += slope(water, vec2(0.35, 0.94), 1.66, -1.68, 0.034);
    vec2 ripples = slope(p + 0.41 * wash, vec2(0.88, 0.48), 3.8, 2.28, 0.067);
    ripples += slope(p, vec2(0.46, -0.89), 5.7, -2.77, 0.052);
    ripples += slope(p + 0.18 * wash, vec2(0.69, 0.72), 11.9, 4.2, 0.043);
    gradient = gradient * mix(0.97, 0.77, shoaling)
      + ripples * (0.45 + 0.75 * swellPatch + 0.37 * shoaling) * (1.0 - smoothstep(22.0, 110.0, range));
    vec3 normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));

    vec3 horizon = mix(uHorizonDay, uHorizonNight, uNight);
    vec3 overhead = mix(uSkyDay, uSkyNight, uNight);
    vec3 body = mix(uWaterDay, uWaterNight, uNight);
    vec3 reflected = reflect(-viewDirection, normal);
    vec3 incidentSky = mix(horizon, overhead, pow(clamp(reflected.y * 1.7, 0.0, 1.0), 0.59));
    float grazing = 1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.11 + 0.79 * pow(grazing, 4.2);
    vec3 colour = mix(body * mix(0.79, 1.15, swellPatch), incidentSky, fresnel * (1.0 - 0.30 * shoaling));

    // Surface facets reflect the light in fragmented groups. The darker
    // water around each group keeps a continuous bright bar from forming.
    vec3 halfway = normalize(viewDirection + uSunDirection);
    float facing = max(dot(normal, halfway), 0.0);
    float broken = smoothstep(0.31, 0.77, swellPatch);
    float lightPatch = (pow(facing, 34.0) * 0.16 + pow(facing, 111.0) * 0.38) * broken;
    float localGlint = pow(max(0.0, dot(reflected, normalize(vec3(0.94, 0.25, -0.26)))), 22.0);
    localGlint *= smoothstep(0.47, 0.76, swellPatch) * (1.0 - smoothstep(45.0, 125.0, range));
    vec3 glint = mix(vec3(0.60, 0.70, 0.66), vec3(0.21, 0.31, 0.40), uNight);
    glint = mix(glint, vec3(0.84, 0.52, 0.29), uWarm * 0.26);
    colour += glint * (lightPatch + localGlint * 0.23);

    if (shoreDistance < 3.1) {
      float local = noise(p * 0.61 + vec2(uTime * 0.12, -uTime * 0.064));
      float debris = noise(p * 1.93 + vec2(-uTime * 0.20, uTime * 0.13));
      float runup = 0.30 + 0.25 * sin(uTime * 1.52 + p.y * 0.66 + p.x * 0.29 + 4.0 * local);
      float crests = 1.0 - smoothstep(0.05, 0.24, abs(shoreDistance - runup));
      float washLine = 1.0 - smoothstep(0.12, 0.40, abs(shoreDistance - (0.9 + 0.70 * local)));
      float flecks = smoothstep(0.49, 0.78, 0.66 * debris + 0.34 * local);
      float foam = (crests * 0.57 + washLine * 0.36) * flecks * (1.0 - smoothstep(55.0, 118.0, range));
      vec3 foamColour = mix(uFoamDay, uFoamNight, uNight);
      colour = mix(colour, foamColour, clamp(foam, 0.0, 0.65));
    }

    colour = mix(colour, horizon, 0.80 * smoothstep(130.0, 725.0, range));
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// The single depth-writing surface stays at the harbour's existing sea level.
// Shore distances affect only the last few metres of water beside each rock.
export function buildTideWater({ THREE, context }, { shoals = harbourShoals, quay = [13, -18, 35] } = {}) {
  const colour = value => ({ value: new THREE.Color(value) });
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uNight: { value: 0 }, uWarm: { value: 0 },
    uWaterDay: colour(0x41605c), uWaterNight: colour(0x1b333d),
    uHorizonDay: colour(0xadbec5), uHorizonNight: colour(0x415572),
    uSkyDay: colour(0x657e90), uSkyNight: colour(0x2e4561),
    uFoamDay: colour(0xb6c7be), uFoamNight: colour(0x768c98),
    uSunDirection: { value: new THREE.Vector3() },
    uQuay: { value: new THREE.Vector3(...quay) },
    uShoals: { value: shoals.map(shape => new THREE.Vector4(...shape)) },
  }]);
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
