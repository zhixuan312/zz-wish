"""CPU geometry-only upper-contour measurement at the actual cover cameras."""
import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def measure(source):
    bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get()
    vertices=[];triangles=[];owners=[];far=[]
    for obj in scene.objects:
        if obj.type!='MESH' or not(obj.get('one_light_static') or obj.get('one_light_dynamic')):continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
        points=[evaluated.matrix_world@v.co for v in mesh.vertices];offset=len(vertices);vertices.extend(points)
        region=obj.get('lightmap_region',obj.get('region'))
        for t in mesh.loop_triangles:
            mat=mesh.materials[t.material_index] if len(mesh.materials)>t.material_index else None
            if mat and mat.get('one_light_hero_glass'):continue
            triangles.append(tuple(offset+i for i in t.vertices));owners.append((obj.name,region))
            if region=='far':far.append((obj.name,[points[i].copy() for i in t.vertices]))
        evaluated.to_mesh_clear()
    bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True);views={}
    for view,width,height in [('desktop',1440,900),('phone',390,844)]:
        camera=scene.objects['Reference_cover-'+view]
        projection=camera.calc_matrix_camera(graph,x=width,y=height,scale_x=1,scale_y=1)
        pv=projection@camera.matrix_world.inverted();inv=projection.inverted();origin=camera.matrix_world.translation
        profile=[None]*width
        for name,points in far:
            projected=[]
            for point in points:
                p=pv@point.to_4d()
                if p.w<=0:break
                projected.append(((p.x/p.w+1)*width/2,(1-p.y/p.w)*height/2))
            if len(projected)!=3:continue
            for x in range(max(0,math.ceil(min(p[0] for p in projected)-.5)),min(width-1,math.floor(max(p[0] for p in projected)-.5))+1):
                px=x+.5;ys=[]
                for left,right in zip(projected,projected[1:]+projected[:1]):
                    if min(left[0],right[0])<=px<=max(left[0],right[0]) and abs(right[0]-left[0])>1e-12:
                        t=(px-left[0])/(right[0]-left[0]);ys.append(left[1]+t*(right[1]-left[1]))
                if ys and (profile[x] is None or min(ys)<profile[x]['y']):profile[x]={'x':x,'y':min(ys),'projectedOwner':name}
        for item in profile:
            if not item:continue
            p=inv@Vector(((item['x']+.5)/width*2-1,1-(item['y']+.5)/height*2,-1,1))
            direction=(camera.matrix_world.to_3x3()@Vector((p.x/p.w,p.y/p.w,p.z/p.w))).normalized()
            hit=bvh.ray_cast(origin,direction,2000)
            item['visible']=hit[2] is not None and owners[hit[2]][1]=='far'
            item['firstOwner']=owners[hit[2]][0] if hit[2] is not None else None
            item['distanceMetres']=hit[3]
        candidates=[]
        for start,item in enumerate(profile):
            if not item or not item['visible']:continue
            low=high=item['y'];end=start
            while end+1<width:
                other=profile[end+1]
                if not other or not other['visible'] or other['firstOwner']!=item['firstOwner']:break
                next_low=min(low,other['y']);next_high=max(high,other['y'])
                if next_high-next_low>6:break
                low=next_low;high=next_high;end+=1
            if end-start+1>=80:candidates.append({'x':[start,end],'widthPixels':end-start+1,'verticalRangePixels':high-low,'owner':item['firstOwner'],'minimumY':low,'maximumY':high})
        chosen=[]
        for candidate in sorted(candidates,key=lambda c:c['widthPixels'],reverse=True):
            if not any(max(0,min(candidate['x'][1],old['x'][1])-max(candidate['x'][0],old['x'][0])+1)>.2*candidate['widthPixels'] for old in chosen):chosen.append(candidate)
            if len(chosen)>=8:break
        views[view]={'viewport':[width,height],'cameraFovDegrees':float(camera['cover_fov']),
                     'visibleFarContourColumns':sum(bool(p and p['visible']) for p in profile),'longestLowReliefSpan':chosen[0] if chosen else None,'nonoverlappingLowReliefSpans':chosen,
                     'profile':profile}
    return views


p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--before',type=Path);p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.source=a.source.resolve();a.output=a.output.resolve();a.before=a.before.resolve() if a.before else None
if a.output.exists():raise RuntimeError('Use a fresh proof output')
sources=[a.source]+([a.before] if a.before else []);inputs=[{'path':str(path),'sha256':sha256(path.read_bytes()).hexdigest()} for path in sources]
result={'inputs':inputs,'method':'Upper projected envelope of actual far triangles at pixel centres, masked by actual first opaque world-BVH hit; clear glass omitted as an opaque occluder. Low-relief means one visible source owner, >=80px contiguous width and <=6px total vertical range. This geometry-only criterion is not itself a realism failure.','source':measure(a.source),'before':measure(a.before) if a.before else None,'renderGpuEncoderJobs':0}
if [sha256(path.read_bytes()).hexdigest() for path in sources]!=[i['sha256'] for i in inputs]:raise RuntimeError('Immutable source changed')
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2)+'\n')
print('CLOUD_SILHOUETTE_MEASURED',str(a.output),json.dumps({k:v['longestLowReliefSpan'] for k,v in result['source'].items()}),flush=True)
