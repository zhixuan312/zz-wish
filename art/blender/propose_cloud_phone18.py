"""Measured actual geometry projection/clearance only, no render or source edits."""
import argparse,hashlib,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();P=[];F=[];body=[];whole=[]
for obj in scene.objects:
    if obj.type!='MESH' or not(obj.get('one_light_static')or obj.get('one_light_dynamic')):continue
    ev=obj.evaluated_get(graph);m=ev.to_mesh();m.calc_loop_triangles();points=[ev.matrix_world@v.co for v in m.vertices];offset=len(P);P.extend(points);F.extend(tuple(offset+i for i in t.vertices)for t in m.loop_triangles)
    if obj.get('one_light_dynamic'):
        whole.extend(points)
        if not any(s in obj.name.lower()for s in ['load link','bail','hanging pivot']):body.extend(points)
    ev.to_mesh_clear()
tree=BVHTree.FromPolygons(P,F,all_triangles=True);engine=lambda p:[p.x,p.z,-p.y];blender=lambda p:Vector((p[0],-p[2],p[1]));cloud=json.loads(scene['cloud_cliff_live_clouds']);poses=[{'id':'source17-control','position':[5.2,1.8,4.8],'target':[3.77,-.1,-5],'fov':52},{'id':'lower-eye-less-down','position':[5.2,1.45,4.8],'target':[3.77,.62,-5],'fov':49},{'id':'normal-eye-less-down','position':[5.2,1.55,4.8],'target':[3.77,.72,-5],'fov':49},{'id':'same-eye-less-down-control','position':[5.2,1.8,4.8],'target':[3.77,.97,-5],'fov':49}];rows=[]
for pose in poses:
    origin=Vector(pose['position']);forward=(Vector(pose['target'])-origin).normalized();right=forward.cross(Vector((0,1,0))).normalized();up=right.cross(forward);scale=844/(2*math.tan(math.radians(pose['fov'])/2))
    def project(p):
        q=Vector(p)-origin;z=q.dot(forward)
        return[195+q.dot(right)*scale/z,422-q.dot(up)*scale/z,z]
    def bounds(points):
        q=[project(engine(p))for p in points];return[min(p[0]for p in q),min(p[1]for p in q),max(p[0]for p in q),max(p[1]for p in q)]
    _,_,_,distance=tree.find_nearest(blender(pose['position']));b=bounds(body);h=bounds(whole);samples=[]
    for bank in cloud['banks']:
        q=list(bank['centre']);q[1]+=.5*bank['radii'][1]-6;s=project(q)
        if 0<=s[0]<=390 and 0<=s[1]<=844:samples.append({'bank':bank['id'],'screen':s,'world':q,'scope':'Geometric mid/upper support landmark minus mean warp, not an opacity/visibility sample.'})
    rows.append({**pose,'viewport':[390,844],'actualBodyBoundsPixels':b,'actualWholeHeroBoundsPixels':h,'bodyHeightFraction':(b[3]-b[1])/844,'bodyBottomToFormTop370Pixels':370-b[3],'actualNearestOpaqueMeshMetres':distance,'cameraSphereRadiusMetres':.15,'cameraSphereClear':distance>.15,'eyeHeightAboveZeroDeck':pose['position'][1],'pitchDownDegrees':-math.degrees(math.asin(forward.y)),'projectedBankLandmarks':samples,'landmarksInLowerHalf':sum(s['screen'][1]>=422 for s in samples)})
report={'version':1,'source':{'path':str(a.source),'sha256':hashlib.sha256(a.source.read_bytes()).hexdigest()},'rows':rows,'scope':'Actual evaluated HERO geometry + actual opaque BVH nearest distance; CPU projection only. Landmark projection does not establish source density/visibility or final UI overlap. Original source/cameras unchanged; Root selects pose before source18 native projection.','renderGpuBakeJobs':False};a.out.parent.mkdir(parents=True,exist_ok=True)
if a.out.exists():raise RuntimeError('New output required')
a.out.write_text(json.dumps(report,indent=2)+'\n');print('PHONE18_PROPOSALS',str(a.out),json.dumps([{k:r[k]for k in['id','actualBodyBoundsPixels','bodyHeightFraction','bodyBottomToFormTop370Pixels','actualNearestOpaqueMeshMetres','pitchDownDegrees','landmarksInLowerHalf']}for r in rows]))
