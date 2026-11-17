"""Read-only source-bound FACE reference for any named prepared atlas regions.

The original Snow three-region/Generated reference remains historical. This
recipe permits a real zero-exclusion region and records Generated only when it
actually exists. It changes no geometry, coordinates, UVs or source file.
"""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared-blend', type=Path, required=True)
parser.add_argument('--source-blend', type=Path, required=True)
parser.add_argument('--proof', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.out = args.out.resolve()
if not args.out.is_relative_to(ROOT / 'art/build') or args.out.exists():
    raise RuntimeError('Use a new separate ignored art/build output directory.')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
inputs = {name: {'path': str(path.resolve()), 'sha256': sha(path)} for name, path in
          [('prepared', args.prepared_blend), ('source', args.source_blend), ('proof', args.proof)]}
proof = json.loads(args.proof.read_text())
if proof['sourceSha256'] != inputs['source']['sha256']:
    raise RuntimeError('Proof does not bind the actual authored source.')
bpy.ops.wm.open_mainfile(filepath=str(args.source_blend.resolve()))
expected = {}
source_regions = {obj.get('lightmap_region', obj.get('region')) for obj in bpy.context.scene.objects
                  if obj.type == 'MESH' and obj.get('one_light_static') and not obj.get('one_light_dynamic')}
for part in proof['parts']:
    obj = bpy.data.objects.get(part['object'])
    if obj is None or obj.type != 'MESH' or obj.modifiers:
        raise RuntimeError('Proof source component is missing or modified: ' + part['object'])
    region = obj.get('lightmap_region', obj.get('region'))
    faces = {index for component in part['safeComponents'] for low, high in component['polygonRanges']
             for index in range(low, high + 1)}
    if len(faces) != part['excludedPolygons'] or any(i >= len(obj.data.polygons) for i in faces):
        raise RuntimeError('Proof polygon ranges do not match actual source.')
    obj.data.calc_loop_triangles()
    expected[region] = expected.get(region, 0) + sum(t.polygon_index in faces for t in obj.data.loop_triangles)
bpy.ops.wm.open_mainfile(filepath=str(args.prepared_blend.resolve()))
binding = json.loads(bpy.context.scene.get('one_light_source_binding', '{}'))
if binding.get('sha256') != inputs['source']['sha256']:
    raise RuntimeError('Prepared scene does not bind the actual source.')
args.out.mkdir(parents=True)
report = {'inputs': inputs, 'sourceBinding': binding, 'regions': {},
          'coordinateRule': 'Blender mesh-local (x,y,z) -> glTF (x,z,-y).',
          'sourceRegionNames': sorted(source_regions), 'expectedSourceHiddenTriangles': expected,
          'renderOrBakePerformed': False, 'modelOrSourceModified': False}
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.get('one_light_static') or obj.get('one_light_dynamic'):
        continue
    region = obj.get('lightmap_region')
    if region not in source_regions or region in report['regions']:
        raise RuntimeError('Expected exactly one prepared receiver per actual named source region.')
    mesh = obj.data
    mesh.calc_loop_triangles()
    flags = mesh.attributes.get('one_light_uv_excluded')
    if flags is not None and flags.domain != 'FACE':
        raise RuntimeError('Exclusion attribute has the wrong domain.')
    if expected.get(region, 0) and flags is None:
        raise RuntimeError('Missing actual prepared FACE flags: ' + region)
    path = args.out / (region + '.bin')
    count = 0
    materials = {}
    with path.open('xb') as output:
        for triangle in mesh.loop_triangles:
            if flags is None or not flags.data[triangle.polygon_index].value:
                continue
            corners = []
            for index in triangle.vertices:
                p = mesh.vertices[index].co
                corners.append(struct.pack('<fff', *[0.0 if value == 0 else value for value in (p.x, p.z, -p.y)]))
            output.write(b''.join(sorted(corners)))
            count += 1
            name = mesh.materials[mesh.polygons[triangle.polygon_index].material_index].name
            materials[name] = materials.get(name, 0) + 1
    if count != expected.get(region, 0):
        raise RuntimeError('Prepared FACE triangle multiplicity differs from actual source proof: ' + region)
    generated = mesh.attributes.get('one_light_source_generated')
    generated_record = None
    if generated is not None:
        if generated.domain != 'POINT' or generated.data_type != 'FLOAT_VECTOR':
            raise RuntimeError('Existing Generated attribute has the wrong schema.')
        values = array('f', [0]) * (len(generated.data) * 3)
        generated.data.foreach_get('vector', values)
        generated_record = {'name': generated.name, 'domain': generated.domain, 'type': generated.data_type,
                            'vertices': len(generated.data), 'sha256': hashlib.sha256(values.tobytes()).hexdigest()}
    report['regions'][region] = {'object': obj.name, 'sourceVertices': len(mesh.vertices),
                                 'sourceTriangles': len(mesh.loop_triangles), 'hiddenTriangles': count,
                                 'materials': materials, 'binary': path.name, 'binarySha256': sha(path),
                                 'matrixWorldBlender': [list(row) for row in obj.matrix_world],
                                 'generatedAttribute': generated_record}
if set(report['regions']) != source_regions:
    raise RuntimeError('Incomplete named-region reference.')
for name, path in [('prepared', args.prepared_blend), ('source', args.source_blend), ('proof', args.proof)]:
    if sha(path) != inputs[name]['sha256']:
        raise RuntimeError('Input changed during read-only proof construction.')
report['scriptSha256'] = sha(Path(__file__))
output = args.out / 'reference.json'
output.write_text(json.dumps(report, indent=2) + '\n')
print('HIDDEN_FACE_REFERENCE_READY', str(output), sha(output), expected, flush=True)
