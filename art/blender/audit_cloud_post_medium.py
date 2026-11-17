"""Read-only interval proof for the actual source posts/camera-to-post volume."""
import bpy
import hashlib
import json
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
audit_path, out = Path(args[0]), Path(args[1])
audit = json.loads(audit_path.read_text())
source = Path(bpy.data.filepath)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
if digest(source) != audit['source']['sha256']:
    raise RuntimeError('Actual immutable source/audit binding required.')
scene = bpy.context.scene
contract = json.loads(scene['cloud_cliff_live_clouds'])
views = json.loads(scene['cloud_cliff_cover_views'])
deps = bpy.context.evaluated_depsgraph_get()
rows, points = [], []
for support in audit['structuralSupports']:
    obj = scene.objects[support['post']].evaluated_get(deps)
    mesh = obj.to_mesh()
    world = [obj.matrix_world @ v.co for v in mesh.vertices]
    values = [[float(p.x), float(p.z), float(-p.y)] for p in world]
    obj.to_mesh_clear()
    points.extend(values)
    rows.append({'name': support['post'], 'vertices': len(values),
                 'boundsEngine': {'min': [min(p[a] for p in values) for a in range(3)],
                                  'max': [max(p[a] for p in values) for a in range(3)]}})
for view in views.values():
    position = view.get('position', view.get('pos'))
    if position:
        points.append(position)
# The convex prism contains every point on every actual camera→post segment.
# A100mm camera/rounding margin exceeds the supported small cover drift.
low = [min(p[a] for p in points) - .1 for a in range(3)]
high = [max(p[a] for p in points) + .1 for a in range(3)]
warp = contract['domainWarp']['sampleOffsetBounds']
intersections = []
for bank in contract['banks']:
    lo = [bank['centre'][a] - bank['radii'][a] - warp['max'][a] for a in range(3)]
    hi = [bank['centre'][a] + bank['radii'][a] - warp['min'][a] for a in range(3)]
    if all(lo[a] <= high[a] and hi[a] >= low[a] for a in range(3)):
        intersections.append(bank['id'])
b = contract['substrate']
nearest = [max(low[a], min(high[a], b['centre'][a])) for a in range(3)]
minimum_q2 = sum(((nearest[a] - b['centre'][a]) / b['radii'][a]) ** 2 for a in range(3))
result = {'source': audit['source'], 'sourceAudit': {'path': str(audit_path), 'sha256': digest(audit_path)},
          'posts': rows, 'postCount': len(rows), 'sourceViews': views,
          'cameraToAllPostsConvexPrism': {'min': low, 'max': high, 'marginMetres': .1},
          'intersectingAllTimeExpandedChildSupports': intersections,
          'substrateMinimumQuadraticRadius': minimum_q2,
          'allCameraToPostSegmentsCertifiedEmpty': not intersections and minimum_q2 > 1,
          'method': 'Actual evaluated source post vertices and actual source camera origins. Every camera→post segment is contained in the convex prism; all-time expanded child supports are disjoint and the minimum substrate quadratic radius is outside1. No sampled-visibility proof.',
          'limit': 'This does not close I11. If empty, depth-correct compositing removes the false cut but cannot create physical multi-metre cloud extinction around these source posts. That requires a later explicit source/optical decision.',
          'renderBakeGpuJobs': 0, 'sourceUnchanged': digest(source) == audit['source']['sha256']}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2) + '\n')
print('POST_MEDIUM_AUDIT', json.dumps({'posts': len(rows), 'empty': result['allCameraToPostSegmentsCertifiedEmpty'], 'q2': minimum_q2, 'path': str(out)}), flush=True)
