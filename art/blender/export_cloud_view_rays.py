"""Twenty actual cover rays clipped by saved opaque source triangles; CPU only."""
import argparse,hashlib,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=a.source.resolve()
if a.out.exists():raise RuntimeError('Fresh output required')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
before=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();positions=[];triangles=[];owners=[]
for obj in scene.objects:
    if obj.type!='MESH' or not(obj.get('one_light_static')or obj.get('one_light_dynamic')) or obj.hide_render:continue
    ev=obj.evaluated_get(graph);mesh=ev.to_mesh();mesh.calc_loop_triangles();offset=len(positions)
    positions.extend(ev.matrix_world@v.co for v in mesh.vertices)
    for tri in mesh.loop_triangles:
        mat=mesh.materials[tri.material_index] if mesh.materials else None
        if mat and mat.use_nodes:
            shaders=[n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED']
            if len(shaders)==1 and(shaders[0].inputs['Transmission Weight'].default_value>0 or shaders[0].inputs['Alpha'].default_value<1):continue
        triangles.append(tuple(offset+i for i in tri.vertices));owners.append(obj.name)
    ev.to_mesh_clear()
tree=BVHTree.FromPolygons(positions,triangles,all_triangles=True)
contract=json.loads(scene['cloud_cliff_live_clouds']);lo=contract['bounds']['min'];hi=contract['bounds']['max'];engine=lambda v:[v.x,v.z,-v.y]
pixels=[(.40,.35),(.50,.40),(.60,.45),(.75,.50),(.90,.55),(.30,.65),(.45,.70),(.65,.75),(.80,.82),(.95,.90)]
rows=[]
for name in ['Reference_cover-desktop','Reference_cover-phone']:
    camera=bpy.data.objects[name];width,height=json.loads(camera['cover_viewport']);origin=camera.matrix_world.translation
    # Source cameras are literal vertical-fit perspective cameras.
    if camera.data.sensor_fit!='VERTICAL':raise RuntimeError('Actual vertical-fit source camera required')
    tangent=camera.data.sensor_height/(2*camera.data.lens);aspect=width/height
    for u,v in pixels:
        direction=(camera.matrix_world.to_3x3()@Vector(((2*u-1)*aspect*tangent,(1-2*v)*tangent,-1))).normalized()
        hit,_,index,distance=tree.ray_cast(origin,direction,camera.data.clip_end)
        O=engine(origin);D=engine(direction);near=0.;far=camera.data.clip_end
        for axis in range(3):
            if abs(D[axis])<1e-15:
                if O[axis]<lo[axis]or O[axis]>hi[axis]:far=-1
            else:
                x=(lo[axis]-O[axis])/D[axis];y=(hi[axis]-O[axis])/D[axis];near=max(near,min(x,y));far=min(far,max(x,y))
        endpoint=min(far,distance)if hit is not None else far
        rows.append({'view':name,'viewport':[width,height],'pixelCss':[u*width,v*height],'origin':O,'direction':D,'volumeStart':near,'volumeEnd':far,'opaqueEnd':distance if hit is not None else None,'opaqueOwner':owners[index]if index is not None else None,'clippedEnd':max(near,endpoint),'activeVolume':endpoint>near})
result={'version':1,'source':{'path':str(source),'sha256':before},'fieldContractSha256':hashlib.sha256(scene['cloud_cliff_live_clouds'].encode()).hexdigest(),'method':'Actual saved camera matrices/vertical projection and actual evaluated static+HERO opaque triangle BVH. Transmission glass excluded, no heightfield/depth bias. Twenty numeric rays only; no CPU image or Cycles job.','rays':rows,'opaqueTriangles':len(triangles),'renderBakeGpuJobs':0,'scriptSha256':sha(Path(__file__))}
if sha(source)!=before:raise RuntimeError('Source changed')
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,indent=2)+'\n')
print('CLOUD_VIEW_RAYS_READY',str(a.out),sha(a.out),sum(row['activeVolume']for row in rows))
