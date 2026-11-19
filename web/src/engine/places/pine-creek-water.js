export function animatePineCreek(group) {
  const phase = { value: 0 };
  const surfaces = new Set();
  group.traverse(object => {
    if (object.isMesh && object.material.name === 'Spring water on a slate bed') surfaces.add(object.material);
  });
  for (const material of surfaces) {
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    // Slate and silt remain visible between the sky highlights.
    material.color.multiplyScalar(.44);
    material.metalness = .08;
    material.roughness = .30;
    material.envMapIntensity *= .67;
    material.customProgramCacheKey = () => key + '-pine-creek-current';
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.uPineCreekTime = phase;
      shader.fragmentShader = 'uniform float uPineCreekTime;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 channelPoint = vBakedWorld.xz;
          float shallowSlate = .5 + .5 * sin(dot(channelPoint, vec2(7.4, 5.8))
            + 1.26 * sin(dot(channelPoint, vec2(11.3, -8.1))));
          diffuseColor.rgb *= mix(.71, 1.07, shallowSlate);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 streamWave = channelPoint * vec2(23.5, 37.2);
          float waveA = cos(streamWave.y - uPineCreekTime * 5.8 + .91 * sin(streamWave.x));
          float waveB = cos(dot(channelPoint, vec2(35.2, -16.7)) + uPineCreekTime * 2.7);
          float waveScale = 1. - smoothstep(.4, 2.1, length(fwidth(streamWave)));
          vec3 slope = vec3(.042 * waveA + .039 * waveB, 0., .11 * waveA - .046 * waveB);
          normal = normalize(normal + mat3(viewMatrix) * (waveScale * slope));`);
    };
  }
  return (_dt, time) => { phase.value = time; };
}
