"""Source-bound CPU-only snow-contact donor certificates.

Run with Blender --background --python-exit-code 1 --python THIS_FILE -- --out NEW_ART_BUILD_DIR --classification-dir EXISTING_RECIPIENT_DIR
No render, bake, OIDN, encoding, source edit or lightmap modification occurs.
Explicit actual-file input profiles bind every new source and correspondence proof.
Classifications never depend on radiance thresholds.
"""
import bpy, math, json, hashlib
from pathlib import Path
from collections import defaultdict, Counter
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
import argparse,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from contact_inputs import load_profile,validate_prepared_source,opaque_snow_proof
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--inputs',type=Path,required=True,help='Explicit measured source/prepared/raw/F32 proof and coverage bindings JSON.')
parser.add_argument('--out',type=Path,required=True,help='New ignored art/build analysis directory; no existing proof is overwritten.')
parser.add_argument('--classification-dir',type=Path,required=True,help='Existing source-bound recipient classification directory.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=args.out.resolve()
if not OUT.is_relative_to(ROOT/'art/build'):raise RuntimeError('Separate art/build output required')
if any((OUT/name).exists() for name in ['contact-visibility-classification.json','contact-valid-donors.json']):raise RuntimeError('Existing proof output refused')
OUT.mkdir(parents=True,exist_ok=True)

PROFILE,INPUT_PATHS,COVERAGE_PATHS=load_profile(args.inputs)
SOURCE=INPUT_PATHS['source'];PREP=INPUT_PATHS['prepared']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def eng(p):return [float(p.x),float(p.z),float(-p.y)]
def bl(p):return Vector((p[0],-p[2],p[1]))
def key(p):return tuple(round(float(v),5) for v in p)
def tree(vertices,faces,tri=False):return BVHTree.FromPolygons(vertices,faces,all_triangles=tri)
def height(t,x,z):
 h=t.ray_cast(bl((x,2,z)),Vector((0,0,-1)),4)[0]
 return None if h is None else float(h.z)
def bary(p,a,b,c):
 v0=b-a;v1=c-a;v2=p-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);d=d00*d11-d01*d01
 if abs(d)<1e-25:return [1.,0.,0.]
 v=(d11*d20-d01*d21)/d;w=(d00*d21-d01*d20)/d;return [1-v-w,v,w]
def interp(rows,weights):return [sum(float(row[j])*w for row,w in zip(rows,weights)) for j in range(len(rows[0]))]
def record_source(obj):
 mesh=obj.data;mesh.calc_loop_triangles();vertices=[obj.matrix_world@v.co for v in mesh.vertices]
 faces=[tuple(p.vertices) for p in mesh.polygons];triangles=[tuple(t.vertices) for t in mesh.loop_triangles]
 return {'name':obj.name,'vertices':vertices,'faces':faces,'triangles':triangles,'triangleFaces':[t.polygon_index for t in mesh.loop_triangles], 'modifiers':[m.type for m in obj.modifiers], 'topFaceCount':obj.get('step_snow_top_faces')}
report={'scope':'Read-only bounded geometry/UV diagnosis; no render/bake/encoding or authored edits. Engine coordinates x,Y-up,z. UVs labelled Blender bottom-left and glTF V-flipped.','inputs':{'source':{'path':str(SOURCE.relative_to(ROOT)),'sha256':sha(SOURCE)},'prepared':{'path':str(PREP.relative_to(ROOT)),'sha256':sha(PREP)}},'sourcePreparedComparisons':{},'samples':[]}
assert report['inputs']['source']['sha256']==PROFILE['inputs']['source']['sha256']
assert report['inputs']['prepared']['sha256']==PROFILE['inputs']['prepared']['sha256']
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
sources={}
for o in bpy.context.scene.objects:
 if o.type=='MESH' and (o.name.startswith('Snow with physically depressed footprint track') or o.name.startswith('Continuous stair-edge snow bank')):
  sources[o.name]=record_source(o)
assert len(sources)==3
src_ground=next(v for n,v in sources.items() if n.startswith('Snow with physically'))
ground_bvh=tree(src_ground['vertices'],src_ground['faces']);ground_loops=tree(src_ground['vertices'],src_ground['triangles'],True)
for data in sources.values():
 data['keys']={key(v):i for i,v in enumerate(data['vertices'])}
 data['vertexFace']=defaultdict(set)
 for i,f in enumerate(data['faces']):
  for vi in f:data['vertexFace'][vi].add(i)
 data['preparedTriangles']=[]
