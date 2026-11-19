// Build the larger scales over the photographed bark grain. The same
// fissures drive pigment and relief, continuing through mip transitions.
const barkPlates = `
  vec3 pineBarkSeed(vec2 cell) {
    vec3 p = fract(cell.xyx * vec3(.1031, .1030, .0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yzz) * p.zyx);
  }

  vec4 pineBarkPlates(vec2 uv) {
    // The trunk has .81 m x 1.14 m per texture repeat.
    vec2 p = uv * vec2(5.5, 5.1);
    p.x += .27 * sin(p.y * 1.7 + sin(p.x * .86)) + .18 * sin(p.y * 5.3 - p.x * 3.9);
    p.y += .23 * sin(p.x * 1.9 - p.y * .54) + .11 * sin(p.y * 7.9 + p.x * 4.1);
    vec2 cell = floor(p), local = fract(p);
    float nearest = 8., second = 8., pigment = .5;
    vec2 centre = vec2(0.);
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
          centre = delta;
        } else {
          second = min(second, distanceSquared);
        }
      }
    }
    float fracture = sin(p.x * 6.3 + p.y * 4.9) * sin(p.y * 7.1 - p.x * 2.4);
    float gap = sqrt(second) - sqrt(nearest) + .038 * fracture;
    float filterWidth = min(.11, fwidth(gap) * .55);
    float split = mix(.046, .085, pigment);
    float plate = smoothstep(split - filterWidth, split + .095 + filterWidth, gap);
    float shoulder = plate * (1. - smoothstep(.15, .33, gap))
      * smoothstep(-.09, .37, centre.y + centre.x * .38);
    float flake = smoothstep(.28, .71, fracture * .25 + .50 + .21 * centre.y);
    vec3 seams = vec3(.57, .46, .39);
    vec3 surface = mix(vec3(.89, .72, .60), vec3(1.56, 1.39, 1.23), pigment);
    vec3 pigmentScale = mix(seams, surface + shoulder * vec3(.23, .18, .12), plate);
    float height = plate * (.0018 + .0021 * pigment + .0007 * flake) + shoulder * .0022;
    return vec4(pigmentScale, height);
  }

  vec3 pineBarkRelief(vec3 point, vec3 normal, float relief, float facing) {
    vec3 signatureX = dFdx(point), signatureY = dFdy(point);
    vec3 tangentX = cross(signatureY, normal), tangentY = cross(normal, signatureX);
    float determinant = dot(signatureX, tangentX) * facing;
    vec3 gradient = sign(determinant) * (dFdx(relief) * tangentX + dFdy(relief) * tangentY);
    return normalize(max(abs(determinant), 1e-10) * normal - gradient);
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
          float barkFootprint = 512. * length(fwidth(vMapUv));
          vec4 barkPlate = pineBarkPlates(vMapUv);
          float broadContrast = mix(.58, .88, smoothstep(2.8, 8., barkFootprint));
          diffuseColor.rgb *= mix(vec3(1.), barkPlate.rgb, broadContrast);
        #endif
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_MAP
          float resolvedBarkRelief = barkPlate.a * (1. - smoothstep(4., 12., barkFootprint));
          normal = pineBarkRelief(-vViewPosition, normal, resolvedBarkRelief, faceDirection);
        #endif
      `);
    };
  }
}
