"""Read-only replay of source contact ownership on actual prepared triangles.

Copy a frozen prepared blend before running. No source or prepared file is saved,
and no rendering/baking/encoding occurs. Actual support triangle geometry, not
source bounds or cached contact heights, supplies every measured height.
"""
import argparse
from collections import defaultdict
from itertools import chain
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from bake_export import receiver_profile
from contact_fingerprints import dynamic_profiles
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-audit',type=Path,required=True)
parser.add_argument('--prepared',type=Path,required=True)
parser.add_argument('--raw',type=Path,help='Optional frozen, uncompressed raw GLB: independently replay the actual exported triangles too.')
parser.add_argument('--extra-raw',type=Path,action='append',default=[],help='Additional actual HERO raw GLB; repeat for every separately exported dynamic hero.')
parser.add_argument('--out',type=Path,required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
sha = lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def key(p):return struct.pack('<fff',*(0. if x==0 else x for x in p))
def engine(p):return [float(p.x),float(p.z),float(-p.y)]
source_audit=json.loads(args.source_audit.read_text())
if source_audit['contactAudit'].get('passed') is not True:
 raise RuntimeError('A genuine passing source contact audit is required')
if (source_audit['contactAudit'].get('gapLimitMetres')!=.002 or
    source_audit['contactAudit'].get('penetrationLimitMetres')!=.005):
 raise RuntimeError('Source contact guards must retain the literal 2mm/5mm limits')
source=ROOT/source_audit['source']['path']
if sha(source)!=source_audit['source']['sha256']:raise RuntimeError('Actual source changed')
prepared_hash=sha(args.prepared)
groups=source_audit['contactAudit']['groups']
bpy.ops.wm.open_mainfile(filepath=str(source))
default_fields=['static_lamp_wicks_engine','static_incense_tips_engine','static_incense_smoke_engine','static_incense_smoke_source']
metadata_fields=source_audit.get('anchorMetadataFields') or json.loads(bpy.context.scene.get('one_light_anchor_fields',json.dumps(default_fields)))
metadata={name:bpy.context.scene[name] for name in metadata_fields}
if source_audit.get('anchorMetadata') and metadata!=source_audit['anchorMetadata']:raise RuntimeError('Actual source anchor fields differ from source audit')
heroes=source_audit.get('heroes',[])
wick_records=list(source_audit.get('wicks',[]))+[{'name':h['id'],'wickObject':h['wickObject'],'wickTip':h['wickTip']} for h in heroes]
hanging_pairs=source_audit.get('hangingContactAudit',{}).get('pairs',[])
extra_names={row['wickObject'] for row in wick_records}|{name for pair in hanging_pairs for name in pair['members']}
names=sorted({name for g in groups for name in g['members']+g['supports'] if bpy.data.objects[name].type=='MESH'}|extra_names)
source_dynamic,source_dynamic_hash=dynamic_profiles(bpy.context.scene)
anchor_nodes={}
for hero in heroes:
 for name,expected in [(hero['rootObject'],hero['hangingPivot']),(hero['pointObject'],hero['lampBasis']['position'])]:
  actual=engine(bpy.data.objects[name].matrix_world.translation)
  if max(abs(a-b) for a,b in zip(actual,expected))>.000005:raise RuntimeError('Actual source HERO point/pivot differs: '+name)
  anchor_nodes[name]={'actualSourceEngine':actual,'metadataEngine':expected,'objectType':bpy.data.objects[name].type}
for wick in source_audit.get('wicks',[]):
 name=wick['pointLightObject'];anchor_nodes[name]={'actualSourceEngine':engine(bpy.data.objects[name].matrix_world.translation),'metadataEngine':wick['pointLight'],'objectType':'LIGHT'}
owners=defaultdict(set);source_points={};point_locations={}
graph=bpy.context.evaluated_depsgraph_get()
for name in names:
 obj=bpy.data.objects[name];evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph)
 points=[evaluated.matrix_world@v.co for v in mesh.vertices];source_points[name]={key(p) for p in points}
 for p in points:owners[key(p)].add(name);point_locations[key(p)]=p
 evaluated.to_mesh_clear()
