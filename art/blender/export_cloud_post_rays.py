"""Actual visible post/contact rays from the saved source, no image/render."""
import argparse,hashlib,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
if a.out.exists():raise RuntimeError('Fresh output required')
source=a.source.resolve();before=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();P=[];F=[];owners=[];bounds={}
engine=lambda p:[p.x,p.z,-p.y];point=lambda p:Vector((p[0],-p[2],p[1]))
for obj in scene.objects:
    if obj.type!='MESH' or not(obj.get('one_light_static')or obj.get('one_light_dynamic'))or obj.hide_render:continue
    ev=obj.evaluated_get(graph);mesh=ev.to_mesh();mesh.calc_loop_triangles();q=[ev.matrix_world@v.co for v in mesh.vertices];offset=len(P);P.extend(q);E=[engine(v)for v in q];bounds[obj.name]={'min':[min(v[k]for v in E)for k in range(3)],'max':[max(v[k]for v in E)for k in range(3)]}
    for tri in mesh.loop_triangles:
        mat=mesh.materials[tri.material_index]if mesh.materials else None;shaders=[n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED']if mat and mat.use_nodes else[]
        if len(shaders)==1 and(shaders[0].inputs['Transmission Weight'].default_value>0 or shaders[0].inputs['Alpha'].default_value<1):continue
        F.append(tuple(offset+i for i in tri.vertices));owners.append(obj.name)
    ev.to_mesh_clear()
tree=BVHTree.FromPolygons(P,F,all_triangles=True);posts=sorted({row['post']for row in json.loads(scene['cloud_cliff_structural_supports'])});rows=[]
for camera_name in['Reference_cover-desktop','Reference_cover-phone']:
    camera=bpy.data.objects[camera_name];width,height=json.loads(camera['cover_viewport']);origin=camera.matrix_world.translation;rotation=camera.matrix_world.to_3x3().transposed();scale=height*camera.data.lens/camera.data.sensor_height
    for name in posts:
        box=bounds[name]
        for y in[-2,-4,-6,-8,-10,-12]:
            if not box['min'][1]<y<box['max'][1]:continue
            target=[(box['min'][0]+box['max'][0])/2,y,(box['min'][2]+box['max'][2])/2];q=rotation@(point(target)-origin)
            if q.z>=0:continue
            pixel=[width/2+q.x*scale/-q.z,height/2-q.y*scale/-q.z];inside=0<=pixel[0]<width and 0<=pixel[1]<height;direction=(point(target)-origin).normalized();hit,_,index,distance=tree.ray_cast(origin,direction,camera.data.clip_end)
            rows.append({'camera':camera_name,'viewport':[width,height],'post':name,'targetY':y,'targetWorld':target,'pixelCss':pixel,'insideViewport':inside,'origin':engine(origin),'direction':engine(direction),'opaqueEnd':distance,'firstHitObject':owners[index]if index is not None else None,'actualVisiblePostRay':inside and index is not None and owners[index]==name,'firstHitWorld':engine(hit)if hit is not None else None})
result={'version':1,'source':{'path':str(source),'sha256':before},'postCount':len(posts),'rays':rows,'actualVisiblePostRays':sum(row['actualVisiblePostRay']for row in rows),'scope':'Actual source support inventory/cameras/evaluated opaque triangles; no sampled image or source edit. Out-of-view/occluded target rays are reported and excluded from visible-opacity claims.','renderBakeGpuJobs':0,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise RuntimeError('Source changed')
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(result,indent=2)+'\n');print('ACTUAL_POST_RAYS_READY',len(posts),len(rows),result['actualVisiblePostRays'],str(a.out))
