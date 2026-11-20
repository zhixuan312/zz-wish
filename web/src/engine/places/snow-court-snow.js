const sweptName = 'Wind-packed snow with recent broom marks';
const fieldName = 'Wind-packed winter snow';
const trailName = 'Wind-packed snow on the pass trail';

export function isWinterCourtSnow(material) {
  return material.name === sweptName || material.name === fieldName || material.name === trailName;
}

export function tuneWinterCourtSnow(material, tint, lightDirection, lightStrength) {
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  const swept = material.name === sweptName;
  const trail = material.name === trailName;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.uSweptSnowBase = { value: tint };
    shader.uniforms.uSnowLightDirection = { value: lightDirection };
    shader.uniforms.uSnowLightStrength = lightStrength;
    shader.fragmentShader = `
      uniform vec3 uSweptSnowBase, uSnowLightDirection;
      uniform float uSnowLightStrength;
      float snowSeed(vec2 cell) {
        vec2 p = fract(cell * vec2(.1031, .1030));
        p += dot(p, p.yx + 33.33);
        return fract((p.x + p.y) * p.x);
      }
      float snowGrain(vec2 p) {
        vec2 cell = floor(p);
        vec2 blend = fract(p);
        blend = blend * blend * (3. - 2. * blend);
        return mix(mix(snowSeed(cell), snowSeed(cell + vec2(1., 0.)), blend.x),
          mix(snowSeed(cell + vec2(0., 1.)), snowSeed(cell + 1.), blend.x), blend.y);
      }
      float snowResolvable(vec2 coordinates) {
        vec2 footprint = fwidth(coordinates);
        return 1. - smoothstep(.62, 1.56, max(footprint.x, footprint.y));
      }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        ${swept ? `
          #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
            vec3 packedSnow = clamp(vColor.rgb / uSweptSnowBase, 0., 1.);
            diffuseColor.rgb *= mix(vec3(1.), packedSnow, .94);
          #endif
        ` : ''}
        // An oblique projection keeps grain on the steep drift faces.
        vec2 snowMetres = vBakedWorld.xz + vBakedWorld.y * vec2(.31, -.73);
        ${trail ? `
          float lane = 0.;
          #if defined(USE_MAP)
            // U is distance across the trail, including the bank climb.
            lane = vMapUv.x * .91;
          #endif
          float bank = smoothstep(.58, 1.19, abs(lane));
          float gust = snowGrain(snowMetres * .74);
          float eddy = snowGrain(snowMetres * .43 + 19.3);
          float heading = .82 * (gust - .5) + 1.57 * (eddy - .5);
          vec2 scoured = mat2(cos(heading), sin(heading), -sin(heading), cos(heading)) * snowMetres;
          vec2 ribs = scoured * mix(vec2(1.7, 5.2), vec2(2.8, 8.1), eddy);
          vec2 rime = vec2(snowMetres.y, -snowMetres.x) * vec2(4.3, 6.2);
          float ribsSkin = snowResolvable(ribs) * (snowGrain(ribs) - .5);
          float rimeSkin = snowResolvable(rime) * (snowGrain(rime) - .5);
          float driftRibs = mix(ribsSkin, rimeSkin, .41) * bank * smoothstep(.25, .65, gust);

          // Short bristle fans disappear under fresh windblown snow.
          float fan = vBakedWorld.z * 14. + lane * abs(lane) * 18. + 1.7 * eddy;
          float marks = smoothstep(.56, .91, cos(fan))
            * (1. - smoothstep(.46, .71, abs(lane)))
            * smoothstep(.47, .72, snowGrain(snowMetres * 1.86))
            * snowResolvable(vec2(fan / 6.283, 0.));
          float snowSkin = .16 * (gust - .5) + .24 * driftRibs - .065 * marks;
        ` : `
          vec2 windMetres = mat2(.96, .28, -.28, .96) * snowMetres;
          float gust = snowGrain(windMetres * vec2(1.2, 2.4));
          vec2 ribs = windMetres * vec2(2.4, 11.0) + vec2(1.4 * gust, -2.5 * gust);
          float windSkin = smoothstep(.25, .75, snowGrain(ribs));
          float driftRibs = snowResolvable(ribs) * (windSkin - .5);
          float snowSkin = .13 * (gust - .5) + .32 * driftRibs;
        `}
        vec2 grains = snowMetres * 43.;
        float grainVisibility = snowResolvable(grains);
        vec2 cell = floor(grains);
        float coarseGrain = snowSeed(cell);
        diffuseColor.rgb *= 1. + snowSkin
          + .19 * (snowGrain(grains) - .5) * grainVisibility;
    `).replace('#include <opaque_fragment>', `
        // Some tiny ice facets redirect the existing light. Their world-space
        // seeds stay fixed, while view angle and distance control visibility.
        float facetMask = smoothstep(.84, .982, coarseGrain);
        vec2 chips = fract(grains) - vec2(
          .26 + .48 * snowSeed(cell + 19.), .25 + .50 * snowSeed(cell - 13.));
        float chip = 1. - smoothstep(.12, .34, length(chips));
        vec3 surfaceNormal = normalize(normal);
        vec3 tangent = normalize(cross(surfaceNormal,
          abs(surfaceNormal.y) < .92 ? vec3(0., 1., 0.) : vec3(1., 0., 0.)));
        vec3 bitangent = cross(surfaceNormal, tangent);
        float a = 6.2831853 * snowSeed(cell + vec2(113., -29.));
        float tilt = .5 + .97 * snowSeed(cell + vec2(-31., 181.));
        vec3 facet = normalize(surfaceNormal + tilt * (cos(a) * tangent + sin(a) * bitangent));
        vec3 lightRay = mat3(viewMatrix) * uSnowLightDirection;
        vec3 halfway = normalize(lightRay + normalize(vViewPosition));
        float flash = pow(max(0., dot(facet, halfway)), 20.);
        float sparkle = uSnowLightStrength * grainVisibility * facetMask * chip * flash;
        outgoingLight *= 1. + sparkle * vec3(1.77, 1.99, 2.16);
        #include <opaque_fragment>
    `);
  };
  const program = trail ? '-snow-court-trail' : (swept ? '-snow-court-packed' : '-snow-court-drift');
  material.customProgramCacheKey = () => key() + program;
}

