const sweptName = 'Wind-packed snow with recent broom marks';
const fieldName = 'Wind-packed winter snow';

export function isWinterCourtSnow(material) {
  return material.name === sweptName || material.name === fieldName;
}

export function tuneWinterCourtSnow(material, tint, lightDirection, lightStrength) {
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  const swept = material.name === sweptName;
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
        vec2 windMetres = mat2(.87, .49, -.49, .87) * snowMetres;
        float gust = snowGrain(windMetres * vec2(1.2, 2.4));
        vec2 ribs = windMetres * vec2(2.9, 8.2) + vec2(gust, -2.1 * gust);
        float driftRibs = snowResolvable(ribs) * (snowGrain(ribs) - .5);
        vec2 grains = snowMetres * 43.;
        float grainVisibility = snowResolvable(grains);
        vec2 cell = floor(grains);
        float coarseGrain = snowSeed(cell);
        diffuseColor.rgb *= 1. + .085 * (gust - .5) + .18 * driftRibs
          + .105 * (coarseGrain - .5) * grainVisibility;
    `).replace('#include <opaque_fragment>', `
        // Some tiny ice facets redirect the existing light. Their world-space
        // seeds stay fixed, while view angle and distance control visibility.
        float facetMask = smoothstep(.87, .995, coarseGrain);
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
        float flash = pow(max(0., dot(facet, halfway)), 16.);
        float sparkle = uSnowLightStrength * grainVisibility * facetMask * chip * flash;
        outgoingLight *= 1. + sparkle * vec3(.84, .94, 1.);
        #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => key() + (swept ? '-snow-court-packed' : '-snow-court-drift');
}
