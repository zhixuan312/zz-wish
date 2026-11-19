// Broad bark plates remain visible after the fine scanned relief is minified.
// Keep the existing diffuse, normal, AO and roughness maps in every view.
const barkPlates = `
  vec3 pineBarkSeed(vec2 cell) {
    vec3 p = fract(cell.xyx * vec3(.1031, .1030, .0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yzz) * p.zyx);
  }

  vec3 pineBarkPlates(vec2 uv) {
    // The trunk has .81 m x 1.14 m per texture repeat.
    vec2 p = uv * vec2(5.5, 5.1);
    p.x += .27 * sin(p.y * 1.7 + sin(p.x * .86)) + .18 * sin(p.y * 5.3 - p.x * 3.9);
    p.y += .23 * sin(p.x * 1.9 - p.y * .54) + .11 * sin(p.y * 7.9 + p.x * 4.1);
    vec2 cell = floor(p), local = fract(p);
    float nearest = 8., second = 8., pigment = .5;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbour = vec2(float(x), float(y));
        vec3 seed = pineBarkSeed(cell + neighbour);
        vec2 delta = neighbour + .19 + seed.xy * .62 - local;
        delta.x += .22 * delta.y;
        float distanceSquared = dot(delta, delta);
        if (distanceSquared < nearest) {
          second = nearest;
          nearest = distanceSquared;
          pigment = seed.z;
        } else {
          second = min(second, distanceSquared);
        }
      }
    }
    float gap = sqrt(second) - sqrt(nearest);
    float filterWidth = min(.11, fwidth(gap) * .55);
    float plate = smoothstep(.045 - filterWidth, .15 + filterWidth, gap);
    float edge = plate * (1. - smoothstep(.18, .31, gap));
    vec3 seams = vec3(.71, .59, .50);
    vec3 surface = mix(vec3(.94, .80, .70), vec3(1.61, 1.48, 1.35), pigment);
    return mix(seams, surface + edge * vec3(.12, .10, .07), plate);
  }
`;

export function dressAncientPineBark(group) {
  const surfaces = new Set();
  group.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.userData.one_light_ancient_pine_bark) surfaces.add(material);
    }
  });

  for (const material of surfaces) {
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => cacheKey + '-ancient-pine-bark-plates';
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.fragmentShader = barkPlates + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          // Real scanned fissures read nearby. Let larger pigment breaks
          // emerge only when several source texels fall into a screen pixel.
          float barkFootprint = 512. * length(fwidth(vMapUv));
          float barkPlateWeight = smoothstep(2.8, 8.0, barkFootprint);
          diffuseColor.rgb *= mix(vec3(1.), pineBarkPlates(vMapUv), barkPlateWeight * .9);
        #endif
      `);
    };
  }
}
