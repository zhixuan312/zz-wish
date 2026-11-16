"""Source-bound CPU-only snow-contact recipient certificates.

Run with Blender --background --python-exit-code 1 --python THIS_FILE -- --out NEW_ART_BUILD_DIR
No render, bake, OIDN, encoding, source edit or lightmap modification occurs.
The accepted source/prepared hashes are deliberately frozen; a new model requires
new correspondence evidence. Classifications never depend on radiance thresholds.
"""
import bpy, math, json, hashlib
from pathlib import Path
from collections import defaultdict, Counter
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
import argparse,sys
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out',type=Path,required=True,help='New ignored art/build analysis directory; no existing proof is overwritten.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=args.out.resolve()
if not OUT.is_relative_to(ROOT/'art/build'):raise RuntimeError('Separate art/build output required')
if any((OUT/name).exists() for name in ['contact-visibility-classification.json','contact-valid-donors.json']):raise RuntimeError('Existing proof output refused')
OUT.mkdir(parents=True,exist_ok=True)

SOURCE=ROOT/'art/build/snow-roof-stair-banks-grain.blend';PREP=ROOT/'art/build/snow-roof-final/snow-roof-prepared.blend'
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
 return {'name':obj.name,'vertices':vertices,'faces':faces,'triangles':triangles,'triangleFaces':[t.polygon_index for t in mesh.loop_triangles], 'modifiers':[m.type for m in obj.modifiers]}
report={'scope':'Read-only bounded geometry/UV diagnosis; no render/bake/encoding or authored edits. Engine coordinates x,Y-up,z. UVs labelled Blender bottom-left and glTF V-flipped.','inputs':{'source':{'path':str(SOURCE.relative_to(ROOT)),'sha256':sha(SOURCE)},'prepared':{'path':str(PREP.relative_to(ROOT)),'sha256':sha(PREP)}},'sourcePreparedComparisons':{},'samples':[]}
assert report['inputs']['source']['sha256']=='6e9f59c93565e08a690eaafbc756967ba39e0f4d8ad0094e4520265948360af8'
assert report['inputs']['prepared']['sha256']=='6ed42644cd3a6c1026b079740957280df0274e9e9a0eaf5f8d3da514725079c1'
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
 data=np.load(ROOT/f'art/build/snow-roof-final/{region}-coverage.npz');coverage[region]=data['labels'];chartnumber[region]=data['charts']
# Native pixel centers, exact unchanged prepared UV2 rasterization. Keep UV-boundary duplicates conservative.
receivers={};duplicate_max=0
for r in bank_tri_records+ground_tri_records:
 if r['region']=='hall' and r['sourceFace']>=2816:continue
 size=coverage[r['region']].shape[0];uv=np.array(r['uv2'])*size;low=np.maximum(0,np.floor(uv.min(axis=0)).astype(int));high=np.minimum(size-1,np.ceil(uv.max(axis=0)).astype(int))
 if np.any(low>high):continue
 a,b,c=uv;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
 if abs(den)<1e-12:continue
 xx,yy=np.meshgrid(np.arange(low[0],high[0]+1)+.5,np.arange(low[1],high[1]+1)+.5);u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;inside=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)
 chart=int(chartnumber[r['region']][r['polygon']])
 for iy,ix in zip(*np.nonzero(inside)):
  x=int(low[0]+ix);y=int(low[1]+iy)
  if int(coverage[r['region']][y,x])!=chart:continue
  w=[float(u[iy,ix]),float(v[iy,ix]),float(1-u[iy,ix]-v[iy,ix])];p=sum((pt*weight for pt,weight in zip(r['points'],w)),Vector());k=(r['region'],x,y)
  if k in receivers:
   error=(receivers[k]['point']-p).length;duplicate_max=max(duplicate_max,error)
   if error>TOL/4:receivers[k]['ambiguous']=True
   continue
  receivers[k]={'r':r,'point':p,'ambiguous':False}
