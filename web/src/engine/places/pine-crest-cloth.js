const clothTint = `
  vec3 pineCrestClothDye(vec2 uv, float height) {
    // Filter the warp and weft separately as the threads drop below a pixel.
    vec2 yarn = uv / vec2(.00132, .00151);
    vec2 resolved = 1. - smoothstep(vec2(.19), vec2(.72), fwidth(yarn));
    vec2 waves = cos(6.2831853 * yarn) * resolved;
    float crossing = (waves.x + waves.y) * .060 + waves.x * waves.y * .080;
    float wear = .49 + .21 * sin(height * 29. + uv.y * 38. + sin(uv.x * 190.))
      + .18 * sin(uv.x * 386. - uv.y * 61.);
    float paleHem = smoothstep(.027, .039, abs(uv.x)) * (.27 + wear * .32);
    float faded = smoothstep(.22, .82, wear) * .33 + paleHem;
    return mix(vec3(.85, .68, .66), vec3(1.34, 1.68, 1.49), faded) * (1. + crossing);
  }
`;

export function dressPineCrestCloth(group) {
  const surfaces = new Set();
  group.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.userData.one_light_crest_cloth) surfaces.add(material);
    }
  });
  for (const material of surfaces) {
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => cacheKey + '-pine-crest-woven-cloth';
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.vertexShader = 'varying vec2 vPineClothUv;\n' + shader.vertexShader.replace(
        '#include <uv_vertex>', '#include <uv_vertex>\nvPineClothUv = uv;');
      shader.fragmentShader = 'varying vec2 vPineClothUv;\n' + clothTint + shader.fragmentShader.replace(
        '#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= pineCrestClothDye(vPineClothUv, vBakedWorld.y);');
    };
  }
}
