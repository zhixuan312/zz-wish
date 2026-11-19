import { Vector3 } from 'three';
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