point_keys=list(point_locations);kd=KDTree(len(point_keys))
for i,k in enumerate(point_keys):kd.insert(point_locations[k],i)
kd.balance()
bpy.ops.wm.open_mainfile(filepath=str(args.prepared))
binding=json.loads(bpy.context.scene.get('one_light_source_binding','{}'))
if binding.get('sha256')!=source_audit['source']['sha256']:
 raise RuntimeError('Prepared binding does not identify the actual audited source')
receiver_profiles={}
geometry_hash=hashlib.sha256()
for obj in sorted([o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('one_light_static')],key=lambda o:o.get('lightmap_region','')):
 region=obj.get('lightmap_region')
 if not region or region in receiver_profiles:raise RuntimeError('Expected one prepared receiver per region')
 profile=receiver_profile(obj);receiver_profiles[region]=profile
 geometry_hash.update(region.encode());geometry_hash.update(profile['receiverFingerprint'].encode());geometry_hash.update(profile['lightmapUVFingerprint'].encode())
for name,value in metadata.items():
 if bpy.context.scene.get(name)!=value:raise RuntimeError('Prepared source anchor metadata changed: '+name)
prepared_dynamic,prepared_dynamic_hash=dynamic_profiles(bpy.context.scene)
if prepared_dynamic!=source_dynamic:raise RuntimeError('Actual evaluated prepared HERO geometry/UV/normal/tint differs from source')
prepared_anchor_nodes=[]
for name,row in anchor_nodes.items():
 actual=engine(bpy.data.objects[name].matrix_world.translation);error=max(abs(a-b) for a,b in zip(actual,row['metadataEngine']))
 prepared_anchor_nodes.append({'object':name,**row,'actualPreparedEngine':actual,'maximumCoordinateErrorMetres':error,'passed':error<=.000005})
if not all(r['passed'] for r in prepared_anchor_nodes):raise RuntimeError('Prepared point/pivot anchor differs from actual source')
tol=.000005
def prepared_meshes():
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH' or not (obj.get('one_light_static') or obj.get('one_light_dynamic')):continue
  if obj.get('one_light_dynamic'):
   graph=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);matrix=evaluated.matrix_world
  else:mesh=obj.data;matrix=obj.matrix_world
  mesh.calc_loop_triangles();vertices=[matrix@v.co for v in mesh.vertices];triangles=[tuple(t.vertices) for t in mesh.loop_triangles]
  if obj.get('one_light_dynamic'):evaluated.to_mesh_clear()
  yield vertices,triangles

