const clearRunnelName = 'Clear spring runnel';
const gravelRunnelName = 'Clear spring runnel over a gravel bed';
const shallowRunnelName = 'Shallow spring runnel over washed gravel';
const wetGravelName = 'Water-darkened spring gravel';
const wetGraniteName = 'Water-darkened spring granite';
const submergedGraniteName = 'Refracted spring granite';
const oldRunnelName = 'Spring water on a slate bed';

const flowPhase = `
  float pineFlowPhase(vec2 position, float time) {
    return 8.7 * (position.y - time * .29) + 2.3 * sin(9.9 * position.x + 1.1 * position.y)
      + .83 * sin(2.7 * position.y - 3.1 * position.x);
  }
`;

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

function installShallowRunnel(material, phase) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 1;
  material.envMapIntensity = .48;
  material.customProgramCacheKey = () => key + '-clear-shallow-pine-runnel';
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uPineCreekTime = phase;
    shader.vertexShader = 'varying vec2 vPineRunnelProfile;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPineRunnelProfile = uv;');
    shader.fragmentShader = 'varying vec2 vPineRunnelProfile; uniform float uPineCreekTime;\n' + flowPhase + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 creek = vBakedWorld.xz;
        float waterDepth = (vPineRunnelProfile.x - .5) * .16;
        float across = 1. - abs(vPineRunnelProfile.y * 2. - 1.);
        // Advection follows the surveyed downhill direction (+Z). Long
        // uneven waves survive in the distant run; short ripples do not alias.
        float drift = creek.y - uPineCreekTime * .29;
        float runPhase = pineFlowPhase(creek, uPineCreekTime);
        float rivuletPhase = 22.4 * (creek.y - uPineCreekTime * .43) + 4.8 * creek.x
          + 1.3 * sin(20.4 * creek.x - 2.8 * creek.y);
        float run = cos(runPhase) * (1. - smoothstep(.6, 2.1, fwidth(runPhase)));
        float rivulet = cos(rivuletPhase) * (1. - smoothstep(.5, 1.8, fwidth(rivuletPhase)));
        float riffle = .5 + .5 * sin(drift * 3.6 + 7.1 * creek.x + sin(13.3 * creek.x - 2.2 * creek.y));
        float flowStrength = mix(.28, 1., smoothstep(.15, .86, across)) * mix(.60, 1., riffle);
        vec3 ripple = vec3(-.031 * run + .018 * rivulet, 0., .080 * run + .038 * rivulet) * flowStrength;
        normal = normalize(normal + mat3(viewMatrix) * ripple);`)
      .replace('#include <opaque_fragment>', `
        float waterEdge = smoothstep(-.001, .008, waterDepth);
        float pool = smoothstep(.008, .050, waterDepth);
        float viewCos = clamp(dot(geometryViewDir, normal), .04, 1.);
        // The unresolved wave slopes contribute at grazing angles. Through
        // the broken reflection, the separate scanned bed remains visible.
        float meanCos = viewCos + (1. - viewCos) * mix(.31, .21, pool);
        float fresnel = .0204 + .9796 * pow(1. - meanCos, 5.);
        // A shallow ray bends towards the normal inside water (n = 1.333).
        // Use that underwater path length for the weak in-water attenuation.
        vec3 transmitted = refract(-geometryViewDir, normal, .7502);
        float waterCos = max(.64, -dot(transmitted, normal));
        float absorption = 1. - exp(-.58 * max(0., waterDepth) / waterCos);
        float body = (1. - fresnel) * absorption;
        vec3 reflection = totalSpecular;
        #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
          reflection = radiance;
          #if defined(RE_IndirectDiffuse) && defined(USE_LIGHTMAP)
            float skyExposure = dot(irradiance, vec3(.2126, .7152, .0722));
            reflection *= mix(.27, .58, smoothstep(.3, 4.2, skyExposure));
          #endif
        #endif
        // The banks keep most of the shallow run in shade. Short crests in
        // the current pick up openings in the canopy as they pass the bars.
        float crest = pow(max(0., .76 * run + .24 * rivulet), 8.);
        float glint = crest * smoothstep(.41, .84, riffle) * smoothstep(.12, .67, across);
        reflection *= .34 + .86 * glint;
        float waterOpacity = fresnel + body;
        diffuseColor.a = waterEdge * waterOpacity;
        outgoingLight = (reflection * fresnel + totalDiffuse * body) / max(.0204, waterOpacity);
        #include <opaque_fragment>`);
  };
}

function installWetGravel(material, phase) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const submerged = material.name === submergedGraniteName;
  material.envMapIntensity = .26;
  material.customProgramCacheKey = () => key + (submerged ? '-submerged-pine-granite' : '-wet-pine-gravel');
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(.25, .56, roughnessFactor);');
    if (submerged) {
      shader.uniforms.uPineCreekTime = phase;
      shader.vertexShader = 'uniform float uPineCreekTime;\n' + flowPhase + shader.vertexShader
        .replace('#include <project_vertex>', `#include <project_vertex>
          // Shift the apparent bed only. The wet bank and the measured
          // waterline remain fixed. Keep the lift within the bed clearance.
          vec3 creekBed = (modelMatrix * vec4(transformed, 1.)).xyz;
          float crestSlope = cos(pineFlowPhase(creekBed.xz, uPineCreekTime));
          vec3 surfaceNormal = normalize(vec3(-.035 * crestSlope, 1., .085 * crestSlope));
          vec3 incident = normalize(creekBed - cameraPosition);
          vec3 transmitted = refract(incident, surfaceNormal, .7502);
          float airCos = max(.0, -dot(incident, surfaceNormal));
          float waterCos = max(.64, -dot(transmitted, surfaceNormal));
          float lift = .0024 * (1. - .7502 * airCos / waterCos);
          vec3 apparentShift = vec3(surfaceNormal.x * .009, lift, surfaceNormal.z * .009);
          mvPosition.xyz += mat3(viewMatrix) * apparentShift;
          gl_Position = projectionMatrix * mvPosition;`);
    }
  };
}

export function animatePineCreek(group) {
  const phase = { value: 0 };
  const surfaces = new Set();
  group.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if ([clearRunnelName, gravelRunnelName, shallowRunnelName, wetGravelName, wetGraniteName, submergedGraniteName,
        oldRunnelName].includes(material?.name)) surfaces.add(material);
    }
  });
  for (const material of surfaces) {
    if (material.name === oldRunnelName) installLegacyRunnel(material, phase);
    else if (material.name === shallowRunnelName) installShallowRunnel(material, phase);
    else if ([wetGravelName, wetGraniteName, submergedGraniteName].includes(material.name)) installWetGravel(material, phase);
    else installClearRunnel(material, phase);
  }
  return (_dt, time) => { phase.value = time; };
}
