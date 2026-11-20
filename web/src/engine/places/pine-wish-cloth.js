// The visitor's red cloth strip, tied round the candle tray when the lamp is lit.
// It carries no text: the wish stays with the visitor. It stays through the burn, the
// burnt-down ending and the put-out ending, becoming part of the shrine like the older wax.
//
// All coordinates are metres relative to the lamp anchor, which is the stone surface. +z faces
// the burn camera. Nothing may sit below y = 0 (inside the stone) or inside the tray wall.
//
// The cloth is built as fabric, not as cards: a narrow upright band hugging the wall, a knotted
// tie made of two pressed loops around a twisted core, and two ~1 mm thick tails with soft
// undulation, a slight lateral drift and fine frayed threads at the ends. The material carries a
// procedural woven normal and roughness map so it reads as coarse cloth under the place light.
import { Vector3 as V3 } from 'three';

const CLOTH_COLOR = 0xa5161b;
const KNOT_CORE = 0x8e1216;

// The tray's outer wall, straight from createPineTray's lathe profile: [radius, y].
export const TRAY_PROFILE = Object.freeze([
  [.038, 0], [.042, .001], [.045, .0035], [.052, .006],
  [.057, .0105], [.058, .014], [.0565, .0165], [.054, .017],
]);

/** The tray's outer radius at height y, linearly interpolated through the lathe profile. */
export function wallRadius(y) {
  const profile = TRAY_PROFILE;
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return profile.at(-1)[0];
}

export const CLOTH_SPEC = Object.freeze({
  // An upright band: 10 mm tall, from y .003 to .013, a couple of millimetres off the wall.
  band: { from: .003, to: .013, clearance: .0018 },
  knot: { y: .009, size: .017 },
  tail: { width: .030, thickness: .001, flatFrom: .0006, flatTo: .0016, endZ: [.112, .126], spread: [.021, .034] },
  weave: { cells: 64 },
});

// A woven cloth texture: warp and weft threads about 1 mm apart, used as normal and roughness.
// Data textures keep this identical on the main thread and in a headless test, with no canvas.
function wovenMaps(THREE, cells) {
  const data = (fill) => {
    const bytes = new Uint8Array(cells * cells * 4);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const [r, g, b, a] = fill(x / cells, y / cells);
        const i = (y * cells + x) * 4;
        bytes[i] = r; bytes[i + 1] = g; bytes[i + 2] = b; bytes[i + 3] = a;
      }
    }
    const texture = new THREE.DataTexture(bytes, cells, cells, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  // Threads cross: a ridge along each warp and each weft, plus a small over/under offset.
  const normal = data((u, v) => {
    const warp = Math.cos(u * Math.PI * 2 * 8);
    const weft = Math.cos(v * Math.PI * 2 * 8);
    return [Math.round(128 + 34 * warp + 10 * weft), Math.round(128 + 34 * weft - 10 * warp), 255, 255];
  });
  const roughness = data((u, v) => {
    const wobble = .5 + .5 * Math.sin(u * 37.1) * Math.sin(v * 29.3);
    const value = Math.round(214 + 30 * wobble);
    return [value, value, value, 255];
  });
  normal.colorSpace = THREE.NoColorSpace;
  roughness.colorSpace = THREE.NoColorSpace;
  return { normal, roughness };
}

