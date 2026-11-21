import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Vector3 } from 'three';
import createPlace from '../../../web/src/engine/places/sea-tide.js';
import { seaTideMix } from '../../../web/src/sea-tide-sound.ts';

const V3 = (...coordinates) => new Vector3(...coordinates);
const site = createPlace({ V3 });
const up = V3(0, 1, 0);

for (const phone of [false, true]) {
  test(`Tide surf is audible inside the lane and opens smoothly on ${phone ? 'phone' : 'desktop'}`, () => {
    const start = phone ? site.viewPhone : site.view;
    const wide = phone ? site.nook.widePhone : site.nook.wide;
    const { pos: origin, ry } = site.nook.at;
    const toWorld = point => point.clone().applyAxisAngle(up, ry).add(origin);
    const end = { pos: toWorld(wide.pos), look: toWorld(wide.look), fov: wide.fov };
    if (phone) end.pos.sub(end.look).multiplyScalar(1.45).add(end.look);
    const walk = site.createWalk(start, end, phone);
    const rig = { pos: V3(), look: V3() };
    const sample = second => {
      walk(second / site.walkSeconds, rig);
      return seaTideMix(rig.pos.x, rig.pos.z, rig.look.x - rig.pos.x, rig.look.z - rig.pos.z);
    };

    const lane = sample(0);
    assert.ok(lane.body > .1 && lane.bodyCutoff <= 200 && lane.washCutoff <= 500);
    assert.ok(lane.pan > 0 && lane.pan < .25);
    assert.ok(sample(18).wash <= lane.wash + .003);
    const open = sample(26);
    assert.ok(open.body > lane.body * 1.6 && open.wash > lane.wash * 15);
    assert.ok(open.washCutoff > 2000);

    let previous = lane;
    for (let frame = 1; frame / 60 <= site.walkSeconds; frame++) {
      const current = sample(frame / 60);
      assert.ok(Math.abs(current.washCutoff - previous.washCutoff) < 30);
      assert.ok(Math.abs(current.pan - previous.pan) < .025);
      previous = current;
    }
    const choose = phone ? site.nook.choosePhone : site.nook.choose;
    const pos = toWorld(choose.pos);
    const look = toWorld(choose.look);
    if (phone) pos.sub(look).multiplyScalar(1.45).add(look);
    const seated = seaTideMix(pos.x, pos.z, look.x - pos.x, look.z - pos.z);
    assert.ok(seated.washCutoff > 2000);
  });
}

test('Tide panning uses the displayed heading and remains centered with no heading', () => {
  const seaward = seaTideMix(8, 9.4, 1, 0);
  const landward = seaTideMix(8, 9.4, -1, 0);
  assert.equal(seaward.pan, -landward.pan);
  assert.ok(Math.abs(seaTideMix(8, 9.4, 10, 0).pan - seaward.pan) < 1e-12);
  assert.equal(seaTideMix(8, 9.4, 0, 0).pan, 0);
});
