const TAU = Math.PI * 2;
const FOOT = .012;
const WALL = .0032;
const SIDES = 8;
// Clockwise boundary of one vent cell. Equal steps keep adjacent courses joined
// even when their vents are staggered by half a cell.
const contour = [
  [0, 0], [0, .25], [0, .5], [0, .75], [0, 1], [.25, 1], [.5, 1], [.75, 1],
  [1, 1], [1, .75], [1, .5], [1, .25], [1, 0], [.75, 0], [.5, 0], [.25, 0],
];

function perforatedHood(THREE, profile, radiusAt) {
  const top = profile.at(-1)[1];
  const positions = [];
  const normals = [];
  const radius = y => Math.max(.009, radiusAt(profile, y));
  function surface(u, y, inside) {
    const angle = TAU * u;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const r = radius(y) - (inside ? WALL : 0);
    const low = Math.max(0, y - .0006), high = Math.min(top, y + .0006);
    const rise = (radius(high) - radius(low)) / (high - low);
    const facing = (inside ? -1 : 1) / Math.hypot(1, rise);
    return { point: [r * cos, y + FOOT, r * sin], normal: [cos * facing, -rise * facing, sin * facing] };
  }
  function strip(a, b, c, d, flip = false, rim = false) {
    const triangles = flip ? [[a, c, b], [a, d, c]] : [[a, b, c], [a, c, d]];
    for (const [v1, v2, v3] of triangles) {
      let face;
      if (rim) {
        const edge = new THREE.Vector3().fromArray(v2.point).sub(new THREE.Vector3().fromArray(v1.point));
        const across = new THREE.Vector3().fromArray(v3.point).sub(new THREE.Vector3().fromArray(v1.point));
        face = edge.cross(across).normalize().toArray();
      }
      for (const vertex of [v1, v2, v3]) {
        positions.push(...vertex.point);
        normals.push(...(face ?? vertex.normal));
      }
    }
  }
  // Band edges land between holes, with the low courses punched slightly wider.
  const bands = [0, .22, .39, .55, .72, .87, 1];
  for (let band = 0; band < bands.length - 1; band++) {
    const lo = bands[band] * top, hi = bands[band + 1] * top;
    if (band === 0 || band === bands.length - 2) {
      const heights = [lo, ...profile.map(([, y]) => y).filter(y => y > lo && y < hi), hi];
      for (const inside of [false, true]) {
        for (let row = 0; row < heights.length - 1; row++) {
          for (let i = 0; i < SIDES * 4; i++) {
            const u = i / (SIDES * 4), v = (i + 1) / (SIDES * 4);
            strip(surface(u, heights[row], inside), surface(u, heights[row + 1], inside),
              surface(v, heights[row + 1], inside), surface(v, heights[row], inside), inside);
          }
        }
      }
      continue;
    }
    for (let cell = 0; cell < SIDES; cell++) {
      const start = cell + (band % 2) * .5;
      const centerY = (lo + hi) / 2 + top * .005 * Math.sin(cell * 2.4 + band);
      const width = (.096 - band * .009) * (1 + .17 * Math.sin(cell * 2.2 - band * 1.8));
      const height = Math.min(top * (.019 - band * .0018), .0056);
      const boundaries = [false, true].map(inside => contour.map(([u, v]) =>
        surface((start + u) / SIDES, lo + v * (hi - lo), inside)));
      const vents = [false, true].map(inside => contour.map(([u, v], i) => {
        const angle = Math.atan2(v - .5, u - .5);
        const lip = (inside ? .78 : 1) * (1 + .07 * Math.sin(i * 1.9 + cell));
        return surface((start + .5 + Math.cos(angle) * width * lip) / SIDES,
          centerY + Math.sin(angle) * height * lip, inside);
      }));
      for (let i = 0; i < contour.length; i++) {
        const j = (i + 1) % contour.length;
        for (const side of [0, 1]) {
          const edge = boundaries[side], vent = vents[side];
          strip(edge[i], edge[j], vent[j], vent[i], side === 1);
        }
        strip(vents[0][i], vents[0][j], vents[1][j], vents[1][i], false, true);
      }
    }
  }
  for (const y of [0, top]) {
    for (let i = 0; i < SIDES * 4; i++) {
      const u = i / (SIDES * 4), v = (i + 1) / (SIDES * 4);
      strip(surface(u, y, false), surface(v, y, false),
        surface(v, y, true), surface(u, y, true), y === top, true);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function firedClay(THREE, colour, top) {
  const color = new THREE.Color(0x94735e).lerp(new THREE.Color(colour), .12);
  const material = new THREE.MeshStandardMaterial({ color, roughness: .86, envMapIntensity: .26 });
  material.userData.lampOwned = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.tideClayTop = { value: top };
    shader.vertexShader = 'varying vec3 vTideClay;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvTideClay = position;');
    shader.fragmentShader = `varying vec3 vTideClay;
uniform float tideClayTop;
float clayTexture(vec3 p) {
  return sin(dot(p, vec3(1.3, .7, 1.8))) * sin(dot(p, vec3(-.8, 1.7, 1.1)));
}
` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float firing = .86 + .16 * clayTexture(vTideClay * 35.) + .09 * clayTexture(vTideClay * 97.);
      float turning = .5 + .5 * sin(vTideClay.y * 1900. + 1.7 * clayTexture(vTideClay * 69.));
      float grog = clayTexture(vTideClay * 1040.);
      float detail = 1. - smoothstep(.25, 1.3, length(fwidth(vTideClay)) * 730.);
      float soot = smoothstep(.72, 1., vTideClay.y / tideClayTop + .055 * clayTexture(vTideClay * 80.));
      diffuseColor.rgb *= firing * (1. - .44 * soot) * (1. + detail * (.14 * grog + .07 * turning));
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + .08 * firing - .16 * soot + detail * .06 * grog, .53, .98);
    `);
  };
  material.customProgramCacheKey = () => 'tide-fired-clay';
  return material;
}

export function buildTideHood(THREE, { lathe, solid, radiusAt }, profile, tint) {
  const g = new THREE.Group();
  const r0 = profile[0][0], top = profile.at(-1)[1];
  const clay = firedClay(THREE, tint, top + FOOT);
  solid(g, lathe([[0, 0], [r0 + .012, 0], [r0 + .016, .01], [r0 + .01, .014], [r0 + .006, .006], [0, .006]], 48), clay);
  solid(g, lathe([[0, .006], [.018, .006], [.022, .026], [.019, .028], [0, .022]], 32), clay);
  const shell = solid(g, perforatedHood(THREE, profile, radiusAt), clay);
  shell.name = 'Tide pierced earthenware hood';

  // The shadowed wick defines the openings. Light scattered by the warm collar
  // and floor of the recess gives its stone a broader, weaker secondary wash.
  const bounce = new THREE.PointLight(0xffc494, 0, .92, 2);
  bounce.name = 'Tide hood bounce';
  bounce.position.set(-r0 * .47, FOOT + .072, r0 + .074);
  g.add(bounce);
  return {
    g, kind: 'shade', wick: { at: new THREE.Vector3(0, .03, 0) },
    frame: { h: top + .03, cy: top * .48 },
    lightMax: .10, flame: .8, light: 0xffbc81,
    updateLight(wickLight) {
      bounce.intensity = 2.1 * (wickLight?.intensity ?? 0);
    },
  };
}
