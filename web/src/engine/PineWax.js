import * as THREE from 'three';
import { waxCutHeight } from '../../../shared/wax.ts';

const TAU = 2 * Math.PI;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);

export function waxContactShadow(radius, opacity) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpacity: { value: opacity } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      void main() {
        float radial = length(vUv * 2. - 1.);
        gl_FragColor = vec4(.013, .008, .005, uOpacity * (1. - smoothstep(.46, 1., radial)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.lampOwned = true;
  const contact = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), material);
  contact.scale.setScalar(radius);
  contact.position.y = .00016;
  return contact;
}

function materialCoordinates(shader) {
  shader.vertexShader = `varying vec3 vPineLocal; varying vec3 vPineWorld;\n${shader.vertexShader}`
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vPineLocal = transformed;
      vPineWorld = (modelMatrix * vec4(transformed, 1.)).xyz;`);
  shader.fragmentShader = `varying vec3 vPineLocal; varying vec3 vPineWorld;\n${shader.fragmentShader}`;
}

const RELIEF_GLSL = `
  vec3 pineRelief(vec3 n, vec3 position, float height) {
    vec3 dx = dFdx(position), dy = dFdy(position);
    vec3 sx = cross(dy, n), sy = cross(n, dx);
    float area = dot(dx, sx);
    vec3 gradient = dFdx(height) * sx + dFdy(height) * sy;
    return normalize(n - sign(area) * gradient / max(abs(area), 1.e-10));
  }
`;

function refinedWaxMaterial(light, layer) {
  const wet = layer === 'pool';
  const shaft = layer === 'body';
  const remnant = layer === 'remnant';
  const style = {
    body: { roughness: .43, clearcoat: .09, specularIntensity: .52, diffuse: .91, scatter: 1.68 },
    pool: { roughness: .13, clearcoat: .42, specularIntensity: .75, diffuse: .34, scatter: .045 },
    remnant: { roughness: .40, clearcoat: .09, specularIntensity: .43, diffuse: .91, scatter: .04 },
  }[layer];
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, ior: 1.43,
    roughness: style.roughness, clearcoat: style.clearcoat, clearcoatRoughness: wet ? .15 : .32,
    specularIntensity: style.specularIntensity, envMapIntensity: wet ? .62 : .42,
    transparent: remnant, depthWrite: !remnant });
  material.onBeforeCompile = shader => {
    materialCoordinates(shader);
    Object.assign(shader.uniforms, light);
    shader.fragmentShader = `
      uniform vec3 uPineSourcePosition, uPineSourceColor, uPineWaxCrown;
      uniform float uPineCandela, uPineSourceRadius, uPinePoolWet, uPineWaxCooling, uPineWaxHeight;
      uniform float uPineWaxTime, uPineWaxWind, uPinePoolRadius;
      ${RELIEF_GLSL}
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 grains = vPineLocal * 720.;
      float grainCoverage = 1. - smoothstep(.12, .65, length(fwidth(grains)));
      float waxGrain = sin(dot(grains, vec3(1.31, .62, .95))) * sin(dot(grains, vec3(-.18, 1.84, .54))) * grainCoverage;
      ${shaft ? `
      // Sparse bubbles caught as the wax was poured. The derivative filter
      // resolves them only where the actual candle occupies enough pixels.
      vec3 bubbleCoords = vPineLocal * 645.;
      vec3 bubbleCell = floor(bubbleCoords);
      float poreSeed = fract(sin(dot(bubbleCell, vec3(92.1, 61.7, 157.3))) * 19471.43);
      vec3 bubbleOffset = .32 + .36 * fract(vec3(17.71, 33.1, 69.8) * poreSeed);
      float bubbleDistance = length(fract(bubbleCoords) - bubbleOffset);
      float bubbleRadius = .14 + .115 * fract(29.51 * poreSeed);
      float bubbleCoverage = (1. - smoothstep(.26, 1.15, length(fwidth(bubbleCoords)))) * step(.67, poreSeed);
      float bubble = (1. - smoothstep(bubbleRadius * .46, bubbleRadius * .92, bubbleDistance)) * bubbleCoverage;
      float poreLip = (1. - smoothstep(bubbleRadius * .70, bubbleRadius * 1.15, bubbleDistance)) * bubbleCoverage - bubble;
      diffuseColor.rgb *= 1. - .085 * bubble + .029 * poreLip;` : ''}
      diffuseColor.rgb *= ${wet ? `mix(${style.diffuse}, .82, uPineWaxCooling)` : style.diffuse} * (1. + .018 * waxGrain);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + .026 * waxGrain ${shaft ? '+ .09 * bubble - .034 * poreLip' : ''}, .1, 1.);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${shaft ? `normal = pineRelief(normal, -vViewPosition, .000034 * waxGrain - .000105 * bubble + .000028 * poreLip);` : ''}
        ${wet ? `
        vec2 poolPoint = vPineLocal.xz;
        float meniscus = smoothstep(.46, .97, length(poolPoint) / max(uPinePoolRadius, .001));
        float ripple = sin(dot(poolPoint, vec2(475., 228.)) + uPineWaxTime * 2.2)
          * cos(dot(poolPoint, vec2(-218., 513.)) - uPineWaxTime * 1.35);
        normal = pineRelief(normal, -vViewPosition, .000049 * ripple * (.27 + .73 * meniscus) * uPinePoolWet);` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 fromCrown = vPineWorld - uPineWaxCrown;
        float depth = max(0., -fromCrown.y);
        float radius = max(.003, uPineSourceRadius);
        vec3 toSource = uPineSourcePosition - vPineWorld;
        float incident = uPineCandela / (dot(toSource, toSource) + radius * radius);
        float sourceFraction = 1. - exp(-incident * .023);
        vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
        vec3 viewRay = normalize(vViewPosition);
        float side = 1. - abs(worldNormal.y);
        // The flame lights the rim from within. Wavelength-dependent absorption
        // leaves the lower wax cooler and keeps the original pigments readable.
        float path = .0012 + depth * .83 + length(fromCrown.xz) * .12;
        vec3 absorption = vec3(49., 88., 155.) - 29. * log(clamp(diffuse, .055, 1.));
        vec3 transmission = exp(-absorption * path);
        float edge = .71 + .29 * pow(1. - abs(dot(normal, viewRay)), 1.45);
        float crownFalloff = ${shaft ? 'exp(-depth * 13.)' : '1. - smoothstep(.006, .046, depth)'};
        float scatter = sourceFraction * edge * (.08 + .92 * side) * ${style.scatter};
        totalEmissiveRadiance += uPineSourceColor * transmission * scatter * crownFalloff ${shaft ? '* (1. + .12 * poreLip - .10 * bubble)' : ''};
        ${wet ? `
        // The glowing wick and flame base are a finite source. Project that
        // source across the curved meniscus so the reflection moves with the
        // view and disappears as the wax cools.
        vec3 viewWorld = inverseTransformDirection(viewRay, viewMatrix);
        vec3 reflected = reflect(-viewWorld, worldNormal);
        float reflectionDistance = (uPineWaxCrown.y - .0039 - vPineWorld.y) / max(.001, reflected.y);
        vec2 flameDrift = vec2(.00062 * sin(uPineWaxTime * 3.17) + .0011 * uPineWaxWind,
          .00049 * sin(uPineWaxTime * 2.09 + .4));
        vec2 reflectedOffset = fromCrown.xz + max(0., reflectionDistance) * reflected.xz - flameDrift;
        float reflectionRadius = length(reflectedOffset * vec2(.67, 1.));
        float flameReflection = (1. - smoothstep(.0008, .0039, reflectionRadius)) * .62
          + (1. - smoothstep(.0002, .00122, reflectionRadius)) * .38;
        flameReflection *= smoothstep(.02, .10, reflected.y) * step(0., reflectionDistance);
        float fresnel = .07 + .93 * pow(1. - max(0., dot(worldNormal, viewWorld)), 4.);
        vec3 reflectionColor = mix(uPineSourceColor, vec3(1., .88, .70), .57);
        totalEmissiveRadiance += reflectionColor * (.29 + fresnel * 2.65) * flameReflection * sourceFraction * uPinePoolWet;` : ''}`);
    if (shaft) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      // The convex dry lip scatters broadly while the concave wet surface
      // retains the sharp reflection. Preserve the dry folds in the light.
      float dryLip = smoothstep(.13, .85, worldNormal.y) * (1. - smoothstep(.006, .019, depth)) * uPinePoolWet;
      reflectedLight.directDiffuse *= mix(1., .22, dryLip);
      reflectedLight.indirectDiffuse *= mix(1., .68, dryLip);
      reflectedLight.directSpecular *= mix(1., .50, dryLip);
      // Diffuse return from the shelf and opening keeps the wax pigment
      // readable below the transmitted amber without following the camera.
      float shaftHeight = clamp(vPineLocal.y / max(uPineWaxHeight, .001), 0., 1.);
      float fromBase = 1. - shaftHeight;
      float flameBounce = (1. - exp(-uPineCandela * 12.)) * uPinePoolWet;
      float reliefLight = .78 + .22 * dot(worldNormal, normalize(vec3(.34, .27, 1.)));
      vec3 litReturn = vec3(1.045, 1., .931) * flameBounce * (.049 + .235 * fromBase);
      float cooledBody = 1. - smoothstep(.40, .89, shaftHeight);
      vec3 cooledReturn = vec3(.96, 1., 1.04) * uPineWaxCooling * (.097 + .023 * cooledBody);
      reflectedLight.indirectDiffuse += diffuseColor.rgb * (litReturn + cooledReturn) * reliefLight;`);
    if (wet) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      // The solidified pool reflects the selected pigment as diffuse wax.
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(.96, 1., 1.04) * .091 * uPineWaxCooling;`);
    if (remnant) {
      shader.fragmentShader = `
        uniform vec3 uPineTraceSection;
        uniform float uPineTraceRadius, uPineTraceThickness;
        ${shader.fragmentShader}`;
      // Light passes through the thin edge of the cooled spill and exposes
      // some of the stone under it. Full-thickness wax keeps its pigment.
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        float waxThickness = vPineLocal.y * uPineTraceThickness;
        diffuseColor.a *= smoothstep(.000025, .00038, waxThickness);`);
      const pointInfo = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
      const pointLighting = THREE.ShaderChunk.lights_fragment_begin.replace(pointInfo, `${pointInfo}
        directLight.color *= mix(1., traceVisibility, 1. - smoothstep(.001, .003, length(pointLight.position - traceWickInView)));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `
        // Transmit the visitor's finite wick light only along rays that miss
        // the remaining wax. One profile section is enough at the footprint.
        float traceVisibility = 1.;
        if (uPineTraceRadius > 0. && uPineCandela > .0001) {
          float rayT = (uPineTraceSection.y - vPineWorld.y) / max(toSource.y, .0001);
          if (rayT > 0. && rayT < 1.) {
            vec2 hit = (vPineWorld + toSource * rayT).xz;
            float penumbra = .0005 + rayT * uPineSourceRadius;
            float lightLeak = smoothstep(uPineTraceRadius - penumbra, uPineTraceRadius + penumbra,
              length(hit - uPineTraceSection.xz));
            traceVisibility = mix(1., .07 + .93 * lightLeak, smoothstep(.0001, .012, uPineCandela));
          }
        }
        vec3 traceWickInView = (viewMatrix * vec4(uPineSourcePosition, 1.)).xyz;
        ${pointLighting}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.directDiffuse *= .28;
          reflectedLight.directSpecular *= .56;
          float spillBounce = (1. - exp(-uPineCandela * 12.)) * uPinePoolWet * .042 + uPineWaxCooling * .045;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(.96, 1., 1.04) * spillBounce;`);
    }
  };
  material.customProgramCacheKey = () => `pine-wax-detail-${layer}-1`;
  return material;
}

function traySurfaceAt(geometry, x, z) {
  const { points, segments } = geometry.parameters;
  const turn = Math.atan2(x, z) / TAU;
  const sector = Math.min(segments - 1, Math.floor((turn < 0 ? turn + 1 : turn) * segments));
  const vertices = geometry.attributes.position, { index } = geometry;
  // Only the inner wall and floor can bear wax. Interpolate their actual
  // triangles so the aged deposits follow the chipped rim and dish slope.
  for (let row = points.length - 5; row < points.length - 1; row++) {
    const start = (sector * (points.length - 1) + row) * 6;
    for (let face = start; face < start + 6; face += 3) {
      const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
      const ax = vertices.getX(a), az = vertices.getZ(a);
      const ux = vertices.getX(b) - ax, uz = vertices.getZ(b) - az;
      const vx = vertices.getX(c) - ax, vz = vertices.getZ(c) - az;
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 1e-12) continue;
      const dx = x - ax, dz = z - az;
      const u = (dx * vz - dz * vx) / det, v = (ux * dz - uz * dx) / det;
      if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
      return (1 - u - v) * vertices.getY(a) + u * vertices.getY(b) + v * vertices.getY(c);
    }
  }
  throw new Error('Aged wax must be supported by the inside of the tray.');
}

function setOldWaxOnTray(tray) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .63,
    envMapIntensity: .26, transparent: true, depthWrite: false });
  material.userData.lampOwned = true;
  const deposits = [
    { angle: 1.08, fromCenter: .0501, length: .0041, width: .00212, height: .00118, color: 0xa08a70 },
    { angle: 1.40, fromCenter: .0511, length: .00175, width: .00117, height: .00065, color: 0xb09a7a },
    { angle: 2.03, fromCenter: .0503, length: .0037, width: .00182, height: .00095, color: 0xa58a70 },
  ];
  const profile = [[0, -.18, 0], [.98, -.18, 0], [1, .042, .13], [.935, .18, .47],
    [.77, .44, .91], [.55, .72, 1], [.29, .94, 1], [0, 1, 1]];
  for (const deposit of deposits) {
    const mesh = surface(profile.length, 28), color = new THREE.Color(deposit.color);
    const rgba = new THREE.Float32BufferAttribute(new Float32Array(profile.length * mesh.sectors * 4), 4);
    const dx = Math.cos(deposit.angle), dz = Math.sin(deposit.angle);
    for (const [row, [radius, height, opacity]] of profile.entries()) {
      for (let side = 0; side < mesh.sectors; side++) {
        const angle = side / mesh.sectors * TAU;
        const wornEdge = 1 + .072 * Math.sin(angle * 3 + deposit.angle) + .036 * Math.sin(angle * 7 + .7);
        const r = deposit.fromCenter + Math.cos(angle) * deposit.width * radius * wornEdge;
        const tangential = Math.sin(angle) * deposit.length * radius * wornEdge;
        const x = dx * r - dz * tangential, z = dz * r + dx * tangential;
        const support = traySurfaceAt(tray.geometry, x, z), i = row * mesh.sectors + side;
        mesh.positions.setXYZ(i, x, support + height * deposit.height, z);
        const age = .83 + .13 * (1 - radius) + .055 * Math.sin(angle * 7 + row * .57) * radius;
        rgba.setXYZW(i, color.r * age, color.g * age, color.b * age, opacity);
      }
    }
    mesh.geometry.setAttribute('color', rgba);
    finishSurface(mesh);
    const wax = new THREE.Mesh(mesh.geometry, material);
    wax.receiveShadow = true;
    tray.add(wax);
  }
}

export function createPineTray(seat) {
  const points = [[0, 0], [.038, 0], [.042, .001], [.045, .0035], [.052, .006],
    [.057, .0105], [.058, .014], [.0565, .0165], [.054, .017], [.0515, .0144],
    [.048, .0105], [.0465, seat.y], [0, seat.y]];
  const geometry = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 96);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x), rim = clamp((Math.hypot(x, z) - .046) / .012, 0, 1);
    const uneven = rim * (.0033 * Math.sin(angle * 17 + 1.8) + .0024 * Math.sin(angle * 29 - .9));
    const chip = .00038 * rim * Math.sin(angle * 37 + .5) * Math.sin(angle * 11);
    positions.setXYZ(i, x * (1 + uneven), y + chip * clamp(y / .008, 0, 1), z * (1 + uneven));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: .9, envMapIntensity: .38 });
  material.onBeforeCompile = shader => {
    materialCoordinates(shader);
    shader.fragmentShader = `
      ${RELIEF_GLSL}
      float pineStoneHash(vec3 p) { return fract(sin(dot(p, vec3(93.2, 43.9, 163.7))) * 28631.41); }
      float pineStoneValue(vec3 p) {
        vec3 q = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(
          mix(mix(pineStoneHash(q), pineStoneHash(q + vec3(1., 0., 0.)), f.x),
              mix(pineStoneHash(q + vec3(0., 1., 0.)), pineStoneHash(q + vec3(1., 1., 0.)), f.x), f.y),
          mix(mix(pineStoneHash(q + vec3(0., 0., 1.)), pineStoneHash(q + vec3(1., 0., 1.)), f.x),
              mix(pineStoneHash(q + vec3(0., 1., 1.)), pineStoneHash(q + vec3(1., 1., 1.)), f.x), f.y), f.z);
      }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float aggregate = pineStoneValue(vPineLocal * 226.);
      vec3 mineralCoord = vPineLocal * 940.;
      float grainCoverage = 1. - smoothstep(.44, 1.35, length(fwidth(mineralCoord)));
      float mineral = mix(.5, pineStoneValue(mineralCoord + vec3(48., 12., 9.)), grainCoverage);
      float fleck = smoothstep(.64, .9, mineral);
      float trayRadius = length(vPineLocal.xz);
      float soot = (1. - smoothstep(.012, .048, trayRadius)) * smoothstep(.37, .85, aggregate);
      float scuffedRim = smoothstep(.049, .057, trayRadius) * smoothstep(.006, .012, vPineLocal.y);
      float polish = scuffedRim * smoothstep(.32, .87, aggregate);
      // A coarse throwing tool leaves nearly concentric traces. Their height
      // varies around the dish and is filtered in the wider views.
      float turningPhase = trayRadius * 2600. + vPineLocal.y * 487. + aggregate * 1.4;
      float turningCoverage = (1. - smoothstep(.41, 1.6, fwidth(turningPhase))) * smoothstep(.011, .022, trayRadius);
      float toolMark = sin(turningPhase) * (.35 + .65 * aggregate) * turningCoverage;
      float ashSpecks = soot * smoothstep(.48, .76, mineral) * smoothstep(.19, .58, aggregate);
      diffuseColor.rgb *= .65 + .40 * aggregate + .09 * fleck + .12 * polish - .28 * soot - .23 * ashSpecks + .042 * toolMark;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + .14 * (aggregate - .5) - .22 * polish + .10 * ashSpecks, .56, .98);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float relief = .00043 * aggregate + .000055 * mineral + .000044 * toolMark + .000033 * ashSpecks;
        normal = pineRelief(normal, -vViewPosition, relief);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= .84;
        reflectedLight.directSpecular *= .76;
        // The outer foot faces the nearby niche walls, away from the wick.
        // Their broad return is subtle and carries through the worn relief.
        vec3 stoneNormal = inverseTransformDirection(normal, viewMatrix);
        float outerFoot = smoothstep(.038, .054, length(vPineLocal.xz))
          * (1. - smoothstep(.12, .74, stoneNormal.y));
        float recessReturn = .48 + .37 * dot(stoneNormal, normalize(vec3(.37, .46, 1.)));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.07, 1.03, .98)
          * (.26 * outerFoot * recessReturn);`);
  };
  material.customProgramCacheKey = () => 'pine-hewn-stone-5';
  material.userData.lampOwned = true;
  const tray = new THREE.Mesh(geometry, material);
  tray.receiveShadow = true;
  setOldWaxOnTray(tray);
  return tray;
}

function fillPool(mesh, radius, rise) {
  const profile = [[1, 1], [.966, .75], [.924, .39], [.867, .12], [.72, -.045], [.47, -.068], [.23, -.021], [0, 0]];
  const perimeter = angle => 1 + .022 * Math.sin(angle * 3 + .8) + .012 * Math.sin(angle * 7 - .3);
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    const relief = angle => rise * r * (.09 * Math.sin(angle * 2 + .3) + .048 * Math.sin(angle * 5 - .6));
    writeRing(mesh, i, 0, radius * r, rise * y, perimeter, relief);
  }
  finishSurface(mesh);
}

function makeBraidedWick(path, fiberMaterial, charMaterial) {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const phase = TAU * i / 3;
    const points = Array.from({ length: 18 }, (_, j) => {
      const t = j / 17;
      const p = path.getPoint(t);
      const twist = phase + t * TAU * 2.7;
      return p.add(vector(Math.cos(twist) * .00029, 0, Math.sin(twist) * .00029));
    });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 26, .000235, 5), fiberMaterial));
  }
  const tipPath = new THREE.CatmullRomCurve3([path.getPoint(.46), path.getPoint(.69), path.getPoint(.86), path.getPoint(1)]);
  const charGeometry = new THREE.TubeGeometry(tipPath, 12, .00058, 8);
  const charVertices = charGeometry.attributes.position;
  const point = new THREE.Vector3();
  for (let row = 0; row <= 12; row++) {
    const center = tipPath.getPointAt(row / 12);
    for (let side = 0; side <= 8; side++) {
      const index = row * 9 + side, turn = side / 8 * TAU;
      const chips = 1 + .10 * Math.sin(turn * 3 + row * .77) + .068 * Math.cos(turn * 2 - row * 1.3);
      point.fromBufferAttribute(charVertices, index).sub(center).multiplyScalar(chips).add(center);
      charVertices.setXYZ(index, point.x, point.y, point.z);
    }
  }
  charGeometry.computeVertexNormals();
  const char = new THREE.Mesh(charGeometry, charMaterial);
  const charCap = new THREE.Mesh(new THREE.IcosahedronGeometry(.00059, 1), charMaterial);
  charCap.position.copy(path.getPoint(1));
  charCap.scale.set(1.13, .82, .92);
  char.add(charCap);
  group.add(char);
  return { group, char };
}

function surface(rings, sectors) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(rings * sectors * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  const indices = [];
  for (let row = 0; row < rings - 1; row++) {
    for (let side = 0; side < sectors; side++) {
      const a = row * sectors + side;
      const b = row * sectors + (side + 1) % sectors;
      indices.push(a, a + sectors, b, b, a + sectors, b + sectors);
    }
  }
  geometry.setIndex(indices);
  return { geometry, positions, rings, sectors };
}

function finishSurface(mesh, used = mesh.rings) {
  mesh.positions.needsUpdate = true;
  mesh.geometry.setDrawRange(0, (used - 1) * mesh.sectors * 6);
  mesh.geometry.computeVertexNormals();
}

function ringAt(rows, y) {
  let i = 1;
  while (i < rows.length - 1 && rows[i].y < y) i++;
  const a = rows[i - 1], b = rows[i];
  const k = clamp((y - a.y) / (b.y - a.y || 1), 0, 1);
  return { cx: lerp(a.cx, b.cx, k), r: lerp(a.r, b.r, k) };
}

function writeRing(mesh, row, cx, radius, height, contour, rise) {
  for (let side = 0; side < mesh.sectors; side++) {
    const angle = side * TAU / mesh.sectors;
    const r = radius * (contour ? contour(angle) : 1);
    mesh.positions.setXYZ(row * mesh.sectors + side, cx + Math.cos(angle) * r,
      height + (rise ? rise(angle) : 0), Math.sin(angle) * r);
  }
}

function shapedRunnels(rows, samples) {
  let seed = 2166136261;
  for (const row of rows) {
    for (const value of [row.y, row.cx, row.r]) {
      seed = Math.imul(seed ^ Math.round(value * 100000), 16777619);
    }
  }
  const next = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
  return samples.map(droplet => ({
    angle: (droplet.angle + (next() - .5) * .46 + TAU) % TAU,
    start: Math.max(.007, droplet.start + (next() - .5) * .02),
    reach: Math.min(.043, droplet.reach * (.78 + .38 * next())),
    width: droplet.width * (.86 + .42 * next()),
    speed: 4.0 + 2.0 * next(),
    bead: .64 + .17 * next(),
    bend: (next() - .5) * .29,
    shoulder: .12 + .13 * next(),
  }));
}

function runnelContour(y, radius, runnels) {
  const flows = [];
  for (const drip of runnels) {
    const k = (drip.crown - y) / drip.reach;
    if (k < 0 || k > 1) continue;
    const taper = Math.sin(Math.PI * k) ** 1.24;
    const bead = .38 + 1.02 * Math.exp(-((k - drip.bead) ** 2) / .025);
    const width = Math.min(drip.width, radius * .23) * drip.growth;
    // Each trail rounds into its own bead and follows a smooth, slightly
    // drifting course down the drawn profile.
    const angle = drip.angle + drip.bend * Math.sin(k * Math.PI);
    flows.push({ angle, height: width * (taper * bead + drip.shoulder * Math.exp(-k * 10)),
      halfWidth: Math.max(.15, width / radius * (1.08 + .56 * taper)) });
  }
  return a => {
    let rise = 0;
    for (const flow of flows) {
      const gap = Math.abs(a - flow.angle);
      const distance = Math.min(gap, TAU - gap);
      if (distance >= flow.halfWidth) continue;
      const blend = Math.cos(distance / flow.halfWidth * Math.PI * .5);
      rise += flow.height * blend ** 2;
    }
    return 1 + .0035 * Math.sin(a * 7 + y * 29) + .0016 * Math.sin(a * 13 - y * 42) + rise / radius;
  };
}

const RUNNEL_ROW_STEP = .0018;
const RUNNEL_ROWS = 26;

function bodySurface(mesh, rows, cut, melt, runnels) {
  const top = ringAt(rows, cut);
  const refined = runnels !== null;
  const depth = (refined ? Math.min(cut * .42, top.r * .40, .0068)
    : Math.min(cut * .24, top.r * .27, .0036)) * melt;
  const bevel = Math.min(cut * .2, top.r * .09, .0014);
  const uneven = a => melt * Math.min(top.r * .09, cut * .13, .0011) * (.65 * Math.sin(a * 3 + .8) + .35 * Math.sin(a * 7 - .3));
  const grain = (y, radius) => runnels ? runnelContour(y, radius, runnels)
    : a => 1 + .006 * Math.sin(a * 7 + y * 120) + .004 * Math.sin(a * 15 - y * 150);
  let row = 0;
  writeRing(mesh, row++, rows[0].cx, 0, 0);
  const shoulderY = cut - bevel;
  const firstRunnel = runnels?.length ? Math.min(...runnels.map(drip => drip.crown - drip.reach)) : shoulderY;
  let detailY = Math.max(0, firstRunnel);
  const fillTo = y => {
    // Only subdivide the short band with raised wax. Keep every drawn row
    // and leave the lower body at its original profile resolution.
    while (detailY < y - 1e-6) {
      const q = ringAt(rows, detailY);
      writeRing(mesh, row++, q.cx, q.r, detailY, grain(detailY, q.r));
      detailY += RUNNEL_ROW_STEP;
    }
    if (detailY <= y + 1e-6) detailY += RUNNEL_ROW_STEP;
  };
  for (const q of rows) {
    if (q.y >= shoulderY) break;
    fillTo(q.y);
    writeRing(mesh, row++, q.cx, q.r, q.y, grain(q.y, q.r));
  }
  fillTo(shoulderY);
  const shoulder = ringAt(rows, shoulderY);
  writeRing(mesh, row++, shoulder.cx, shoulder.r, shoulderY, grain(runnels ? shoulderY : cut, shoulder.r));
  writeRing(mesh, row++, top.cx, top.r * .99, cut - bevel * .25, grain(runnels ? cut - bevel * .25 : cut, top.r), a => uneven(a) * .4);
  if (refined && melt > 0) {
    writeRing(mesh, row++, top.cx, top.r * .94, cut, grain(cut, top.r), uneven);
    writeRing(mesh, row++, top.cx, top.r * .865, cut - depth * .20, grain(cut, top.r), a => uneven(a) * .45);
    writeRing(mesh, row++, top.cx, top.r * .717, cut - depth, grain(cut, top.r));
  } else {
    writeRing(mesh, row++, top.cx, top.r * .92, cut, grain(cut, top.r), uneven);
    writeRing(mesh, row++, top.cx, top.r * .77, cut - depth * .55, grain(cut, top.r), a => uneven(a) * .3);
    writeRing(mesh, row++, top.cx, top.r * .61, cut - depth, grain(cut, top.r));
  }
  const used = row + 1;
  // The unused rings collapse onto the cap centre so they contribute no normals.
  for (; row < mesh.rings; row++) writeRing(mesh, row, top.cx, 0, cut - depth);
  finishSurface(mesh, used);
  return { ...top, depth };
}

const TRACE_CENTRE = .68;

function makeTrace(refined) {
  const mesh = surface(refined ? 12 : 5, 64);
  const contour = refined
    ? a => 1 + .065 * Math.sin(a * 3 + .2) + .034 * Math.sin(a * 8 - .8)
      + .17 * Math.max(0, Math.cos(a - 1.1)) ** 12 + .14 * Math.max(0, Math.cos(a - 4.4)) ** 16
    : a => 1 + .11 * Math.sin(a * 3 + .2) + .06 * Math.sin(a * 7 - .8)
      + .22 * Math.max(0, Math.cos(a - 1.1)) ** 12 + .21 * Math.max(0, Math.cos(a - 4.4)) ** 18;
  const profile = refined
    // Close the underside, then roll the thin perimeter into the fuller wax.
    ? [[0, .008], [.96, .008], [1, .018], [.991, .028], [.969, .064], [.931, .147],
      [.88, .278], [.79, .438], [.64, .57], [.45, .65], [.22, TRACE_CENTRE], [0, TRACE_CENTRE]]
    : [[0, .04], [.94, .04], [1, .21], [.73, .58], [0, 1]];
  profile.forEach(([r, y], i) => writeRing(mesh, i, 0, r, y, contour,
    refined ? angle => y * r * (.06 * Math.sin(angle * 4 + i * .5) + .025 * Math.sin(angle * 11)) : null));
  finishSurface(mesh);
  return mesh.geometry;
}

function writeDrip(drip, rows, cut, growth) {
  const mesh = drip.surface;
  const reach = Math.min(drip.reach * growth, cut * .8);
  drip.object.visible = reach > .0001;
  if (!drip.object.visible) return;
  for (let row = 0; row < mesh.rings; row++) {
    const k = 1 - row / (mesh.rings - 1);
    const y = cut - reach * k - Math.min(cut * .04, .00045);
    const q = ringAt(rows, y);
    const angle = drip.angle + .07 * Math.sin(k * 4.4);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    // The tear follows the actual outline, with its widest bead near its tip.
    const taper = Math.sin(Math.PI * k) ** .45 * (.54 + .62 * Math.exp(-((k - .79) ** 2) / .014));
    const width = Math.min(drip.width, q.r * .24) * Math.sqrt(growth) * taper;
    const r = q.r + width * .16;
    for (let side = 0; side < mesh.sectors; side++) {
      const a = side * TAU / mesh.sectors;
      const radial = r + Math.cos(a) * width * .78;
      const tangent = Math.sin(a) * width;
      mesh.positions.setXYZ(row * mesh.sectors + side, q.cx + dx * radial - dz * tangent,
        y, dz * radial + dx * tangent);
    }
  }
  finishSurface(mesh);
}

export function createPineWax(seat, waxMaterial, { refined = false } = {}) {
  const group = new THREE.Group();
  group.position.y = seat.y;
  const light = refined ? {
    uPineSourcePosition: { value: vector(0, 0, 0) },
    uPineSourceColor: { value: new THREE.Color() },
    uPineWaxCrown: { value: vector(0, 0, 0) },
    uPineSourceRadius: { value: .007 },
    uPineCandela: { value: 0 },
    uPinePoolWet: { value: 0 },
    uPineWaxTime: { value: 0 },
    uPineWaxWind: { value: 0 },
    uPinePoolRadius: { value: .001 },
    uPineWaxCooling: { value: 0 },
    uPineWaxHeight: { value: 0 },
    uPineTraceSection: { value: vector(0, 0, 0) },
    uPineTraceRadius: { value: 0 },
    uPineTraceThickness: { value: 0 },
  } : null;
  const traceSectionLocal = refined ? vector(0, 0, 0) : null;
  const bodyMaterial = refined ? refinedWaxMaterial(light, 'body')
    : waxMaterial(0xffffff, { roughness: .42, clearcoat: .28, fall: 92 });
  const poolMaterial = refined ? refinedWaxMaterial(light, 'pool')
    : waxMaterial(0xffffff, { roughness: .14, clearcoat: .95, fall: 84 });
  const traceMaterial = refined ? refinedWaxMaterial(light, 'remnant')
    : waxMaterial(0xffffff, { roughness: .45, clearcoat: .35, fall: 115 });
  const materials = refined ? [] : [bodyMaterial, poolMaterial, traceMaterial];
  const wickMaterial = new THREE.MeshStandardMaterial({ color: 0x665442, roughness: .98 });
  const charMaterial = refined ? new THREE.MeshPhysicalMaterial({ color: 0x0a0705, roughness: .98, specularIntensity: .08, envMapIntensity: .09 }) : null;
  for (const material of [bodyMaterial, poolMaterial, traceMaterial, wickMaterial, charMaterial]) {
    if (material) material.userData.lampOwned = true;
  }

  const add = (geometry, material) => {
    const object = new THREE.Mesh(geometry, material);
    object.receiveShadow = true;
    group.add(object);
    return object;
  };
  const body = add(new THREE.BufferGeometry(), bodyMaterial);
  body.frustumCulled = false; // Small, moving vertices do not need a new bounding sphere each frame.
  const poolMesh = refined ? surface(8, 64) : null;
  const pool = add(poolMesh?.geometry ?? new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), poolMaterial);
  if (refined) pool.frustumCulled = false;
  const trace = add(makeTrace(refined), traceMaterial);
  const contact = waxContactShadow(1, refined ? .36 : .42);
  if (refined) contact.renderOrder = -1; // Draw the shadow on stone under the translucent wax.
  group.add(contact);
  const drops = [
    { angle: 1.12, start: .015, reach: .031, width: .00165 },
    { angle: 2.16, start: .095, reach: .020, width: .00118 },
    { angle: .18, start: .18, reach: .043, width: .00141 },
    { angle: 3.6, start: .24, reach: .026, width: .00175 },
    { angle: 5.1, start: .31, reach: .036, width: .00124 },
  ].map(spec => {
    if (refined) return spec;
    const mesh = surface(12, 10);
    const object = add(mesh.geometry, traceMaterial);
    object.frustumCulled = false;
    return { ...spec, surface: mesh, object };
  });
  const wickPath = new THREE.CatmullRomCurve3([vector(0, -.001, 0), vector(-.00015, .002, 0),
    vector(.00035, .0041, .00022), vector(.00135, .00575, .00058)]);
  const braid = refined ? makeBraidedWick(wickPath, wickMaterial, charMaterial) : null;
  const wick = braid ? braid.group : add(new THREE.TubeGeometry(wickPath, 10, .00068, 7, false), wickMaterial);
  if (braid) group.add(wick);
  const wickTip = new THREE.Vector3();
  const wickEnd = wickPath.getPoint(1);
  const warmWax = new THREE.Color(0xffc07d);
  let source, rows, bodyMesh, lastFuel, lastState, fullHeight, cutHeight, bodyHeight;
  let traceSeatRadius = seat.traceRadius, runnelLayout;
  let drips = 0;

  return {
    group, materials, wickTip,
    setShape(shape) {
      source = shape.rows;
      const base = source[0].y;
      const width = Math.max(...source.map(q => Math.abs(q.cx) + q.r));
      const scale = Math.min(1, seat.maxR / width, seat.maxH / ((source.at(-1).y - base) || 1));
      rows = source.map(q => ({ y: (q.y - base) * scale, cx: q.cx * scale, r: q.r * scale }));
      fullHeight = rows.at(-1).y;
      if (refined) {
        // Match the runtime holder fit and leave the spill on the flat seat,
        // inside its inner wall and the older deposits attached to that wall.
        const holderScale = clamp((width * scale + .007) / seat.traceRadius, .76, 1);
        traceSeatRadius = holderScale * seat.traceRadius - .00045;
        runnelLayout = shapedRunnels(source, drops);
      }
      body.geometry.dispose();
      bodyMesh = surface(rows.length + 7 + (refined ? RUNNEL_ROWS : 0), refined ? 72 : 48);
      body.geometry = bodyMesh.geometry;
      bodyMaterial.color.setHex(shape.color);
      poolMaterial.color.copy(bodyMaterial.color).lerp(warmWax, refined ? .06 : .12);
      traceMaterial.color.copy(bodyMaterial.color);
      if (!refined) traceMaterial.color.lerp(warmWax, .065);
      lastFuel = undefined;
    },
    update(remaining, state, anchor) {
      const fuel = state === 'burned_down' ? 0 : remaining;
      if (lastFuel !== fuel || lastState !== state) {
        lastFuel = fuel;
        lastState = state;
        cutHeight = waxCutHeight(source, fuel);
        const span = source.at(-1).y - source[0].y;
        const cut = span > 0 ? (cutHeight - source[0].y) * fullHeight / span : 0;
        bodyHeight = cut;
        const spent = cut <= 0;
        const melted = state === 'unlit' ? 0 : Math.min(1, .54 + (1 - fuel) * 4);
        const runnels = refined ? runnelLayout.map(drip => {
          const amount = clamp((1 - fuel - drip.start) * drip.speed, 0, 1);
          return { ...drip, reach: Math.min(drip.reach * amount, cut * .8),
            growth: Math.sqrt(amount), crown: cut - Math.min(cut * .04, .0002) };
        }).filter(drip => drip.reach > .0001) : null;
        const top = spent ? rows[0] : bodySurface(bodyMesh, rows, cut, melted, runnels);
        body.visible = !spent;
        pool.visible = !spent && melted > 0;
        if (refined) {
          const depth = top.depth ?? 0;
          // Place the meniscus below the dry lip. Its outer rings meet the
          // curved inner wall; the centre stays below them around the wick.
          const poolRadius = top.r * .802;
          if (pool.visible) fillPool(poolMesh, poolRadius, Math.min(.00049, depth * .20));
          pool.position.set(top.cx, cut - depth * .72, 0);
          light.uPinePoolRadius.value = poolRadius;
          const cooled = state === 'went_out' || state === 'burned_down';
          poolMaterial.roughness = state === 'burning' ? .13 : .44;
          poolMaterial.color.copy(bodyMaterial.color).lerp(warmWax, cooled ? 0 : .06);
          light.uPinePoolWet.value = state === 'burning' ? 1 : 0;
          light.uPineWaxCooling.value = cooled ? 1 : 0;
          light.uPineWaxHeight.value = cut;
        } else {
          pool.scale.setScalar(top.r * (.56 + .086 * melted));
          pool.position.set(top.cx, cut - (top.depth ?? 0) + Math.min(cut * .04, .00016), 0);
          poolMaterial.roughness = state === 'burning' ? .14 : .29;
        }
        const spread = Math.sqrt(Math.max(0, 1 - fuel));
        const base = rows[0];
        contact.position.x = base.cx;
        contact.scale.setScalar(base.r * (refined ? 1.38 : 1.48));
        const traceHeight = (refined ? Math.min(.0042, base.r * .24) : Math.min(.0052, base.r * .32)) * spread;
        trace.visible = spread > .04;
        trace.position.x = base.cx;
        const traceRadius = base.r * (refined ? .84 + .32 * spread : .78 + .38 * spread);
        const spreadRadius = Math.min(traceRadius, (traceSeatRadius - Math.abs(base.cx)) / (refined ? 1.28 : 1.4));
        trace.scale.set(spreadRadius, traceHeight, spreadRadius);
        if (refined) {
          light.uPineTraceThickness.value = traceHeight;
          light.uPineTraceRadius.value = 0;
          if (trace.visible && state === 'burning' && cut > .003) {
            const sectionY = cut * .46;
            const section = ringAt(rows, sectionY);
            traceSectionLocal.set(section.cx, sectionY, 0);
            light.uPineTraceRadius.value = section.r;
          }
        }
        drips = runnels?.length ?? 0;
        if (!refined) {
          for (const drip of drops) {
            writeDrip(drip, rows, cut, clamp((1 - fuel - drip.start) * 5, 0, 1));
            drips += Number(drip.object.visible);
          }
        }
        if (braid) {
          braid.char.visible = state !== 'unlit';
          wickMaterial.color.setHex(state === 'unlit' ? 0x9b8966 : 0x3b2d1f);
        } else wickMaterial.color.setHex(state === 'unlit' ? 0x665442 : 0x18110b);
        const spentWick = 1 - clamp(cut / Math.max(.002, traceHeight * 1.8), 0, 1);
        wick.scale.y = lerp(1, .56, spentWick);
        wick.position.set(top.cx, Math.max(pool.position.y, traceHeight * (refined ? TRACE_CENTRE : .9)), 0);
        wickTip.copy(wickEnd).multiply(wick.scale).add(wick.position);
        wickTip.y += seat.y;
      }
      anchor.set(wickTip.x, wickTip.y - .004, wickTip.z);
    },
    updateLight(sourceLight, emitterRadius = .007, time = 0, wind = 0) {
      if (!light) return;
      light.uPineWaxTime.value = time;
      light.uPineWaxWind.value = wind;
      light.uPineCandela.value = sourceLight.intensity;
      if (!sourceLight.intensity) return;
      light.uPineSourceRadius.value = emitterRadius;
      light.uPineSourceColor.value.copy(sourceLight.color);
      sourceLight.getWorldPosition(light.uPineSourcePosition.value);
      light.uPineWaxCrown.value.copy(wickTip);
      group.parent?.localToWorld(light.uPineWaxCrown.value);
      if (light.uPineTraceRadius.value) group.localToWorld(light.uPineTraceSection.value.copy(traceSectionLocal));
    },
    fullHeight: () => fullHeight,
    profileBounds() {
      const minX = Math.min(...rows.map(row => row.cx - row.r));
      const maxX = Math.max(...rows.map(row => row.cx + row.r));
      const depth = Math.max(...rows.map(row => row.r));
      return new THREE.Box3(vector(minX, seat.y, -depth), vector(maxX, seat.y + fullHeight + .006, depth));
    },
    state: () => ({ remaining: lastFuel, cutHeight, bodyHeight, state: lastState, drips, trace: trace.visible }),
  };
}
