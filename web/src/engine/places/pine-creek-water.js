const clearRunnelName = 'Clear spring runnel';
const gravelRunnelName = 'Clear spring runnel over a gravel bed';
const oldRunnelName = 'Spring water on a slate bed';

function installClearRunnel(material, phase) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const signedDepth = material.name === gravelRunnelName;
  // Blend over the opaque, independently lit gravel and bank stones. The
  // water occupies its own transparent pass and never replaces their depth.
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 1;
  material.envMapIntensity = .52;
  material.customProgramCacheKey = () => key + (signedDepth ? '-gravel-pine-runnel' : '-clear-pine-runnel');
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
        float viewCos = clamp(dot(geometryViewDir, ${signedDepth ? 'nonPerturbedNormal' : 'geometryNormal'}), .03, 1.);
        float reflectance = .0204 + .9796 * pow(1. - viewCos, 5.);
        float depth = ${signedDepth ? '(vPineRunnelProfile.x - .5) * .16' : 'vPineRunnelProfile.x * .08'};
        float coverage = ${signedDepth ? 'smoothstep(-.001, .009, depth)' : '1.'};
        float body = (1. - reflectance) * (1. - exp(-${signedDepth ? '3.0' : '4.0'} * max(0., depth) / max(.35, viewCos)));
        vec3 reflection = totalSpecular;
        #if defined(USE_ENVMAP)
          reflection = getIBLRadiance(geometryViewDir, normal, material.roughness);
          ${signedDepth ? `
          #if defined(RE_IndirectDiffuse) && defined(USE_LIGHTMAP)
            // The distant sky probe has no local canopy. Use the baked
            // irradiance as a proxy for sky occlusion in the narrow ravine.
            float skyExposure = dot(irradiance, vec3(.2126, .7152, .0722));
            reflection *= mix(.36, .91, smoothstep(.28, 4.2, skyExposure));
          #endif` : ''}
        #endif
        float waterOpacity = reflectance + body;
        diffuseColor.a = coverage * waterOpacity;
        outgoingLight = (reflection * reflectance + totalDiffuse * body) / max(.02, waterOpacity);
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
      if ([clearRunnelName, gravelRunnelName, oldRunnelName].includes(material?.name)) surfaces.add(material);
    }
  });
  for (const material of surfaces) {
    if (material.name === oldRunnelName) installLegacyRunnel(material, phase);
    else installClearRunnel(material, phase);
  }
  return (_dt, time) => { phase.value = time; };
}