const driftSize = [5.8, 3.16, 4.25];
const driftVertex = `
  uniform vec3 uDriftSize;
  uniform float uCycle, uPointScale;
  attribute vec3 aCrystal;
  varying float vAlpha, vFlash, vStreak;

  void main() {
    const float tau = 6.2831853;
    float phase = tau * aCrystal.z;
    // Integer wraps keep the drift continuous at the cycle boundary, including
    // after hours of burning. The same crosswind takes the chimney smoke west.
    vec3 flow = vec3(-12. - floor(7. * aCrystal.x),
      -4. - floor(3. * aCrystal.y), 3. + floor(3. * aCrystal.z));
    float gust = sin(tau * 17. * uCycle + position.z * 2.);
    vec3 eddy = vec3(.037 * gust, .021 * sin(tau * 53. * uCycle + phase),
      .036 * cos(tau * 29. * uCycle + phase));
    vec3 unit = fract(position + uCycle * flow + eddy);
    vec3 p = (unit - .5) * uDriftSize;
    vec4 view = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * view;

    float diameter = .014 + .021 * aCrystal.y * aCrystal.y;
    float pixels = uPointScale * projectionMatrix[1][1] * diameter / max(1., -view.z);
    gl_PointSize = clamp(pixels, 1.5, 6.5);
    vec3 edge = min(unit, 1. - unit);
    vec3 feather = smoothstep(vec3(0.), vec3(.13, .15, .11), edge);
    vAlpha = feather.x * feather.y * feather.z * min(1., pixels * pixels / 2.25);
    vFlash = pow(.5 + .5 * cos(tau * 101. * uCycle + 4.3 * phase), 12.);
    vStreak = .54 + .42 * aCrystal.x + .08 * gust;
  }
`;

const driftFragment = `
  uniform float uNight;
  varying float vAlpha, vFlash, vStreak;

  void main() {
    vec2 p = gl_PointCoord * 2. - 1.;
    float streak = length(vec2(p.x, (p.y - .11 * p.x) / vStreak));
    float wake = (1. - smoothstep(.18, 1., streak)) * .22;
    float crystal = 1. - smoothstep(.04, .49, length(p));
    vec3 day = vec3(1.22, 1.35, 1.49), night = vec3(.34, .44, .63);
    float alpha = vAlpha * (wake + (.31 + .24 * vFlash) * crystal);
    gl_FragColor = vec4(mix(day, night, uNight) * (1. + .93 * vFlash), alpha);
    #include <colorspace_fragment>
  }
`;

export function buildSnowDoorDrift({ THREE, renderer, group }, hallFront) {
  const count = 288;
  const positions = new Float32Array(count * 3);
  const crystals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const seed = i + .5;
    positions.set([seed * .754877666 % 1, seed * .569840291 % 1, seed * .438447187 % 1], i * 3);
    crystals.set([seed * .618033989 % 1, seed * .414213562 % 1, seed * .732050808 % 1], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aCrystal', new THREE.BufferAttribute(crystals, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(...driftSize) / 2);
  const uniforms = {
    uDriftSize: { value: new THREE.Vector3(...driftSize) },
    uPointScale: { value: renderer.domElement.height * .5 },
    uNight: { value: 0 },
    uCycle: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: driftVertex, fragmentShader: driftFragment,
    uniforms, transparent: true, depthWrite: false, toneMapped: false });
  const points = new THREE.Points(geometry, material);
  points.name = 'Wind-driven snow crystals beyond the half-open hall door';
  points.position.set(.26, 3.38, hallFront + .32 + driftSize[2] / 2);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  points.visible = !reducedMotion.matches;
  group.add(points);
  return {
    update(_dt, seconds, light) {
      points.visible = !reducedMotion.matches;
      uniforms.uCycle.value = (seconds % 60) / 60;
      uniforms.uNight.value = light.n;
      uniforms.uPointScale.value = renderer.domElement.height * .5;
    },
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