bpy.ops.wm.open_mainfile(filepath=str(PREP));bpy.context.view_layer.update()
validate_prepared_source(bpy.context.scene,PROFILE['inputs']['source']['sha256'])
prepared={o.get('lightmap_region'):o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('one_light_static')}
prepared_vertices={};tri_records=[];ground_tri_records=[];bank_tri_records=[];bank_bounds=[.65,2.8,2.0,7.4]
for region in ['court','hall']:
 obj=prepared[region];mesh=obj.data;mesh.calc_loop_triangles();verts=[obj.matrix_world@v.co for v in mesh.vertices];prepared_vertices[region]=verts
 uv0=mesh.uv_layers['UVMap'].data;uv2=mesh.uv_layers['Lightmap'].data;charts=mesh.attributes['one_light_uv_chart'];uvexcluded=mesh.attributes.get('one_light_uv_excluded')
 for tri in mesh.loop_triangles:
  points=[verts[i] for i in tri.vertices]
  # Only geometry around the two banks, stairs and adjacent ground; never full-scene BVH.
  xx=[p.x for p in points];zz=[-p.y for p in points];yy=[p.z for p in points]
  if min(xx)>2.8 or max(xx)<-2.8 or min(zz)>7.4 or max(zz)<2.0 or min(yy)>1.2 or max(yy)<-.2:continue
  rec={'region':region,'polygon':tri.polygon_index,'loopTriangle':tri.index,'vertices':list(tri.vertices),'loops':list(tri.loops),'points':points,'uv0':[list(uv0[i].uv) for i in tri.loops],'uv2':[list(uv2[i].uv) for i in tri.loops],'chartRaw':int(charts.data[tri.polygon_index].value),'normal':list(tri.normal),'material':mesh.materials[mesh.polygons[tri.polygon_index].material_index].name,'source':None,'sourceFace':None}
  for name,data in sources.items():
   if (region=='court')!=name.startswith('Snow with physically'):continue
   indices=[data['keys'].get(key(p)) for p in points]
   if any(i is None for i in indices):continue
   matches=set.intersection(*[data['vertexFace'][i] for i in indices])
   if len(matches)!=1:continue
   rec['source']=name;rec['sourceFace']=next(iter(matches));rec['sourceVertices']=indices;data['preparedTriangles'].append(rec)
   break
  tri_records.append(rec)
  if rec['source']:
   (ground_tri_records if rec['source'].startswith('Snow with physically') else bank_tri_records).append(rec)
# BVHs indexed directly into bounded records.
flat=[p for r in tri_records for p in r['points']];localtris=[(i,i+1,i+2) for i in range(0,len(flat),3)];first_bvh=tree(flat,localtris,True)
ground_flat=[p for r in ground_tri_records for p in r['points']];prep_ground=tree(ground_flat,[(i,i+1,i+2) for i in range(0,len(ground_flat),3)],True)
# Analysis only: create source-bound per-centre occlusion certificates, never edit illumination.
TOL=20e-6
banks={name:tree([p for r in data['preparedTriangles'] for p in r['points']],[(i,i+1,i+2) for i in range(0,len(data['preparedTriangles'])*3,3)],True) for name,data in sources.items() if not name.startswith('Snow with physically')}
closed={}
for name,data in sources.items():
 if name.startswith('Snow with physically'):continue
 edges=Counter();oriented=Counter()
 for r in data['preparedTriangles']:
  vs=r['sourceVertices']
  for a,b in zip(vs,vs[1:]+vs[:1]):edges[tuple(sorted((a,b)))]+=1;oriented[tuple(sorted((a,b)))]+=1 if a<b else -1
 closed[name]={'preparedTriangles':len(data['preparedTriangles']),'edgeCount':len(edges),'nonTwoSidedEdges':sum(v!=2 for v in edges.values()),'inconsistentOrientedEdges':sum(v!=0 for v in oriented.values())}
 assert closed[name]['nonTwoSidedEdges']==0 and closed[name]['inconsistentOrientedEdges']==0
bankboxes={name:tuple((min(p[i] for p in data['vertices']),max(p[i] for p in data['vertices'])) for i in range(3)) for name,data in sources.items() if name in banks}
DIRECTIONS=[Vector((0,0,1)),Vector((1,.173,.351)).normalized(),Vector((-.233,1,.417)).normalized()]
def parity(bvh,p,d):
 o=p.copy();count=0
 for _ in range(24):
  h=bvh.ray_cast(o,d,20)
  if h[0] is None:return count%2,count
  count+=1;o=h[0]+d*1e-6
 return -1,count