rows=[];counts=Counter();charts=defaultdict(Counter)
for (region,x,y),item in sorted(receivers.items()):
 r=item['r'];p=item['point'];reason='not-proven-hidden';hidden=False;g=height(prep_ground,p.x,-p.y);shellDistance=None;clearance=None;certificate={}
 if item['ambiguous']:reason='uv-boundary-position-ambiguous'
 elif region=='hall':
  nearest=prep_ground.find_nearest(p);shellDistance=None if nearest[0] is None else float(nearest[3]);clearance=None if g is None else float(p.z-g)
  # All permitted journey cameras remain above the continuous opaque rectangular terrain field.
  if clearance is not None and clearance < -TOL and shellDistance>TOL and -25<p.x<25 and -12<(-p.y)<52:
   hidden=True;reason='bank-top-below-continuous-opaque-ground';certificate={'verticalMarginMetres':-clearance,'nearestOpaqueSurfaceDistanceMetres':shellDistance}
  elif clearance is not None and abs(clearance)<=TOL:reason='near-contact-not-certified'
 else:
  for name,bvh in banks.items():
   bounds=bankboxes[name]
   if not all(bounds[i][0]<=p[i]<=bounds[i][1] for i in range(3)):continue
   nearest=bvh.find_nearest(p)
   if nearest[0] is None or nearest[3]<=TOL:continue
   results=[parity(bvh,p,d) for d in DIRECTIONS]
   if all(v[0]==1 for v in results):
    hidden=True;reason='ground-centre-inside-closed-opaque-bank';shellDistance=float(nearest[3]);certificate={'enclosingSourceObject':name,'nearestOpaqueSurfaceDistanceMetres':shellDistance,'parityRays':[{'directionBlender':list(d),'odd':v[0]==1,'intersections':v[1]} for d,v in zip(DIRECTIONS,results)]};break
   if len({v[0] for v in results})>1:reason='parity-disagreement-not-certified'
 rows.append({'region':region,'x':x,'yBottomLeft':y,'preparedPolygon':r['polygon'],'sourceObject':r['source'],'sourceFace':r['sourceFace'],'chartRaw':r['chartRaw'],'chartRaster':int(chartnumber[region][r['polygon']]),'worldEngine':eng(p),'hidden':hidden,'reason':reason,'certificate':certificate})
 counts[(region,reason)]+=1;charts[(region,r['chartRaw'])]['candidates']+=1;charts[(region,r['chartRaw'])]['hidden' if hidden else 'notCertified']+=1
