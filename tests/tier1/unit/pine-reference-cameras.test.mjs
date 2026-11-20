import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import path from '../../../shared/pine-gate-path.json' with { type: 'json' };

// The Blender authoring script places its reference cameras by indexing the same route the runtime
// walks. When a duplicate waypoint was removed the script kept the old index and the build failed with
// IndexError; the camera that was lost is the route's last waypoint. This reads the source as text
// because the camera block only runs inside Blender.
test('every reference camera indexes a waypoint that exists', () => {
  const source = readFileSync(join(import.meta.dirname, '../../../art/blender/pine_gate.py'), 'utf8');
  // The indices are the literals in the loop tuple the camera block iterates; the lookup itself uses
  // the loop variable.
  const loop = source.match(/for name, index in \((.*)\):/);
  assert.ok(loop, 'the script must place cameras from the route');
  const indices = [...loop[1].matchAll(/'\w+',\s*(-?\d+)/g)].map((match) => Number(match[1]));
  assert.ok(indices.length > 0, 'the camera loop must name waypoint indices');
  const count = path.waypoints.length;
  for (const index of indices) {
    if (index < 0) {
      assert.ok(-index <= count, `negative index ${index} must reach into ${count} waypoints`);
    } else {
      assert.ok(index < count, `waypoint index ${index} must be under ${count}`);
    }
  }
  // The shoulder camera is the route's end, named without pinning a count.
  assert.ok(indices.includes(-1), 'the shoulder camera reads the route end by -1');
});