raw_node_records=defaultdict(list)
def raw_meshes(path):
 """Decode original FLOAT32 GLB vertices; never import/requantize a candidate."""
 data=path.read_bytes()
 if data[:4]!=b'glTF' or struct.unpack_from('<I',data,4)[0]!=2:raise RuntimeError('Expected GLB2')
 if struct.unpack_from('<I',data,8)[0]!=len(data):raise RuntimeError('Truncated raw GLB')
 cursor=12;document=None;binary=None
 while cursor<len(data):
  size,kind=struct.unpack_from('<II',data,cursor);chunk=data[cursor+8:cursor+8+size];cursor+=8+size
  if kind==0x4e4f534a:document=json.loads(chunk)
  elif kind==0x004e4942:binary=chunk
 if document is None or binary is None:raise RuntimeError('GLB JSON/BIN missing')
 scene=document['scenes'][document.get('scene',0)]
 extras=scene.get('extras',{})
 for name,value in metadata.items():
  if extras.get(name)!=value:raise RuntimeError('Raw source anchor metadata changed: '+name)
 if json.loads(extras.get('one_light_source_binding','{}')).get('sha256')!=source_audit['source']['sha256']:
  raise RuntimeError('Raw binding does not identify the audited source')
 def accessor(index):
  a=document['accessors'][index]
  if a.get('sparse') or a.get('normalized'):raise RuntimeError('Expected original nonnormalized raw accessor')
  view=document['bufferViews'][a['bufferView']]
  if view.get('buffer',0)!=0 or view.get('extensions',{}).get('EXT_meshopt_compression'):raise RuntimeError('Expected uncompressed embedded raw accessor')
  types={5121:'B',5123:'H',5125:'I',5126:'f'};widths={'SCALAR':1,'VEC3':3}
  code=types[a['componentType']];width=widths[a['type']];size=struct.calcsize('<'+code*width)
  stride=view.get('byteStride',size);offset=view.get('byteOffset',0)+a.get('byteOffset',0)
  values=[struct.unpack_from('<'+code*width,binary,offset+i*stride) for i in range(a['count'])]
  return a,values
 def matrix(node):
  if 'matrix' in node:return Matrix([node['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
  q=node.get('rotation',[0,0,0,1]);r=Quaternion((q[3],q[0],q[1],q[2]))
  return Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),r,Vector(node.get('scale',[1,1,1])))
 def visit(index,parent):
  node=document['nodes'][index];world=parent@matrix(node)
  if node.get('name') in anchor_nodes:raw_node_records[node['name']].append({'path':str(path),'positionEngine':list(world.translation)})
  if 'mesh' in node:
   for primitive in document['meshes'][node['mesh']]['primitives']:
    if primitive.get('mode',4)!=4:raise RuntimeError('Expected raw triangle primitive')
    a,values=accessor(primitive['attributes']['POSITION'])
    if a['componentType']!=5126:raise RuntimeError('Raw POSITION must retain authored FLOAT32')
    vertices=[]
    for value in values:
     p=world@Vector(value);vertices.append(Vector((p.x,-p.z,p.y)))
    _,indices=accessor(primitive['indices'])
    flat=[x[0] for x in indices]
    if len(flat)%3:raise RuntimeError('Nontriangular raw index count')
    yield vertices,[tuple(flat[i:i+3]) for i in range(0,len(flat),3)]
  for child in node.get('children',[]):yield from visit(child,world)
 for node in scene['nodes']:yield from visit(node,Matrix.Identity(4))

def associate_geometry(meshes,label):
 actual_points=defaultdict(list);actual_faces=defaultdict(list);coverage=defaultdict(set)
 exact=fallback=0;maximum_match=0.
 for world,triangles in meshes:
  membership=[]
  for p in world:
   k=key(p);partnames=owners.get(k)
   if partnames:
    exact+=1;reference_keys=[k]
   else:
    near=kd.find_range(p,tol);partnames=set();reference_keys=[]
    for co,i,distance in near:
     reference_key=point_keys[i];partnames.update(owners[reference_key]);reference_keys.append(reference_key);maximum_match=max(maximum_match,float(distance))
    if partnames:fallback+=1
   membership.append(partnames or set())
   for name in partnames or []:
    actual_points[name].append(p)
    coverage[name].update(reference_key for reference_key in reference_keys if name in owners[reference_key])
  for triangle in triangles:
   candidate=set.intersection(*(membership[i] for i in triangle))
   if not candidate:continue
   points=[world[i] for i in triangle]
   if (points[1]-points[0]).cross(points[2]-points[0]).length<1e-12:continue
   for name in candidate:actual_faces[name].append(points)
 missing={name:len(source_points[name]-coverage[name]) for name in names if source_points[name]-coverage[name]}
 if missing:raise RuntimeError('Unassociated '+label+' source vertices: '+json.dumps(missing))
 association={'method':'Actual evaluated source world-vertex membership; exact FLOAT32 keys first, native KD association≤5µm only where necessary. BVHs use actual '+label+' triangles.','exactPreparedVertices':exact,'toleranceAssociatedVertices':fallback,'maximumAssociationErrorMetres':maximum_match,'missingSourceVertices':missing}
 return actual_points,actual_faces,association

def measure_geometry(meshes,label):
 actual_points,actual_faces,association=associate_geometry(meshes,label)
 trees={}
 def support_tree(names):
  k=tuple(names)
  if k not in trees:
   points=[];faces=[];faceowners=[]
   for name in names:
    for triangle in actual_faces[name]:
     i=len(points);points.extend(triangle);faces.append((i,i+1,i+2));faceowners.append(name)
   if not faces:raise RuntimeError('No actual prepared support triangles')
   trees[k]=(BVHTree.FromPolygons(points,faces,all_triangles=True),faceowners)
  return trees[k]
 records=[]
 for group in groups:
  if group['mode']!='resting':
   tree,faceowners=support_tree(group['supports']);points=[p for name in group['members'] for p in actual_points.get(name,[])];mounts=[]
   for probe in group['mountProbes']:
    p=probe['startEngine'];d=probe['directionEngine'];start=Vector((p[0],-p[2],p[1]));direction=Vector((d[0],-d[2],d[1])).normalized();hit,normal,index,distance=tree.ray_cast(start,direction,2)
    near=[p for p in points if abs(p.x-start.x)<.025 and abs(p.z-start.z)<.025]
    if hit is None or not near:raise RuntimeError('Actual prepared mounted support geometry missing')
    embedding=max((p-start).dot(direction) for p in near)-distance
    mounts.append({'supportObject':faceowners[index],'supportPointEngine':engine(hit),'actualFastenerEmbeddingMetres':float(embedding),'passed':embedding>=.001})
   records.append({'name':group['name'],'mode':group['mode'],'passed':all(row['passed'] for row in mounts),'mountedSupportChecks':mounts,'measuredGapMetres':None,'maximumPenetrationMetres':None,'restingLimitApplicable':False});continue
  points=[(name,p) for name in group['members'] for p in actual_points.get(name,[])];minimum=min(p.z for name,p in points)
  tree,faceowners=support_tree(group['supports']);low=[];allhits=[]
  for name,p in points:
   hit,normal,index,distance=tree.ray_cast(Vector((p.x,p.y,50)),Vector((0,0,-1)),100)
   if hit is None:continue
   row={'member':name,'pointEngine':engine(p),'supportPointEngine':engine(hit),'supportObject':faceowners[index],'gapMetres':float(p.z-hit.z)};allhits.append(row)
   if p.z<=minimum+.00005:low.append(row)
  if not low:raise RuntimeError('Prepared lowest bearing set has no support: '+group['name'])
  contact=min(low,key=lambda r:r['gapMetres']);worst=min(allhits,key=lambda r:r['gapMetres']);penetration=max(0.,-worst['gapMetres']);passed=contact['gapMetres']<=.002 and penetration<=.005
  records.append({'name':group['name'],'mode':'resting','passed':passed,'contact':contact,'measuredGapMetres':contact['gapMetres'],'maximumPenetrationMetres':penetration,'worstPenetrationContact':worst,'sourceContactGapMetres':group['final']['contact']['gapMetres'],'sourceMaximumPenetrationMetres':group['final']['maximumPenetrationMetres']})
 def crown(name):
  # glTF splits one spatial vertex across UV/normal/material seams. Count each
  # actual coordinate once, so storage multiplicity cannot move the centroid.
  points=list({key(p):p for p in actual_points[name]}.values())
  top=max(p.z for p in points);c=[p for p in points if abs(p.z-top)<.000001]
  return sum(c,Vector())/len(c)
 anchors=[]
 for wick in wick_records:
  tip=engine(crown(wick['wickObject']));error=max(abs(a-b) for a,b in zip(tip,wick['wickTip']));anchors.append({'name':wick['name'],'sourceObject':wick['wickObject'],'actualPreparedWickTip':tip,'sourceMetadataWickTip':wick['wickTip'],'maximumCoordinateErrorMetres':error,'passed':error<=tol})
 incense=[]
 for row in source_audit.get('incenseTips',[]):
  tip=engine(crown(row['object']));error=max(abs(a-b) for a,b in zip(tip,row['tipEngine']));incense.append({'sourceObject':row['object'],'actualPreparedTip':tip,'sourceMetadataTip':row['tipEngine'],'maximumCoordinateErrorMetres':error,'passed':error<=tol})
 suspended=[]
 for pair in hanging_pairs:
  left,right=pair['members'];tree,_=support_tree([right]);samples=list(actual_points[left])
  samples.extend(sum(triangle,Vector())/3 for triangle in actual_faces[left])
  distance=min(tree.find_nearest(p)[3] for p in samples)
  suspended.append({'members':[left,right],'nearestActualTriangleSurfaceMetres':float(distance),'limitMetres':.002,'passed':distance<=.002})
 return {'association':association,'groups':records,'wickTips':anchors,'incenseTips':incense,'hangingPairs':suspended,'passed':all(r['passed'] for r in records+anchors+incense+suspended)}

prepared_result=measure_geometry(prepared_meshes(),'prepared')
raw_hash=sha(args.raw) if args.raw else None
if args.extra_raw and not args.raw:raise RuntimeError('--extra-raw also requires the actual static --raw input')
extra_raw_hashes=[{'path':str(p),'sha256':sha(p)} for p in args.extra_raw]
raw_result=measure_geometry(chain.from_iterable(raw_meshes(p) for p in [args.raw]+args.extra_raw),'raw') if args.raw else None
raw_anchor_nodes=[]
if raw_result is not None:
 for name,row in anchor_nodes.items():
  if row['objectType']=='LIGHT':continue
  found=raw_node_records.get(name,[])
  if len(found)!=1:raise RuntimeError('Actual raw HERO pivot absent or duplicated: '+name)
  error=max(abs(a-b) for a,b in zip(found[0]['positionEngine'],row['metadataEngine']))
  raw_anchor_nodes.append({'object':name,**found[0],'metadataEngine':row['metadataEngine'],'maximumCoordinateErrorMetres':error,'passed':error<=tol})
 raw_result['passed']=raw_result['passed'] and all(row['passed'] for row in raw_anchor_nodes)
report={'source':source_audit['source'],'sourceBlendSha256':source_audit['source']['sha256'],'sourceAuditSha256':sha(args.source_audit),'prepared':{'path':str(args.prepared),'sha256':prepared_hash},'receiverProfiles':receiver_profiles,'geometryFingerprint':geometry_hash.hexdigest(),'dynamicProfiles':prepared_dynamic,'dynamicGeometryFingerprint':prepared_dynamic_hash,'sourceDynamicProfiles':source_dynamic,'sourceDynamicGeometryFingerprint':source_dynamic_hash,'preparedAnchorNodes':prepared_anchor_nodes,'anchorMetadataFields':metadata_fields,'literalGuardsMetres':{'gap':.002,'penetration':.005},**prepared_result,'sourceAnchorMetadataByteExact':True,'noModelMutationsRenderBakeEncoding':True,'scriptSha256':sha(Path(__file__))}
if raw_result is not None:
 report['raw']={'path':str(args.raw),'sha256':raw_hash,'extraSources':extra_raw_hashes,**raw_result,'anchorNodes':raw_anchor_nodes,'sourceAnchorMetadataByteExact':True}
 report['passed']=report['passed'] and raw_result['passed']
if sha(source)!=source_audit['source']['sha256'] or sha(args.prepared)!=prepared_hash or (args.raw and sha(args.raw)!=raw_hash) or any(sha(Path(row['path']))!=row['sha256'] for row in extra_raw_hashes):raise RuntimeError('Frozen input changed during proof')
args.out=args.out.resolve()
if not args.out.is_relative_to(ROOT) or args.out.exists():raise RuntimeError('New repository proof output required')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
failed=[dict(r,stage=stage) for stage,result in [('prepared',prepared_result),('raw',raw_result)] if result for category in ['groups','wickTips','incenseTips','hangingPairs'] for r in result[category] if not r['passed']]+[row for row in raw_anchor_nodes+prepared_anchor_nodes if not row['passed']]
print('PREPARED_RESTING_CONTACT_REPLAY',json.dumps({'passed':report['passed'],'output':str(args.out),'sha256':sha(args.out),'failed':failed,'association':report['association']}),flush=True)
if failed:raise RuntimeError('Actual prepared contact/anchor guard failed')
