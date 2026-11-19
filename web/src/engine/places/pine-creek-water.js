const clearRunnelName = 'Clear spring runnel';
const oldRunnelName = 'Spring water on a slate bed';

function installClearRunnel(material, phase) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  // Blend over the opaque, independently lit gravel and bank stones. The
  // water occupies its own transparent pass and never replaces their depth.
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 1;
  material.envMapIntensity = .52;
  material.customProgramCacheKey = () => key + '-clear-pine-runnel';
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uPineCreekTime = phase;
    shader.vertexShader = 'varying vec2 vPineRunnelProfile;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPineRunnelProfile = uv;');
    shader.fragmentShader = 'varying vec2 vPineRunnelProfile; uniform float uPineCreekTime;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 p = vBakedWorld.xz;
        float mid = 1. - abs(vPineRunnelProfile.y * 2. - 1.);
        float t = uPineCreekTime;
        float longWave = dot(p, vec2(10.3, 44.2)) - t * 18.4 + sin(p.x * 19.4 + p.y * 3.) * 1.2;
        float brokenWave = dot(p, vec2(-39.4, 61.3)) - t * 24.8 + sin(dot(p, vec2(14.2, 7.1))) * 1.5;
        float a = cos(longWave) * (1. - smoothstep(.60, 2.2, fwidth(longWave)));
        float b = cos(brokenWave) * (1. - smoothstep(.50, 2.0, fwidth(brokenWave)));
        vec3 ripple = vec3(.008*a - .030*b, 0., .043*a + .030*b) * mix(.48, 1., mid);
        normal = normalize(normal + mat3(viewMatrix) * ripple);`)
      .replace('#include <opaque_fragment>', `
        // A dielectric reflects mostly at grazing angles. Away from that
        // angle, Beer-Lambert absorption depends on the submerged ray length.
        float viewCos = clamp(dot(geometryViewDir, geometryNormal), .03, 1.);
        float reflectance = .0204 + .9796 * pow(1. - viewCos, 5.);
        float depth = vPineRunnelProfile.x * .08;
        float body = (1. - reflectance) * (1. - exp(-4.0 * depth / max(.35, viewCos)));
        vec3 reflection = totalSpecular;
        #if defined(USE_ENVMAP)
          reflection = getIBLRadiance(geometryViewDir, geometryNormal, material.roughness);
        #endif
        diffuseColor.a = reflectance + body;
        outgoingLight = (reflection * reflectance + totalDiffuse * body) / max(.02, diffuseColor.a);
        #include <opaque_fragment>`);
  };
}

function installLegacyRunnel(material, phase) {
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

export function animatePineCreek(group) {
  const phase = { value: 0 };
  const surfaces = new Set();
  group.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.name === clearRunnelName || material?.name === oldRunnelName) surfaces.add(material);
    }
  });
  for (const material of surfaces) {
    if (material.name === clearRunnelName) installClearRunnel(material, phase);
    else installLegacyRunnel(material, phase);
  }
  return (_dt, time) => { phase.value = time; };
}
