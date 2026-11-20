const vertex = `
  uniform float uTime, uPointScale;
  attribute vec3 aPuff;
  varying float vAlpha, vCurl;
  void main() {
    float slot = uTime + aPuff.x;
    float pulse = floor(slot / 1.8);
    float age = mod(slot, 1.8) + aPuff.y;
    float length = 1.65 + .67 * sin(.58 * uTime);
    float gust = sin(pulse * 1.76) * .21;
    float air = age * age;
    vec3 drift = vec3(-.51 * air + .17 * age * sin(aPuff.z + age),
      .97 * age - .12 * air, -.28 * air + gust * age);
    vec4 view = modelViewMatrix * vec4(position + drift, 1.);
    gl_Position = projectionMatrix * view;
    float metres = .124 + .294 * age;
    gl_PointSize = uPointScale * projectionMatrix[1][1] * metres / max(1., -view.z);
    vAlpha = smoothstep(0., .1, age) * (1. - smoothstep(.36, length, age));
    // A light residual trail outlives the stronger short stove puffs.
    vAlpha *= .19 + .81 * smoothstep(-.22, .8, sin(pulse * 1.95 + .5 * aPuff.z));
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
  return {
    update(_dt, seconds, light) {
      uniforms.uTime.value = seconds;
      uniforms.uPointScale.value = renderer.domElement.height * .5;
      uniforms.uTint.value.copy(day).lerp(night, light.n);
      uniforms.uOpacity.value = .57 - .18 * light.n;
    },
    dispose() {
      smoke.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