print('CONTACT_CLASSIFICATION_COUNTS',json.dumps({str(k):v for k,v in counts.items()}),flush=True)
inputs={**report['inputs'],'raw':{'path':'art/build/snow-roof-final/snow-roof.raw.glb','sha256':sha(ROOT/'art/build/snow-roof-final/snow-roof.raw.glb')},'f32Diagnostic':{'path':'art/build/snow-roof-float32-position-diagnostic/snow-roof.glb','sha256':sha(ROOT/'art/build/snow-roof-float32-position-diagnostic/snow-roof.glb')},'independentExactF32PositionProof':{'path':'art/build/snow-roof-float32-position-diagnostic/independent-position-stream-proof.json','sha256':sha(ROOT/'art/build/snow-roof-float32-position-diagnostic/independent-position-stream-proof.json')}}
metadata={'version':1,'classifierScriptSha256':sha(Path(__file__)),'opaqueMaterialProof':{'rawMaterial':'Snow settled dry grains','alphaMode':'OPAQUE','baseColorAlpha':1,'basis':'Actual raw0deec GLB material JSON inspected; source ground and both banks use the same opaque material.'},'terrainMaximumActualVertexY':max(v.z for v in src_ground['vertices']),'terrainMinimumActualVertexY':min(v.z for v in src_ground['vertices']),'scope':'ANALYSIS ONLY. Native TEXEL CENTRE geometry certificates. No illumination, geometry, UV, material, source file or delivery asset changed. Not a whole-texel footprint mask or permission to relabel visible dark illumination. Original raw/denoised transport remains immutable.','inputs':inputs,'toleranceMetres':TOL,'floatPrecisionScope':'Certificates apply to exact authored/prepared FLOAT32 world positions. Position16 delivery may move near-tangent geometry and is not covered. UV16 still shifts sampling; per-centre classification does not assert all bilinear footprints are hidden.','allowedCameraDomain':'All journey cameras lie inside opaque terrain XY rectangle and above its heightfield. Ground-inside-bank certificates are camera-independent for every camera outside the closed bank volume. Bank-below-ground certificates are camera-independent within the continuous opaque field for above-ground cameras.','terrainDomainEngine':{'x':[-26,26],'z':[-13,53]},'proofRules':{'bank':'Native top receiver centre lies below actual prepared ground, with both vertical clearance and nearest ground-surface distance >20µm; it is at least1m from terrain boundary. No radiance threshold is consulted.','ground':'Native receiver centre lies inside a watertight, consistently oriented opaque bank volume: three irrational-direction parity rays all odd and nearest bank-shell distance >20µm. No radiance threshold is consulted.','ambiguity':'Points within20µm of tested shell, UV-boundary position disagreements >5µm, and parity disagreements are never certified hidden.'},'closedBankProof':closed,'nativeResolutionByRegion':{r:int(v.shape[0]) for r,v in coverage.items()},'coordinateRule':'worldEngine=(Blender.x,Blender.z,-Blender.y); texel(x,yBottomLeft), UV2=((x+.5)/size,(y+.5)/size).','maximumUVBoundaryDuplicateWorldDifferenceMetres':duplicate_max,'counts':[{'region':r,'reason':why,'texels':n} for (r,why),n in sorted(counts.items())],'charts':[{'region':r,'chartRaw':c,**dict(v)} for (r,c),v in sorted(charts.items())],'candidateTexels':len(rows),'certifiedHiddenTexels':sum(v['hidden'] for v in rows),'recordsFile':'contact-texel-certificates.json','groundDiagnosticScope':'The recipient classifier independently rebuilds exact source/prepared geometry; no pre-existing camera diagnostic is required.'}
# Human-readable sparse proof is small and reproducible; never writes any lightmap.
(OUT/'contact-texel-certificates.json').write_text(json.dumps(rows,separators=(',',':'))+'\n');metadata['recordsSha256']=sha(OUT/'contact-texel-certificates.json')
np.savez_compressed(OUT/'contact-texel-centres.npz',region=np.array([0 if r['region']=='court' else 1 for r in rows],dtype=np.uint8),xyBottomLeft=np.array([[r['x'],r['yBottomLeft']] for r in rows],dtype=np.uint16),hidden=np.array([r['hidden'] for r in rows],dtype=np.bool_),preparedPolygon=np.array([r['preparedPolygon'] for r in rows],dtype=np.uint32),chartRaw=np.array([r['chartRaw'] for r in rows],dtype=np.int32),worldEngine=np.array([r['worldEngine'] for r in rows],dtype=np.float32))
metadata['compactCentres']={'file':'contact-texel-centres.npz','sha256':sha(OUT/'contact-texel-centres.npz'),'regionCode':{'0':'court','1':'hall'},'hiddenField':'True only for certified opaque geometric occlusion; all other points are False/uncertified.'}
(OUT/'contact-visibility-classification.json').write_text(json.dumps(metadata,indent=2)+'\n');print('CONTACT_VISIBILITY_READY',json.dumps({'path':str(OUT/'contact-visibility-classification.json'),'sha256':sha(OUT/'contact-visibility-classification.json'),'candidates':len(rows),'hidden':metadata['certifiedHiddenTexels'],'recordsBytes':(OUT/'contact-texel-certificates.json').stat().st_size}),flush=True)