export function createWishCloth({ THREE, anchor, seed = 1 }) {
  const group = new THREE.Group();
  // The anchor is the stone surface; the tray sits on it and the cloth ties to the tray.
  group.position.set(anchor.x, anchor.y, anchor.z);

  const { band, knot: knotSpec, tail: tailSpec } = CLOTH_SPEC;
  const maps = wovenMaps(THREE, CLOTH_SPEC.weave);
  const material = new THREE.MeshStandardMaterial({
    color: CLOTH_COLOR,
    roughness: 1,
    ...(maps.roughness ? { roughnessMap: maps.roughness } : {}),
    ...(maps.normal ? { normalMap: maps.normal, normalScale: new THREE.Vector2(.55, .55) } : {}),
    metalness: 0,
    // The place environment is bright; cloth is a poor reflector, so keep the environment
    // from washing the dye out to white.
    envMapIntensity: .28,
    // Cloth needs both sides visible; it is still opaque, so it sorts as solid geometry.
    side: THREE.DoubleSide,
  });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: KNOT_CORE, roughness: 1, envMapIntensity: .28,
    ...(maps.roughness ? { roughnessMap: maps.roughness } : {}),
    ...(maps.normal ? { normalMap: maps.normal, normalScale: new THREE.Vector2(.6, .6) } : {}),
    metalness: 0,
  });

  // 1. An upright band round the wall: two rings joined into a quad strip, 10 mm tall. Its faces
  // point outward, so it reads as a narrow red line at the tray's lower wall, never a flange.
  const steps = 96;
  const positions = [], indices = [];
  // The wall flares from 43.5 mm at y .003 to 57.9 mm at y .013. A strip tied round it must follow
  // that flare to stay in contact; built as a two-ring shell it still reads as a band, and the
  // outer face stays radial because the strip is only 10 mm tall.
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const rTop = wallRadius(band.to) + band.clearance;
    const rBottom = wallRadius(band.from) + band.clearance;
    rings.push({ angle, rTop, rBottom });
  }
  for (const { angle, rTop, rBottom } of rings) {
    positions.push(Math.sin(angle) * rTop, band.to, Math.cos(angle) * rTop);
    positions.push(Math.sin(angle) * rBottom, band.from, Math.cos(angle) * rBottom);
  }
  for (let i = 1; i <= steps; i++) {
    const a = (i - 1) * 2, b = i * 2 % (steps * 2);
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const bandGeometry = new THREE.BufferGeometry();
  bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bandGeometry.setIndex(indices);
  bandGeometry.computeVertexNormals();
  const bandMesh = new THREE.Mesh(bandGeometry, material);
  bandMesh.castShadow = true;
  bandMesh.receiveShadow = true;
  bandMesh.name = 'Wish cloth band tied round the candle tray';
  group.add(bandMesh);

  // 2. The knot: two pressed loops round a twisted core, all cloth. Not a sphere.
  const knotGroup = new THREE.Group();
  knotGroup.name = 'Knot of the visitor wish cloth';
  knotGroup.position.set(0, knotSpec.y, wallRadius(knotSpec.y) + .004);
  const loopProfile = (squash, twist) => {
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      // A flat cloth loop: an ellipse in the plane facing the camera, pressed in z.
      points.push(new THREE.Vector3(Math.cos(a) * knotSpec.size * .5, Math.sin(a) * knotSpec.size * .3,
        Math.sin(a * 2 + twist) * knotSpec.size * .12 * squash));
    }
    return new THREE.CatmullRomCurve3(points, true);
  };
  for (const [index, twist] of [0, Math.PI * .6].entries()) {
    const curve = loopProfile(.7, twist);
    const loop = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, knotSpec.size * .085, 8, true), material);
    loop.castShadow = true;
    loop.receiveShadow = true;
    loop.rotation.z = index * Math.PI * .5;
    loop.name = `Wish cloth knot loop ${index + 1}`;
    knotGroup.add(loop);
  }
  // The twisted core pinches the loops together.
  const core = new THREE.Mesh(new THREE.CapsuleGeometry(knotSpec.size * .085, knotSpec.size * .16, 6, 10), coreMaterial);
  core.rotation.z = Math.PI * .5;
  core.castShadow = true;
  core.receiveShadow = true;
  core.name = 'Twisted core of the wish cloth knot';
  knotGroup.add(core);
  group.add(knotGroup);

  // 3. Two tails: 1 mm thick, gently undulating along their length, drifting sideways, with a
  // rounded rather than cut edge, then fine frayed threads at the tip.
  const rand = (() => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  const madeTails = [];
  for (const [index, side] of [-1, 1].entries()) {
    const spread = tailSpec.spread[index];
    const endZ = tailSpec.endZ[index];
    const samples = 26;
    const halfWidth = tailSpec.width / 2;
    const centres = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const fall = Math.min(1, t / .40);
      const lie = Math.max(0, (t - .40) / .60);
      // Soft undulation along the length: ±1.5 mm in height over two or three waves.
      const wave = .0015 * Math.sin(t * Math.PI * 2 * 2.6 + index * 1.9);
      const y = knotSpec.y * (1 - fall)
        + (tailSpec.flatFrom + tailSpec.thickness / 2 + .0004 + Math.abs(wave)) * lie;
      // Lateral drift plus a gentle S so the edge is not a straight line.
      const drift = Math.sin(t * Math.PI * 1.4 + index * .8) * .004;
      const x = side * (spread * lie * lie) + drift * lie;
      const z = wallRadius(knotSpec.y) + .004 + (endZ - wallRadius(knotSpec.y) - .004) * lie;
      // Clamp the centre line so the *bottom* face (centre minus half the thickness) stays on
      // the stone rather than inside it.
      centres.push([x, Math.max(tailSpec.flatFrom + tailSpec.thickness / 2, y), z]);
    }
    // Build both faces plus the rim so the cloth has real thickness.
    const ring = (sign) => centres.map(([x, y, z], i) => {
      const next = centres[Math.min(i + 1, centres.length - 1)];
      const prev = centres[Math.max(i - 1, 0)];
      const dx = next[0] - prev[0], dz = next[2] - prev[2];
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len), nz = (dx / len);
      // Slight widening toward the tip, and a rounded end.
      const taper = 1 - .12 * Math.pow(1 - i / centres.length, 3);
      const w = halfWidth * taper * (i === centres.length - 1 ? .72 : 1);
      const yOff = sign * tailSpec.thickness / 2;
      return [
        [x - nx * w, y + yOff, z - nz * w],
        [x + nx * w, y + yOff, z + nz * w],
      ];
    });
    const top = ring(1), bottom = ring(-1);
    const pos = [], idx = [];
    const push = ([x, y, z]) => { pos.push(x, y, z); return pos.length / 3 - 1; };
    const topIds = top.map(([l, r]) => [push(l), push(r)]);
    const botIds = bottom.map(([l, r]) => [push(l), push(r)]);
    for (let i = 1; i < topIds.length; i++) {
      const [tl0, tr0] = topIds[i - 1], [tl1, tr1] = topIds[i];
      const [bl0, br0] = botIds[i - 1], [bl1, br1] = botIds[i];
      idx.push(tl0, tr0, tl1, tr0, tr1, tl1);           // top face
      idx.push(bl1, br0, bl0, bl1, br1, br0);           // bottom face
      idx.push(tl0, bl0, tl1, bl0, bl1, tl1);           // left rim
      idx.push(tr1, br0, tr0, tr1, br1, br0);           // right rim
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Wish cloth tail ${index + 1} lying on the stone`;
    group.add(mesh);
    madeTails.push(mesh);

    // Fine fray: 8-12 threads of 0.5 mm diameter and 3-8 mm length leaving the tip.
    const tip = centres.at(-1);
    const threads = 8 + Math.floor(rand() * 5);
    for (let k = 0; k < threads; k++) {
      const length = .003 + rand() * .005;
      const thread = new THREE.Mesh(
        new THREE.CylinderGeometry(.00025, .00018, length, 5),
        material,
      );
      // A cylinder is authored along +y; rotating it a quarter turn about x lays it along z,
      // and half its diameter above the stone keeps it resting on the surface.
      thread.rotation.set(Math.PI / 2, 0, (rand() - .5) * 1.4);
      thread.position.set(
        tip[0] + (k - threads / 2) * .0016 + (rand() - .5) * .002,
        tailSpec.flatFrom + .0003 + .0003,
        tip[2] + .001 + rand() * .0015,
      );
      thread.castShadow = true;
      thread.receiveShadow = true;
      thread.name = 'Frayed thread of a wish cloth tail';
      group.add(thread);
    }
  }

  const loose = group.children.filter(object => /tail|Frayed/.test(object.name));
  const local = new V3();
  return {
    group,
    anchor: anchor.clone(),
    update(wind = 0) {
      // Only a whisper of movement: cloth on a ledge does not flap.
      const angle = Math.max(-.5, Math.min(.5, wind)) * .10;
      loose.forEach((object, i) => { object.rotation.z = angle * (i % 2 ? -1 : 1) * .4; });
    },
    worldPosition() { return group.getWorldPosition(local.clone()); },
    dispose() {
      for (const object of group.children) object.geometry?.dispose();
      material.dispose(); coreMaterial.dispose();
      maps.normal?.dispose(); maps.roughness?.dispose();
      void madeTails;
    },
  };
}
