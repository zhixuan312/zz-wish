export function addSnowCourtGauzeTransmission(shader, ribs, aged) {
  shader.vertexShader = 'varying vec2 vSnowGauze;\n' + shader.vertexShader.replace('#include <uv_vertex>',
    '#include <uv_vertex>\nvSnowGauze = uv;');
  shader.fragmentShader = `varying vec2 vSnowGauze;
    float snowGauzeBamboo() {
      float h = vSnowGauze.y;
      float verticalDistance = abs(fract(vSnowGauze.x * ${ribs.toFixed(1)} + .5) - .5);
      float rib = 1. - smoothstep(.021, .087 + fwidth(vSnowGauze.x) * ${ribs.toFixed(1)}, verticalDistance);
      return rib * smoothstep(0., .09, h) * smoothstep(0., .09, 1. - h);
    }
    \n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float gauzeBamboo = snowGauzeBamboo();
      diffuseColor.rgb *= 1. - ${aged ? '.30' : '.065'} * gauzeBamboo;
      diffuseColor.a *= 1. - ${aged ? '.045' : '.055'} * sin(3.141593 * vSnowGauze.y);
    `);
}

const earlierGauze = new Map([
  ['Sun-faded rose-red gauze', .77],
  ['Faded dusty rose gauze', .79],
  ['Faded iron-red gauze', .81],
  ['Thin gauze over low flame', .78],
]);

export function isEarlierGauze(material) {
  return earlierGauze.has(material.name);
}

export function tuneEarlierGauze(material, sources, THREE, preExposure, fabric) {
  // Blend the rear layer before the front. The existing open throat, tears
  // and actual inward bamboo remain visible between those two surfaces.
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.forceSinglePass = false;
  material.opacity = earlierGauze.get(material.name);
  material.map = fabric.weave;
  material.normalMap = fabric.normal;
  material.normalScale.setScalar(.68);
  material.roughness = .96;
  material.roughnessMap = fabric.roughness;
  material.envMapIntensity = 0;

  const lit = material.name === 'Thin gauze over low flame';
  if (lit) material.emissiveIntensity = 0;
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  const wicks = sources.map(source => new THREE.Vector3(...source.wickTip));
  const candela = sources.map(source => new THREE.Color().fromArray(source.linearColor)
    .multiplyScalar(source.watts * preExposure / (4 * Math.PI)));
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    addSnowCourtGauzeTransmission(shader, 8, true);
    shader.uniforms.uOldWeaveMean = { value: fabric.mean };
    shader.fragmentShader = `uniform float uOldWeaveMean;
      const vec3 OLD_GAUZE_LUMA = vec3(.2126, .7152, .0722);
      vec2 oldGauzeFabricScale() { return vec2(2.1, 1.13); }
      \n` + shader.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 weave = texture2D(map, vMapUv * oldGauzeFabricScale()).rgb;
        float thread = dot(weave, OLD_GAUZE_LUMA) / uOldWeaveMean;
        diffuseColor.rgb *= clamp(1. + (thread - 1.) * 2.1, .52, 1.39);
      `)
      .replace('#include <alphamap_fragment>', `
        #include <alphamap_fragment>
        // Keep the smooth low folds and the grain independent of the staves.
        // Filament coverage varies softly across a fold, including in backlight.
        float around = 6.2831853 * vSnowGauze.x;
        float height = vSnowGauze.y;
        float crease = sin(around * 19. + 2.8 * height + sin(around * 7. - height * 8.))
          + .55 * sin(around * 29. - height * 6. + .55 * sin(height * 12.));
        float readCreases = 1. - smoothstep(.9, 2.2, fwidth(around * 29.));
        float thinFold = crease * sin(3.141593 * height) * readCreases;
        diffuseColor.rgb *= vec3(.92, .75, .74) * (1. + .105 * thinFold);
        diffuseColor.a = clamp(diffuseColor.a - .019 * thinFold
          + .09 * gauzeBamboo + .035 * (clamp(thread, .35, 1.65) - 1.), .70, .95);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = max(roughnessFactor, .93);
      `)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps
        .replaceAll('normalMap, vNormalMapUv )', 'normalMap, vNormalMapUv * oldGauzeFabricScale() )'))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular = vec3(0.);
        reflectedLight.indirectSpecular = vec3(0.);
        reflectedLight.directDiffuse *= .38;
        reflectedLight.indirectDiffuse *= .51;
        // Translucent yarn scatters the broad paper-window bounce across
        // nearby fibres. It should not repeat the opaque sleeve's bright band.
        float incident = dot(reflectedLight.indirectDiffuse, OLD_GAUZE_LUMA);
        reflectedLight.indirectDiffuse /= 1. + 2.8 * max(incident - .095, 0.);
      `);
    if (!lit) return;
    shader.uniforms.uEarlierWick = { value: wicks };
    shader.uniforms.uEarlierCandela = { value: candela };
    shader.fragmentShader = `uniform vec3 uEarlierWick[2], uEarlierCandela[2];\n` + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        for (int j = 0; j < 2; j++) {
          vec3 fromWick = vBakedWorld - uEarlierWick[j];
          float distance2 = dot(fromWick, fromWick);
          // The little flame varies the warm centre of its own lantern only.
          float thinCloth = .52 * (1. - smoothstep(.24, .34, sqrt(distance2)));
          vec3 throughThreads = pow(max(diffuseColor.rgb, vec3(0.)), vec3(.64));
          totalEmissiveRadiance += uEarlierCandela[j] * throughThreads
            * thinCloth * (1. - gauzeBamboo * .47) / (3.141593 * max(distance2, .007));
        }`);
  };
  material.customProgramCacheKey = () => key() + (lit ? '-snow-faded-gauze-wick-2' : '-snow-faded-gauze-2');
  material.needsUpdate = true;
}