coverage={};chartnumber={}
for region in ['hall','court']:
 data=np.load(COVERAGE_PATHS[region]);coverage[region]=data['labels'];chartnumber[region]=data['charts']
CLASSIFICATION=args.classification_dir.resolve()
rows=json.loads((CLASSIFICATION/'contact-texel-certificates.json').read_text());classification=json.loads((CLASSIFICATION/'contact-visibility-classification.json').read_text())
assert classification['inputs']==PROFILE['inputs']
assert classification['coverage']==PROFILE['coverage']
for item in classification['inputs'].values():
 if sha(ROOT/item['path'])!=item['sha256']:raise RuntimeError('Actual source classification input changed')
ownerNames=[src_ground['name']]+sorted(banks)
ownerId={n:i for i,n in enumerate(ownerNames)}
# Chart ownership uses every prepared polygon in each affected chart, not just the bounded sample pixels.
targets={r:set(v['chartRaw'] for v in rows if v['region']==r) for r in ['court','hall']};ownership=[]
bankOwnerByPoly={r['polygon']:ownerId[r['source']] for r in bank_tri_records};maximumMatchError=0
for region in ['court','hall']:
 obj=prepared[region];mesh=obj.data;chartAttr=mesh.attributes['one_light_uv_chart'];counts=defaultdict(Counter)
 for poly in mesh.polygons:
  chart=int(chartAttr.data[poly.index].value)
  if chart not in targets[region]:continue
  if region=='hall':
   oid=bankOwnerByPoly.get(poly.index)
   if oid is None:raise RuntimeError('Affected hall chart includes an unproven bank owner')
  else:
   points=[prepared_vertices[region][i] for i in poly.vertices];indices=[src_ground['keys'].get(key(p)) for p in points]
   if any(i is None for i in indices):raise RuntimeError('Affected court chart includes a non-ground vertex')
   matches=set.intersection(*[src_ground['vertexFace'][i] for i in indices])
   if len(matches)!=1:raise RuntimeError('Affected court chart has unproven source face')
   maximumMatchError=max(maximumMatchError,max((p-src_ground['vertices'][i]).length for p,i in zip(points,indices)))
   oid=0
  counts[chart][oid]+=1
 for chart,c in sorted(counts.items()):
  if len(c)!=1:raise RuntimeError('Chart does not have a unique original snow owner')
  oid=next(iter(c));ownership.append({'region':region,'chartRaw':chart,'ownerId':oid,'sourceObject':ownerNames[oid],'allPreparedPolygonCount':sum(c.values()),'uniqueOwnerVerified':True})
# Conservative donor guard against buried terrace/tread samples, while retaining all original lighting.
stoneRecords=[r for r in tri_records if r['material']=='Worn granite'];stonePoints=[p for r in stoneRecords for p in r['points']];stoneBVH=tree(stonePoints,[(i,i+1,i+2) for i in range(0,len(stonePoints),3)],True)
valid=[];reasons=Counter();donorByKey=set();rowOwner=[]
for row in rows:
 p=bl(row['worldEngine']);region=row['region'];validDonor=False;reason='not-certified-donor';oid=ownerId[row['sourceObject']]
 if row['hidden']:reason='certified-hidden-recipient-never-donor'
 elif row['reason'] in ['uv-boundary-position-ambiguous','parity-disagreement-not-certified','near-contact-not-certified']:reason='ambiguous-or-near-contact-never-donor'
 else:
  stoneY=height(stoneBVH,p.x,-p.y)
  nearestStone=stoneBVH.find_nearest(p)
  if stoneY is not None and p.z-stoneY<=TOL:reason='covered-or-near-opaque-stair-terrace-surface'
  elif nearestStone[0] is not None and nearestStone[3]<=TOL:reason='near-opaque-stair-terrace-surface'
  elif region=='hall':
   g=height(prep_ground,p.x,-p.y);nearest=prep_ground.find_nearest(p)
   if g is not None and p.z-g>TOL and nearest[0] is not None and nearest[3]>TOL:
    validDonor=True;reason='bank-positive-ground-and-support-clearance'
   else:reason='bank-not-positive-clearance-never-donor'
  else:
   allOutside=True
   for name,bvh in banks.items():
    nearest=bvh.find_nearest(p)
    if nearest[0] is None or nearest[3]<=TOL:allOutside=False;reason='ground-near-bank-shell-never-donor';break
    bounds=bankboxes[name]
    if all(bounds[i][0]<=p[i]<=bounds[i][1] for i in range(3)):
     parities=[parity(bvh,p,d)[0] for d in DIRECTIONS]
     if parities!=[0,0,0]:allOutside=False;reason='ground-not-proven-outside-bank-never-donor';break
   if allOutside:validDonor=True;reason='ground-outside-closed-banks-and-support-clear'
 valid.append(validDonor);rowOwner.append(oid);reasons[(region,reason)]+=1
 if validDonor:donorByKey.add((region,row['chartRaw'],oid,row['x'],row['yBottomLeft']))
