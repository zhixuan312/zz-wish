import { FrontSide } from 'three';

const graniteName = 'Wet carved granite of the spring basin';
const waterName = 'Clear water in the granite spring basin';
const jetName = 'Running spring water below the bamboo spout';
const bambooName = 'Weathered hollow bamboo spring spout';

function decorate(material, update) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + '-' + material.name;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    update(shader);
  };
}

function blendWater(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 1;
  material.envMapIntensity = .72;
}

function installBasinWater(material, phase) {
  const impact = material.userData.pine_spring_impact;
  const depth = material.userData.pine_spring_depth;
  blendWater(material);
  material.side = FrontSide;
  decorate(material, shader => {
    shader.uniforms.uPineSpringTime = phase;
    shader.uniforms.uPineSpringImpact = { value: [impact[0], impact[2]] };
    shader.uniforms.uPineSpringDepth = { value: depth };
    shader.vertexShader = 'varying float vPineSpringEdge;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPineSpringEdge = uv.x;');
    shader.fragmentShader = `
      varying float vPineSpringEdge;
      uniform vec2 uPineSpringImpact;
      uniform float uPineSpringTime, uPineSpringDepth;
      ` + shader.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 fromImpact = vBakedWorld.xz - uPineSpringImpact;
        float distanceFromImpact = max(.002, length(fromImpact));
        float wave = 51. * distanceFromImpact - 16. * uPineSpringTime;
        float interference = 86. * distanceFromImpact - 23. * uPineSpringTime + dot(fromImpact, vec2(9., -6.));
        float first = cos(wave) * (1. - smoothstep(.6, 2.3, fwidth(wave)));
        float second = cos(interference) * (1. - smoothstep(.55, 2.2, fwidth(interference)));
        float decay = smoothstep(.003, .023, distanceFromImpact)
          * exp(-5.8 * distanceFromImpact) * vPineSpringEdge;
        vec2 slope = (first * .124 + second * .049) * decay * fromImpact / distanceFromImpact;
        normal = normalize(normal - mat3(viewMatrix) * vec3(slope.x, 0., slope.y));`)
      .replace('#include <opaque_fragment>', `
        // A mostly transmitted view of the baked stone bottom and a moving
        // reflection of the sky. Refraction controls the in-water ray length.
        float facing = clamp(dot(geometryViewDir, normal), 0., 1.);
        float fresnel = .0204 + .9796 * pow(1. - facing, 5.);
        // Unresolved slopes in the falling stream briefly turn additional
        // wave crests toward the sky. Keep the quiet water mostly clear.
        float brightCrest = pow(max(0., first), 4.) * decay;
        float reflectionWeight = mix(fresnel, 1., brightCrest * .128);
        vec3 transmitted = refract(-geometryViewDir, normal, .7502);
        float pathLength = uPineSpringDepth / max(.65, -dot(transmitted, normal));
        float absorption = (1. - reflectionWeight) * (1. - exp(-.59 * pathLength));
        vec3 reflection = totalSpecular;
        #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
          reflection = radiance;
          #if defined(RE_IndirectDiffuse) && defined(USE_LIGHTMAP)
            float exposure = dot(irradiance, vec3(.2126, .7152, .0722));
            reflection *= mix(.60, .89, smoothstep(.22, 3.6, exposure));
          #endif
        #endif
        float opacity = reflectionWeight + absorption;
        diffuseColor.a = vPineSpringEdge * opacity;
        outgoingLight = (reflection * reflectionWeight + totalDiffuse * .29 * absorption) / max(.0204, opacity);
        #include <opaque_fragment>`);
  });
}

function installJet(material, phase) {
  blendWater(material);
  decorate(material, shader => {
    shader.uniforms.uPineSpringTime = phase;
    shader.fragmentShader = 'uniform float uPineSpringTime;\n' + shader.fragmentShader
      .replace('#include <opaque_fragment>', `
        float rim = pow(1. - clamp(dot(geometryViewDir, normal), 0., 1.), 3.);
        float current = 65. * vBakedWorld.y + 32. * uPineSpringTime;
        float tone = .87 + .13 * sin(current) * (1. - smoothstep(.55, 2.2, fwidth(current)));
        vec3 reflection = totalSpecular;
        #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
          reflection = radiance * .70;
        #endif
        diffuseColor.a = mix(.26, .68, rim) * tone;
        outgoingLight = mix(totalDiffuse * .53, reflection, .12 + .68 * rim);
        #include <opaque_fragment>`);
  });
}

function installBasinStone(material) {
  decorate(material, shader => {
    shader.uniforms.uPineSpringWaterline = { value: material.userData.pine_spring_waterline };
    shader.fragmentShader = 'uniform vec3 uPineSpringWaterline;\n' + shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec3 basin = vBakedWorld - uPineSpringWaterline;
        float stain = basin.y + .004 * sin(47. * basin.x + 62. * basin.z)
          + .003 * sin(96. * basin.x - 28. * basin.z);
        float wet = (1. - smoothstep(.327, .370, length(basin.xz)))
          * (1. - smoothstep(.002, .037, stain));
        diffuseColor.rgb *= mix(vec3(1.), vec3(.64, .68, .63), wet);
        roughnessFactor = mix(roughnessFactor, .25 + .17 * roughnessFactor, wet * .80);`);
  });
}

function installBamboo(material) {
  decorate(material, shader => {
    shader.uniforms.uPineSpringBambooLip = { value: material.userData.pine_spring_bamboo_lip };
    shader.uniforms.uPineSpringBambooInner = { value: material.userData.pine_spring_bamboo_inner };
    shader.vertexShader = 'varying vec2 vPineSpringBamboo;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPineSpringBamboo = vec2(uv.x, 1. - uv.y);');
    shader.fragmentShader = `
      varying vec2 vPineSpringBamboo;
      uniform float uPineSpringBambooLip, uPineSpringBambooInner;
      ` + shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float around = vPineSpringBamboo.x * 6.2831853;
        float axial = vPineSpringBamboo.y;
        float grain = 29. * around + .64 * sin(13. * around) + .33 * sin(21. * axial);
        float fibres = cos(grain) * (1. - smoothstep(.7, 2.3, fwidth(grain)));
        float fade = .5 + .5 * cos(3. * around + .68 * sin(16. * axial));
        vec3 skin = mix(vec3(.54, .65, .45), vec3(1.06, .92, .69), fade);
        float cut = smoothstep(uPineSpringBambooLip - .001, uPineSpringBambooLip + .002, axial);
        float hollow = smoothstep(uPineSpringBambooInner - .001, uPineSpringBambooInner + .009, axial);
        vec3 patina = mix(skin, vec3(1.21, 1.04, .76), cut);
        patina = mix(patina, vec3(.23, .20, .135), hollow);
        diffuseColor.rgb *= patina * (.93 + .085 * fibres);
        roughnessFactor = mix(roughnessFactor, .43, hollow);`);
  });
}

export function animatePineSpringBasin(gate) {
  const phase = { value: 0 };
  const materials = new Set();
  gate.traverse(object => {
    if (object.isMesh) for (const material of [object.material].flat()) materials.add(material);
  });
  let hasMovingWater = false;
  for (const material of materials) {
    if (material.name === graniteName) installBasinStone(material);
    if (material.name === bambooName) installBamboo(material);
    if (material.name === waterName) {
      installBasinWater(material, phase);
      hasMovingWater = true;
    }
    if (material.name === jetName) {
      installJet(material, phase);
      hasMovingWater = true;
    }
  }
  return hasMovingWater ? (_dt, time) => { phase.value = time; } : null;
}
