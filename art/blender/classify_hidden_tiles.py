"""Classify whole roof-tile components permanently occluded by closed snow.

This opens the source blend read-only and writes proof JSON only. No geometry is
removed, no UVs are changed and no render is performed. Run with Blender Python:
  blender -b --python art/blender/classify_hidden_tiles.py -- \
    --source-blend art/build/snow-roof-stable.blend \
    --output art/build/snow-roof-hidden-tiles.json
The baker independently enforces the recorded source blend SHA before using it.
"""
import bpy,math,json,time,hashlib,argparse,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo_root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-blend',type=Path,default=repo_root/'art/build/snow-roof-stable.blend')
parser.add_argument('--output',type=Path,default=repo_root/'art/build/snow-roof-hidden-tiles.json')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
start=time.time();path=args.source_blend.resolve();bpy.ops.wm.open_mainfile(filepath=str(path))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('one_light_static')]
def tree(obj):return BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],[list(p.vertices) for p in obj.data.polygons],all_triangles=False)
snows=[(o,tree(o)) for o in objects if 'curved settled snow cap' in o.name and o.get('snow_volume_closed')]
parts=[o for o in objects if 'concave pan tile rows' in o.name or 'convex cover tile rows' in o.name]
direction=Vector((.913,.371,.167)).normalized()
def inside(pt,bvh,margin=.02):
 hit,normal,_,_=bvh.ray_cast(pt,direction,1000)
 if hit is None or normal.dot(direction)<=0:return False,0
 near=bvh.find_nearest(pt)
 return near[3]>=margin,near[3]
def compact(indices):
 indices=sorted(indices);runs=[]
 for i in indices:
  if runs and i==runs[-1][1]+1:runs[-1][1]=i
  else:runs.append([i,i])
 return runs
report={'source':str(path),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rule':'Only whole connected tile components enclosed by an opaque closed roof-snow volume, all vertex/mid-edge/face-center samples at least20mm inside, and no BVH-overlap pairs with the snow boundary. Full render/bake geometry is retained; this only identifies potential UV allocation exclusions.','parts':[],'representativeCameraRayChecks':{}}
for obj in parts:
 mesh=obj.data;parent=list(range(len(mesh.vertices)))
 def root(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for edge in mesh.edges:
  a,b=map(root,edge.vertices)
  if a!=b:parent[a]=b
 groups={}
 for polygon in mesh.polygons:groups.setdefault(root(polygon.vertices[0]),[]).append(polygon.index)
 row={'object':obj.name,'region':obj.get('region'),'material':[m.name for m in mesh.materials],'components':len(groups),'polygons':len(mesh.polygons),'safeComponents':[],'excludedPolygonRanges':[],'excludedPolygons':0,'excludedArea':0,'totalArea':sum(p.area for p in mesh.polygons),'rejected':{'outsideOrClearance':0,'boundaryOverlap':0}}
 excluded=[]
 for fi in groups.values():
  ids=sorted(set(v for f in fi for v in mesh.polygons[f].vertices));verts=[obj.matrix_world@mesh.vertices[i].co for i in ids]
  center=sum(verts,Vector())/len(verts);candidate=[]
  for snow,bvh in snows:
   ok,dist=inside(center,bvh)
   if ok:candidate.append((snow,bvh))
  accepted=None;minimum=999
  for snow,bvh in candidate:
   samples=list(verts)
   for f in fi:
    poly=mesh.polygons[f];pv=[obj.matrix_world@mesh.vertices[i].co for i in poly.vertices]
    samples.append(sum(pv,Vector())/len(pv))
    samples.extend((pv[i]+pv[(i+1)%len(pv)])/2 for i in range(len(pv)))
   results=[inside(p,bvh) for p in samples]
   if not all(r[0] for r in results):continue
   # Rejection by an overlap query is conservative even if BVH returns broad-phase pairs.
   remap={v:i for i,v in enumerate(ids)}
   component=BVHTree.FromPolygons(verts,[[remap[v] for v in mesh.polygons[f].vertices] for f in fi],all_triangles=False)
   if component.overlap(bvh):
    row['rejected']['boundaryOverlap']+=1;continue
   accepted=snow;minimum=min(r[1] for r in results);break
  if accepted is None:
   row['rejected']['outsideOrClearance']+=1;continue
  area=sum(mesh.polygons[f].area for f in fi);excluded.extend(fi);row['excludedArea']+=area
  bbox=[[min(p[k] for p in verts) for k in range(3)],[max(p[k] for p in verts) for k in range(3)]]
  item={'snowVolume':accepted.name,'polygonRanges':compact(fi),'minimumBoundaryDistance':minimum,'worldBlenderBounds':bbox,'center':list(center),'area':area}
  row['safeComponents'].append(item)
  # A closed opaque snow hit before the tile center demonstrates occlusion from each source camera.
  for camera in [o for o in bpy.context.scene.objects if o.type=='CAMERA' and (o.name.startswith('Reference_') or o.name in ['EaveDetail','RoofRidgeDetail'])]:
   delta=center-camera.location;distance=delta.length;ray=delta.normalized();checks=report['representativeCameraRayChecks'].setdefault(camera.name,{'samples':0,'snowBlocksRay':0})
   checks['samples']+=1
   if any(bvh.ray_cast(camera.location,ray,max(0,distance-.01))[0] is not None for _,bvh in snows):checks['snowBlocksRay']+=1
 row['excludedPolygonRanges']=compact(excluded);row['excludedPolygons']=len(excluded)
 report['parts'].append(row)
 print('PART',obj.name,'components',row['components'],'safe',len(row['safeComponents']),'faces',len(excluded),'area',round(row['excludedArea'],3),flush=True)
report['seconds']=time.time()-start
report['summary']={region:{'components':sum(r['components'] for r in report['parts'] if r['region']==region),'safeComponents':sum(len(r['safeComponents']) for r in report['parts'] if r['region']==region),'polygons':sum(r['polygons'] for r in report['parts'] if r['region']==region),'excludedPolygons':sum(r['excludedPolygons'] for r in report['parts'] if r['region']==region),'excludedArea':sum(r['excludedArea'] for r in report['parts'] if r['region']==region)} for region in ['hall','court','gate']}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(report,indent=2)+'\n')
print('HIDDEN_SUMMARY',json.dumps(report['summary']),round(report['seconds'],2),flush=True)
