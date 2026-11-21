export const HIGH_WHITE_PLASTER_UV_SCALE = .57;

export function mapHighWhitePlasterUV(geometry, [x, y, z]) {
  const { position, normal, uv } = geometry.attributes;
  const scale = HIGH_WHITE_PLASTER_UV_SCALE;
  for (let i = 0; i < position.count; i++) {
    const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i)), az = Math.abs(normal.getZ(i));
    const worldX = position.getX(i) + x, worldY = position.getY(i) + y, worldZ = position.getZ(i) + z;
    if (ay > Math.max(ax, az)) uv.setXY(i, worldX * scale, worldZ * scale);
    else if (ax > az) uv.setXY(i, worldZ * scale, worldY * scale);
    else uv.setXY(i, worldX * scale, worldY * scale);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function whitewash(THREE, scan, color, wear = 1) {
  const material = new THREE.MeshStandardMaterial({
    color, map: scan.map, normalMap: scan.normalMap,
    normalScale: new THREE.Vector2(.42, .42), roughness: .92,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uHighWhiteWear = { value: wear };
    shader.vertexShader = `varying vec3 vLimePosition, vLimeNormal;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>', `#include <begin_vertex>
      vLimePosition = (modelMatrix * vec4(position, 1.0)).xyz;
      vLimeNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = `varying vec3 vLimePosition, vLimeNormal;
      uniform float uHighWhiteWear;
      float limeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float limeCloud(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(limeHash(i), limeHash(i + vec2(1, 0)), f.x),
          mix(limeHash(i + vec2(0, 1)), limeHash(i + 1.0), f.x), f.y);
      }
      ${shader.fragmentShader}`.replace('#include <map_fragment>', `
      vec3 a = abs(vLimeNormal);
      vec2 face = a.y > max(a.x, a.z) ? vLimePosition.xz
        : a.x > a.z ? vLimePosition.zy : vLimePosition.xy;
      vec2 limeUV = face * ${HIGH_WHITE_PLASTER_UV_SCALE.toFixed(2)};
      vec3 stone = texture2D(map, limeUV).rgb;
      float age = limeCloud(face * 1.1) * .69 + limeCloud(face * 4.9) * .31;
      float eroded = (1.0 - smoothstep(.10, .42 + age * .26, vLimePosition.y)) * (.25 + .75 * age);
      diffuseColor.rgb *= mix(vec3(.98, .97, .95), stone, .17 + .31 * eroded * uHighWhiteWear);
      diffuseColor.rgb *= mix(vec3(.96), vec3(1.015), age);
      `).replace('#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv', 'limeUV'));
  };
  material.customProgramCacheKey = () => 'highland-whitewash';
  return material;
}

// The opaque walls remain in the scene; these are the brighter parts of the
// near reflection field. Keep the center of the glass mostly transparent.
function chimneyReflection(material, daylight) {
  material.envMap = null;
  material.roughness = .09;
  material.onBeforeCompile = shader => {
    shader.uniforms.uHighWhiteDay = daylight;
    shader.fragmentShader = `uniform float uHighWhiteDay;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
      vec3 toEye = normalize(vViewPosition);
      vec3 reflected = inverseTransformDirection(reflect(-toEye, normal), viewMatrix);
      float grazing = pow(1.0 - abs(dot(normal, toEye)), 2.4);
      float sky = smoothstep(.04, .40, reflected.y) * smoothstep(.04, .49, reflected.z);
      vec3 brightReturn = normalize(vec3(.72, .22, .66));
      float lime = pow(max(dot(brightReturn, reflected), 0.0), 13.0);
      vec3 opening = mix(vec3(.55, .65, .82), vec3(1.7, 1.86, 2.05), uHighWhiteDay);
      vec3 plaster = mix(vec3(.88, .65, .42), vec3(1.65, 1.35, .99), uHighWhiteDay);
      outgoingLight += (opening * sky + plaster * lime * .78) * (.22 + .71 * grazing);
      diffuseColor.a = clamp(.065 + .38 * grazing + .16 * sky + .20 * lime, .06, .76);
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'highland-chimney-reflection';
}

export function fitHighWhiteChimneys(THREE, context) {
  const nook = context.G;
  const treated = new WeakSet();
  const daylight = { value: 1 - context.light.n };
  let knownLamp;
  const bounce = new THREE.PointLight(0xffeacc, .64, 2.35, 2);
  bounce.position.set(.85, 1.52, .91);
  nook.add(bounce);

  function fit(chimney) {
    if (treated.has(chimney)) return;
    treated.add(chimney);
    const material = chimney.material.clone();
    chimneyReflection(material, daylight);
    chimney.material = material;
    const points = chimney.geometry.parameters.points;
    for (const [edge, bead] of [[points[0], .0010], [points.at(-1), .00125]]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(edge.x, bead, 10, 48), material);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = edge.y;
      lip.renderOrder = 4;
      chimney.add(lip);
    }
  }

  const glass = object => object?.children.find(child =>
    child.renderOrder === 3 && child.geometry?.type === 'LatheGeometry' && child.material?.transparent);
  for (const fixture of context.others) {
    const chimney = glass(fixture.p.g);
    if (chimney) fit(chimney);
  }
  context.up.push((_dt, _time, light) => {
    daylight.value = 1 - light.n;
    bounce.intensity = .56 + .22 * daylight.value;
    // The common lamp builder replaces the vessel group when the offer changes.
    // Statically built fixtures have no nested vessel group. The visitor does.
    if (knownLamp?.parent !== nook) knownLamp = nook.children.find(child =>
      child.isGroup && child.children.some(item => item.isGroup && glass(item)));
    for (const child of knownLamp?.children ?? []) {
      const chimney = glass(child);
      if (chimney) fit(chimney);
    }
  });
}
