"""Read-only, source-bound refinement of the accepted closed-snow tile proof.

Only independently enclosed ORIGINAL tile polygons may be added. Physical source
and bake occluders remain intact. A triangle/snow-boundary separation test covers
the entire polygon, rather than inferring clearance from its bounding box.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import closest_point_on_tri

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-blend', type=Path, required=True)
parser.add_argument('--base-proof', type=Path, required=True)
parser.add_argument('--source-audit', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_hash, base_hash = sha(args.source_blend), sha(args.base_proof)
base = json.loads(args.base_proof.read_text())
audit = json.loads(args.source_audit.read_text())
if source_hash != base['sourceSha256'] or source_hash != audit['source']['sha256'] or not audit['contactAudit']['passed']:
    raise RuntimeError('Actual passing source/base/contact binding required')
if args.output.exists() or not args.output.resolve().is_relative_to(ROOT / 'art/build'):
    raise RuntimeError('New ignored proof path required')
bpy.ops.wm.open_mainfile(filepath=str(args.source_blend.resolve()))
started = time.time()
certified_margin = .020
margin = certified_margin + .00005  # Conservative allowance for Blender FLOAT32 vector arithmetic.
directions = [Vector(v).normalized() for v in [( .913, .371, .167), (-.231, .803, .549), (.513, -.277, .812)]]


def segment_distance2(p1, q1, p2, q2):
    d1, d2, r = q1-p1, q2-p2, p1-p2
    a, e, f = d1.dot(d1), d2.dot(d2), d2.dot(r)
    if a <= 1e-24 and e <= 1e-24:
        return r.length_squared
    if a <= 1e-24:
        s, t = 0., min(1., max(0., f/e))
    else:
        c = d1.dot(r)
        if e <= 1e-24:
            t, s = 0., min(1., max(0., -c/a))
        else:
            b = d1.dot(d2)
            denominator = a*e-b*b
            s = min(1., max(0., (b*f-c*e)/denominator)) if denominator > 1e-24 else 0.
            t = (b*s+f)/e
            if t < 0:
                t, s = 0., min(1., max(0., -c/a))
            elif t > 1:
                t, s = 1., min(1., max(0., (b-c)/a))
    return (r+d1*s-d2*t).length_squared


def triangle_distance2(a, b):
    best = min([(p-closest_point_on_tri(p, *b)).length_squared for p in a] + [(p-closest_point_on_tri(p, *a)).length_squared for p in b])
    if best < margin*margin:
        return best
    for i in range(3):
        for j in range(3):
            best = min(best, segment_distance2(a[i], a[(i+1)%3], b[j], b[(j+1)%3]))
            if best < margin*margin:
                return best
    return best


caps = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or not obj.get('snow_volume_closed') or 'curved settled snow cap' not in obj.name:
        continue
    if obj.modifiers:
        raise RuntimeError('Explicit evaluated correspondence required for a modified snow volume')
    if obj.hide_render or not obj.visible_camera:
        raise RuntimeError('The enclosing snow must actually render')
    for material in obj.data.materials:
        outputs=[n for n in material.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output]
        shaders=[link.from_node for n in outputs for link in n.inputs['Surface'].links]
        if len(shaders)!=1 or shaders[0].type!='BSDF_PRINCIPLED' or shaders[0].inputs['Alpha'].default_value!=1 or shaders[0].inputs['Alpha'].is_linked or shaders[0].inputs['Transmission Weight'].default_value!=0 or shaders[0].inputs['Transmission Weight'].is_linked:
            raise RuntimeError('The enclosing source snow must have a direct opaque nontransmissive surface')
    mesh = obj.data
    edges = {}
    for poly in mesh.polygons:
        ids = list(poly.vertices)
        for a, b in zip(ids, ids[1:]+ids[:1]):
            k = tuple(sorted((a,b)))
            edges.setdefault(k, []).append((a,b))
    if any(len(v) != 2 or v[0] != tuple(reversed(v[1])) for v in edges.values()):
        raise RuntimeError('Snow certificate requires a closed consistently oriented manifold: '+obj.name)
    mesh.calc_loop_triangles()
    points = [obj.matrix_world@v.co for v in mesh.vertices]
    triangles = [[points[i] for i in t.vertices] for t in mesh.loop_triangles]
    signed_volume = sum(t[0].dot(t[1].cross(t[2])) for t in triangles)/6
    if signed_volume <= 0:
        raise RuntimeError('Snow boundary must be oriented outward')
    coordinates = np.array([[list(p) for p in t] for t in triangles])
    bvh = BVHTree.FromPolygons(points, [list(t.vertices) for t in mesh.loop_triangles], all_triangles=True)
    caps.append({'name':obj.name,'bvh':bvh,'triangles':triangles,'lo':coordinates.min(axis=1),'hi':coordinates.max(axis=1),'region':obj.get('region'),'pointCache':{},'volume':signed_volume})


def inside_with_margin(point, cap):
    key = tuple(point)
    if key in cap['pointCache']:
        return cap['pointCache'][key]
    near = cap['bvh'].find_nearest(point)
    passed = bool(near[0] is not None and near[3] >= margin)
    if passed:
        for d in directions:
            hit, normal, _, _ = cap['bvh'].ray_cast(point, d, 1000)
            if hit is None or normal.dot(d) <= 1e-6:
                passed = False
                break
    cap['pointCache'][key] = passed
    return passed


registered = {n for g in audit['contactAudit']['groups'] for n in g['members']+g['supports']}
report = json.loads(json.dumps(base))
report['baseProof'] = {'path':str(args.base_proof),'sha256':base_hash}
report['sourceContactAudit'] = {'path':str(args.source_audit),'sha256':sha(args.source_audit),'all47GroupsPassed':len(audit['contactAudit']['groups'])==47 and audit['contactAudit']['passed']}
report['classificationUnit'] = 'Original unmodified tile polygons. safeComponents is a compatibility container; new entries are individual polygons, not connected components.'
report['rule'] = 'Base accepted whole-component certificates are retained. Additional original tile polygons require all vertex/mid-edge/center points >=20.05mm inside one closed consistently outward opaque snow cap in3independent first-exit rays; no polygon triangle intersects its boundary; vertex-face and edge-edge triangle distances are >=20.05mm for every boundary triangle with an expanded-AABB proximity candidate, conservatively certifying20mm with50micrometres arithmetic allowance. All visible and uncertified geometry remains. Physical source/bake occluders remain intact.'
report['addedSummary'] = {}
for row in report['parts']:
    obj = bpy.data.objects[row['object']]
    if obj.name in registered or obj.modifiers:
        raise RuntimeError('Roof candidates must be unmodified and disjoint from contact inventory')
    mesh = obj.data
    mesh.calc_loop_triangles()
    points = [obj.matrix_world@v.co for v in mesh.vertices]
    triangles = [[points[i] for i in t.vertices] for t in mesh.loop_triangles]
    tree = BVHTree.FromPolygons(points,[list(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
    face_triangles = {}
    for index,t in enumerate(mesh.loop_triangles):
        face_triangles.setdefault(t.polygon_index,[]).append(index)
    excluded = {i for a,b in row['excludedPolygonRanges'] for i in range(a,b+1)}
    original_count = len(excluded)
    intersecting = {cap['name']:{mesh.loop_triangles[i].polygon_index for i,j in tree.overlap(cap['bvh'])} for cap in caps}
    added_area, added_triangles, minimum = 0.,0,None
    for poly in mesh.polygons:
        if poly.index in excluded:
            continue
        vertices = [points[i] for i in poly.vertices]
        samples = vertices+[sum(vertices,Vector())/len(vertices)]+[(vertices[i]+vertices[(i+1)%len(vertices)])/2 for i in range(len(vertices))]
        for cap in caps:
            if poly.index in intersecting[cap['name']] or not all(inside_with_margin(p,cap) for p in samples):
                continue
            passed, clearance = True, certified_margin
            for ti in face_triangles[poly.index]:
                tri = triangles[ti]
                xyz = np.array([list(p) for p in tri])
                candidates = np.flatnonzero(np.all(cap['lo'] <= xyz.max(axis=0)+margin,axis=1)&np.all(cap['hi'] >= xyz.min(axis=0)-margin,axis=1))
                for ci in candidates:
                    distance2 = triangle_distance2(tri,cap['triangles'][ci])
                    if distance2 < margin*margin:
                        passed = False
                        break
                if not passed:
                    break
            if not passed:
                continue
            excluded.add(poly.index)
            area = poly.area
            row['safeComponents'].append({'unit':'independently certified original polygon','snowVolume':cap['name'],'polygonRanges':[[poly.index,poly.index]],'minimumBoundaryDistance':clearance,'clearanceMeaning':'Conservative entire triangle/boundary separation lower bound, not sampled minimum','area':area})
            added_area += area
            added_triangles += len(face_triangles[poly.index])
            minimum = clearance if minimum is None else min(minimum,clearance)
            break
    indices = sorted(excluded)
    ranges = []
    for i in indices:
        if ranges and i==ranges[-1][1]+1:
            ranges[-1][1]=i
        else:
            ranges.append([i,i])
    row['excludedPolygonRanges'],row['excludedPolygons'] = ranges,len(excluded)
    row['excludedArea'] += added_area
    row['addedIndividualPolygons'] = len(excluded)-original_count
    row['addedIndividualTriangles'] = added_triangles
    row['addedWholeTriangleClearanceLowerBoundMetres'] = minimum
    s = report['addedSummary'].setdefault(row['region'],{'polygons':0,'triangles':0,'area':0.})
    s['polygons'] += len(excluded)-original_count
    s['triangles'] += added_triangles
    s['area'] += added_area
    print('REFINED_PART',obj.name,'additionalPolygons',len(excluded)-original_count,'additionalTriangles',added_triangles,flush=True)
for region,s in report['summary'].items():
    selected = [r for r in report['parts'] if r['region']==region]
    s['excludedPolygons'] = sum(r['excludedPolygons'] for r in selected)
    s['excludedArea'] = sum(r['excludedArea'] for r in selected)
report['sourceAndAllContactArchitectureMaterialNormalUVDataUnmodified'] = True
report['boundaryChecks'] = [{'object':c['name'],'closedConsistentlyOutwardManifold':True,'signedVolume':c['volume']} for c in caps]
report['seconds'] = time.time()-started
report['scriptSha256'] = sha(Path(__file__))
if sha(args.source_blend)!=source_hash or sha(args.base_proof)!=base_hash:
    raise RuntimeError('Immutable input changed')
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(report,indent=2)+'\n')
print('HIDDEN_FACE_REFINEMENT_READY',sha(args.output),report['addedSummary'],report['seconds'],flush=True)
