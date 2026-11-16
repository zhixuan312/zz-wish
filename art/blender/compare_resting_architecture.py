"""Quantify frozen source rebuild differences without changing either scene.

Only the non-prop objects flagged by the resting audit are inspected. Canonical
triangle corners bind position, normal and tint; UV differences are measured in
actual UV units and relative to the source material image dimensions.
"""
import argparse
from array import array
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--audit', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
audit = json.loads(args.audit.read_text())
new_path, old_path = ROOT/audit['source']['path'], ROOT/audit['legacy']['path']
if sha(new_path) != audit['source']['sha256'] or sha(old_path) != audit['legacy']['sha256']:
    raise RuntimeError('Frozen source input changed')
names = audit['geometryComparison']['changedOutsideRegisteredProps']


def packed(values):
    return struct.pack('<'+'f'*len(values), *(0. if x == 0 else x for x in values))


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    graph = bpy.context.evaluated_depsgraph_get()
    result = {}
    for name in names:
        obj = bpy.data.objects[name]
        mesh = obj.data
        base = hashlib.sha256()
        for collection, field, kind, count in [(mesh.vertices,'co','f',len(mesh.vertices)*3),
                                                (mesh.loops,'vertex_index','i',len(mesh.loops)),
                                                (mesh.polygons,'loop_start','i',len(mesh.polygons)),
                                                (mesh.polygons,'loop_total','i',len(mesh.polygons)),
                                                (mesh.uv_layers['UVMap'].data,'uv','f',len(mesh.loops)*2)]:
            values = array(kind,[0])*count
            collection.foreach_get(field,values)
            base.update(values.tobytes())
        base.update(packed([v for row in obj.matrix_world for v in row]))
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph)
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers['UVMap'].data
        tint = mesh.color_attributes.get('SurfaceTint')
        positions = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        buckets = defaultdict(list)
        canonical = []
        zero_area = 0
        for triangle in mesh.loop_triangles:
            corners, uvs = [], []
            for vi,li in zip(triangle.vertices,triangle.loops):
                color = tuple(tint.data[li if tint.domain=='CORNER' else vi].color) if tint else (1.,1.,1.,1.)
                corners.append(packed(tuple(positions[vi])+tuple(mesh.corner_normals[li].vector)+color))
                uvs.append(tuple(uv[li].uv))
            rotations = [b''.join([corners[k],corners[(k+1)%3],corners[(k+2)%3]]) for k in range(3)]
            index = min(range(3),key=lambda k:rotations[k])
            key = rotations[index]
            canonical.append(key)
            a,b,c = [positions[vi] for vi in triangle.vertices]
            area = (b-a).cross(c-a).length*.5
            if area <= 1e-12:
                zero_area += 1
                continue
            values = uvs[index]+uvs[(index+1)%3]+uvs[(index+2)%3]
            buckets[key].append((values,area))
        image_size = max([int(max(node.image.size)) for mat in mesh.materials if mat and mat.use_nodes
                          for node in mat.node_tree.nodes if node.type=='TEX_IMAGE' and node.image]+[0])
        result[name] = {'baseSha256':base.hexdigest(),
                        'canonicalPositionNormalTintSha256':hashlib.sha256(b''.join(sorted(canonical))).hexdigest(),
                        'zeroAreaTriangles':zero_area,'triangles':len(mesh.loop_triangles),
                        'imageMaximumDimension':image_size,'buckets':buckets}
        evaluated.to_mesh_clear()
    return result


old,new = snapshot(old_path),snapshot(new_path)
records = []
for name in names:
    before,after = old[name],new[name]
    maximum = 0.
    changed = 0
    changed_area = 0.
    total_area = 0.
    for key,values in after['buckets'].items():
        choices = before['buckets'].get(key,[]).copy()
        for uv,area in values:
            if not choices:
                raise RuntimeError('Canonical physical triangle mismatch: '+name)
            at = min(range(len(choices)),key=lambda i:max(abs(a-b) for a,b in zip(choices[i][0],uv)))
            previous,_ = choices.pop(at)
            error = max(abs(a-b) for a,b in zip(previous,uv))
            maximum = max(maximum,error)
            total_area += area
            if error:
                changed += 1
                changed_area += area
        if choices:
            raise RuntimeError('Canonical physical triangle multiplicity mismatch: '+name)
    if before['baseSha256'] != after['baseSha256']:
        raise RuntimeError('Unrelated authored geometry/UV/transform changed: '+name)
    if before['canonicalPositionNormalTintSha256'] != after['canonicalPositionNormalTintSha256']:
        raise RuntimeError('Unrelated physical geometry/normal/tint changed: '+name)
    records.append({'object':name,'authoredGeometryUV0TransformExact':True,
                    'evaluatedPositionNormalTintTriangleMultisetsExact':True,
                    'nondegenerateTrianglesWithUVRoundoff':changed,'affectedSurfaceAreaM2':changed_area,
                    'totalInspectedSurfaceAreaM2':total_area,'maxUVComponentDifference':maximum,
                    'actualMaterialMaximumImageDimension':after['imageMaximumDimension'],
                    'maxDifferenceInSourceTexels':maximum*after['imageMaximumDimension'],
                    'zeroAreaTrianglesBefore':before['zeroAreaTriangles'],
                    'zeroAreaTrianglesAfter':after['zeroAreaTriangles']})
report = {'source':audit['source'],'legacy':{k:audit['legacy'][k] for k in ['path','sha256']},
          'contactAuditSha256':sha(args.audit),'scope':'Frozen read-only modifier/UV comparison; no render/bake/encoder or source edits.',
          'objects':records,'allFlaggedAuthoredAndPhysicalGeometryNormalTintExact':True,
          'maximumUVComponentDifference':max([r['maxUVComponentDifference'] for r in records]+[0]),
          'maximumDifferenceInActualSourceTexels':max([r['maxDifferenceInSourceTexels'] for r in records]+[0]),
          'scriptSha256':sha(Path(__file__))}
if sha(new_path)!=audit['source']['sha256'] or sha(old_path)!=audit['legacy']['sha256']:
    raise RuntimeError('Frozen source input changed during comparison')
args.out = args.out.resolve()
if not args.out.is_relative_to(ROOT) or args.out.exists():
    raise RuntimeError('New repository report required')
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(json.dumps(report,indent=2)+'\n')
print('RESTING_ARCHITECTURE_COMPARISON_PASS',json.dumps({'out':str(args.out),'sha256':sha(args.out),
      'objects':len(records),'maxUV':report['maximumUVComponentDifference'],
      'maxActualSourceTexels':report['maximumDifferenceInActualSourceTexels']}),flush=True)
