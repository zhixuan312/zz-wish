const dampPaving = `
  float pineStoneHash(vec2 cell) {
    vec3 p = fract(vec3(cell.xyx) * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float pineStoneNoise(vec2 p) {
    vec2 cell = floor(p), blend = fract(p);
    blend *= blend * (3. - 2. * blend);
    return mix(mix(pineStoneHash(cell), pineStoneHash(cell + vec2(1., 0.)), blend.x),
      mix(pineStoneHash(cell + vec2(0., 1.)), pineStoneHash(cell + 1.), blend.x), blend.y);
  }
`;

export function dressPineWetTreads(group) {
  const surfaces = new Set();
  group.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.name === 'Wet granite on the old footpath') surfaces.add(material);
    }
  });
  for (const material of surfaces) {
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => cacheKey + '-pine-tread-water-film';
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.fragmentShader = dampPaving + shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Water caught on the upward-facing, worn granite darkens pore
        // pigment and sharpens the existing sky reflection in patches.
        vec2 stone = vBakedWorld.xz;
        float upwards = smoothstep(.72, .96, dot(nonPerturbedNormal, viewMatrix[1].xyz));
        float sheet = pineStoneNoise(stone * vec2(2.32, 3.84) + vec2(7.1, 1.8));
        float pores = pineStoneNoise(stone * vec2(9.6, 11.3) + sheet * 1.7);
        float wet = upwards * .92 * smoothstep(.44, .73, mix(sheet, pores, .28));
        diffuseColor.rgb *= mix(vec3(1.), vec3(.86, .89, .92), wet);
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, mix(.26, .36, pores)), wet);
      `);
    };
  }
}
