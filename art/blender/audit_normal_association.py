"""Independent read-only normal association: corners, triangles and source faces."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils.kdtree import KDTree

parser = argparse.ArgumentParser(description=__doc__)
for flag in ['source', 'prepared', 'out']:
    parser.add_argument('--' + flag, type=Path, required=True)
parser.add_argument('--material', action='append', default=[])
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
materials = set(args.material or ['Snow settled dry grains'])
digest = lambda p: sha256(p.read_bytes()).hexdigest()
inputs = {name: {'path': str(path.resolve()), 'sha256': digest(path)} for name, path in [('source', args.source), ('prepared', args.prepared)]}


def key_position(point):
    return struct.pack('<fff', *(0. if value == 0 else value for value in point))


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()))
    graph = bpy.context.evaluated_depsgraph_get()
    rows, lookup, owners, faces, triangles, transforms = [], {}, defaultdict(set), [], [], []
    geometries = defaultdict(list)
    raw_loops = 0
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.get('one_light_static') or obj.get('one_light_dynamic'):
            continue
        if not any(material and material.name in materials for material in obj.data.materials):
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        matrix = evaluated.matrix_world.copy()
        normal_matrix = matrix.to_3x3().inverted().transposed()
        uv, tint = mesh.uv_layers['UVMap'], mesh.color_attributes.get('SurfaceTint')
        transforms.append({'object': obj.name, 'matrix': [list(row) for row in matrix], 'determinant': matrix.to_3x3().determinant(), 'customNormals': mesh.has_custom_normals})
        loops = {}
        face_ids = {}
        for face in mesh.polygons:
            material = mesh.materials[face.material_index].name
            if material not in materials:
                continue
            fid = len(faces)
            face_ids[face.index] = fid
            indices = []
            for li in face.loop_indices:
                vi = mesh.loops[li].vertex_index
                point = tuple(matrix @ mesh.vertices[vi].co)
                normal = tuple((normal_matrix @ mesh.corner_normals[li].vector).normalized())
                color = tuple(tint.data[li if tint.domain == 'CORNER' else vi].color) if tint else (1., 1., 1., 1.)
                row = (material, point, tuple(uv.data[li].uv), normal, color)
                rid = lookup.get(row)
                if rid is None:
                    rid = len(rows); lookup[row] = rid; rows.append(row)
                loops[li] = rid; indices.append(rid); owners[rid].add(fid); raw_loops += 1
            faces.append({'object': obj.name, 'polygon': face.index, 'smooth': face.use_smooth, 'loops': indices, 'normal': list((normal_matrix @ face.normal).normalized())})
        mesh.calc_loop_triangles()
        for triangle in mesh.loop_triangles:
            if triangle.polygon_index not in face_ids:
                continue
            rids = tuple(loops[li] for li in triangle.loops)
            points = [matrix @ mesh.vertices[vi].co for vi in triangle.vertices]
            cross = (points[1] - points[0]).cross(points[2] - points[0])
            record = {'face': face_ids[triangle.polygon_index], 'corners': rids, 'area': cross.length * .5, 'geometricNormal': tuple(cross.normalized())}
            tid = len(triangles); triangles.append(record)
            # Count exact spatial coincidences separately from shading/UV seams.
            position_key = tuple(sorted(key_position(p) for p in points))
            geometries[position_key].append(tid)
        evaluated.to_mesh_clear()
    row_triangles = defaultdict(set)
    for tid, triangle in enumerate(triangles):
        for rid in triangle['corners']:
            row_triangles[rid].add(tid)
    duplicates = [ids for ids in geometries.values() if len(ids) > 1]
    return {'rows': rows, 'owners': owners, 'faces': faces, 'triangles': triangles, 'rowTriangles': row_triangles, 'rawLoops': raw_loops, 'transforms': transforms,
            'coincidentGeometry': {'groups': len(duplicates), 'trianglesInGroups': sum(map(len, duplicates)), 'extraTriangleMultiplicity': sum(len(ids) - 1 for ids in duplicates), 'groupsWithDistinctParentFaces': sum(len({triangles[tid]['face'] for tid in ids}) > 1 for ids in duplicates)}}


source, prepared = snapshot(args.source), snapshot(args.prepared)
tree = KDTree(len(source['rows']))
for rid, row in enumerate(source['rows']):
    tree.insert(row[1], rid)
tree.balance()
matches = {}
population = Counter()
bins = Counter()
examples = []
maximum = 0.
for rid, row in enumerate(prepared['rows']):
    candidates = []
    for _, sid, distance in tree.find_range(row[1], .000005):
        other = source['rows'][sid]
        if row[0] != other[0] or max(abs(a-b) for a, b in zip(row[2], other[2])) > .000001 or max(abs(a-b) for a, b in zip(row[4], other[4])) > .000001:
            continue
        candidates.append(sid)
    matches[rid] = set(candidates)
    population['uniquePreparedCorners'] += 1
    if not candidates:
        population['noPositionUVTintCandidate'] += 1
        continue
    population['positionUVTintMatched'] += 1
    population['oneCandidate' if len(candidates) == 1 else 'multipleCandidates'] += 1
    distinct_normals = {source['rows'][sid][3] for sid in candidates}
    population['oneDistinctNormal' if len(distinct_normals) == 1 else 'multipleDistinctNormals'] += 1
    deltas = [(max(abs(a-b) for a, b in zip(row[3], source['rows'][sid][3])), sid) for sid in candidates]
    delta, sid = min(deltas)
    maximum = max(maximum, delta)
    bins[next((str(limit) for limit in [1e-6, 1e-4, .001, .01, .1, .5, 1., 2.] if delta <= limit), '>2')] += 1
    if delta > 1e-6:
        population['normalMismatch'] += 1
        population['normalMismatchOneCandidate' if len(candidates) == 1 else 'normalMismatchMultipleCandidates'] += 1
    if delta > .1:
        angle = math.degrees(math.acos(max(-1., min(1., sum(a*b for a, b in zip(row[3], source['rows'][sid][3]))))))
        examples.append({'error': delta, 'angleDegrees': angle, 'candidateCount': len(candidates), 'preparedCorner': {'material': row[0], 'position': row[1], 'UV0': row[2], 'normal': row[3], 'tint': row[4], 'faces': [prepared['faces'][fid] for fid in sorted(prepared['owners'][rid])[:3]]},
                         'closestSourceCorner': {'position': source['rows'][sid][1], 'normal': source['rows'][sid][3], 'faces': [source['faces'][fid] for fid in sorted(source['owners'][sid])[:3]]}})

triangle_population = Counter()
genuine_examples = []
for tid, triangle in enumerate(prepared['triangles']):
    corners = triangle['corners']
    corner_candidates = [matches[rid] for rid in corners]
    triangle_population['preparedTriangles'] += 1
    if not all(corner_candidates):
        triangle_population['missingCornerCandidate'] += 1
        continue
    face_sets = [set().union(*(source['owners'][rid] for rid in candidates)) for candidates in corner_candidates]
    face_candidates = set.intersection(*face_sets)
    triangle_sets = [set().union(*(source['rowTriangles'][rid] for rid in candidates)) for candidates in corner_candidates]
    exact_triangle_candidates = []
    for candidate in set.intersection(*triangle_sets):
        src = source['triangles'][candidate]['corners']
        for rotation in range(3):
            if all(src[(k+rotation) % 3] in corner_candidates[k] for k in range(3)):
                exact_triangle_candidates.append((candidate, rotation))
    if len(exact_triangle_candidates) == 1:
        triangle_population['oneCyclicSourceTriangleAndRotation'] += 1
    elif exact_triangle_candidates:
        triangle_population['ambiguousSourceTriangleOrRotation'] += 1
    elif len(face_candidates) == 1:
        triangle_population['noSameTriangleButOneSourceParentPolygon'] += 1
    else:
        triangle_population['noCyclicTriangleOrUniqueParentPolygon'] += 1
    if len(face_candidates) == 1:
        fid = next(iter(face_candidates)); face = source['faces'][fid]
        triangle_population['oneSourceParentPolygon'] += 1
        triangle_population['oneParentSmooth' if face['smooth'] else 'oneParentFlat'] += 1
        # Parent polygon identity excludes unrelated coincident shading faces.
        error = max(min(max(abs(a-b) for a, b in zip(prepared['rows'][rid][3], source['rows'][sid][3])) for sid in candidates if fid in source['owners'][sid]) for rid, candidates in zip(corners, corner_candidates))
        if error > 1e-6:
            triangle_population['oneParentNormalMismatch'] += 1
        if error > .1:
            triangle_population['oneParentLargeNormalMismatch'] += 1
            triangle_population['oneParentLargeSmooth' if face['smooth'] else 'oneParentLargeFlat'] += 1
            if triangle['area'] > 1e-12:
                triangle_population['oneParentLargeNondegenerate'] += 1
            genuine_examples.append({'error': error, 'preparedTriangle': tid, 'worldAreaM2': triangle['area'], 'preparedGeometricNormal': triangle['geometricNormal'], 'sourceFace': face, 'preparedFace': prepared['faces'][triangle['face']]})

report = {'version': 1, 'inputs': inputs, 'materials': sorted(materials), 'method': 'Independent evaluated world inverse-transpose corner normals; retain source object/polygon provenance. Position≤5µm, UV0/tint≤1e−6 associations ignore normals. Count all candidate populations; then intersect actual source triangle and parent-polygon memberships to distinguish coincidence/diagonal ambiguity.',
          'source': {'uniqueCorners': len(source['rows']), 'polygonLoops': source['rawLoops'], 'polygons': len(source['faces']), 'triangles': len(source['triangles']), 'coincidentGeometry': source['coincidentGeometry'], 'transforms': source['transforms']},
          'prepared': {'uniqueCorners': len(prepared['rows']), 'polygonLoops': prepared['rawLoops'], 'polygons': len(prepared['faces']), 'triangles': len(prepared['triangles']), 'coincidentGeometry': prepared['coincidentGeometry'], 'transforms': prepared['transforms']},
          'preparedToSourceCornerPopulation': dict(population), 'bestCandidateNormalErrorBinsUpperInclusive': dict(bins), 'maximumBestCandidateNormalComponentError': maximum, 'triangleAndParentPopulation': dict(triangle_population),
          'largeCornerExamples': sorted(examples, key=lambda row: -row['error'])[:12], 'largeUniqueParentExamples': sorted(genuine_examples, key=lambda row: -row['error'])[:12],
          'interpretationLimit': 'Reported ambiguity is genuine candidate multiplicity; a minimum-normal matcher can hide mismatches, so it cannot establish a one-to-one corner/face proof. Unique-parent mismatches remain real even when source/prepared tessellation diagonals differ. No render/pixel equivalence claim.',
          'sourceOrPreparedModified': False, 'renderBakeEncoderGpuJobs': 0, 'scriptSha256': digest(Path(__file__))}
for name, path in [('source', args.source), ('prepared', args.prepared)]:
    if digest(path) != inputs[name]['sha256']:
        raise RuntimeError('Frozen input changed.')
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, indent=2) + '\n')
print('NORMAL_ASSOCIATION', json.dumps({'path': str(args.out), 'sha256': digest(args.out), 'corners': dict(population), 'triangles': dict(triangle_population), 'maxError': maximum}), flush=True)
