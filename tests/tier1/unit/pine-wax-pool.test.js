import { Raycaster, Texture, Vector3 } from 'three';
import { expect, test } from 'vitest';
import { createPineWax } from '../../../web/src/engine/PineWax.js';

const seat = { y: .008, maxR: .039, maxH: .16, traceRadius: .046 };
const base = { y: 0, cx: 0, r: .017 };
const crown = { ...base, y: .06 };

test('moves a straight candle melt pool without replacing its unchanged buffers', () => {
  const wax = createPineWax(seat, undefined, { refined: true });
  wax.setShape({ rows: [base, crown], color: 0xffe8c3 });
  const [, pool] = wax.group.children;
  const anchor = new Vector3();
  const versions = () => {
    const { position, normal } = pool.geometry.attributes;
    return [position.version, normal.version];
  };

  wax.update(.88, 'burning', anchor);
  const initialVersions = versions();
  const initialHeight = pool.position.y;
  const initialAnchor = anchor.y;
  wax.update(.87, 'burning', anchor);
  expect(versions()).toEqual(initialVersions);
  expect(pool.position.y).toBeLessThan(initialHeight);
  expect(anchor.y).toBeLessThan(initialAnchor);

  // A very short stub keeps its width but has a shallower meniscus.
  wax.update(.002, 'burning', anchor);
  const stubVersions = initialVersions.map(version => version + 1);
  expect(versions()).toEqual(stubVersions);

  // A different width also invalidates the geometry cache.
  wax.setShape({ rows: [{ ...base, r: .028 }, { ...crown, r: .028 }], color: 0xffe8c3 });
  wax.update(.002, 'burning', anchor);
  expect(versions()).toEqual(stubVersions.map(version => version + 1));
});


test('the softened wax lip exposes the pool from the burning view without moving the wick', () => {
  const shape = { rows: [{ ...base, r: .0128 }, { ...crown, r: .0128, y: .0524 }], color: 0xe9ddc3 };
  function sample(sculptNormal) {
    const wax = createPineWax(seat, undefined, { refined: true, sculptNormal });
    wax.setShape(shape);
    const anchor = new Vector3();
    wax.update(.996, 'burning', anchor);
    wax.group.updateMatrixWorld(true);

    const [body, pool] = wax.group.children;
    const eye = new Vector3(-.047, .0864, .375);
    const ray = new Raycaster();
    let visible = 0;
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        if (x * x + z * z > 16) continue;
        const point = new Vector3(x * .002, seat.y + pool.position.y, z * .002);
        ray.set(eye, point.sub(eye).normalize());
        if (ray.intersectObjects([body, pool], false)[0]?.object === pool) visible++;
      }
    }
    const positions = body.geometry.attributes.position;
    let backLip = -Infinity;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      if (positions.getZ(vertex) < -.007) backLip = Math.max(backLip, positions.getY(vertex));
    }
    return { visible, anchor, cutHeight: wax.state().cutHeight, backLip };
  }

  const flat = sample(null);
  const softened = sample(new Texture());
  expect(softened.visible).toBeGreaterThan(flat.visible * 3);
  expect(softened.visible).toBeGreaterThanOrEqual(40);
  expect(softened.backLip - softened.cutHeight).toBeGreaterThan(.0025);
  expect(softened.anchor).toEqual(flat.anchor);
  expect(softened.cutHeight).toBe(flat.cutHeight);
});
