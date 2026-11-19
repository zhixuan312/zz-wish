import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import * as THREE from 'three';
import createPineGate from '../../web/src/engine/places/pine-gate-baked.js';
import { readPinePreview } from './pine-preview-delivery.mjs';

function measureApproachUpperClearance(forest) {
  const V3 = (...coordinates) => new THREE.Vector3(...coordinates);
  const place = createPineGate({ THREE, V3 });
  const profiles = [['desktop', false, 2.45], ['phone', true, 1]];
  return Object.fromEntries(profiles.map(([label, phone, aspect]) => {
    const start = phone ? place.viewPhone : place.view;
    const choose = phone ? place.nook.choosePhone : place.nook.choose;
    const end = { pos: choose.pos.clone().add(place.nook.at.pos), look: choose.look.clone().add(place.nook.at.pos), fov: choose.fov };
    const walk = place.createWalk(start, end, phone);
    const rig = { pos: V3(), look: V3() };
    const camera = new THREE.PerspectiveCamera(start.fov, aspect, .05, 1000);
    const clearance = new Map(forest.plates.map(plate => [plate.z, Infinity]));
    const ray = V3();
    // Check the changed portion of the sweep. The forest is hidden within 6.5 m.
    for (let tick = 0; tick <= 240; tick++) {
      walk(tick * .05 / place.walkSeconds, rig);
      camera.position.copy(rig.pos);
      camera.lookAt(rig.look);
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const plate of forest.plates) {
        const depth = rig.pos.z - plate.z;
        if (depth <= 6.5) continue;
        for (const x of [-1, 1]) {
          ray.set(x, 1, .5).unproject(camera).sub(rig.pos);
          const upperRay = rig.pos.y - depth * ray.y / ray.z;
          const margin = plate.planeY + plate.planeHeight * .5 - upperRay;
          assert(margin > plate.planeHeight * .012, `${label} forest plate ${plate.file.uri} exposes its upper fade at ${tick * .05} s.`);
          clearance.set(plate.z, Math.min(margin, clearance.get(plate.z)));
        }
      }
    }
    return [label, Object.fromEntries([...clearance].filter(([, margin]) => Number.isFinite(margin)))];
  }));
}

const [candidate, sha] = process.argv.slice(2);
assert(candidate && sha, 'Supply the candidate directory and expected manifest SHA-256.');
const { approachForest } = await readPinePreview(process.cwd(), resolve(candidate), sha);
assert(approachForest, 'The preview must contain approach forest plates.');
console.log(JSON.stringify(measureApproachUpperClearance(approachForest)));
