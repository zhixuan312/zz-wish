import { cartRut, createLoessWalk, cutGrid, cutHeight, gateZ, routeBeats, routeClearance, routeGround, walkSeconds } from './loess-route.js';

const lampSeatY = 1;
const windowBack = -.63;

// A tiling colour and height field for the packed silt. Layers come from the
// carved profile, while fine grains and small pockets continue across them.
function seatGrain(THREE) {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  function grain(u, v, cells) {
    const x = u * cells, y = v * cells;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = THREE.MathUtils.smoothstep(x - ix, 0, 1);
    const fy = THREE.MathUtils.smoothstep(y - iy, 0, 1);
    function sample(dx, dy) {
      const key = ((ix + dx) % cells) + cells * ((iy + dy) % cells);
      let bits = Math.imul(key + 37, 0x45d9f3b);
      bits = Math.imul(bits ^ (bits >>> 16), 0x45d9f3b);
      return ((bits ^ (bits >>> 16)) >>> 0) / 0xffffffff;
    }
    const lo = THREE.MathUtils.lerp(sample(0, 0), sample(1, 0), fx);
    const hi = THREE.MathUtils.lerp(sample(0, 1), sample(1, 1), fx);
    return THREE.MathUtils.lerp(lo, hi, fy);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const mottling = grain(u, v, 7) * .11 + grain(u, v, 28) * .16;
    const grit = grain(u, v, 79) * .20;
    const fines = grain(u, v, 128) * .12;
    const pores = .12 * THREE.MathUtils.smoothstep(grain(u, v, 69), .69, .96);
    const value = Math.round(255 * (.48 + mottling + grit + fines - pores));
    pixels.set([value, value, value, 255], (x + y * size) * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// The cut rolls from the earthen window into a level bearing surface and over
// the worn front lip. Closely spaced rows in the cut carry the sediment bands.
function windowSeat(THREE) {
  const section = [
    [windowBack - .03, .096, .50, 0x84654d], [-.55, .094, .54, 0x916c50],
    [-.46, .092, .57, 0x967359], [-.413, .083, .57, 0x88654b],
    [-.373, .071, .58, 0xb08b67], [-.335, .062, .60, 0x9a7657],
    [-.304, .050, .62, 0x89634a], [-.284, .048, .64, 0x9c7355],
    [-.273, .044, .65, 0xac8364], [-.242, .037, .67, 0x90694e],
    [-.225, .036, .68, 0xa07a5c], [-.205, .032, .68, 0x9f7a5d],
    [-.181, .019, .68, 0x987457], [-.159, .006, .68, 0x99765a],
    [-.14, 0, .68, 0x9c795c],
  ];
  for (let row = 1; row <= 28; row++) {
    section.push([-.14 + row * .01, 0, .68, 0x9c795c]);
  }
  section.push(
    [.157, -.004, .676, 0xa78261], [.171, -.015, .668, 0xa58263],
    [.179, -.033, .658, 0x957155], [.177, -.052, .65, 0xa68061],
    [.165, -.067, .645, 0x87654a], [.143, -.08, .64, 0x8c694d],
    [-.235, -.087, .64, 0x826149],
  );

  const columns = 144;
  const stride = columns + 1;
  const positions = [], colors = [], uvs = [], triangles = [];
  const color = new THREE.Color();
  const earthBase = new THREE.Color(0x9d7859);
  const absorbedOil = new THREE.Color(0x634834);
  let surfaceDistance = 0;
  for (let row = 0; row < section.length; row++) {
    const [z, y, halfWidth, earth] = section[row];
    if (row > 0) {
      const [lastZ, lastY] = section[row - 1];
      surfaceDistance += Math.hypot(z - lastZ, y - lastY);
    }
    for (let column = 0; column <= columns; column++) {
      const x = (2 * column / columns - 1) * halfWidth;
      const ridge = Math.sin(x * 15 + z * 9) * Math.sin(x * 36 - .7);
      const lip = THREE.MathUtils.smoothstep(z, .06, .17);
      const contour = z + lip * (.005 * ridge - .025 * Math.pow(Math.abs(x / halfWidth), 10));
      const cut = 1 - THREE.MathUtils.smoothstep(z, -.22, -.14);
      const erosion = Math.sin(x * 19 + z * 24) * Math.cos(x * 47 - z * 31);
      positions.push(x, lampSeatY + y + ridge * Math.abs(y) * .04 + cut * .0038 * erosion, contour);
      uvs.push(x * 3.4 + .5, surfaceDistance * 3.4);

      // Old oil soaked in several centimetres outside the present cup. The
      // displaced, uneven pools stay distinct from the dish's contact shadow.
      const uneven = .12 * Math.sin(x * 138 + z * 69) * Math.cos(z * 144);
      const contact = Math.hypot(x / .024, z / .022);
      const spill = Math.hypot((x + .085 + (z - .058) * .74) / .043, (z - .058) / .026) + uneven;
      const drip = Math.hypot((x + .134) / .018, (z - .075) / .011) + uneven;
      const absorbed = .64 * (1 - THREE.MathUtils.smoothstep(spill, .54, 1.31))
        + .34 * (1 - THREE.MathUtils.smoothstep(drip, .18, 1.17));
      const bearing = .19 * (1 - THREE.MathUtils.smoothstep(contact, .42, 1.12));
      const interrupted = cut * THREE.MathUtils.smoothstep(erosion, -.64, .55) * .62;
      color.setHex(earth).lerp(earthBase, interrupted).lerp(absorbedOil, absorbed)
        .multiplyScalar((1 - bearing) * (1 + .045 * ridge));
      colors.push(color.r, color.g, color.b);
      if (row === 0 || column === 0) continue;
      const lower = row * stride + column;
      const upper = lower - stride;
      triangles.push(upper - 1, lower - 1, upper, upper, lower - 1, lower);
    }
  }
  // Fan caps close the exposed sides; the rear edge is within the cave wall.
  for (const column of [0, columns]) {
    for (let row = 1; row < section.length - 1; row++) {
      const edge = row * stride + column;
      if (column === 0) triangles.push(column, edge, edge + stride);
      else triangles.push(column, edge + stride, edge);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(triangles);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const grain = seatGrain(THREE);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .96, map: grain, bumpMap: grain, bumpScale: .0014,
  });
  // Broaden the peak from the visitor's near point source on the rough earth.
  // Lamp, wick, shadows and falloff beyond the window stay on the live light.
  material.onBeforeCompile = shader => {
    const pointLight = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
    const lights = THREE.ShaderChunk.lights_fragment_begin.replace(pointLight, `${pointLight}
      directLight.color *= mix(0.23, 1.0,
        smoothstep(0.055, 0.43, length(pointLight.position - geometryPosition)));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lights);
  };
  material.customProgramCacheKey = () => 'loess-window-earth-v1';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Loess visitor window seat';
  return mesh;
}

function cutGround(THREE, material) {
  const { west, north, columns, rows, stepX, stepZ } = cutGrid;
  const width = columns * stepX, depth = rows * stepZ;
  const geometry = new THREE.PlaneGeometry(width, depth, columns, rows).rotateX(-Math.PI / 2)
    .translate(west + width / 2, 0, north + depth / 2);
  const points = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i);
    const h = cutHeight(x, z);
    points.setY(i, h);
    const rut = cartRut(x, z);
    const bank = Math.min(1, Math.max(0, (h - routeGround(1, z)) * .55));
    const wear = .91 - .23 * rut + .10 * bank + .045 * Math.sin(x * 8 + z * 1.3) * Math.sin(z * 7.7 - x * 2.1);
    colors.push(wear, wear, wear * (1 - .06 * bank));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Loess cut and cart track';
  mesh.receiveShadow = true;
  return mesh;
}

function smokedPaper(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const paper = ctx.createLinearGradient(210, 0, 375, 512);
  paper.addColorStop(0, '#c4af8c');
  paper.addColorStop(.58, '#b7a17f');
  paper.addColorStop(1, '#978367');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5500; i++) {
    const x = (i * 177.3721) % 512, y = (i * 331.5319) % 512;
    ctx.fillStyle = i % 3 ? 'rgba(83,61,43,0.055)' : 'rgba(241,222,189,0.09)';
    ctx.fillRect(x, y, 1 + i % 4, .6);
  }
  ctx.fillStyle = '#8a5145';
  for (const [x, y, size] of [[216, 178, 40], [384, 274, 22], [101, 298, 22]]) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * size * .56, y + Math.sin(a) * size * .56, size * .35, size * .13, a, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, size * .19, 0, 2 * Math.PI);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// An invented cave court. The lamp window, cave fronts and cliff are one continuous piece of ground.
export default function createPlace(h) {
  const { THREE, V3, M, ground, box, put, wallWithHoles, otherLamp, loessTex, papercutTex, grainTex, pavingTex, mist, pauseBuild } = h;
  const choose = { pos: V3(.68, 1.34, .92), look: V3(0, 1.15, -.18), fov: 32 };
  const choosePhone = { pos: V3(.53, 1.22, .70), look: V3(-.165, 1.11, -.22) };
  const entry = { pos: V3(1.92, routeGround(1.92, 30.3) + 1.67, 30.3), look: V3(1.30, 3.1, 15.6), fov: 39 };
  return {
    exposure: 1.12, shade: .3,
    sky: { top: 0x080b12, horizon: 0x24232a, ground: 0x100e0c, sun: 0xc9d2e4, dir: [-.4, .5, .5], glow: .08, clouds: .45, lit: 0x333b4a, dark: 0x111118, stars: .6, disc: 1.1 },
    fog: [0x1c1e25, .009], sunL: [0xb6c5df, .48], hemi: [0x42495e, 0x17120e, .38], bloom: [.48, 1], porch: [0xffa45b, 8],
    day: { exposure: 1, sky: { top: 0x657f9a, horizon: 0xe0d5bd, ground: 0x8f704d, sun: 0xffebcf, dir: [-.5, .55, .5], glow: .35, clouds: .25, lit: 0xffeee0, dark: 0x8793a4 }, fog: [0xb9aa96, .006], sunL: [0xffe4c0, 2], hemi: [0xc4d5e5, 0x62503b, .85], bloom: [.3, 1.4] },
    view: entry, viewPhone: { ...entry, fov: 48 },
    walk: [], doors: V3(1.35, 1.6, gateZ),
    walkSeconds, createWalk: createLoessWalk, routeGround, routeBeats, routeClearance,
    async build() {
      const C = h.context, earth = M(0x8f6c46, .98, { map: loessTex }), cap = M(0x74634e, .95, { map: loessTex });
      ground(0x725c43, { y: -.14, mat: { map: loessTex } });
      C.G.add(cutGround(THREE, M(0xa48461, .97, { map: loessTex, vertexColors: true })));
      // Retaining cheeks marry the gate to the sides of the cut. The court opens behind it.
      wallWithHoles({ x0: -9, x1: 9, y0: 0, y1: 2.7, z: gateZ, depth: .8, m: earth, uv: .32, holes: [{ x0: -.2, x1: 3.2, y0: 0, y1: 2.7 }] });
      box(3.65, .18, .95, cap, 1.5, 2.78, gateZ - .35);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.45, .08), M(0x462b1b, .9, { map: grainTex })); leaf.position.set(3.17, 1.23, gateZ - .9); leaf.rotation.y = -1.25; leaf.castShadow = leaf.receiveShadow = true; C.G.add(leaf);
      for (const x of [-.45, 3.45]) box(.5, .08, .9, cap, x, routeGround(x, gateZ - .5) + .04, gateZ - .5);
      for (let i = 0; i < 32; i++) {
        const x = (C.rnd() < .5 ? -1 : 1) * (4.8 + C.rnd() * 9), z = 1 + C.rnd() * 33;
        put(new THREE.DodecahedronGeometry(.09 + C.rnd() * .18, 1), cap, x, routeGround(x, z) + .04, z, C.rnd() * 6.28);
      }
      // Thin dry grass stays out of the wheel ruts and follows the bank.
      const grass = M(0x6d6042, 1, { side: THREE.DoubleSide });
      for (let i = 0; i < 160; i++) {
        const x = 1 + (C.rnd() < .5 ? -1 : 1) * (3.1 + C.rnd() * 11), z = -3 + C.rnd() * 41, hh = .12 + C.rnd() * .35;
        put(new THREE.PlaneGeometry(.015 + C.rnd() * .02, hh), grass, x, routeGround(x, z) + hh / 2, z, C.rnd() * 6.28);
      }
      await pauseBuild();
      mist({ n: 10, at: [0, .6, 24], box: [30, 1.2, 22], color: 0x9c8b76, opacity: .05, size: 10, drift: .45 });
    },
    nook: {
      at: { pos: V3(0, 0, -3), ry: 0 }, lamp: 'clay', y: lampSeatY, exposure: 1.08, bloom: [.35, 1.05],
      wide: choose, widePhone: choosePhone, choose, choosePhone,
      async build(hh, C) {
        const earth = M(0x9d794e, .98, { map: loessTex }), packed = M(0x725638, .98, { map: loessTex }), wood = M(0x47301e, .85, { map: grainTex });
        // A thick cliff face with fully open arches. The front is the actual cave wall, rather than a distant scenery copy.
        const holes = [{ x0: -.58, x1: .58, y0: 1.02, y1: 2.3, arch: true }, { x0: 1.25, x1: 2.55, y0: 0, y1: 2.65, arch: true }, { x0: -3.15, x1: -1.85, y0: .92, y1: 2.3, arch: true }, { x0: -7.7, x1: -5.5, y0: 0, y1: 3.1, arch: true }, { x0: 5.2, x1: 7.5, y0: 0, y1: 3.25, arch: true }];
        wallWithHoles({ x0: -16, x1: 16, y0: 0, y1: 11, z: -.2, depth: 5.5, m: earth, uv: .34, holes });
        // Sediment shelves run through the cliff; their different thicknesses catch a thin band of moonlight.
        for (const [y, depth, tint] of [[3.5, .16, 0x8a6946], [5.6, .28, 0xa38156], [7.9, .22, 0x8c6d49], [9.8, .36, 0xa6855b]]) {
          for (let i = 0; i < 8; i++) box(4.08, .035 + (i % 3) * .025, depth, M(tint, 1, { map: loessTex }), -14 + i * 4, y + Math.sin(i * 1.7) * .12, -.14);
        }
        box(32, 1.4, 8, earth, 0, 11.6, -3.8);
        for (const x of [-18, 18]) box(5, 9, 14, earth, x, 4.5, -4.8);
        // Deep dark cave interiors stay visible through the open arches, with small pools of light far inside.
        for (const [x, w, hh2, glow] of [[-6.6, 2.2, 3.1, .18], [1.9, 1.3, 2.65, .1], [6.35, 2.3, 3.25, .14]]) {
          box(w + .15, hh2, .08, M(0x24180f, .98), x, hh2 / 2, -5.35);
          const glowM = new THREE.MeshStandardMaterial({ color: 0x291a10, roughness: 1, emissive: 0xffa25b, emissiveIntensity: glow });
          box(w * .65, hh2 * .7, .04, glowM, x, hh2 * .35, -5.29);
          box(w, .08, 5.2, packed, x, .04, -2.9);
        }
        const paper = new THREE.MeshStandardMaterial({ map: papercutTex, emissive: 0xffb875, emissiveMap: papercutTex, emissiveIntensity: .09 + .11 * C.light.n, roughness: .95, side: THREE.DoubleSide });
        const heroTexture = smokedPaper(THREE);
        const heroPaper = new THREE.MeshStandardMaterial({
          map: heroTexture, emissive: 0x99734e, emissiveMap: heroTexture,
          emissiveIntensity: .025 + .055 * C.light.n, roughness: .98, side: THREE.DoubleSide,
        });
        for (const [x, w] of [[0, 1.16], [-2.5, 1.3]]) {
          const hero = x === 0;
          const back = hero ? windowBack : -.52;
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.25), hero ? heroPaper : paper); pane.position.set(x, 1.65, back); C.G.add(pane);
          const latticeWidth = hero ? 1 : w;
          for (let k = -2; k <= 2; k++) box(.018, 1.25, .035, wood, x + k * latticeWidth / 5, 1.65, back + .06);
          for (const y of [1.08, 1.65, 2.23]) box(latticeWidth, .025, .045, wood, x, y, back + .08);
          if (hero) {
            C.G.add(windowSeat(THREE));
            // Short fired-clay slips hold the timber away from raw earth.
            // The dark inner frame sits behind the front plane of the cliff.
            const slips = [M(0x656052, .95, { map: pavingTex }), M(0x544f45, .96, { map: pavingTex })];
            const mortar = M(0x776756, .99, { map: loessTex });
            for (const side of [-1, 1]) {
              box(.043, .84, .055, wood, side * .479, 1.51, back + .05);
              // The filled joints and shoulder carry each course into the earth.
              box(.091, .619, .192, mortar, side * .54, 1.389, back + .225);
              box(.092, .67, .27, earth, side * .594, 1.39, back + .216);
              for (let course = 0; course < 5; course++) {
                const depth = .19 + (course % 3) * .012;
                box(.082, .120, depth, slips[course % 2], side * .537, 1.145 + .123 * course, back + .14 + depth / 2);
              }
            }
          } else box(w + .18, .065, .62, packed, x, .98, -.25);
        }
        const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 2.36, 12, 1), M(0x273141, .98, { side: THREE.DoubleSide }));
        const cp = curtain.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 32) * .045); curtain.geometry.computeVertexNormals(); curtain.position.set(1.9, 1.19, -.75); C.G.add(curtain);
        otherLamp('clay', -2.5, 1, -.2, .6, .4);
        for (const x of [-15.8, 15.8]) box(.7, 2.1, 19, earth, x, 1.05, 7);
        put(new THREE.CylinderGeometry(.42, .42, .16, 36), M(0x68645b, .94, { map: pavingTex }), -3.8, .08, 1.8);
        box(1.1, .08, .38, wood, 3.4, .4, .8); for (const x of [3.02, 3.78]) box(.08, .38, .28, wood, x, .19, .8);
        // Rough firewood against the cave wall, little earthen jars and drying grain.
        for (let i = 0; i < 16; i++) put(new THREE.CylinderGeometry(.03, .05, .55 + (i % 3) * .08, 9).rotateZ(Math.PI / 2), wood, 4.1, .07 + Math.floor(i / 4) * .08, .15 + i % 4 * .09);
        for (const x of [-4.9, 3.9]) put(new THREE.LatheGeometry([[0, 0], [.11, 0], [.16, .18], [.1, .31], [.09, .33]].map(([r,y])=>new THREE.Vector2(r,y)), 32), M(0x62472f, .95), x, 0, .3);
        await pauseBuild();
      },
    },
  };
}
