const vertex = `
  uniform float uTime, uPointScale;
  attribute vec3 aPuff;
  varying float vAlpha, vCurl;
  void main() {
    float slot = uTime + aPuff.x;
    float age = mod(slot, 1.8) + aPuff.y;
    float emitted = uTime - age;
    float length = 1.68 + .21 * sin(.59 * emitted);
    float gust = .19 * sin(1.38 * emitted);
    float air = age * age;
    // Hot air first clears the two neighbouring roof slopes, then settles
    // into the crosswind as the plume widens and cools.
    vec3 drift = vec3(-.43 * air + .15 * air * sin(aPuff.z + age),
      1.34 * age - .24 * air, -.23 * air + gust * air);
    vec4 view = modelViewMatrix * vec4(position + drift, 1.);
    gl_Position = projectionMatrix * view;
    float metres = .138 + .386 * age;
    gl_PointSize = uPointScale * projectionMatrix[1][1] * metres / max(1., -view.z);
    // Neighbouring particles inherit the same stove pulse when they leave the
    // flue. The youngest ones still form a narrow trace between the puffs.
    float pressure = .17 + .83 * smoothstep(-.34, .79, sin(1.94 * emitted + .28 * sin(.53 * emitted)));
    float outlet = .61 * (1. - smoothstep(.13, .49, age));
    vAlpha = smoothstep(0., .038, age) * (1. - smoothstep(.53, length, age))
      * max(pressure, outlet);
    vCurl = aPuff.z + age;
  }`;

const fragment = `
  uniform vec3 uTint;
  uniform float uOpacity;
  varying float vAlpha, vCurl;
  void main() {
    vec2 p = gl_PointCoord * 2. - 1.;
    float edge = length(vec2(p.x + .13 * sin(vCurl + p.y * 4.), p.y));
    float plume = exp(-2.6 * edge * edge) * (1. - smoothstep(.67, 1., edge));
    gl_FragColor = vec4(uTint, uOpacity * vAlpha * plume);
  }`;

export function buildSnowChimney({ THREE, renderer, group }, origin) {
  const count = 36;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const puff = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    puff.set([i / count * 1.8, .035 * (i % 3), i * 2.39996], i * 3);
  }
  geometry.setAttribute('aPuff', new THREE.BufferAttribute(puff, 3));
  const uniforms = {
    uTime: { value: 0 },
    uPointScale: { value: 0 },
    uTint: { value: new THREE.Color() },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment,
    uniforms, transparent: true, depthWrite: false, toneMapped: false });
  const smoke = new THREE.Points(geometry, material);
  smoke.name = 'Intermittent leeward smoke from the open kitchen flue';
  smoke.position.fromArray(origin);
  smoke.frustumCulled = false;
  group.add(smoke);
  const day = new THREE.Color('#d8dfdf').multiplyScalar(1.94);
  const night = new THREE.Color('#99a6b4').multiplyScalar(1.38);
  const dawn = new THREE.Color('#ffeddc').multiplyScalar(1.87);
  return {
    update(_dt, seconds, light) {
      uniforms.uTime.value = seconds;
      uniforms.uPointScale.value = renderer.domElement.height * .5;
      const morning = light.dawn ? light.g : 0;
      uniforms.uTint.value.copy(day).lerp(night, light.n).lerp(dawn, morning);
      uniforms.uOpacity.value = .65 - .16 * light.n + .31 * morning;
    },
    dispose() {
      smoke.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
