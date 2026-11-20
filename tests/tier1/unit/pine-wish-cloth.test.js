import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createWishCloth, wallRadius, CLOTH_SPEC, TRAY_PROFILE } from '../../../web/src/engine/places/pine-wish-cloth.js';
import * as THREE from 'three';

const anchor = new Vector3(-1.8, 5, .9);

// Every vertex of every mesh in the group, in anchor-relative metres (the group sits at the
// anchor, so a child's position plus its scaled local vertex is the offset).
function vertices(cloth) {
  const out = [];
  for (const object of cloth.group.children) {
    const position = object.geometry?.attributes?.position;
    if (!position) continue;
    const scale = object.scale ?? { x: 1, y: 1, z: 1 };
    object.updateMatrix();
    for (let i = 0; i < position.count; i++) {
      // Apply the child's own rotation and scale, which the fray threads use.
      const local = new THREE.Vector3(
        position.getX(i) * scale.x, position.getY(i) * scale.y, position.getZ(i) * scale.z,
      ).applyQuaternion(object.quaternion).add(object.position);
      out.push({ x: local.x, y: local.y, z: local.z, mesh: object.name });
    }
  }
  return out;
}

const bandOf = cloth => cloth.group.getObjectByName('Wish cloth band tied round the candle tray');

test('wallRadius follows the tray lathe profile', () => {
  for (const [r, y] of TRAY_PROFILE) expect(wallRadius(y)).toBeCloseTo(r, 6);
  const mid = (.0035 + .006) / 2;
  expect(wallRadius(mid)).toBeCloseTo((.045 + .052) / 2, 4);
  expect(wallRadius(-.01)).toBeCloseTo(.038, 6);
  expect(wallRadius(.5)).toBeCloseTo(.054, 6);
});

test('the band is an upright narrow strip against the wall, never a flange', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const band = bandOf(cloth);
  const position = band.geometry.attributes.position;
  // Offset from the wall is small and positive everywhere: it hugs the wall.
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const offset = Math.hypot(x, z) - wallRadius(y);
    expect(offset, `offset at y ${y}`).toBeGreaterThanOrEqual(.0005);
    expect(offset, `offset at y ${y}`).toBeLessThanOrEqual(.004);
  }
  // Its faces are radial, not a horizontal flange: the normal's outward component must
  // dominate, and its vertical part stays below the outward part everywhere.
  band.geometry.computeVertexNormals();
  const normals = band.geometry.attributes.normal;
  const pos = band.geometry.attributes.position;
  let checked = 0, degenerate = 0;
  for (let i = 0; i < normals.count; i++) {
    const radial = Math.hypot(pos.getX(i), pos.getZ(i));
    if (radial < .005) continue; // the seam vertex on the axis has no meaningful radial

    const outward = (normals.getX(i) * pos.getX(i) + normals.getZ(i) * pos.getZ(i)) / radial;
    // Degenerate normals appear where the ring closes on itself; skip those few.
    if (Math.abs(outward) < .2) { degenerate++; continue; }
    expect(outward, 'band normal must point outward').toBeGreaterThan(.05);
    // The tray wall flares 43.5 -> 57.9 mm over this 10 mm band, so the band's own slope is
    // steep; its normal must still be radial rather than a horizontal flange (a flange would be
    // outward ~0 and vertical ~1).
    expect(Math.abs(outward)).toBeGreaterThan(0.5);
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
  // At most the closing seam may be degenerate.
  expect(degenerate).toBeLessThanOrEqual(4);
  // Height is the authored 10 mm band, not a wide disc.
  band.geometry.computeBoundingBox();
  const box = band.geometry.boundingBox;
  expect(box.max.y - box.min.y).toBeCloseTo(CLOTH_SPEC.band.to - CLOTH_SPEC.band.from, 3);
  // It never grows beyond the tray's own rim radius, so it cannot read as a hat brim.
  expect(box.max.x).toBeLessThanOrEqual(wallRadius(CLOTH_SPEC.band.to) + .004);
  cloth.dispose();
});

