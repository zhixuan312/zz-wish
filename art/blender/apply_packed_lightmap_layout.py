"""Apply packed UV2 only to an immutable, already certified prepared mesh.

No source/modifier evaluation, physical mesh, material UV, normal or anchor edit.
Fresh contact, mapping, overlap, visible-density and GI checks remain required.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake_export import receiver_profile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--layout', action='append', required=True,
                    help='region=input.json=packed.json')
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = Path(__file__).resolve().parents[2]
if args.out.exists() or not args.out.resolve().is_relative_to(root / 'art/build'):
    raise RuntimeError('New ignored output directory required')
digest = lambda p: sha256(p.read_bytes()).hexdigest()
inputs = {'prepared': {'path': str(args.prepared), 'sha256': digest(args.prepared)}}
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene = bpy.context.scene
regions = {o['lightmap_region']: o for o in scene.objects
           if o.type == 'MESH' and o.get('one_light_static') and not o.get('one_light_dynamic')}
before = {r: receiver_profile(o) for r, o in regions.items()}
rows = {}
for specification in args.layout:
    region, input_name, packed_name = specification.split('=')
    input_path, packed_path = Path(input_name), Path(packed_name)
    inputs[region] = {name: {'path': str(p), 'sha256': digest(p)}
                      for name, p in [('input', input_path), ('packed', packed_path)]}
    data, packed = json.loads(input_path.read_text()), json.loads(packed_path.read_text())
    obj = regions[region]
    mesh = obj.data
    mesh.calc_loop_triangles()
    excluded, zero = (mesh.attributes.get(n) for n in ['one_light_uv_excluded', 'one_light_uv_zero_area'])
    triangles = [t for t in mesh.loop_triangles
                 if not (excluded and excluded.data[t.polygon_index].value or
                         zero and zero.data[t.polygon_index].value)]
    references = [v for t in triangles for v in t.vertices]
    if references != data['sourceVertexReferences']:
        raise RuntimeError('Actual source vertex references/winding differ: ' + region)
    owners = mesh.attributes['one_light_source_chart_owner']
    if [owners.data[t.polygon_index].value for t in triangles] != data['faceOwners']:
        raise RuntimeError('Actual source ownership differs: ' + region)
    pending = {}
    for t in triangles:
        pending.setdefault(tuple(sorted(t.vertices)), []).append((tuple(t.vertices), tuple(t.loops), t.polygon_index))
    uv, chart = mesh.uv_layers['Lightmap'], mesh.attributes['one_light_uv_chart']
    for start in range(0, len(packed['indices']), 3):
        corners = [packed['vertices'][i] for i in packed['indices'][start:start+3]]
        key = tuple(sorted(c[0] for c in corners))
        if not pending.get(key):
            raise RuntimeError('Packed triangle correspondence lost: ' + region)
        original, loops, polygon = pending[key].pop()
        ids = {c[3] for c in corners}
        if len(ids) != 1:
            raise RuntimeError('Packed triangle crosses chart IDs')
        chart.data[polygon].value = next(iter(ids)) + 1
        for vertex, u, v, chart_id in corners:
            uv.data[loops[original.index(vertex)]].uv = (u, v)
    if any(pending.values()):
        raise RuntimeError('Packed result omitted actual triangles')
    obj['one_light_unwrap_report'] = json.dumps(packed['report'])
    rows[region] = {'triangles': len(triangles), 'packingReport': packed['report']}
after = {r: receiver_profile(o) for r, o in regions.items()}
for region in regions:
    if before[region]['fieldSha256'] != after[region]['fieldSha256']:
        raise RuntimeError('Non-lightmap field bytes changed: ' + region)
for key in ['one_light_prepared_preview_audit', 'one_light_prepared_contact_audit_binding']:
    if key in scene:
        del scene[key]
scene['one_light_uv_reallocation'] = json.dumps({'policy': __doc__, 'inputs': inputs})
args.out.mkdir(parents=True)
target = args.out / 'input.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target.resolve()))
if digest(args.prepared) != inputs['prepared']['sha256']:
    raise RuntimeError('Frozen prepared input changed')
report = {'scope': __doc__, 'inputs': inputs, 'regions': rows,
          'allNonLightmapFieldBytesExact': True,
          'output': {'path': str(target), 'sha256': digest(target)},
          'scriptSha256': digest(Path(__file__)), 'renderBakeGpuJobs': 0}
(args.out / 'uv-transfer.json').write_text(json.dumps(report, indent=2) + '\n')
print('PACKED_UV2_TRANSFER_PASS', digest(args.out / 'uv-transfer.json'), flush=True)
