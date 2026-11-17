"""Independent actual saved closed-rock/whole-host-edge certificate replay."""
import argparse,hashlib,json,math,sys
from collections import defaultdict
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));scene=bpy.context.scene;before=hashlib.sha256(a.source.read_bytes()).hexdigest();meta=json.loads(scene['source18_geologic_boundary_audit']);graph=bpy.context.evaluated_depsgraph_get();engine=lambda p:[p.x,p.z,-p.y];point=lambda p:Vector((p[0],-p[2],p[1]));cores={};rows=[]
for host in meta['hostCertificates']:
    for core in host['cores']:
        obj=bpy.data.objects[core['object']]
        if obj.hide_render or not obj.visible_camera:raise RuntimeError('Certified geological solid is not camera-visible')
        for mat in obj.data.materials:
            if not mat or not mat.use_nodes:raise RuntimeError('Opaque photographed PBR material required')
            principled=[n for n in mat.node_tree.nodes if n.bl_idname=='ShaderNodeBsdfPrincipled']
            if len(principled)!=1 or principled[0].inputs['Alpha'].is_linked or principled[0].inputs['Alpha'].default_value!=1 or principled[0].inputs['Transmission Weight'].default_value!=0:raise RuntimeError('Geological certificate material is not truly opaque')
        ev=obj.evaluated_get(graph);m=ev.to_mesh();m.calc_loop_triangles();P=[ev.matrix_world@v.co for v in m.vertices];F=[tuple(t.vertices)for t in m.loop_triangles];edges=defaultdict(int);ids={};W=[]
        for p0 in P:
            key=tuple(p0)
            if key not in ids:ids[key]=len(ids)
            W.append(ids[key])
        for tri in F:
            t=[W[i]for i in tri]
            for x,y in zip(t,t[1:]+t[:1]):edges[tuple(sorted((x,y)))]+=1
        if any(n!=2 for n in edges.values()):raise RuntimeError('Saved actual geological rock is not watertight/manifold')
        tree=BVHTree.FromPolygons(P,F,all_triangles=True);centre=point(core['centreEngine']);_,_,_,distance=tree.find_nearest(centre);radius=core['radiusMetres']
        if distance<radius:raise RuntimeError('Declared core sphere exceeds actual saved surface distance')
        parity=[]
        for direction in [Vector((1,.031,.017)).normalized(),Vector((.023,1,.019)).normalized(),Vector((.011,.029,1)).normalized()]:
            count=0;start=centre.copy()
            for _ in range(256):
                hit,_,_,_=tree.ray_cast(start,direction,10000)
                if hit is None:break
                count+=1;start=hit+direction*.001
            parity.append(count%2==1)
        if not all(parity):raise RuntimeError('Actual saved core centre is not unambiguously inside the closed solid')
        cores[obj.name]={'centre':centre,'radius':radius};rows.append({'object':obj.name,'triangles':len(F),'geometricBoundaryOrNonmanifoldEdges':0,'declaredRadiusMetres':radius,'actualNearestSurfaceMetres':distance,'actualCoreSafetyMetres':distance-radius,'parityInside':parity,'opaqueCameraVisible':True});ev.to_mesh_clear()
def intersect(A,B,spheres):
    v=B-A;qA=v.dot(v);spans=[]
    for s in spheres:
        q=A-s['centre'];qB=q.dot(v);qC=q.dot(q)-s['radius']**2;D=qB*qB-qA*qC
        if D<0 or qA<=0:continue
        r=math.sqrt(D);lo=max(0,(-qB-r)/qA);hi=min(1,(-qB+r)/qA)
        if lo<=hi:spans.append((lo,hi))
    end=0
    for lo,hi in sorted(spans):
        if lo>end+1e-8:return False
        end=max(end,hi)
    return end>=1-1e-8
hosts=[]
for row in meta['hostCertificates']:
    obj=bpy.data.objects[row['host']];P=[obj.matrix_world@v.co for v in obj.data.vertices];E=[engine(p)for p in P];lo=[min(p[k]for p in E)for k in range(3)];hi=[max(p[k]for p in E)for k in range(3)];counts=defaultdict(int)
    for poly in obj.data.polygons:
        ids=list(poly.vertices)
        for x,y in zip(ids,ids[1:]+ids[:1]):counts[tuple(sorted((x,y)))]+=1
    spheres=[cores[c['object']]for c in row['cores']];checked=0
    for (x,y),n in counts.items():
        if n!=1:continue
        mid=[(E[x][k]+E[y][k])*.5 for k in range(3)];side=mid[0]<lo[0]+(hi[0]-lo[0])*.12 or mid[0]>hi[0]-(hi[0]-lo[0])*.12;top=mid[1]>hi[1]-35
        if mid[1]<-65 or not(side or top):continue
        if not intersect(P[x],P[y],spheres):raise RuntimeError('Actual saved opaque core union does not bury the ENTIRE selected old crop edge')
        checked+=1
    if checked!=row['selectedBoundaryEdges']:raise RuntimeError('Selected boundary inventory mismatch')
    hosts.append({'host':row['host'],'actualSelectedEdges':checked,'allWholeSegmentsCovered':True})
if hashlib.sha256(a.source.read_bytes()).hexdigest()!=before:raise RuntimeError('Source changed')
report={'version':1,'source':{'path':str(a.source),'sha256':before},'passed':True,'actualClosedRocks':rows,'hosts':hosts,'allWholeSelectedEdgesPhysicallyInsideOpaqueSolids':True,'method':'Actual saved evaluated world triangle topology, material opacity,3parity interior queries, actual nearest triangle distance certify each shrunken solid core. Independent analytic whole-edge/sphere interval union proves targeted photograph cut boundaries are buried inside REAL opaque geometry for any camera, without sampled visibility/compositor hiding.','scopeLimit':'Targeted crop edges are source boundary edges aboveY-65 within12% lateral strips or35m of the crest; deep substrate skirt is separate. New rock silhouettes/photographic quality and final byte budget still require actual review.','sourceUnchanged':True,'renderBakeGpuJobs':False,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};a.out.parent.mkdir(parents=True,exist_ok=True)
if a.out.exists():raise RuntimeError('New proof path required')
a.out.write_text(json.dumps(report,indent=2)+'\n');print('SAVED_CORE_EDGE_PROOF_PASS',len(rows),sum(h['actualSelectedEdges']for h in hosts),str(a.out),hashlib.sha256(a.out.read_bytes()).hexdigest())
