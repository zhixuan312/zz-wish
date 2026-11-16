"""Read-only prepared FACE-flag reference for exact raw glTF correspondence.

blender -b --python-exit-code 1 --python art/blender/export_hidden_reference.py -- \
  --prepared-blend art/build/snow-roof-final/snow-roof-prepared.blend \
  --source-blend art/build/snow-roof-stair-banks-grain.blend \
  --proof art/blender/proofs/snow-roof-final-hidden-tiles.json \
  --out art/build/snow-roof-final/hidden-export-reference

No geometry, UV, material, light, source file or render settings are changed.
Each binary record is three lexicographically sorted float32 XYZ vertices in
glTF mesh-local Y-up coordinates (36 bytes). Signed zero is normalized only
for the correspondence key; the model is never edited.
"""
import argparse
import hashlib
import json
import struct
import sys
from array import array
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared-blend', type=Path, required=True)
parser.add_argument('--source-blend', type=Path, required=True)
parser.add_argument('--proof', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.out = args.out.resolve()
if not args.out.is_relative_to((ROOT / 'art/build').resolve()):
    raise RuntimeError('Reference output must remain under ignored art/build.')
if (args.out / 'reference.json').exists():
    raise RuntimeError('Reference already exists; use a new output directory.')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


inputs = {key: {'path': str(path.resolve()), 'sha256': sha(path)}
          for key, path in [('prepared', args.prepared_blend),
                            ('source', args.source_blend), ('proof', args.proof)]}
proof = json.loads(args.proof.read_text())
if proof['sourceSha256'] != inputs['source']['sha256']:
    raise RuntimeError('Proof does not bind the actual authored source.')
bpy.ops.wm.open_mainfile(filepath=str(args.prepared_blend.resolve()))
binding = json.loads(bpy.context.scene.get('one_light_source_binding', '{}'))
if binding.get('sha256') != inputs['source']['sha256']:
    raise RuntimeError('Prepared scene does not bind the actual authored source.')
args.out.mkdir(parents=True, exist_ok=True)
report = {'inputs': inputs, 'sourceBinding': binding, 'regions': {},
          'coordinateRule': 'Blender mesh-local (x,y,z) -> glTF (x,z,-y).',
          'renderOrBakePerformed': False}
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.get('one_light_static'):
        continue
    region = obj.get('lightmap_region')
    if region not in ['hall', 'court', 'gate'] or region in report['regions']:
        raise RuntimeError('Expected exactly one static prepared mesh per region.')
    mesh = obj.data
    mesh.calc_loop_triangles()
    flags = mesh.attributes.get('one_light_uv_excluded')
    if not flags or flags.domain != 'FACE':
        raise RuntimeError('Missing prepared source FACE flags: ' + region)
    path = args.out / (region + '.bin')
    count = 0
    materials = {}
    with path.open('xb') as out:
        for triangle in mesh.loop_triangles:
            if not flags.data[triangle.polygon_index].value:
                continue
            rows = []
            for index in triangle.vertices:
                p = mesh.vertices[index].co
                values = [p.x, p.z, -p.y]
                rows.append(struct.pack('<fff', *[0.0 if value == 0 else value for value in values]))
            out.write(b''.join(sorted(rows)))
            count += 1
            name = mesh.materials[mesh.polygons[triangle.polygon_index].material_index].name
            materials[name] = materials.get(name, 0) + 1
    generated = mesh.attributes.get('one_light_source_generated')
    if not generated or generated.domain != 'POINT' or generated.data_type != 'FLOAT_VECTOR':
        raise RuntimeError('Missing preserved source Generated coordinates.')
    values = array('f', [0]) * (len(generated.data) * 3)
    generated.data.foreach_get('vector', values)
    report['regions'][region] = {
        'object': obj.name, 'sourceVertices': len(mesh.vertices),
        'sourceTriangles': len(mesh.loop_triangles),
        'hiddenTriangles': count, 'materials': materials,
        'binary': path.name, 'binarySha256': sha(path),
        'matrixWorldBlender': [list(row) for row in obj.matrix_world],
        'generatedAttribute': {'name': generated.name, 'domain': generated.domain,
                               'type': generated.data_type, 'vertices': len(generated.data),
                               'sha256': hashlib.sha256(values.tobytes()).hexdigest()},
    }
if set(report['regions']) != {'hall', 'court', 'gate'}:
    raise RuntimeError('Incomplete region reference.')
for key, path in [('prepared', args.prepared_blend), ('source', args.source_blend), ('proof', args.proof)]:
    if sha(path) != inputs[key]['sha256']:
        raise RuntimeError('Input changed while producing the read-only reference.')
(args.out / 'reference.json').write_text(json.dumps(report, indent=2) + '\n')
print('HIDDEN_FACE_REFERENCE_READY', json.dumps(report), flush=True)
