"""Conservative UV allocation for explicitly scoped, fixed cover cameras.

This changes only unique UV2 allocation. Every physical surface remains a real
Cycles occluder and an exported mesh. It does not classify sampled visibility.
"""
from array import array
from hashlib import sha256
import itertools
import json
import math
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def allocate_fixed_views(scene, objects, directory):
    raw=scene.get('one_light_fixed_view_uv_scope')
    if not raw:return None
    scope=json.loads(raw);graph=bpy.context.evaluated_depsgraph_get()
    cameras=[]
    delta=float(scope['positionEnvelopeMetres']);angular=math.radians(float(scope['orientationEnvelopeDegrees']))
    offsets=[Vector(x) for x in itertools.product([-delta,delta],repeat=3)]
    for name in scope['cameras']:
        camera=bpy.data.objects[name];width,height=json.loads(camera['cover_viewport'])
        projection=camera.calc_matrix_camera(graph,x=width,y=height)
        for axis in [0,1]:
            half_angle=math.atan(1/abs(projection[axis][axis]))
            projection[axis][axis]*=math.tan(half_angle)/math.tan(half_angle+angular)
        origin=camera.matrix_world.translation
        cameras.append({'name':name,'origins':[origin+offset for offset in offsets],
                        'matrices':[projection@camera.matrix_world.inverted()@Matrix.Translation(-offset) for offset in offsets],
                        'viewport':[width,height],'worldMatrix':[list(row) for row in camera.matrix_world],
                        'expandedProjection':[list(row) for row in projection]})
    vertices=[];faces=[];owners=[];polygons={};identity=sha256()
    for obj in objects:
        mesh=obj.data;mesh.calc_loop_triangles();points=[obj.matrix_world@v.co for v in mesh.vertices];base=len(vertices);vertices.extend(points)
        identity.update(obj.name.encode());identity.update(array('f',[v for p in points for v in p]).tobytes())
        identity.update(array('i',[v for p in mesh.polygons for v in p.vertices]).tobytes())
        for face in mesh.polygons:
            corners=[points[i] for i in face.vertices];normal=(corners[1]-corners[0]).cross(corners[2]-corners[0])
            planar=False;convex=False
            if normal.length>1e-10:
                normal.normalize();planar=max(abs((p-corners[0]).dot(normal)) for p in corners)<1e-7
                signs=[(corners[(i+1)%len(corners)]-p).cross(corners[(i+2)%len(corners)]-corners[(i+1)%len(corners)]).dot(normal) for i,p in enumerate(corners)]
                convex=all(s>=-1e-9 for s in signs) or all(s<=1e-9 for s in signs)
            material=mesh.materials[face.material_index] if mesh.materials else None
            bsdf=material.node_tree.nodes.get('Principled BSDF') if material and material.use_nodes else None
            opaque=bool(bsdf and not bsdf.inputs['Alpha'].is_linked and bsdf.inputs['Alpha'].default_value==1 and not bsdf.inputs['Transmission Weight'].is_linked and bsdf.inputs['Transmission Weight'].default_value==0)
            polygons[(obj.name,face.index)]={'points':corners,'normal':normal,'validBlocker':planar and convex and opaque}
        for triangle in mesh.loop_triangles:
            faces.append(tuple(base+i for i in triangle.vertices));owners.append((obj.name,triangle.polygon_index))
    bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
    def outside(points,camera):
        clip=[matrix@p.to_4d() for matrix in camera['matrices'] for p in points]
        # One common homogeneous separating plane for every position in the
        # camera box certifies the whole triangle hull outside that frustum.
        # Runtime near/far values can widen during the handoff. Only the four
        # lateral cone planes certify exclusion; never rely on clip depth.
        return any(all(sign*p[axis] > p.w for p in clip) for axis in [0,1] for sign in [-1,1])
    def occluded(points,camera,receiver):
        blocker=None
        for origin in camera['origins']:
            for p in points:
                ray=p-origin;distance=ray.length
                if distance<1e-5:return None
                hit,normal,index,depth=bvh.ray_cast(origin,ray/distance,distance-.0001)
                if index is None:return None
                owner=owners[index]
                if owner==receiver or blocker is not None and owner!=blocker:return None
                blocker=owner
        candidate=polygons[blocker]
        if not candidate['validBlocker']:return None
        corners=candidate['points'];centre=sum(corners,Vector())/len(corners);normal=candidate['normal'];margin=float('inf')
        for origin in camera['origins']:
            side=(origin-corners[0]).dot(normal)
            if abs(side)<1e-6 or any((p-corners[0]).dot(normal)*side>=-1e-10 for p in points):return None
            for i,a in enumerate(corners):
                edge=(corners[(i+1)%len(corners)]-a).cross(origin-a)
                if edge.length<1e-10:return None
                edge.normalize();inside=(centre-a).dot(edge)
                if abs(inside)<1e-8:return None
                sign=1 if inside>0 else -1
                distances=[sign*(p-a).dot(edge) for p in points]
                # Exact convex shadow-cone inequalities over both vertex sets
                # also cover their entire camera-box/receiver convex hulls.
                if min(distances)<1e-6:return None
                margin=min(margin,min(distances))
        return {'opaquePlanarConvexBlocker':list(blocker),'minimumConeMarginMetres':margin}
    records=[];total=0;excluded=0
    for obj in objects:
        mesh=obj.data;attribute=mesh.attributes.get('one_light_uv_excluded') or mesh.attributes.new(name='one_light_uv_excluded',type='BOOLEAN',domain='FACE')
        for face in mesh.polygons:
            total+=1;key=(obj.name,face.index);points=polygons[key]['points'];certificates=[]
            for camera in cameras:
                if outside(points,camera):certificates.append({'camera':camera['name'],'rule':'common expanded-frustum separating plane'});continue
                certificate=occluded(points,camera,key)
                if not certificate:break
                certificates.append({'camera':camera['name'],'rule':'complete convex shadow cone',**certificate})
            if len(certificates)==len(cameras):
                attribute.data[face.index].value=True;excluded+=1
                records.append({'object':obj.name,'polygon':face.index,'certificates':certificates})
    report={'version':1,'sourceBinding':json.loads(scene['one_light_source_binding']),'evaluatedGeometrySha256':identity.hexdigest(),'scope':scope,
            'cameras':[{k:v for k,v in c.items() if k not in ['origins','matrices']} for c in cameras],
            'totalEvaluatedPolygons':total,'excludedPolygons':excluded,'allocatedPolygons':total-excluded,'certificates':records,
            'geometryRetainedForBakeAndExport':True,'UV0Unchanged':True,'rule':'Every face convex hull is outside a common expanded frustum plane, or entirely behind one actual opaque planar convex polygon for every camera-box corner. Ray samples only nominate blockers; explicit convex halfspace inequalities certify exclusion. No camera sampling is used as proof.'}
    data=(json.dumps(report,indent=2)+'\n').encode();path=directory/'fixed-view-allocation.json';path.write_bytes(data)
    receipt={'path':str(path),'sha256':sha256(data).hexdigest(),'sourceBlendSha256':report['sourceBinding']['sha256'],'evaluatedGeometrySha256':report['evaluatedGeometrySha256'],'excludedPolygons':excluded,'totalEvaluatedPolygons':total,'scope':scope,'geometryRetained':True}
    scene['one_light_fixed_view_allocation_proof']=json.dumps(receipt)
    print('FIXED_VIEW_UV_ALLOCATION',json.dumps(receipt),flush=True)
    return receipt