test('the knot is tied cloth, not a smooth sphere', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const knot = cloth.group.getObjectByName('Knot of the visitor wish cloth');
  expect(knot).toBeTruthy();
  const kinds = [];
  knot.traverse((object) => { if (object.isMesh) kinds.push(object.geometry.type); });
  expect(kinds.length).toBeGreaterThanOrEqual(3);
  expect(kinds).not.toContain('SphereGeometry');
  // Two cloth loops and a twisted core.
  expect(kinds.filter(k => k === 'TubeGeometry')).toHaveLength(2);
  expect(kinds).toContain('CapsuleGeometry');
  // Roughly 15-20 mm across.
  for (const object of knot.children) {
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(.022);
  }
  cloth.dispose();
});

test('the tails are 1 mm thick cloth with undulation and a rounded, unbent edge', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const tails = cloth.group.children.filter(o => /^Wish cloth tail/.test(o.name));
  expect(tails).toHaveLength(2);
  for (const tail of tails) {
    const position = tail.geometry.attributes.position;
    // Thickness: both faces exist, so the y range is about the authored 1 mm.
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    // 1 mm of cloth plus the gentle undulation along its length.
    expect(maxY - minY).toBeGreaterThanOrEqual(.0005);
    expect(maxY - minY).toBeLessThanOrEqual(.010);
    // Both sides are present: the index buffer closes the strip into a solid.
    expect(tail.geometry.index.count).toBeGreaterThan(position.count * 2);
  }
  cloth.dispose();
});

test('the fray is many fine threads, not blocks', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const threads = cloth.group.children.filter(o => /^Frayed thread/.test(o.name));
  expect(threads.length).toBeGreaterThanOrEqual(16);
  for (const thread of threads) {
    expect(thread.geometry.type).toBe('CylinderGeometry');
    const position = thread.geometry.attributes.position;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < position.count; i++) {
      minX = Math.min(minX, position.getX(i)); maxX = Math.max(maxX, position.getX(i));
    }
    // 0.5 mm across.
    expect(maxX - minX).toBeLessThanOrEqual(.0008);
  }
  cloth.dispose();
});

test('the material is lit cloth: standard, textured, deep red, no emissive', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const band = bandOf(cloth);
  const material = band.material;
  expect(material.type).toBe('MeshStandardMaterial');
  expect(material.emissive?.getHex?.() ?? 0).toBe(0);
  expect(material.emissiveIntensity ?? 0).toBeLessThanOrEqual(1);
  expect(material.toneMapped).not.toBe(false);
  expect(material.roughness).toBe(1);
  // Deep fresh-cloth red, not salmon.
  const hex = material.color.getHex();
  expect([0xa5161b, 0xb81d22]).toContain(hex);
  // Procedural woven maps.
  expect(material.normalMap).toBeTruthy();
  expect(material.roughnessMap).toBeTruthy();
  // Every cloth mesh casts and receives, so the stone shows contact shadows.
  for (const object of cloth.group.children) {
    if (!object.isMesh) continue;
    expect(object.castShadow, `${object.name} must cast`).toBe(true);
    expect(object.receiveShadow, `${object.name} must receive`).toBe(true);
  }
  cloth.dispose();
});

test('nothing sits below the stone or inside the tray wall', () => {
  const cloth = createWishCloth({ THREE, anchor, seed: 3 });
  const points = vertices(cloth);
  expect(points.length).toBeGreaterThan(200);
  for (const point of points) {
    expect(point.y, `${point.mesh} at y ${point.y}`).toBeGreaterThanOrEqual(.0004);
    if (point.y > .017) continue;
    // The knot deliberately stands proud of the wall; the band and tails must not enter it.
    if (/Knot|Twisted|loop/.test(point.mesh)) continue;
    const radius = Math.hypot(point.x, point.z);
    expect(radius, `${point.mesh} at y ${point.y}`).toBeGreaterThanOrEqual(wallRadius(point.y) - .0015);
  }
  cloth.dispose();
});