# Coverage is conservative: recipients without a valid same-chart+owner donor inside8px remain unchanged.
offsets=sorted((dx*dx+dy*dy,dx,dy) for dx in range(-8,9) for dy in range(-8,9) if dx*dx+dy*dy<=64)
covered=Counter();distanceCounts=Counter();uncovered=[]
for row,oid in zip(rows,rowOwner):
 if not row['hidden']:continue
 found=None
 for d2,dx,dy in offsets:
  if (row['region'],row['chartRaw'],oid,row['x']+dx,row['yBottomLeft']+dy) in donorByKey:found=d2;break
 if found is None:covered[(row['region'],'no-valid-donor-within8')]+=1;uncovered.append([0 if row['region']=='court' else 1,row['x'],row['yBottomLeft'],row['chartRaw'],oid])
 else:covered[(row['region'],'valid-donor-within8')]+=1;distanceCounts[found]+=1
np.savez_compressed(OUT/'contact-valid-donors.npz',region=np.array([0 if r['region']=='court' else 1 for r in rows],np.uint8),xyBottomLeft=np.array([[r['x'],r['yBottomLeft']] for r in rows],np.uint16),chartRaw=np.array([r['chartRaw'] for r in rows],np.int32),ownerId=np.array(rowOwner,np.uint8),validDonor=np.array(valid,np.bool_))
result={'version':1,'scope':'ANALYSIS-ONLY conservative donor permissions. hiddenFalse was not sufficient and is not used as a validity claim. No geometry, lighting, transport or image changes.','inputs':classification['inputs'],'inputValidationScriptSha256':sha(Path(__file__).with_name('contact_inputs.py')),'recipientClassificationSha256':sha(CLASSIFICATION/'contact-visibility-classification.json'),'recipientRecordsSha256':sha(CLASSIFICATION/'contact-texel-certificates.json'),'toleranceMetres':TOL,'donorFile':{'path':'contact-valid-donors.npz','sha256':sha(OUT/'contact-valid-donors.npz'),'arrays':['region(0court1hall)','xyBottomLeft','chartRaw','ownerId','validDonor']},'owners':{str(i):n for i,n in enumerate(ownerNames)},'chartOwners':ownership,'maximumFullChartGroundSourceVertexMatchErrorMetres':maximumMatchError,'donorRules':{'global':'Never hidden, near-contact, UV-ambiguous or parity-ambiguous; >20µm from stair/terrace surface and not below its vertical top; no radiance threshold.','hall':'Positive>20µm clearance ABOVE actual opaque ground, with nearest ground distance>20µm. All original source bank-top texel owners proven.','court':'Outside both watertight bank volumes: outside their AABB or3 agreeing even-parity rays; >20µm from both shells.','sampling':'Recipient and donor must share original chartRaw AND ownerId; nearest Euclidean distance<=8 native base pixels. Recipients lacking such donor are left unchanged. Missing sparse entries are never donors.'},'validDonorCount':sum(valid),'counts':[{'region':r,'reason':why,'count':n} for (r,why),n in sorted(reasons.items())],'recipientCoverage':[{'region':r,'outcome':why,'count':n} for (r,why),n in sorted(covered.items())],'coveredRecipientDistanceSquaredHistogram':dict(sorted(distanceCounts.items())),'uncoveredRecipientRows':uncovered,'scriptSha256':sha(Path(__file__))}
(OUT/'contact-valid-donors.json').write_text(json.dumps(result,indent=2)+'\n');print('CONTACT_DONORS_READY',json.dumps({'metadata':str(OUT/'contact-valid-donors.json'),'sha256':sha(OUT/'contact-valid-donors.json'),'validDonors':sum(valid),'recipientCoverage':result['recipientCoverage'],'owners':result['owners']}),flush=True)
