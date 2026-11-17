"""Reduce UV2 cap depth only on actual downward-facing floor-paver polygons.

This is a copied-input packing study. Physical arrays and material UV0 are not
presently edited. Each affected cap remains unique and joined to the same real
body edge. All overlap, coverage, contact and normal gates remain required.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(',', ':')).encode()).hexdigest()


def triangle_area_twice(values):
    a = values[:, 1] - values[:, 0]
    b = values[:, 2] - values[:, 0]
    return a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]


def intersection_area(a, b):
    """Continuous triangle intersection; shared edges have zero area."""
    polygon = list(a)
    orientation = 1 if triangle_area_twice(b[None])[0] > 0 else -1
    for i in range(3):
        start, end = b[i], b[(i + 1) % 3]
        edge = end - start
        def side(p):
            d = p - start
            return orientation * (edge[0] * d[1] - edge[1] * d[0])
        clipped = []
        for j, p in enumerate(polygon):
            q = polygon[(j + 1) % len(polygon)]
            sp, sq = side(p), side(q)
            if sp >= 0:
                clipped.append(p)
            if (sp > 0 and sq < 0) or (sp < 0 and sq > 0):
                clipped.append(p + (q - p) * sp / (sp - sq))
        polygon = clipped
        if len(polygon) < 3:
            return 0.
    p = np.asarray(polygon)
    return abs(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1))) * .5


def refine(data, sources, factor=.1, structure_ratio=1., column_ratio=1.):
    if not 0 < factor <= 1 or not data.get('packAuthoredCharts'):
        raise ValueError('Positive authored-chart scale required')
    names = {record['owner']: name for name, record in sources.items()
             if record['region'] == 'hall'}
    owners = np.asarray(data['faceOwners'])
    points = np.asarray(data['positions'], dtype=np.float64).reshape(-1, 3, 3)
    uv = np.asarray(data['vertexUvs'], dtype=np.float64).reshape(-1, 3, 2)
    references = np.asarray(data['sourceVertexReferences']).reshape(-1, 3)
    frozen = {key: digest(value) for key, value in data.items() if key != 'vertexUvs'}
    rows = []
    for owner in np.unique(owners):
        name = names[int(owner)]
        if not name.startswith('Settled irregular paving stone'):
            continue
        triangles = np.flatnonzero(owners == owner)
        p = points[triangles]
        cross = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
        lengths = np.linalg.norm(cross, axis=1)
        normal_z = cross[:, 2] / np.maximum(lengths, 1e-30)
        middle_height = (p[:, :, 2].min() + p[:, :, 2].max()) * .5
        cap = triangles[(normal_z < -.995) & (lengths > 1e-12) &
                        (p[:, :, 2].mean(axis=1) < middle_height)]
        if len(cap) == 0:
            continue
        cap_set = set(map(int, cap))
        edges = {}
        for triangle in triangles:
            for c in range(3):
                d = (c + 1) % 3
                key = tuple(sorted((int(references[triangle, j]),
                                    np.asarray(uv[triangle, j], dtype=np.float32).tobytes())
                                   for j in (c, d)))
                edges.setdefault(key, []).append((int(triangle), c, d))
        joined_edges = []
        for values in edges.values():
            inside = [v for v in values if v[0] in cap_set]
            outside = [v for v in values if v[0] not in cap_set]
            if len(inside) == 1 and len(outside) == 1:
                triangle, c, d = inside[0]
                joined_edges.append((uv[triangle, c].copy(), uv[triangle, d].copy()))
        if len(joined_edges) != 1:
            rows.append({'object': name, 'changed': False,
                         'reason': 'Cap does not have exactly one real joined UV edge',
                         'joinedEdges': len(joined_edges)})
            continue
        a, b = joined_edges[0]
        direction = b - a
        direction /= np.linalg.norm(direction)
        perpendicular = np.array([-direction[1], direction[0]])
        original = uv[cap].copy()
        delta = original - a
        proposed = a + (delta @ direction)[:, :, None] * direction + \
            factor * (delta @ perpendicular)[:, :, None] * perpendicular
        proposed = proposed.astype(np.float32).astype(np.float64)
        old_area = triangle_area_twice(original)
        new_area = triangle_area_twice(proposed)
        if np.any(old_area * new_area <= 0) or np.any(np.abs(new_area) * .5 < 1e-6):
            raise RuntimeError(f'{name}: downward cap folds or collapses')
        # Shared body vertices must remain bit-exact in the packing input.
        edge_ids = []
        for triangle in cap:
            for c in range(3):
                if np.array_equal(uv[triangle, c], a) or np.array_equal(uv[triangle, c], b):
                    edge_ids.append((int(triangle), c))
        for triangle, c in edge_ids:
            local = int(np.flatnonzero(cap == triangle)[0])
            proposed[local, c] = uv[triangle, c]
        new_area = triangle_area_twice(proposed)
        if np.any(old_area * new_area <= 0) or np.any(np.abs(new_area) * .5 < 1e-6):
            raise RuntimeError(f'{name}: fixed-edge cap folds or collapses')
        # Positive winding alone does not prevent a compressed cap extending
        # across another part of an irregular body's UV boundary. Reject that
        # owner's refinement by continuous intersection, before pixel packing.
        collisions = []
        outside = [ti for ti in triangles if ti not in cap_set]
        for local, ti in enumerate(cap):
            candidate = proposed[local]
            for other in outside:
                target = uv[other]
                if np.any(candidate.max(axis=0) < target.min(axis=0)) or np.any(target.max(axis=0) < candidate.min(axis=0)):
                    continue
                area_after = intersection_area(candidate, target)
                if area_after > 1e-6:
                    area_before = intersection_area(original[local], target)
                    if area_after > area_before + 1e-6:
                        collisions.append({'capTriangle': int(ti), 'bodyTriangle': int(other),
                                           'intersectionAreaBefore': area_before, 'intersectionAreaAfter': area_after})
        if collisions:
            rows.append({'object': name, 'changed': False,
                         'reason': 'Continuous cap/body UV intersection would increase',
                         'rejectedIntersections': collisions})
            continue
        uv[cap] = proposed
        rows.append({'object': name, 'changed': True, 'owner': int(owner),
                     'triangles': len(cap), 'worldAreaSquareMetres': float(lengths[np.isin(triangles, cap)].sum() * .5),
                     'originalUVArea': float(np.abs(old_area).sum() * .5),
                     'newUVArea': float(np.abs(new_area).sum() * .5),
                     'capNormalZMaximum': float(normal_z[np.isin(triangles, cap)].max()),
                     'depthFactor': factor, 'joinedPhysicalEdgePreserved': True})
    structure = []
    if structure_ratio <= 0 or column_ratio <= 0:
        raise ValueError('Positive structure ratio required')
    if structure_ratio != 1:
        for owner in np.unique(owners):
            name = names[int(owner)]
            if any(word in name.lower() for word in
                   ['beam', 'bracket', 'brace', 'purlin', 'rafter', 'tenon', 'column']):
                uv[owners == owner] = (uv[owners == owner] * structure_ratio).astype(np.float32)
                structure.append({'object': name, 'linearUVRatio': structure_ratio})
    if column_ratio != 1:
        for owner in np.unique(owners):
            name = names[int(owner)]
            if 'column' in name.lower():
                uv[owners == owner] = (uv[owners == owner] * column_ratio).astype(np.float32)
                structure.append({'object': name, 'additionalColumnLinearUVRatio': column_ratio})
    data['vertexUvs'] = uv.reshape(-1).tolist()
    for key, value in frozen.items():
        if digest(data[key]) != value:
            raise RuntimeError(f'Non-UV packing array changed: {key}')
    changed = [row for row in rows if row['changed']]
    return {'scope': __doc__, 'changedOwners': len(changed),
            'changedTriangles': sum(row['triangles'] for row in changed),
            'downwardWorldAreaSquareMetres': sum(row['worldAreaSquareMetres'] for row in changed),
            'originalAffectedUVArea': sum(row['originalUVArea'] for row in changed),
            'newAffectedUVArea': sum(row['newUVArea'] for row in changed),
            'nonUVPackingArraysExact': True, 'owners': rows,
            'structurePriorityRebalance': structure}


def refine_outer_snow(data, sources, outer_slope):
    """Retain the entire inner13m allocation; reduce remote blank snow only."""
    if not 0 < outer_slope <= .15 or not data.get('packAuthoredCharts'):
        raise ValueError('A positive outer slope no larger than the original .15 is required')
    record = sources['Continuous snowfield footprints and stair-edge drifts']
    if record['region'] != 'court':
        raise RuntimeError('Actual continuous snowfield owner is not in court')
    owners = np.asarray(data['faceOwners'])
    points = np.asarray(data['positions'], dtype=np.float64).reshape(-1, 3, 3)
    uv = np.asarray(data['vertexUvs'], dtype=np.float64).reshape(-1, 3, 2)
    frozen = {key: digest(value) for key, value in data.items() if key != 'vertexUvs'}
    mask = owners == record['owner']
    x = points[mask, :, 0].reshape(-1)
    targets = uv[mask].reshape(-1, 2)
    edges = [-13, -8, -2.5, 2.5, 8, 13]
    old_slopes = [.15, .6, .25, 1, .25, .6, .15]
    new_slopes = [outer_slope, .6, .25, 1, .25, .6, outer_slope]

    def warp(values, slopes):
        result = slopes[0] * values
        for edge, before, after in zip(edges, slopes, slopes[1:]):
            result += (after - before) * np.maximum(0, values - edge)
        zero = sum((after - before) * max(0, -edge)
                   for edge, before, after in zip(edges, slopes, slopes[1:]))
        return result - zero

    old_x = warp(x, old_slopes)
    fit = np.linalg.lstsq(np.column_stack((old_x, np.ones(len(x)))), targets[:, 0], rcond=None)[0]
    error = float(np.max(np.abs(targets[:, 0] - (fit[0] * old_x + fit[1]))))
    if error > .001 or fit[0] <= 0:
        raise RuntimeError('Input is not the actual original monotonic snow UV2 warp')
    proposed = targets.copy()
    proposed[:, 0] = fit[0] * warp(x, new_slopes) + fit[1]
    proposed = proposed.reshape(-1, 3, 2).astype(np.float32).astype(np.float64)
    old_area = triangle_area_twice(uv[mask])
    new_area = triangle_area_twice(proposed)
    if np.any(old_area * new_area <= 0) or np.any(np.abs(new_area) * .5 < 1e-6):
        raise RuntimeError('Remote snow allocation folds or collapses actual triangles')
    uv[mask] = proposed
    data['vertexUvs'] = uv.reshape(-1).tolist()
    for key, value in frozen.items():
        if digest(data[key]) != value:
            raise RuntimeError(f'Non-UV packing array changed: {key}')
    return {'scope': refine_outer_snow.__doc__, 'owner': record['owner'],
            'oldPositiveXSlopes': old_slopes, 'newPositiveXSlopes': new_slopes,
            'edges': edges, 'innerDerivativePreservedThroughAbsoluteXMetres': 13,
            'allZAllocationPreserved': True, 'oldWarpFitMaximumError': error,
            'affectedUVAreaBefore': float(np.abs(old_area).sum() * .5),
            'affectedUVAreaAfter': float(np.abs(new_area).sum() * .5),
            'nonUVPackingArraysExact': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--normal-audit', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--factor', type=float, default=.1)
    parser.add_argument('--structure-ratio', type=float, default=1.)
    parser.add_argument('--column-ratio', type=float, default=1.)
    parser.add_argument('--snow-outer-slope', type=float)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    source = Path(args.input)
    target = Path(args.output)
    if target.exists():
        raise RuntimeError('A new copied-input output path is required')
    data = json.loads(source.read_text())
    audit = json.loads(Path(args.normal_audit).read_text())
    report = refine_outer_snow(data, audit['sources'], args.snow_outer_slope) \
        if args.snow_outer_slope is not None else \
        refine(data, audit['sources'], args.factor, args.structure_ratio, args.column_ratio)
    report['input'] = {'path': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    report['normalAudit'] = {'path': args.normal_audit,
                             'sha256': hashlib.sha256(Path(args.normal_audit).read_bytes()).hexdigest()}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, separators=(',', ':')))
    report['output'] = {'path': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    report['scriptSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    Path(str(target) + '.refinement.json').write_text(json.dumps(report, indent=2) + '\n')
    print('UV_REFINEMENT_READY', json.dumps({key: value for key, value in report.items()
                                           if key not in {'owners', 'structurePriorityRebalance'}}))
