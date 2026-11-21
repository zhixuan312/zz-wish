import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { bambooEave, bambooNook } from '../../../web/src/bamboo-rain-shelter.ts';
import { bambooRainMix } from '../../../web/src/bamboo-rain-sound.ts';
import { bambooRainCameras, WALK_SECONDS } from '../../../web/src/engine/places/bamboo-rain-camera.js';

const V3 = (x, y, z) => new Vector3(x, y, z);
const nook = { pos: V3(bambooNook.x, bambooNook.y, bambooNook.z), ry: bambooNook.ry };
const cameras = bambooRainCameras(V3, nook);
const lipX = bambooNook.x + bambooEave.eaveZ;
const at = (x, z = bambooNook.z) => bambooRainMix(x, z, 0, -1);

function mixAtPose(pos, look) {
  return bambooRainMix(pos.x, pos.z, look.x - pos.x, look.z - pos.z);
}

test('rain changes smoothly across the finite roof footprint', () => {
  const exposed = at(lipX + .66);
  const edge = at(lipX);
  const covered = at(lipX - .65);
  expect(exposed).toMatchObject({ shelter: 0, outdoor: 1, overhead: 0, drips: 0 });
  expect(edge.shelter).toBeCloseTo(.5, 10);
  expect(covered.shelter).toBeCloseTo(1, 10);
  expect(covered.outdoor).toBeLessThan(edge.outdoor);
  expect(covered.outdoorCutoff).toBeLessThan(edge.outdoorCutoff);
  expect(covered.overhead).toBeGreaterThan(edge.overhead);
  expect(covered.drips).toBeGreaterThan(0);
  expect(at(lipX - 1, bambooNook.z - bambooEave.start + .66).shelter).toBe(0);
  expect(at(lipX - 1, bambooNook.z - bambooEave.end - .66).shelter).toBe(0);
  expect(bambooRainMix(lipX - .65, bambooNook.z, 0, 1).dripPan).toBeCloseTo(-covered.dripPan, 10);
});

for (const phone of [false, true]) {
  const viewport = phone ? 'phone' : 'desktop';
  const toWorld = p => p.clone().applyAxisAngle(V3(0, 1, 0), nook.ry).add(nook.pos);
  const worldPose = ({ pos, look, fov }) => ({ pos: toWorld(pos), look: toWorld(look), fov });
  const entrance = phone ? cameras.viewPhone : cameras.view;
  const reveal = worldPose(phone ? cameras.widePhone : cameras.wide);
  const seat = worldPose(phone ? cameras.choosePhone : cameras.choose);

  test(`${viewport} rain follows the real roof crossing and stays audible at the Skip endpoint`, () => {
    const walk = cameras.createWalk(entrance, reveal, phone);
    const rig = { pos: V3(0, 0, 0), look: V3(0, 0, 0), fov: 0, amp: 0 };
    const samples = [];
    for (let frame = 0; frame <= WALK_SECONDS * 60; frame++) {
      walk(frame / (WALK_SECONDS * 60), rig);
      samples.push({ x: rig.pos.x, ...mixAtPose(rig.pos, rig.look) });
    }
    expect(samples[0].shelter).toBe(0);
    const middle = samples.findIndex(sample => sample.shelter >= .5);
    expect(middle / 60).toBeGreaterThan(25);
    expect(middle / 60).toBeLessThan(26);
    expect(samples[middle].x).toBeCloseTo(lipX, 1);
    expect(samples.at(-1).shelter).toBeCloseTo(1, 10);
    expect(Math.max(...samples.slice(1).map((sample, i) => Math.abs(sample.shelter - samples[i].shelter)))).toBeLessThan(.03);
    const arrive = cameras.createArrival(reveal, seat);
    arrive(1, rig);
    const arrival = mixAtPose(rig.pos, rig.look), skipped = mixAtPose(seat.pos, seat.look);
    expect(arrival.shelter).toBeCloseTo(1, 10);
    expect(arrival.drips).toBeGreaterThan(.1);
    expect(arrival.drips).toBeCloseTo(skipped.drips, 10);
    expect(arrival.dripPan).toBeCloseTo(skipped.dripPan, 10);
  });
}
