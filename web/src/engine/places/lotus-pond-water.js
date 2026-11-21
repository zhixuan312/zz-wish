const rippleDelay = 1.25;
const rippleDuration = 2.85;

const surfaceSample = /* glsl */`
  vec2 delta = vLotusWaterXZ - uLotusRippleCenter;
  float radius = length(delta);
  float pocket = 1. - smoothstep(1.1, 2.45, radius);
  float crossWave = sin(delta.x * 19. + delta.y * 25. + sin(delta.y * 13.) + uWaterTime * 1.45);
  float longWave = sin(delta.x * 33. - delta.y * 17. + crossWave * .8 - uWaterTime * 1.1);
  q.xy += vec2(crossWave, longWave) * .00062 * pocket * q.w;
  vec4 base = texture2DProj(tDiffuse,q);
  // The sheltered water picks up small patches of sky on its moving surface.
  float fleck = smoothstep(.16, .93, (.57 * crossWave + .43 * longWave));
  base.rgb += vec3(.010, .017, .018) * fleck * pocket;

  float age = uLotusRippleAge;
  if (age >= 0.) {
    float fromCrest = radius - age * .54;
    float life = smoothstep(.01, .18, age) * (1. - smoothstep(2.04, 2.85, age));
    float crest = (1. - smoothstep(.028, .100, abs(fromCrest))) * life;
    vec2 screenRadial = normalize(vec2(dFdx(radius), dFdy(radius)) + vec2(.000001, 0.));
    vec2 screenTangent = vec2(-screenRadial.y, screenRadial.x);
    vec2 offset = (screenRadial * 6.5 + screenTangent * 3.5) * uLotusWaterPixel * q.w;
    // Opposite slopes of the moving crest show two directions into the same reflection.
    vec3 front = texture2DProj(tDiffuse, q + vec4(offset, 0., 0.)).rgb;
    vec3 back = texture2DProj(tDiffuse, q - vec4(offset, 0., 0.)).rgb;
    base.rgb = mix(base.rgb, .54 * front + .46 * back, crest);
    float lip = 1. - smoothstep(.008, .025, abs(fromCrest - .023));
    base.rgb += vec3(.025, .034, .038) * lip * life;
  }
`;

export function configureLotusWater(THREE, pond) {
  const { material } = pond;
  const varying = 'varying vec4 vUv;';
  const sample = 'vec4 base=texture2DProj(tDiffuse,q);';
  const vertex = 'vUv = textureMatrix * vec4( position, 1.0 );';
  if (!material.vertexShader.includes(vertex) || !material.fragmentShader.includes(sample)) {
    throw new Error('Lotus water requires the planar reflector shader.');
  }
  const age = { value: -1 };
  const pixel = new THREE.Vector2();
  Object.assign(material.uniforms, {
    uLotusRippleAge: age,
    uLotusRippleCenter: { value: new THREE.Vector2(-3.42, 7.94) },
    uLotusWaterPixel: { value: pixel },
  });
  material.vertexShader = material.vertexShader
    .replace(varying, varying + '\nvarying vec2 vLotusWaterXZ;')
    .replace(vertex, vertex + '\nvLotusWaterXZ = (modelMatrix * vec4(position, 1.)).xz;');
  material.fragmentShader = material.fragmentShader
    .replace(varying, varying + `
      varying vec2 vLotusWaterXZ;
      uniform float uLotusRippleAge;
      uniform vec2 uLotusRippleCenter, uLotusWaterPixel;
    `)
    .replace(sample, surfaceSample);
  material.needsUpdate = true;

  let start = Infinity;
  let stillBurning;
  return {
    start(time, isBurning) {
      start = time + rippleDelay;
      stillBurning = isBurning;
    },
    step(time) {
      pixel.set(1 / Math.max(1, globalThis.innerWidth ?? 1), 1 / Math.max(1, globalThis.innerHeight ?? 1));
      const elapsed = time - start;
      if (stillBurning && (elapsed >= rippleDuration || !stillBurning())) stillBurning = undefined;
      age.value = stillBurning && elapsed >= 0 ? elapsed : -1;
    },
  };
}
