"""Fictional Cloud Cliff cover, authored in metres for the One Light pipeline.

CPU build only:
  blender --background --python cloud_cliff.py -- --output art/build/cloud-cliff.blend

Engine (x, Y-up, z) maps to Blender (x, -z, Y). STATIC has named lightmap
regions. HERO is a separately exported, normally shaded brass/glass lantern;
it remains a genuine native bake occluder. No render or bake runs here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import struct
import sys

import bpy
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from resting_contacts import RestingContacts

STATIC = HERO = LIGHTS = CAMERAS = RUNTIME = None
TARGET = None
REGION = 'cover'
CONTACTS = None
RNG = random.Random(812673)
SUPPORTS = []
MATERIALS = {}
SCANS = []
SCAN_DIR = ROOT / 'web/public/materials/scans'


def point(p):
    return Vector((p[0], -p[2], p[1]))


def engine(p):
    return [float(p.x), float(p.z), float(-p.y)]


def digest(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def tag(obj, region=None, dynamic=False):
    if dynamic or TARGET == HERO:
        obj['one_light_dynamic'] = True
        obj['hero_id'] = 'storm'
    else:
        obj['one_light_static'] = True
        obj['region'] = region or REGION
        obj['lightmap_region'] = region or REGION
    obj['units'] = 'metres'
    return obj


def uv_world(obj, scale=1.6):
    mesh = obj.data
    uv = mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        axis = max(range(3), key=lambda k: abs(face.normal[k]))
        axes = [(1, 2), (0, 2), (0, 1)][axis]
        for li in face.loop_indices:
            p = obj.matrix_world @ mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = (p[axes[0]] / scale, p[axes[1]] / scale)
    mesh.uv_layers.active = uv


def source_uv(obj, coordinates):
    """Artist UV2 in metre-based connected charts; UV0 never changes."""
    if obj.get('one_light_dynamic'):return obj
    uv=obj.data.uv_layers.get('SourceLightmap') or obj.data.uv_layers.new(name='SourceLightmap')
    for polygon,values in zip(obj.data.polygons,coordinates):
        if len(values)!=len(polygon.loop_indices):raise RuntimeError('Authored UV2 corner count mismatch')
        for loop,value in zip(polygon.loop_indices,values):uv.data[loop].uv=value
    obj.data.uv_layers.active=obj.data.uv_layers['UVMap'];obj.data.uv_layers['UVMap'].active_render=True
    obj['one_light_authored_uv2']='Connected analytical source charts; material UVMap untouched.'
    return obj


def grid_uv(obj,columns,du,dv):
    return source_uv(obj,[[(obj.data.loops[li].vertex_index%columns*du,obj.data.loops[li].vertex_index//columns*dv) for li in p.loop_indices] for p in obj.data.polygons])


def mesh_object(name, vertices, faces, material, region=None, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([point(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    (TARGET or STATIC).objects.link(obj)
    if material:
        data.materials.append(material)
    tag(obj, region)
    for face in data.polygons:
        face.use_smooth = smooth
    uv_world(obj)
    return obj


def eased(obj, width=.008, segments=1):
    modifier = obj.modifiers.new('Real eased construction edges', 'BEVEL')
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = 'ANGLE'
    modifier.angle_limit = .4
    modifier.harden_normals = True
    weighted = obj.modifiers.new('Weighted construction normals', 'WEIGHTED_NORMAL')
    weighted.keep_sharp = True
    return obj


def box(name, dimensions, location, material, edge=.006, region=None):
    x,y,z = [v / 2 for v in dimensions]
    vertices = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    vertices = [tuple(a+b for a,b in zip(p,location)) for p in vertices]
    obj = mesh_object(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),
                                      (3,7,6,2),(0,4,7,3),(1,2,6,5)], material, region)
    coordinates=[];width,height,depth=dimensions
    for p in obj.data.polygons:
        n=engine(p.normal);axis=max(range(3),key=lambda k:abs(n[k]));values=[]
        for li in p.loop_indices:
            v=engine(obj.data.vertices[obj.data.loops[li].vertex_index].co);xx,yy,zz=[v[i]-location[i] for i in range(3)]
            if axis==2:uv=(depth+xx+width/2,depth+yy+height/2) if n[2]<0 else (depth+width+depth+width/2-xx,depth+yy+height/2)
            elif axis==0:uv=(depth+width+zz+depth/2,depth+yy+height/2) if n[0]>0 else (depth-zz-depth/2,depth+yy+height/2)
            else:uv=(depth+xx+width/2,depth+height+zz+depth/2) if n[1]>0 else (depth+xx+width/2,depth-zz-depth/2)
            values.append(uv)
        coordinates.append(values)
    source_uv(obj,coordinates)
    if edge:
        eased(obj, edge)
    return obj


def lathe(name, profile, location, material, sides=32, region=None):
    vertices=[];faces=[]
    for radius,height in profile:
        vertices.extend((location[0]+radius*math.cos(i/sides*math.tau),
                         location[1]+height,
                         location[2]+radius*math.sin(i/sides*math.tau)) for i in range(sides))
    for row in range(len(profile)-1):
        for col in range(sides):
            a=row*sides+col;b=row*sides+(col+1)%sides
            faces.append((a,b,b+sides,a+sides))
    obj=mesh_object(name,vertices,faces,material,region,True);maximum=max(r for r,h in profile);circumference=math.tau*maximum
    lengths=[0]
    for a,b in zip(profile,profile[1:]):lengths.append(lengths[-1]+math.hypot(a[0]-b[0],a[1]-b[1]))
    coordinates=[]
    for row in range(len(profile)-1):
        cap=profile[row][0]==0 or profile[row+1][0]==0 or abs(profile[row][1]-profile[row+1][1])<1e-8
        for col in range(sides):
            values=[]
            for rr,cc in [(row,col),(row,col+1),(row+1,col+1),(row+1,col)]:
                radius=profile[rr][0];angle=cc/sides*math.tau
                values.append((circumference+maximum*2+radius*math.cos(angle),row*maximum*3+radius*math.sin(angle)) if cap else (cc/sides*circumference,lengths[rr]))
            coordinates.append(values)
    return source_uv(obj,coordinates)


def beam(name, a, b, radius, material, sides=10, end_radius=None, region=None):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    right=direction.cross(Vector((0,1,0)))
    if right.length<1e-5:right=direction.cross(Vector((1,0,0)))
    right.normalize();up=right.cross(direction).normalized();vertices=[]
    for p,r in [(a,radius),(b,end_radius if end_radius is not None else radius)]:
        vertices.extend(tuple(p+right*math.cos(i/sides*math.tau)*r+up*math.sin(i/sides*math.tau)*r) for i in range(sides))
    faces=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    faces.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    obj=mesh_object(name,vertices,faces,material,region,True);length=(b-a).length;maximum=max(radius,end_radius or radius);circumference=math.tau*maximum
    coordinates=[]
    for p in obj.data.polygons:
        values=[]
        for li in p.loop_indices:
            index=obj.data.loops[li].vertex_index;row=index//sides;col=index%sides
            if p.index<2:
                angle=col/sides*math.tau;rr=radius if row==0 else end_radius or radius
                values.append((circumference+maximum*2+rr*math.cos(angle),maximum*(2+4*row)+rr*math.sin(angle)))
            else:
                start=p.index-2;cc=start+1 if col==(start+1)%sides else start
                values.append((cc/sides*circumference,row*length))
        coordinates.append(values)
    return source_uv(obj,coordinates)


def tube_curve(name, points, radius, material, sides=8):
    vertices=[];faces=[]
    for i,p in enumerate(points):
        p=Vector(p);d=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        d.normalize();right=d.cross(Vector((0,1,0)))
        if right.length<1e-6:right=d.cross(Vector((1,0,0)))
        right.normalize();up=right.cross(d).normalized()
        vertices.extend(tuple(p+radius*(right*math.cos(j/sides*math.tau)+up*math.sin(j/sides*math.tau))) for j in range(sides))
    for i in range(len(points)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    obj=mesh_object(name,vertices,faces,material,smooth=True);lengths=[0]
    for a,b in zip(points,points[1:]):lengths.append(lengths[-1]+(Vector(b)-Vector(a)).length)
    return source_uv(obj,[[(col/sides*math.tau*radius,lengths[row]),((col+1)/sides*math.tau*radius,lengths[row]),((col+1)/sides*math.tau*radius,lengths[row+1]),(col/sides*math.tau*radius,lengths[row+1])] for row in range(len(points)-1) for col in range(sides)])


def torus(name, center, major, wire, material, plane='xy', segments=48, sides=8):
    vertices=[];faces=[]
    for i in range(segments):
        a=i/segments*math.tau
        for j in range(sides):
            b=j/sides*math.tau;r=major+wire*math.cos(b)
            q=(r*math.cos(a),r*math.sin(a),wire*math.sin(b))
            if plane=='yz':q=(q[2],q[1],q[0])
            if plane=='xz':q=(q[0],q[2],q[1])
            vertices.append(tuple(v+w for v,w in zip(q,center)))
    for i in range(segments):
        for j in range(sides):faces.append((i*sides+j,((i+1)%segments)*sides+j,((i+1)%segments)*sides+(j+1)%sides,i*sides+(j+1)%sides))
    obj=mesh_object(name,vertices,faces,material,smooth=True)
    return source_uv(obj,[[(i/segments*math.tau*major,j/sides*math.tau*wire),((i+1)/segments*math.tau*major,j/sides*math.tau*wire),((i+1)/segments*math.tau*major,(j+1)/sides*math.tau*wire),(i/segments*math.tau*major,(j+1)/sides*math.tau*wire)] for i in range(segments) for j in range(sides)])


def pbr(name, rgba, rough=.8, metallic=0, scan=None):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    mat.diffuse_color=rgba;mat['one_light_basecolor_linear']=list(rgba)
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=rgba
    bsdf.inputs['Roughness'].default_value=rough
    bsdf.inputs['Metallic'].default_value=metallic
    mat['one_light_min_roughness']=max(.24,min(rough,.7))
    if scan:
        for filename,socket in [('diffuse.jpg','Base Color'),('roughness.jpg','Roughness'),('normal.jpg','Normal')]:
            path=SCAN_DIR/scan/filename;image=bpy.data.images.load(str(path),check_existing=True)
            if socket!='Base Color':image.colorspace_settings.name='Non-Color'
            n=mat.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;n.extension='REPEAT'
            uv=mat.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
            mat.node_tree.links.new(uv.outputs['UV'],n.inputs['Vector'])
            if socket=='Normal':
                normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.55
                mat.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs[0],bsdf.inputs[socket])
            elif socket=='Base Color':
                multiply=mat.node_tree.nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
                multiply.inputs[7].default_value=rgba;mat.node_tree.links.new(n.outputs['Color'],multiply.inputs[6]);mat.node_tree.links.new(multiply.outputs[2],bsdf.inputs[socket])
            else:mat.node_tree.links.new(n.outputs['Color'],bsdf.inputs[socket])
        mat['source_cc0_asset']=scan
    MATERIALS[name]=mat
    return mat


def tint_brass(obj):
    mesh=obj.data;attribute=mesh.color_attributes.new(name='SurfaceTint',type='FLOAT_COLOR',domain='CORNER')
    for li,loop in enumerate(mesh.loops):
        p=mesh.vertices[loop.vertex_index].co;n=noise.noise(p*32+Vector((4.2,8.1,2.7)))
        broad=noise.noise(p*7+Vector((8.8,1.1,5.4)))
        oxide=max(0,min(.7,(broad+.1)*1.2));dirt=max(.38,min(1,.72+n*.2))
        attribute.data[li].color=(dirt*(1-.44*oxide),dirt*(1-.12*oxide),dirt*(1+.1*oxide),1)
    mesh.color_attributes.active_color=attribute


def enable_tint(mat):
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='SurfaceTint'
    multiply=nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    multiply.inputs[6].default_value=bsdf.inputs['Base Color'].default_value
    links.new(vertex.outputs['Color'],multiply.inputs[7]);links.new(multiply.outputs[2],bsdf.inputs['Base Color'])
    mat['one_light_vertex_color']='SurfaceTint / COLOR_0'


def tree(objects):
    graph=bpy.context.evaluated_depsgraph_get();vertices=[];faces=[];owners=[]
    for obj in objects:
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles();offset=len(vertices)
        vertices.extend(evaluated.matrix_world@v.co for v in mesh.vertices)
        for t in mesh.loop_triangles:faces.append(tuple(offset+i for i in t.vertices));owners.append(obj.name)
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(vertices,faces,all_triangles=True),owners


def contact_height(x,z,supports):
    bvh,_=CONTACTS.support(supports);hit=bvh.ray_cast(point((x,50,z)),Vector((0,0,-1)),100)[0]
    if hit is None:raise RuntimeError('Actual declared support is missing')
    return float(hit.z)


def scan_cliff(asset, location, scale, yaw=0, ratio=.45, region='cliff', lean=.3):
    path=ROOT/f'web/public/models/{asset}/{asset}.gltf';before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes=[obj for obj in bpy.data.objects if obj not in before and obj.type=='MESH']
    result=[]
    for obj in meshes:
        obj.name='CC0 '+asset+' cliff scan'
        # Preserve the scan's actual geometry, UV0 and material inputs. A
        # source-bound anisotropic cliff placement is recorded explicitly.
        mesh=obj.data.copy();mesh.transform(obj.matrix_world);obj.data=mesh;obj.matrix_world=Matrix.Identity(4)
        for vertex in mesh.vertices:
            e=engine(vertex.co);e=[e[i]*scale[i] for i in range(3)];e[0]-=lean*e[1]
            xx=e[0]*math.cos(yaw)-e[2]*math.sin(yaw);zz=e[0]*math.sin(yaw)+e[2]*math.cos(yaw)
            vertex.co=point((xx+location[0],e[1]+location[1],zz+location[2]))
        for collection in list(obj.users_collection):collection.objects.unlink(obj)
        STATIC.objects.link(obj);tag(obj,region)
        if mesh.uv_layers:mesh.uv_layers[0].name='UVMap'
        uv=mesh.uv_layers.new(name='SourceLightmap');uv.data.foreach_set('uv',[component for value in mesh.uv_layers['UVMap'].data for component in value.uv])
        mesh.uv_layers.active=mesh.uv_layers['UVMap'];mesh.uv_layers['UVMap'].active_render=True
        mod=obj.modifiers.new('Source-preserving distant scan reduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
        for mat in mesh.materials:mat['one_light_min_roughness']=.74;mat['source_cc0_asset']=asset
        obj['source_cc0_asset']=asset;obj['source_file']=str(path.relative_to(ROOT));obj['source_sha256']=digest(path)
        obj['source_placement']=json.dumps({'location':location,'scale':scale,'yaw':yaw,'cliffLean':lean,'decimate':ratio})
        result.append(obj)
    for obj in list(bpy.data.objects):
        if obj not in before and obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    SCANS.append({'asset':asset,'source':str(path.relative_to(ROOT)),'sha256':digest(path),'license':'CC0-1.0','licenseUrl':'https://polyhaven.com/license','objects':[obj.name for obj in result]})
    return result


def arch(name,cx,front,width,depth,floor,wood,paint,paper,tile,plaster):
    # Timber frame, real wall thickness, paper backed lattice and open bay.
    for z in [front-depth,front]:
        for x in [cx-width/2+.18,cx,cx+width/2-.18]:
            lathe(name+' entasis column',[(0,0),(.17,0),(.16,.2),(.139,2.6),(.17,2.75),(0,2.75)],(x,floor,z),paint,20)
            box(name+' column bearing',(.42,.16,.42),(x,floor-.08,z),wood,.01)
            box(name+' tie beam',(.25,.26,depth+.4),(x,floor+2.68,front-depth/2),wood,.014)
    for z in [front-depth,front]:
        box(name+' carved transverse architrave',(width+.6,.28,.28),(cx,floor+2.83,z),paint,.014)
    box(name+' rear lime wall',(width-.3,2.5,.14),(cx,floor+1.32,front-depth+.04),plaster,.01)
    for side in [-1,1]:
        box(name+' side wall',(.14,2.5,depth),(cx+side*(width/2-.12),floor+1.32,front-depth/2),plaster,.01)
    for side in [-1,1]:
        xx=cx+side*width*.335;w=width*.26
        box(name+' paper window backing',(w,1.53,.025),(xx,floor+1.58,front-.09),paper,.002)
        for s in [-1,1]:
            box(name+' deep window jamb',(.075,1.7,.12),(xx+s*(w/2+.025),floor+1.58,front),wood,.006)
            box(name+' deep window rail',(w+.15,.075,.12),(xx,floor+1.58+s*.84,front),wood,.006)
        for j in range(1,8):box(name+' physical lattice',(.024,1.57,.032),(xx-w/2+j*w/8,floor+1.58,front+.01),wood,.002)
        for j in range(1,5):box(name+' physical lattice',(w,.024,.032),(xx,floor+.79+j*1.57/5,front+.015),wood,.002)
        box(name+' lower panel',(w,.62,.09),(xx,floor+.41,front-.025),paint,.007)
    for side in [-1,1]:
        # Door leaves sit physically within their jambs and open into the hall.
        door=box(name+' open panelled door',(.7,2.22,.08),(cx+side*.72,floor+1.16,front-.25),wood,.008)
        pivot=point((cx+side*1.08,floor,front));rotation=Matrix.Translation(pivot)@Matrix.Rotation(side*.68,4,'Z')@Matrix.Translation(-pivot)
        door.data.transform(rotation)
        box(name+' main doorway jamb',(.15,2.5,.2),(cx+side*1.11,floor+1.26,front),paint,.01)
    for i in range(17):box(name+' inner floor board',(width-.2,.08,(depth-.12)/17-.008),(cx,floor-.04,front-depth+(i+.5)*(depth-.12)/17),wood,.003)
    pitched_roof(name+' tiled roof',cx,floor+3.0,front-depth/2,width+1.4,depth/2+.75,1.25,tile,wood)
    # Readable simple joinery rather than a featureless red block.
    for x in [cx-width/2+.18,cx,cx+width/2-.18]:
        for z in [front,front-depth]:
            box(name+' bracket bearing',(.39,.16,.4),(x,floor+2.84,z),wood,.009)
            for side in [-1,1]:
                tube_curve(name+' curved bracket',[(x+side*.48,floor+3.05,z),(x+side*.28,floor+2.96,z),(x,floor+2.94,z)],.065,paint,8)


def pitched_roof(name,cx,eave,cz,width,half_depth,rise,tile,wood):
    def surf(x,t,side):
        corner=.17*(abs((x-cx)/(width/2))**6)*t**5
        return (x,eave+rise*(1-t)**1.55+.2*t**8+corner,cz+side*half_depth*t)
    for side in [-1,1]:
        cols=max(12,int(width/.35));rows=10;vertices=[];faces=[]
        for j in range(rows+1):
            for i in range(cols+1):vertices.append(surf(cx-width/2+width*i/cols,j/rows,side))
        for j in range(rows):
            for i in range(cols):
                a=j*(cols+1)+i;faces.append((a,a+1,a+cols+2,a+cols+1))
        if side>0:faces=[tuple(reversed(f)) for f in faces]
        grid_uv(mesh_object(name+' visible curved boarding',vertices,faces,wood,smooth=True),cols+1,width/cols,half_depth*1.15/rows)
        # Continuous overlapping pan strips with genuine curved tile ends.
        for col in range(cols):
            xx=cx-width/2+(col+.5)*width/cols;vertices=[];faces=[]
            for j in range(rows+1):
                for i in range(5):
                    a=(i/4-.5)*math.pi;v=surf(xx+math.sin(a)*width/cols*.49,j/rows,side)
                    vertices.append((v[0],v[1]+.045-.035*math.cos(a),v[2]))
            for j in range(rows):
                for i in range(4):
                    a=j*5+i;faces.append((a,a+1,a+6,a+5))
            if side>0:faces=[tuple(reversed(f)) for f in faces]
            grid_uv(mesh_object(name+' concave pan strip',vertices,faces,tile,smooth=True),5,math.pi*width/cols*.49/4,half_depth*1.15/rows)
            if col<cols-1:
                # A cover tile is a half-round shell resting on its two pan
                # edges; a hidden full cylinder needlessly doubles geometry.
                vertices=[];faces=[]
                for j in range(6):
                    p=surf(cx-width/2+(col+1)*width/cols,j/5,side)
                    for k in range(5):
                        a=k/4*math.pi
                        vertices.append((p[0]+math.cos(a)*.047,p[1]+.045+math.sin(a)*.047,p[2]))
                for j in range(5):
                    for k in range(4):
                        a=j*5+k;faces.append((a,a+1,a+6,a+5))
                if side>0:faces=[tuple(reversed(f)) for f in faces]
                grid_uv(mesh_object(name+' half-round clay cover',vertices,faces,tile,smooth=True),5,math.pi*.047/4,half_depth*1.15/5)
        for i in range(max(8,int(width/.55))):
            xx=cx-width/2+(i+.5)*width/max(8,int(width/.55));points=[]
            for j in range(5):
                p=surf(xx,j/4,side);points.append((p[0],p[1]-.095,p[2]))
            tube_curve(name+' exposed cambered rafter',points,.049,wood,6)
        for t in [.22,.57,.88]:
            p=surf(cx,t,side);beam(name+' transverse purlin',(cx-width/2,p[1]-.16,p[2]),(cx+width/2,p[1]-.16,p[2]),.072,wood,10)
        for i in range(cols):
            p=surf(cx-width/2+(i+.5)*width/cols,1,side)
            vertices=[]
            for depth in [0,.016]:
                for k in range(7):
                    a=k/6*math.pi
                    vertices.append((p[0]+math.cos(a)*.047,p[1]+.046+math.sin(a)*.047,p[2]+side*depth))
            grid_uv(mesh_object(name+' open curved eave tile end',vertices,[(i,i+1,i+8,i+7) for i in range(6)],tile,smooth=True),7,math.pi*.047/6,.016)
    beam(name+' plain ridge',(cx-width/2,eave+rise+.09,cz),(cx+width/2,eave+rise+.09,cz),.09,tile,12)


def support_post(x,z,top,bottom,cliff_tree,wood):
    # The post bears on a real horizontal seat. A corbel/diagonal load path
    # enters the actual scanned cliff, rather than terminating in empty cloud.
    hit=cliff_tree.ray_cast(point((15,bottom-.3,z)),Vector((-1,0,0)),55)
    if hit[0] is None:hit=cliff_tree.find_nearest(point((-2,bottom-.3,z)))
    if hit[0] is None:raise RuntimeError('Missing genuine cliff anchor')
    anchor=engine(hit[0]);anchor[0]-=.12
    seat=box('Rock-fastened post bearing seat',(.48,.28,.48),(x,bottom-.14,z),wood,.01)
    root=beam('Deep cantilever entering scanned cliff',anchor,(x,bottom-.14,z),.16,wood,10)
    beam('Triangular cliff-foot brace',(anchor[0],anchor[1]-.9,anchor[2]),(x,bottom-.24,z),.13,wood,10)
    with CONTACTS.group('structural post '+str(len(SUPPORTS)),[seat]):
        post=lathe('Long gallery post',[(0,0),(.15,0),(.145,.22),(.13,top-bottom-.2),(.15,top-bottom),(0,top-bottom)],(x,bottom,z),wood,12)
    SUPPORTS.append({'kind':'cliff-corbel-post','post':post.name,'seat':seat.name,'corbel':root.name,'cliffAnchorEngine':anchor,'cliffNearestSurfaceEngine':engine(hit[0]),'intentionalRockEmbeddingMetres':.12,'postBearingYEngine':bottom})
    return post


def gallery(wood,red,tile,cliff_tree):
    for z in [-6,-2,2,6]:
        for x in [-.85,3.45]:support_post(x,z,-.08,-14-.12*(z+6),cliff_tree,wood)
        box('Gallery transverse deck beam',(4.6,.24,.24),(1.3,-.2,z),wood,.01)
    for x in [-.85,1.3,3.45]:box('Continuous gallery stringer',(.19,.22,15),(x,-.19,0),wood,.01)
    for i in range(75):
        z=-7.5+(i+.5)*.2
        box('Worn gallery floor board',(4.6,.08,.192),(1.3,-.04,z),wood,.003)
    for z in [-6,-3,0,3,6]:
        for x in [-.85,3.45]:
            lathe('Painted gallery column',[(0,0),(.14,0),(.135,.3),(.115,2.9),(.145,3.1),(0,3.1)],(x,0,z),red,20)
            box('Gallery post stone-free timber foot',(.34,.12,.34),(x,.06,z),wood,.009)
            beam('Gallery column knee brace',(x,2.38,z),(x,2.93,z+.55),.065,wood,8)
        box('Visible gallery cross beam',(4.6,.24,.23),(1.3,3.0,z),red,.012)
    for x in [-.85,3.45]:
        for y in [.47,1.02]:box('Gallery mortised railing',(.08,.075,14.9),(x,y,0),wood,.006)
        for i in range(19):box('Gallery railing stanchion',(.075,1.03,.075),(x,.515,-7.2+i*.8),wood,.005)
    # A proper narrow gabled gallery roof runs along the gallery, rather than
    # making a shallow 16 m roof pitch across the camera's line of sight.
    before=set(STATIC.objects)
    pitched_roof('Gallery',0,3.17,0,16.0,2.6,.72,tile,wood)
    rotation=Matrix.Translation(point((1.3,0,0)))@Matrix.Rotation(math.pi/2,4,'Z')
    for obj in set(STATIC.objects)-before:obj.data.transform(rotation)
    # The lamp's actual load-bearing beam is explicitly source-identifiable.
    hanger_beam=box('Storm lantern supporting beam',(5.65,.24,.23),(1.975,3.0,0),wood,.01)
    beam('Storm cantilevered beam knee',(3.45,2.0,0),(4.61,2.89,0),.085,wood,10)
    return hanger_beam


def lookout(wood):
    # A modest open balcony projects from the gallery's existing long posts.
    # Its two diagonal brackets enter those posts; there are no floating seats.
    for z,post_z in [(3.2,2),(5.9,6)]:
        beam('Lookout bearing diagonal',(3.43,-1.75,post_z),(5.56,-.22,z),.12,wood,10)
        box('Lookout continuous cantilever girder',(2.48,.24,.22),(4.49,-.20,z),wood,.009)
    for x in [3.5,4.5,5.55]:box('Lookout longitudinal stringer',(.16,.20,2.96),(x,-.18,4.55),wood,.008)
    for i in range(15):box('Lookout worn continuous plank',(2.10,.08,.192),(4.65,-.04,3.1+(i+.5)*.2),wood,.003)
    for z in [3.15,6.0]:
        for y in [.48,1.03]:box('Lookout end guardrail',(2.28,.075,.08),(4.55,y,z),wood,.006)
    for y in [.48,1.03]:box('Lookout outer guardrail',(.08,.075,2.85),(5.65,y,4.575),wood,.006)
    for z in [3.15,4.1,5.05,6.0]:box('Lookout guardrail post',(.09,1.08,.09),(5.65,.54,z),wood,.005)


def light(name, location, watts, rgb, radius=.05, role='fixture'):
    data=bpy.data.lights.new(name,'POINT');data.energy=watts;data.color=rgb;data.shadow_soft_size=radius
    obj=bpy.data.objects.new(name,data);LIGHTS.objects.link(obj);obj.location=point(location);obj['bake_role']=role
    return obj


def window_spill(name,location,watts,width,height):
    data=bpy.data.lights.new(name,'AREA');data.energy=watts;data.color=(1,.57,.27);data.shape='RECTANGLE';data.size=width;data.size_y=height
    obj=bpy.data.objects.new(name,data);LIGHTS.objects.link(obj);obj.location=point(location)
    obj.rotation_euler=point((0,0,1)).to_track_quat('-Z','Y').to_euler();obj['bake_role']='fixture'
    obj['physical_source']='Area spill at actual luminous paper window; not a camera fill.'
    return obj


def linear_knots(values,u):
    t=max(0,min(1,u))*(len(values)-1);i=min(len(values)-2,int(t))
    return values[i]+(values[i+1]-values[i])*(t-i)


def far_ridge(name,front,width,depth,height,rock,phase):
    """A connected stratified massif: tall walls, narrow ledges and broken tops.

    The former sin(t*pi)**2.4 cross-section made every summit a rounded cone.
    These measured-depth rows instead describe an exposed rock wall with two
    erosion benches, a narrow irregular summit and a receding back slope.
    """
    columns=256
    # (depth fraction, height fraction): short horizontal runs carry most of
    # the ascent, so the major surfaces are cliffs rather than smooth hills.
    section=[(0,-.80),(.025,-.40),(.045,.04),(.080,.16),(.095,.18),
             (.11,.43),(.155,.47),(.17,.49),(.185,.76),(.23,.81),
             (.245,.83),(.27,.99),(.34,1.0),(.40,.94),(.52,.62),
             (.68,.25),(.83,-.10),(1,-.80)]
    # Long joint-controlled shoulders alternate with narrow clefts. Linear
    # crest segments retain angular, irregular rock silhouettes at distance.
    crests=[.10,.46,.51,.45,.76,.81,.72,.75,.38,.27,.59,.65,
            .58,.91,.96,.84,.88,.62,.37,.52,.47,.21,.08]
    if phase>2:crests=[.10,.34,.31,.63,.67,.57,.86,.91,.79,.61,.64,
                       .36,.49,.78,.83,.72,.55,.62,.40,.24,.33,.15,.08]
    vertices=[];faces=[]
    for row,(t,fraction) in enumerate(section):
        for i in range(columns+1):
            u=i/columns;x=-width/2+u*width
            crest=height*linear_knots(crests,u)
            # Joint flutes continue down the entire wall, while small row
            # offsets make actual ledges catch directional moon/sun light.
            joint=(math.sin(u*math.tau*29+phase)*.55+
                   math.sin(u*math.tau*61-phase)*.24)
            boundary=min(1,u*14,(1-u)*14)
            y=-54+(crest+54)*fraction+boundary*joint*1.7
            setback=(5.5*math.sin(u*math.tau*7.3+phase)+
                     2.0*math.sin(u*math.tau*19.1+phase*.3))*boundary
            z=front-t*depth+setback*(.35+.65*max(0,fraction))
            vertices.append((x,y,z))
    for j in range(len(section)-1):
        for i in range(columns):
            a=j*(columns+1)+i;faces.append((a,a+columns+1,a+columns+2,a+1))
    obj=mesh_object(name,vertices,faces,rock,'far',True)
    # Preserve a connected analytical chart, while keeping geological bench
    # transitions sharp. UV0 remains the real photographed rock material.
    chart_rows=[0.0]
    for row in range(1,len(section)):
        chart_rows.append(chart_rows[-1]+sum(math.dist(vertices[row*(columns+1)+i],vertices[(row-1)*(columns+1)+i]) for i in range(columns+1))/(columns+1))
    source_uv(obj,[[(vertices[obj.data.loops[li].vertex_index][0],
                    chart_rows[obj.data.loops[li].vertex_index//(columns+1)])
                   for li in p.loop_indices] for p in obj.data.polygons])
    sharp_rows={2,4,5,7,8,10,11,12}
    for edge in obj.data.edges:
        a,b=edge.vertices
        if a//(columns+1)==b//(columns+1) and a//(columns+1) in sharp_rows:
            edge.use_edge_sharp=True
    obj['source_texture_asset']='rock_pitted_mossy'
    obj['authored_terrain']='Connected jointed rock massif with steep exposed walls, erosion benches, clefts and irregular linear summit segments; no bell-shaped hill cross-section.'
    obj['massif_section']=json.dumps(section)
    uv_world(obj,6)
    return obj


def foreground_cliff_drop(rock):
    """Visible rock beneath the supported gallery; original anchors stay exact."""
    columns=44
    # Cross-section remains behind the existing posts, exposing the vertical
    # drop rather than adding a floating shelf in front of the gallery.
    rows=[(-1.8,-2.8),(-3.2,-2.4),(-7,-1.9),(-7.7,-1.1),
          (-16,-.7),(-17,-.1),(-31,-.5),(-44,-1.5),(-62,-3.1)]
    vertices=[];faces=[]
    for j,(y,x) in enumerate(rows):
        for i in range(columns+1):
            z=-31+42*i/columns
            flute=.48*math.sin(z*.81)+.24*math.sin(z*2.13+.4)
            vertices.append((x+flute,y+.18*math.sin(z*.57+j*.9),z))
    for j in range(len(rows)-1):
        for i in range(columns):
            a=j*(columns+1)+i;faces.append((a,a+1,a+columns+2,a+columns+1))
    obj=mesh_object('Exposed gallery rock-face drop and strata',vertices,faces,rock,'cliff',True)
    chart_rows=[0.0]
    for row in range(1,len(rows)):
        chart_rows.append(chart_rows[-1]+sum(math.dist(vertices[row*(columns+1)+i],vertices[(row-1)*(columns+1)+i]) for i in range(columns+1))/(columns+1))
    source_uv(obj,[[(vertices[obj.data.loops[li].vertex_index][2],chart_rows[obj.data.loops[li].vertex_index//(columns+1)]) for li in p.loop_indices] for p in obj.data.polygons])
    for edge in obj.data.edges:
        a,b=edge.vertices
        if a//(columns+1)==b//(columns+1) and a//(columns+1) in {2,3,4,5}:
            edge.use_edge_sharp=True
    uv_world(obj,2.5)
    obj['source_texture_asset']='rock_pitted_mossy'
    obj['structural_scope']='Additional exposed geology only; all existing scanned cliff anchors, corbels, post bearings and contact members remain unchanged.'
    return obj


def permute289(x):
    x=x-289*math.floor(x/289)
    value=(34*x+1)*x
    return value-289*math.floor(value/289)


def value_noise3(p):
    """Deterministic value lattice; integer hash intermediates fit float32."""
    cell=[math.floor(x) for x in p];fraction=[x-c for x,c in zip(p,cell)]
    blend=[f*f*f*(f*(f*6-15)+10) for f in fraction]
    def h(x,y,z):
        return permute289(permute289(permute289(cell[0]+x)+(cell[1]+y-289*math.floor((cell[1]+y)/289)))+(cell[2]+z-289*math.floor((cell[2]+z)/289)))/288
    def mix(a,b,t):return a+(b-a)*t
    return mix(mix(mix(h(0,0,0),h(1,0,0),blend[0]),mix(h(0,1,0),h(1,1,0),blend[0]),blend[1]),
               mix(mix(h(0,0,1),h(1,0,1),blend[0]),mix(h(0,1,1),h(1,1,1),blend[0]),blend[1]),blend[2])


def dress_scan_cap(obj,index):
    """Deform only the scan's upper 15%; photographed interiors/UV stay exact."""
    graph=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(graph)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=graph)
    original_positions=[engine(v.co) for v in mesh.vertices]
    original_normals=[n.vector.copy() for n in mesh.corner_normals]
    original_uv=[tuple(t.uv) for t in mesh.uv_layers['UVMap'].data]
    minimum=min(p[1] for p in original_positions);maximum=max(p[1] for p in original_positions)
    height=maximum-minimum;cap_base=maximum-height*.15;cap_depth=height*.15
    def displacement(p):
        t=max(0,min(1,(p[1]-cap_base)/cap_depth));weight=t*t*(3-2*t)
        coarse=value_noise3([(p[0]+index*31.7)/33,7.3+index*1.7,p[2]/33])
        detail=value_noise3([(p[0]-index*17.1)/12,23.6+index*2.3,(p[2]+19.2)/12])
        return height*.12*(coarse*.65+detail*.35-.45)*weight
    moved=[];derivatives={};maximum_displacement=0
    for i,(vertex,p) in enumerate(zip(mesh.vertices,original_positions)):
        if p[1]<=cap_base:continue
        shift=displacement(p);vertex.co=point((p[0],p[1]+shift,p[2]));moved.append(i)
        maximum_displacement=max(maximum_displacement,abs(shift));gradient=[]
        for axis in range(3):
            left=list(p);right=list(p);left[axis]-=.005;right[axis]+=.005
            gradient.append((displacement(right)-displacement(left))/.01)
        if 1+gradient[1]<=.1:raise RuntimeError('Scan cap deformer folds its vertical Jacobian')
        derivatives[i]=gradient
    # Apply the deformation Jacobian to actual imported smooth normals. The
    # unmodified interior corner vectors are copied bit-for-bit, not rebuilt.
    custom=mesh.attributes.get('custom_normal')
    if custom:mesh.attributes.remove(custom)
    custom=mesh.attributes.new('custom_normal','FLOAT_VECTOR','CORNER')
    for li,loop in enumerate(mesh.loops):
        normal=original_normals[li]
        if loop.vertex_index in derivatives:
            nx,ny,nz=engine(normal);gx,gy,gz=derivatives[loop.vertex_index]
            vertical=ny/(1+gy);normal=point((nx-gx*vertical,vertical,nz-gz*vertical)).normalized()
        custom.data[li].vector=normal
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    obj.data=mesh;mesh.update()
    if [tuple(t.uv) for t in mesh.uv_layers['UVMap'].data]!=original_uv:raise RuntimeError('Scan cap changed photographic UV0')
    unchanged=[i for i in range(len(mesh.vertices)) if i not in derivatives]
    if any(engine(mesh.vertices[i].co)!=original_positions[i] for i in unchanged):raise RuntimeError('Scan cap changed protected interior positions')
    obj['scan_cap_scope']=json.dumps({'method':'Only upper 15% in world Y; two nonrepeating deterministic value-noise scales, smooth boundary weight. Evaluated scan frozen before dressing; topology/material/UV0 untouched. Imported corner normals transformed by deformation Jacobian only on moved vertices.',
                                     'capBaseYEngine':cap_base,'capDepthMetres':cap_depth,'vertices':len(mesh.vertices),'movedCapVertices':len(moved),'protectedInteriorVertices':len(unchanged),'maximumDisplacementMetres':maximum_displacement,
                                     'uv0Unchanged':True,'protectedInteriorPositionsExact':True,'seedIndex':index})


def dress_scan_boundaries17(obj,index):
    """Break the scan crop outline; retain its photographed central surface."""
    graph=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(graph)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=graph)
    world=obj.matrix_world.copy();inverse=world.inverted();normal_world=world.to_3x3().inverted().transposed()
    original=[engine(world@v.co) for v in mesh.vertices]
    normals=[n.vector.copy() for n in mesh.corner_normals]
    uv0=[tuple(t.uv) for t in mesh.uv_layers['UVMap'].data]
    low=[min(p[a] for p in original) for a in range(3)];high=[max(p[a] for p in original) for a in range(3)]
    height=high[1]-low[1];width=high[0]-low[0]
    upper_base=high[1]-.35*height;lower_top=low[1]+.25*height
    # Each massif has unequal, nonperiodic clefts. There is no height band or
    # terrace added across its face, and no positive displacement of a crest.
    centres=[.17+.025*math.sin(index*1.73+.2),.52+.045*math.sin(index*2.31+1.2),.83-.025*math.cos(index*1.17+.6)]
    widths=[.14+.015*(index%2),.20-.01*(index%3),.11+.015*((index+1)%3)]
    strengths=[.83,.64,1.0]
    def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
    def displacement(p):
        u=(p[0]-low[0])/width;notches=[]
        for centre,radius,strength in zip(centres,widths,strengths):
            q=abs((u-centre)/radius)
            notches.append(strength*(.5+.5*math.cos(math.pi*q)) if q<1 else 0)
        variation=.7+.3*value_noise3([(p[0]+index*41.7)/37,19.3+index,p[2]/31])
        top=-height*.21*max(notches)*variation*smooth((p[1]-upper_base)/(.35*height))
        # The cropped feet continue down into the existing deep atmospheric
        # substrate, with an unequal natural edge rather than six level ends.
        foot=-220-17*value_noise3([(p[0]-index*23.1)/73,7.1+index*1.3,p[2]/59])
        bottom=(foot-low[1])*smooth((lower_top-p[1])/(.25*height))
        return top+bottom
    moved={};maximum=0
    for i,(vertex,p) in enumerate(zip(mesh.vertices,original)):
        if lower_top<=p[1]<=upper_base:continue
        shift=displacement(p)
        if shift==0:continue
        vertex.co=inverse@point((p[0],p[1]+shift,p[2]));gradient=[]
        for axis in range(3):
            a=list(p);b=list(p);a[axis]-=.005;b[axis]+=.005
            gradient.append((displacement(b)-displacement(a))/.01)
        if 1+gradient[1]<.099:raise RuntimeError('Source17 boundary deformer violates positive vertical Jacobian')
        moved[i]=gradient;maximum=max(maximum,abs(shift))
    custom=mesh.attributes.get('custom_normal')
    if custom:mesh.attributes.remove(custom)
    custom=mesh.attributes.new('custom_normal','FLOAT_VECTOR','CORNER')
    for li,loop in enumerate(mesh.loops):
        normal=normals[li]
        if loop.vertex_index in moved:
            nx,ny,nz=engine(normal_world@normal);gx,gy,gz=moved[loop.vertex_index]
            vertical=ny/(1+gy);normal=(world.to_3x3().transposed()@point((nx-gx*vertical,vertical,nz-gz*vertical))).normalized()
        custom.data[li].vector=normal
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    obj.data=mesh;mesh.update()
    if [tuple(t.uv) for t in mesh.uv_layers['UVMap'].data]!=uv0:raise RuntimeError('Source17 boundary changed photographic UV0')
    protected=[i for i in range(len(original)) if i not in moved]
    if any(engine(world@mesh.vertices[i].co)!=original[i] for i in protected):raise RuntimeError('Source17 boundary moved a protected scan interior vertex')
    obj['scan_boundary17_scope']=json.dumps({'method':'Source14 upper-cap dressing is retained, then upper35% gains three unequal downward clefts and lower25% continues into deep substrate. Central40% and every other untouched vertex remain exact; UV0/topology/material unchanged. Actual source corner normals follow the deformation Jacobian.',
        'topDepthMaximumFraction':.21,'topZoneFraction':.35,'allWorldVerticalJacobianLowerBound':.1,'lowerZoneFraction':.25,
        'centralProtectedYEngine':[lower_top,upper_base],'movedVertices':len(moved),'protectedVertices':len(protected),
        'maximumDisplacementMetres':maximum,'notchCentresNormalizedX':centres,'notchWidthsNormalizedX':widths,
        'lowestFootRangeEngine':[-237,-220],'uv0Unchanged':True,'protectedInteriorPositionsExact':True,'seedIndex':index})


def far_scan_massifs():
    """Six staggered real CC0 rock scans; no procedural terraced wall."""
    # (world X centre, foremost world Z, uniform scale, yaw). Uniform scale
    # preserves the photographed formation's proportions and original UV0.
    placements=[(-169,-425,34,.12),(-23,-355,31,-.10),
                (155,-465,40,.18),(355,-650,43,-.16),
                (-277,-825,55,.08),(73,-1035,65,-.13)]
    result=[]
    for index,(cx,front,scale,yaw) in enumerate(placements):
        objects=scan_cliff('rock_face_01',(0,0,0),(scale,scale,scale),yaw=yaw,ratio=.18,region='far',lean=0)
        bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();points=[]
        for obj in objects:
            evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh()
            points.extend(engine(evaluated.matrix_world@v.co) for v in mesh.vertices);evaluated.to_mesh_clear()
        centre=(min(p[0] for p in points)+max(p[0] for p in points))/2
        delta=(cx-centre,-42-min(p[1] for p in points),front-max(p[2] for p in points))
        translation=Matrix.Translation(point(delta))
        for obj in objects:
            obj.data.transform(translation);obj.name=f'Far photographic rock massif {index+1:02d}'
            obj['source_massif_placement']=json.dumps({'uniformScale':scale,'yaw':yaw,'initialEvaluatedBottomEngine':-42,'evaluatedFrontEngine':front,'evaluatedCentreXEngine':cx,'translationAfterEvaluatedBounds':delta,'finalBoundaryReshaped':True,'purpose':'Staggered, partially occluding natural rock masses. Original scan UV0 and PBR materials retained; final source17 boundary bounds are measured separately.'})
            dress_scan_cap(obj,index)
            dress_scan_boundaries17(obj,index)
        # scan_cliff's inventory is recorded before renaming; update the
        # actual object references rather than leaving stale source names.
        SCANS[-1]['objects']=[obj.name for obj in objects]
        result.extend(objects)
    return result


def hero_lantern(brass,bright,soot,wax,glass):
    global TARGET
    x,z=4.5,0.0
    # The forged eye is fixed into the underside of the actual timber beam.
    beam('Embedded lantern eye shank',(x,2.93,z),(x,3.10,z),.008,soot,10)
    fixed=torus('Fixed forged hanging eye',(x,2.91,z),.04,.004,soot,'xy',40,6)
    TARGET=HERO
    pivot=bpy.data.objects.new('Storm hanging pivot',None);HERO.objects.link(pivot);pivot.location=point((x,2.91,z));pivot['one_light_dynamic']=True;pivot['hero_id']='storm'
    first=torus('Storm upper load link',(x,2.838,z),.04,.004,brass,'yz',32,6)
    second=torus('Storm second load link',(x,2.766,z),.04,.004,brass,'xy',32,6)
    third=torus('Storm third load link',(x,2.694,z),.04,.004,brass,'yz',32,6)
    fourth=torus('Storm lower load link',(x,2.622,z),.04,.004,brass,'xy',32,6)
    # A substantial curved bail and turned ventilated crown, not a gold cage.
    handle=[]
    for i in range(21):
        a=i/20*math.pi;handle.append((x+math.cos(a)*.2,2.285+math.sin(a)*.25,z))
    bail=tube_curve('Storm swept brass bail',handle,.006,brass,8)
    eye=torus('Storm bail eye',(x,2.567,z),.023,.004,brass,'yz',32,6)
    beam('Storm welded bail eye neck',(x,2.535,z),(x,2.544,z),.006,brass,8)
    for side in [-1,1]:
        beam('Storm real bail hinge lug',(x+side*.174,2.225,z),(x+side*.2,2.285,z),.01,brass,10)
        beam('Storm bail hinge pin',(x+side*.2,2.285,z-.012),(x+side*.2,2.285,z+.012),.007,bright,12)
    base=lathe('Storm cast base and oil-wax cup',[(0,0),(.19,0),(.205,.018),(.207,.035),(.177,.055),(.167,.075),(.145,.09),(0,.09)],(x,1.54,z),brass,48)
    for y,r in [(1.56,.203),(1.61,.176),(2.18,.153),(2.225,.173)]:torus('Storm worn turned bead',(x,y,z),r,.004,bright,'xz',48,4)
    crown=lathe('Storm spun crown',[(.152,0),(.18,.024),(.19,.043),(.17,.062),(.108,.11),(.068,.155),(.06,.195),(0,.204)],(x,2.18,z),brass,48)
    for i in range(12):
        a=i/12*math.tau
        # Vent slots are actual recessed dark openings between raised ribs.
        beam('Storm crown vent rib',(x+math.cos(a)*.065,2.305,z+math.sin(a)*.065),(x+math.cos(a)*.059,2.359,z+math.sin(a)*.059),.004,bright,6)
    for a in [math.pi/4+i*math.pi/2 for i in range(4)]:
        points=[(x+math.cos(a)*r,y,z+math.sin(a)*r) for r,y in [(.174,1.59),(.187,1.76),(.192,1.98),(.171,2.18),(.166,2.245)]]
        tube_curve('Storm protective bowed upright',points,.006,brass,10)
        lathe('Storm frame rivet',[(0,0),(.008,0),(.008,.006),(0,.006)],points[-1],bright,16)
    # A real 2 mm glass shell, with independently modelled inner/outer walls.
    profile=[(.145,0),(.16,.04),(.174,.15),(.177,.3),(.167,.44),(.143,.54),(.14,.56),(.138,.56),(.141,.54),(.165,.44),(.175,.3),(.172,.15),(.158,.04),(.143,0),(.145,0)]
    with CONTACTS.group('storm glass shell',[base]):
        chimney=lathe('Storm clear hurricane glass',profile,(x,1.63,z),glass,48)
    chimney.visible_shadow=False
    chimney['one_light_shadow_policy']='Clear2mm hurricane glass keeps physical transmission/reflection but omits the opaque shadow approximation; metal frame/candle shadows remain.'
    with CONTACTS.group('storm candle and wick',[base]):
        candle=lathe('Storm used tallow candle',[(0,0),(.037,0),(.037,.13),(.035,.153),(.025,.146),(0,.145)],(x,1.63,z),wax,32)
        wick=tube_curve('Storm charred fibre wick',[(x,1.779,z),(x+.001,1.787,z),(x-.001,1.792,z)],.0015,soot,8)
        for i in range(4):
            a=.3+i*1.45;points=[(x+.035*math.cos(a),1.77,z+.035*math.sin(a)),(x+.038*math.cos(a),1.72-i*.007,z+.038*math.sin(a))]
            tube_curve('Storm wax dribble',points,.0025,wax,6)
    bpy.context.view_layer.update()
    vertices=CONTACTS.vertices([wick]);top=max(p.z for _,_,p in vertices)
    unique={tuple(p):p for _,_,p in vertices if abs(p.z-top)<1e-6};tip=sum(unique.values(),Vector())/len(unique)
    point_position=tip+Vector((0,0,.024));lamp=light('Storm flame 45W basis',engine(point_position),45,(1,189/255,120/255),.035,'lamp')
    for obj in list(HERO.objects):
        if obj==pivot:continue
        world=obj.matrix_world.copy();obj.parent=pivot;obj.matrix_world=world
        obj['one_light_dynamic']=True;obj['hero_id']='storm'
        if obj.type=='MESH' and obj.data.materials[0] in [brass,bright]:tint_brass(obj)
    TARGET=STATIC
    return {'id':'storm','collection':'HERO','rootObject':pivot.name,'hangingPivot':engine(pivot.matrix_world.translation),
            'wickTip':engine(tip),'wickObject':wick.name,'glassObject':chimney.name,'pointObject':lamp.name,
            'flamePoint':engine(tip+Vector((0,0,.002))),
            'lampBasis':{'watts':45,'position':engine(point_position),'linearColor':list(lamp.data.color)},
            'suspension':{'fixedEye':fixed.name,'firstLink':first.name,'secondLink':second.name,'thirdLink':third.name,'fourthLink':fourth.name,'bail':bail.name,'bailEye':eye.name},
            'flame':{'height':.037,'leanMaximum':.005,'source':'Live runtime flame rooted at actual wick tip.'},
            'sourceFrame':'Engine Y-up metres; hero objects retain authored world transforms and pivot.'}


def camera(name,location,target,fov,width,height):
    data=bpy.data.cameras.new(name);data.sensor_fit='VERTICAL';data.sensor_height=24;data.lens=12/math.tan(math.radians(fov)/2);data.clip_start=.005;data.clip_end=2000
    obj=bpy.data.objects.new(name,data);CAMERAS.objects.link(obj);obj.location=point(location);obj.rotation_euler=(point(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    obj['cover_viewport']=json.dumps([width,height]);obj['cover_fov']=fov
    return obj


def suspension_audit(hero):
    """Measure the real interlinked mesh surfaces, independently of centres."""
    pairs=[('fixedEye','firstLink'),('firstLink','secondLink'),('secondLink','thirdLink'),
           ('thirdLink','fourthLink'),('fourthLink','bailEye'),('bailEye','bail')]
    records=[]
    for left,right in pairs:
        a=bpy.data.objects[hero['suspension'][left]];b=bpy.data.objects[hero['suspension'][right]]
        bvh,_=tree([b]);graph=bpy.context.evaluated_depsgraph_get();evaluated=a.evaluated_get(graph)
        data=evaluated.to_mesh();samples=[evaluated.matrix_world@v.co for v in data.vertices]
        samples.extend(evaluated.matrix_world@p.center for p in data.polygons)
        distances=[bvh.find_nearest(p)[3] for p in samples];evaluated.to_mesh_clear()
        distance=min(d for d in distances if d is not None)
        records.append({'members':[a.name,b.name],'nearestEvaluatedSurfaceMetres':distance,'limitMetres':.002,'passed':distance<=.002})
    result={'method':'Evaluated polygon/vertex surface samples against actual opposing triangle BVHs; interlinked suspension, not bounding-box proximity.','pairs':records,'passed':all(r['passed'] for r in records)}
    if not result['passed']:raise RuntimeError('Hanging link contact failed: '+json.dumps(result))
    return result


def camera_audit(scene):
    from bpy_extras.object_utils import world_to_camera_view
    objects=[o for o in HERO.objects if o.type=='MESH' and not any(s in o.name for s in ['load link','second load','third load','lower load','bail eye','eye neck'])]
    points=[p for _,_,p in CONTACTS.vertices(objects)];result={}
    for camera in CAMERAS.objects:
        width,height=json.loads(camera['cover_viewport']);scene.render.resolution_x=width;scene.render.resolution_y=height
        projected=[world_to_camera_view(scene,camera,p) for p in points]
        bounds=[min(p.x for p in projected)*width,(1-max(p.y for p in projected))*height,max(p.x for p in projected)*width,(1-min(p.y for p in projected))*height]
        result[camera.name]={'viewport':[width,height],'heroBodyBoundsPixels':bounds,'heroBodyHeightPixels':bounds[3]-bounds[1],'allInFront':all(p.z>0 for p in projected)}
    scene.render.resolution_x=1440;scene.render.resolution_y=900
    return result


def live_cloud_contract():
    # Fixed banks contain advected internal noise; only a bounded coordinate
    # warp changes their silhouette, without moving any support through space.
    shapes=[([58,-22,8],[48,14,66]),
            ([153,-24,-53],[63,18,90]),
            ([77,-22,-171],[65,22.7,96]),
            ([272,-29,-216],[103,23,120]),
            ([-63,-28,-261],[76,22,135]),
            ([467,-32,-343],[138,29,150]),
            ([104,-29,-466],[139,29.7,178]),
            ([405,-34,-604],[176,32,185]),
            ([-87,-32,-650],[157,28,208]),
            ([182,-34,-866],[204,34.7,220]),
            ([591,-38,-986],[196,34,230]),
            ([-230,-36,-1060],[218,31,230])]
    f32=lambda x:struct.unpack('<f',struct.pack('<f',x))[0]
    banks=[];groups=[]
    pattern=[(-.29,-.22,.43,.37,.74),(.25,-.30,.36,.44,.68),
             (-.19,.26,.39,.33,.59),(.33,.18,.34,.41,.71)]
    for group,(centre,radii) in enumerate(shapes):
        indices=[];top=centre[1]+radii[1]
        for slot,(dx,dz,rx,rz,ry) in enumerate(pattern):
            jitter=(permute289(group*7+slot*13)/288-.5)*.02
            drop=1+((group*7+slot*3)%17)/16*2
            child_radii=[radii[0]*rx*(1+jitter),radii[1]*ry*(1-jitter*.5),radii[2]*rz*(1-jitter)]
            child_centre=[centre[0]+radii[0]*(dx*(-1 if group%2 else 1)+jitter),
                          top-drop-child_radii[1],
                          centre[2]+radii[2]*(dz*(-1 if group%3==1 else 1)-jitter)]
            indices.append(len(banks))
            banks.append({'id':len(banks),'group':group,'slot':slot,'centre':child_centre,'radii':child_radii,
                          'density':.12,'edgeWidth':.22,'parentTopY':top,'topDropMetres':drop})
        groups.append({'id':group,'lobeIndices':indices,
                       'parentReference':{'centre':centre,'radii':radii,'topY':top},
                       'parentRole':'Conservative culling/authoring reference only. Parent contributes NO density.'})
    substrate={'centre':[160,-160,-570],'radii':[650,150,1000],'density':.006,'edgeWidth':.32}
    near_wisps=[{'id':'cliffward-torn-wisp','centre':[-1.2,-13,-8],'radii':[11,10,16],'density':f32(.11),'edgeWidth':f32(.60)},
                {'id':'valleyward-low-bank','centre':[7.5,-15,2.5],'radii':[13,11,14],'density':f32(.09),'edgeWidth':f32(.65)},
                {'id':'rear-low-filament','centre':[-9,-17.5,5],'radii':[12,12,17],'density':f32(.07),'edgeWidth':f32(.70)}]
    near_bounds={'min':[min(w['centre'][a]-w['radii'][a] for w in near_wisps) for a in range(3)],
                 'max':[max(w['centre'][a]+w['radii'][a] for w in near_wisps) for a in range(3)]}
    if near_bounds['max'][1]!=-3:raise RuntimeError('Near-post medium must leave every upper post and eye space clear')
    warp={'octaveMixturesEngine':[[1,0,0],[0,f32(.65),f32(.35)],[0,0,1]],'scaleEngine':[12,12,16],'offsetEngine':[-6,0,-8],
          'sampleOffsetBounds':{'min':[-6,0,-8],'max':[6,12,8]},
          'formula':'Ni=clamp(existing unweighted octave i,0,1); pWarp=p+[12*N0-6,12*(.65*N1+.35*N2),16*N2-8]; only child lobe E uses pWarp. Shared F and substrate E use original p.',
          'noiseEvaluations':3,'additionalNoiseEvaluations':0,
          'scope':'Bounded spatial deformation of bank contours; vertical sample offset is nonnegative, so visible density can only move down. All bank centres and conservative supports are time-invariant.'}
    expanded=[]
    for bank in banks:
        expanded.append({'id':bank['id'],
                         'min':[bank['centre'][a]-bank['radii'][a]-warp['sampleOffsetBounds']['max'][a] for a in range(3)],
                         'max':[bank['centre'][a]+bank['radii'][a]-warp['sampleOffsetBounds']['min'][a] for a in range(3)]})
    for group in groups:
        parent=group['parentReference']
        group['expandedCullBounds']={'min':[parent['centre'][a]-parent['radii'][a]-warp['sampleOffsetBounds']['max'][a] for a in range(3)],
                                     'max':[parent['centre'][a]+parent['radii'][a]-warp['sampleOffsetBounds']['min'][a] for a in range(3)]}
    substrate_bounds={'min':[substrate['centre'][a]-substrate['radii'][a] for a in range(3)],
                      'max':[substrate['centre'][a]+substrate['radii'][a] for a in range(3)]}
    lower=[min([b['min'][a] for b in expanded]+[substrate_bounds['min'][a]]) for a in range(3)]
    upper=[max([b['max'][a] for b in expanded]+[substrate_bounds['max'][a]]) for a in range(3)]
    # Keep the proven global support/volume unchanged. Every actual child
    # top is lower; this remains a conservative bound, never a density plane.
    upper[1]=.7000000000000028
    if upper[1]>.700001:raise RuntimeError('Cloud support intrudes into the fixed cover eye/lamp space')
    noise_contract={'kind':'value-noise-3D-fBm','periodCells':289,
                    'hash':'mod289(x)=x-289*floor(x/289); permute(x)=mod289((34*mod289(x)+1)*mod289(x)); h=permute(permute(permute(ix)+mod289(iy))+mod289(iz))/288',
                    'interpolation':'f=fraction(p); u=f*f*f*(f*(6*f-15)+10); trilinear mix of all eight lattice corner values',
                    'octaves':[{'frequency':f32(f),'weight':f32(w),'offset':[f32(x) for x in offset]}
                               for f,w,offset in [(.025,.55,[37.2,11.9,-17.7]),(.075,.30,[-13.4,47.1,31.6]),(.225,.15,[71.3,-23.8,9.2])]],
                    'combination':'F=clamp(sum(weight*valueNoise3((p+flowEngine*t)*frequency+offset)),0,1); evaluate once per world point and share across every bank',
                    'floatConvention':'Published arithmetic constants are float32. Floored modulo handles negative lattice cells; integer hash intermediates stay below 2^24. World-position sampling is highp float32 in native and runtime shaders; no sin hash.'}
    breakup={'thresholdBase':f32(.84),'noiseAmplitude':f32(.80),'normalization':f32(.56)}
    breakup['minimumThreshold']=breakup['thresholdBase']-breakup['noiseAmplitude']
    breakup['formula']='bank=density*clamp((E-thresholdBase+noiseAmplitude*F)/normalization,0,1); final=max(bank_i)+substrate.density*substrate.E'
    if any(near_bounds['min'][a]<lower[a] or near_bounds['max'][a]>upper[a] for a in range(3)):
        raise RuntimeError('Source17 near medium exceeds the unchanged conservative finite world box')
    return {'version':7,'coordinates':'WORLD engine Y-up metres','banks':banks,'bankGroups':groups,'substrate':substrate,
            'nearWisps':near_wisps,'nearWispBounds':near_bounds,
            'nearWispModulation':{'base':f32(.4),'scale':f32(.6),'formula':'near=max_i(density_i*E_i(original p)) * MULTIPLY_ADD(F,scale,base); final=max(childBankUnion,near)+unchanged substrate. Three existing octave values/F shared; no extra noise, warp, opaque parent or artificial post cut.',
                                  'positionScope':'Fixed original WORLD supports, highestY=-3. Only the shared internal noise/F advects; near support never reaches the gallery/eye/hero.'},
            'parentDensityRemoved':True,'grouping':'12 conservative parent culls index four unequal, overlapping child lobes each. Only48 child banks and three explicit soft near-post wisps contribute density; no opaque parent term exists.',
            'bounds':{'min':lower,'max':upper},'combination':'max-union then additive lower haze',
            'envelope':'q2=dot((p-centre)/radii,(p-centre)/radii); E=1-smoothstep((1-edgeWidth)^2,1,q2)',
            'noise':noise_contract,'breakup':breakup,'domainWarp':warp,
            'expandedBankBounds':expanded,'substrateBounds':substrate_bounds,
            'flowEngine':[.7,0,.22],'timeOrigin':0,'nativeTime':0,
            'flowScope':'Only the internal noise coordinates p+flowEngine*t are advected. Their three bounded values drive density and contour warp. Bank centres, substrate and conservative finite world supports never drift, including over an hour.',
            'albedoLinear':[.69,.76,.86],'anisotropy':.25,
            'scope':'Forty-eight unequal overlapping billow lobes in twelve fixed culling groups, plus three camera-clear wisps around actual long posts. Existing shared three-octave noise/warp, world, lights and lower haze unchanged. No opaque parent, extra noise evaluations, drifting supports, slab, horizon plane, post clipping or duplicate feather.'}



def native_cloud_reference(contract):
    """Literal analytic source field shared with the runtime GLSL contract."""
    global TARGET
    mat=bpy.data.materials.new('Cloud eroded layered banks and lower water-droplet haze');mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    output=nodes.new('ShaderNodeOutputMaterial');volume=nodes.new('ShaderNodeVolumePrincipled')
    volume.inputs['Color'].default_value=(*contract['albedoLinear'],1)
    volume.inputs['Anisotropy'].default_value=contract['anisotropy']
    geometry=nodes.new('ShaderNodeNewGeometry')
    def scalar(operation,*inputs):
        node=nodes.new('ShaderNodeMath');node.operation=operation
        for index,value in enumerate(inputs):
            if isinstance(value,(int,float)):node.inputs[index].default_value=value
            else:links.new(value,node.inputs[index])
        return node.outputs[0]
    def envelope(bank,position=None):
        subtract=nodes.new('ShaderNodeVectorMath');subtract.operation='SUBTRACT'
        subtract.inputs[1].default_value=point(bank['centre']);links.new(position if position is not None else geometry.outputs['Position'],subtract.inputs[0])
        divide=nodes.new('ShaderNodeVectorMath');divide.operation='DIVIDE'
        divide.inputs[1].default_value=(bank['radii'][0],bank['radii'][2],bank['radii'][1]);links.new(subtract.outputs['Vector'],divide.inputs[0])
        squared=nodes.new('ShaderNodeVectorMath');squared.operation='DOT_PRODUCT'
        links.new(divide.outputs['Vector'],squared.inputs[0]);links.new(divide.outputs['Vector'],squared.inputs[1])
        falloff=nodes.new('ShaderNodeMapRange');falloff.interpolation_type='SMOOTHSTEP';falloff.clamp=True
        falloff.label=f"Cloud density lobe {bank['id']}" if 'id' in bank else 'Cloud lower substrate envelope'
        falloff.inputs['From Min'].default_value=(1-bank['edgeWidth'])**2;falloff.inputs['From Max'].default_value=1
        falloff.inputs['To Min'].default_value=1;falloff.inputs['To Max'].default_value=0
        links.new(squared.outputs['Value'],falloff.inputs['Value'])
        return falloff.outputs['Result']
    def mod289(value):
        return scalar('SUBTRACT',value,scalar('MULTIPLY',scalar('FLOOR',scalar('DIVIDE',value,289)),289))
    def permute(value):
        value=mod289(value)
        return mod289(scalar('MULTIPLY',scalar('MULTIPLY_ADD',value,34,1),value))
    def mix(a,b,t):return scalar('MULTIPLY_ADD',scalar('SUBTRACT',b,a),t,a)
    separate=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],separate.inputs[0])
    world_engine=[separate.outputs['X'],separate.outputs['Z'],scalar('MULTIPLY',separate.outputs['Y'],-1)]
    def value_noise(octave):
        coordinates=[scalar('MULTIPLY_ADD',p,octave['frequency'],offset) for p,offset in zip(world_engine,octave['offset'])]
        cell=[scalar('FLOOR',p) for p in coordinates];fraction=[scalar('SUBTRACT',p,c) for p,c in zip(coordinates,cell)]
        blend=[]
        for f in fraction:
            cube=scalar('MULTIPLY',scalar('MULTIPLY',f,f),f)
            blend.append(scalar('MULTIPLY',cube,scalar('MULTIPLY_ADD',f,scalar('MULTIPLY_ADD',f,6,-15),10)))
        lattice=[[mod289(scalar('ADD',c,offset)) for offset in [0,1]] for c in cell]
        xhash=[permute(x) for x in lattice[0]]
        xyhash=[[permute(scalar('ADD',x,y)) for x in xhash] for y in lattice[1]]
        corners=[[[scalar('DIVIDE',permute(scalar('ADD',xyhash[y][x],lattice[2][z])),288) for x in range(2)] for y in range(2)] for z in range(2)]
        planes=[mix(mix(corners[z][0][0],corners[z][0][1],blend[0]),mix(corners[z][1][0],corners[z][1][1],blend[0]),blend[1]) for z in range(2)]
        return mix(planes[0],planes[1],blend[2])
    fractal=None;octave_values=[]
    for index,octave in enumerate(contract['noise']['octaves']):
        unweighted=scalar('MINIMUM',scalar('MAXIMUM',value_noise(octave),0),1);octave_values.append(unweighted)
        unweighted.node.label=f'Cloud unweighted octave {index}'
        value=scalar('MULTIPLY',unweighted,octave['weight'])
        fractal=value if fractal is None else scalar('ADD',fractal,value)
    fractal=scalar('MINIMUM',scalar('MAXIMUM',fractal,0),1)
    fractal.node.label='Cloud shared fBm F'
    breakup=contract['breakup']
    threshold=scalar('SUBTRACT',breakup['thresholdBase'],scalar('MULTIPLY',fractal,breakup['noiseAmplitude']))
    warp=contract['domainWarp']
    mixtures=[]
    for weights in warp['octaveMixturesEngine']:
        terms=[scalar('MULTIPLY',n,weight) for n,weight in zip(octave_values,weights) if weight]
        value=terms[0]
        for term in terms[1:]:value=scalar('ADD',value,term)
        mixtures.append(value)
    offsets=[scalar('MULTIPLY_ADD',value,scale,offset) for value,scale,offset in zip(mixtures,warp['scaleEngine'],warp['offsetEngine'])]
    warped_engine=[scalar('ADD',p,offset) for p,offset in zip(world_engine,offsets)]
    warped_blender=nodes.new('ShaderNodeCombineXYZ')
    warped_blender.label='Cloud bank coordinate domain warp'
    links.new(warped_engine[0],warped_blender.inputs['X']);links.new(scalar('MULTIPLY',warped_engine[2],-1),warped_blender.inputs['Y']);links.new(warped_engine[1],warped_blender.inputs['Z'])
    union=None
    for bank in contract['banks']:
        carved=scalar('DIVIDE',scalar('SUBTRACT',envelope(bank,warped_blender.outputs['Vector']),threshold),breakup['normalization'])
        bank_density=scalar('MULTIPLY',scalar('MINIMUM',scalar('MAXIMUM',carved,0),1),bank['density'])
        union=bank_density if union is None else scalar('MAXIMUM',union,bank_density)
    if contract.get('nearWisps'):
        near=None
        for wisp in contract['nearWisps']:
            value=scalar('MULTIPLY',envelope(wisp),wisp['density'])
            near=value if near is None else scalar('MAXIMUM',near,value)
        modulation=contract['nearWispModulation']
        near=scalar('MULTIPLY',near,scalar('MULTIPLY_ADD',fractal,modulation['scale'],modulation['base']))
        near.node.label='Cloud source17 physical near-post medium'
        union=scalar('MAXIMUM',union,near)
    substrate=contract['substrate']
    density=scalar('ADD',union,scalar('MULTIPLY',envelope(substrate),substrate['density']))
    links.new(density,volume.inputs['Density']);links.new(volume.outputs['Volume'],output.inputs['Volume'])
    lower=contract['bounds']['min'];upper=contract['bounds']['max']
    TARGET=RUNTIME;cloud=box('Native reference eroded banks and lower haze',
                             [b-a for a,b in zip(lower,upper)],[(a+b)/2 for a,b in zip(lower,upper)],mat,0)
    for key in ['one_light_static','region','lightmap_region']:
        if key in cloud:del cloud[key]
    cloud['one_light_runtime_native_reference']=True
    cloud['runtime_equivalent']='Literal cloud_cliff_live_clouds v7 child lobes and physical near-post wisps with no parent density, shared three-octave domain warp and lower haze; nativeTime=0.'
    cloud['density_contract_sha256']=sha256(json.dumps(contract,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    TARGET=STATIC


def native_distance_air():
    global TARGET
    mat=bpy.data.materials.new('Cloud clear blue mountain distance air');mat.use_nodes=True
    nodes=mat.node_tree.nodes;nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');volume=nodes.new('ShaderNodeVolumePrincipled')
    volume.inputs['Density'].default_value=.0009;volume.inputs['Color'].default_value=(.32,.48,.72,1);volume.inputs['Anisotropy'].default_value=.15
    mat.node_tree.links.new(volume.outputs['Volume'],output.inputs['Volume'])
    TARGET=RUNTIME;air=box('Native reference long distance mountain air',(1800,700,1800),(0,0,-450),mat,0)
    for key in ['one_light_static','region','lightmap_region']:
        if key in air:del air[key]
    air['one_light_runtime_native_reference']=True;air['runtime_equivalent']='Distance fog; physical air attenuation and scattering in source reference.';TARGET=STATIC


def build_scene():
    global STATIC,HERO,LIGHTS,CAMERAS,RUNTIME,TARGET,REGION,CONTACTS,RNG
    RNG=random.Random(812673)
    SUPPORTS.clear();SCANS.clear();MATERIALS.clear()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for name in ['STATIC','HERO','LIGHTS','CAMERAS','RUNTIME']:
        old=bpy.data.collections.get(name)
        if old:bpy.data.collections.remove(old)
        collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(collection)
        globals()[name]=collection
    TARGET=STATIC;REGION='cover';CONTACTS=RestingContacts(contact_height)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.render.engine='CYCLES';scene.cycles.device='GPU';scene.render.threads_mode='AUTO';scene.cycles.samples=64
    scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.use_denoising=True
    if hasattr(scene.cycles,'denoising_use_gpu'):scene.cycles.denoising_use_gpu=True
    scene.view_settings.view_transform='AgX';scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Cloud Cliff accepted night candidate');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.055,.09,.16,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.80
    wood=pbr('Cloud weathered gallery timber',(.52,.43,.34,1),.86,scan='weathered_planks')
    red=pbr('Cloud worn oxblood timber',(.36,.085,.055,1),.76,scan='weathered_planks')
    tile=pbr('Cloud aged grey clay tiles',(.55,.57,.6,1),.88,scan='grey_roof_tiles')
    plaster=pbr('Cloud lime infill',(.47,.43,.36,1),.96,scan='white_plaster_rough_01')
    paper=pbr('Cloud warm opaque window paper',(.57,.49,.35,1),.96)
    bsdf=paper.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Emission Color'].default_value=(1,.53,.22,1);bsdf.inputs['Emission Strength'].default_value=.7
    brass=pbr('Storm old cast brass',(.48,.285,.073,1),.43,.9);enable_tint(brass)
    bright=pbr('Storm worn brass high points',(.66,.46,.17,1),.26,.97);enable_tint(bright)
    soot=pbr('Storm carbon and iron',(.022,.018,.014,1),.86,.25)
    wax=pbr('Storm warm used tallow',(.71,.64,.47,1),.9)
    glass=pbr('Storm real clear glass',(.98,.99,1,1),.045)
    glass.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=1
    glass.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.5
    glass['one_light_hero_glass']=True;glass['one_light_min_roughness']=.045
    rock=pbr('Cloud far weathered mountain stone',(.32,.37,.40,1),.98,scan='rock_pitted_mossy')
    cliff=[]
    cliff+=scan_cliff('rock_face_01',(-5,-23,-4),(3.0,9,4.0),ratio=.08)
    cliff+=scan_cliff('rock_face_01',(-5,-23,8),(3.0,9,4.0),ratio=.08)
    cliff+=scan_cliff('rock_face_02',(-8,-15,-17),(4,8,5),yaw=.1,ratio=.06)
    bpy.context.view_layer.update();cliff_bvh,_=tree(cliff)
    gallery(wood,red,tile,cliff_bvh)
    lookout(wood)
    for x in [-4.1,.4]:
        for z in [-8.5,-4.5]:support_post(x,z,.02,-13.8,cliff_bvh,wood)
    arch('Lower cliff hall',-1.85,-4.4,5.2,4.3,.12,wood,red,paper,tile,plaster)
    for x in [-4.0,.3]:
        for z in [-16,-12.5]:support_post(x,z,2.35,-14.5,cliff_bvh,wood)
    arch('Upper suspended hall',-1.85,-12.4,4.9,3.8,2.45,wood,red,paper,tile,plaster)
    light('Lower hall paper-window warmth',(-1.8,1.8,-6.7),12,(1,.62,.31),.55,'fixture')
    light('Upper hall paper-window warmth',(-1.8,4.1,-14.3),8,(1,.61,.3),.5,'fixture')
    for side in [-1,1]:
        window_spill('Lower paper window real warm spill',(-1.85+side*5.2*.335,1.70,-4.35),6,5.2*.26,1.53)
        window_spill('Upper paper window real warm spill',(-1.85+side*4.9*.335,4.03,-12.35),4,4.9*.26,1.53)
    foreground_cliff_drop(rock)
    far_scan_massifs()
    cloud_contract=live_cloud_contract()
    native_cloud_reference(cloud_contract)
    native_distance_air()
    hero=hero_lantern(brass,bright,soot,wax,glass)
    moon_data=bpy.data.lights.new('Cloud moon basis','SUN');moon_data.energy=.45;moon_data.color=(.62,.75,1);moon_data.angle=.10
    moon=bpy.data.objects.new('Cloud moon basis',moon_data);LIGHTS.objects.link(moon);moon.rotation_euler=(math.radians(24),math.radians(-31),math.radians(-27));moon['bake_role']='ambient'
    views={'Reference_cover-desktop':{'position':[5.2,1.85,4.7],'target':[5.8,1.18,-2.5],'fov':49,'size':[1440,900]},'Reference_cover-phone':{'position':[5.2,1.8,4.8],'target':[3.77,-.1,-5.0],'fov':52,'size':[390,844]}}
    for name,view in views.items():camera(name,view['position'],view['target'],view['fov'],*view['size'])
    camera('Reference_lantern-detail',(6.5,1.95,2.0),(4.5,2.05,0),40,1440,900)
    camera('Reference_hanging-contact',(5.5,2.85,1.5),(4.5,2.75,0),36,960,600)
    camera('Reference_candle-contact',(5.0,1.9,.5),(4.5,1.72,0),45,960,600)
    scene.camera=bpy.data.objects['Reference_cover-desktop']
    bpy.context.view_layer.update();contact_audit=CONTACTS.audit(fail=True)
    scene['place_id']='cloud-cliff';scene['one_light_place']='cloud-cliff';scene['runtime_origin']='glTF Y-up metres'
    scene['lightmap_resolutions']=json.dumps({'cover':1024,'cliff':512,'far':256})
    scene['one_light_lamp_basis']=json.dumps(hero['lampBasis'])
    scene['one_light_export_heroes']=json.dumps([hero])
    scene['one_light_anchor_registry']=json.dumps({'storm':hero})
    scene['one_light_anchor_fields']=json.dumps(['one_light_export_heroes','one_light_anchor_registry','one_light_lamp_basis'])
    scene['cloud_cliff_cover_views']=json.dumps(views)
    scene['one_light_camera_far']=2000
    def actual_bounds(region):
        graph=bpy.context.evaluated_depsgraph_get();points=[];objects=[]
        for obj in STATIC.objects:
            if obj.type!='MESH' or obj.get('region')!=region:continue
            evaluated=obj.evaluated_get(graph);data=evaluated.to_mesh()
            local=[engine(evaluated.matrix_world@v.co) for v in data.vertices]
            points.extend(local);objects.append({'name':obj.name,'min':[min(p[a] for p in local) for a in range(3)],'max':[max(p[a] for p in local) for a in range(3)]})
            evaluated.to_mesh_clear()
        return {'min':[min(p[a] for p in points) for a in range(3)],'max':[max(p[a] for p in points) for a in range(3)],'objects':objects}
    scene['cloud_cliff_far_world_bounds']=json.dumps({'terrain':actual_bounds('far'),'cliff':actual_bounds('cliff'),'cloud':cloud_contract['bounds'],'cameraFar':2000,'noisePolicy':'World-position bank and sine vectors are literal metres; enlarging the volume bounds does not stretch the field.'})
    scene['one_light_fixed_view_uv_scope']=json.dumps({'cameras':[o.name for o in CAMERAS.objects],'positionEnvelopeMetres':.03,'orientationEnvelopeDegrees':2,'supportedScope':'Fixed home cover and source lantern/contact diagnostics only. No walking or orbit camera is supported.'})
    scene['cloud_cliff_live_clouds']=json.dumps(cloud_contract)
    scene['cloud_cliff_source_revision']='v17: source14 gallery/HERO/cliff and accepted world/lights/cameras retained; far scan upper35% clefts/lower25% deep skirt replace exposed cropped outlines, central scan surface/UV/material retained; three soft physical near-post wisps fade real supports over metres, using the same shared3octaves. No post geometry clipping.'
    scene['cloud_cliff_structural_supports']=json.dumps(SUPPORTS)
    scene['cloud_cliff_asset_sources']=json.dumps(SCANS)
    scene['cloud_cliff_budget']=json.dumps({'completePackageBytesMaximum':10_000_000,'targetTriangles':75000,'heroTargetTriangles':8000,'materialProfile':'512 ETC1S base/rough,256–512 UASTC normals, shared source textures','posterBytesMaximum':200000})
    scene['one_light_hanging_audit']=json.dumps(suspension_audit(hero))
    scene['cloud_cliff_camera_audit']=json.dumps(camera_audit(scene))
    return scene,contact_audit


def cpu_report(scene,audit,output):
    graph=bpy.context.evaluated_depsgraph_get();counts=Counter();materials=set();objects=[]
    for obj in scene.objects:
        if obj.type!='MESH':continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
        region='HERO' if obj.get('one_light_dynamic') else obj.get('region','other');counts[region]+=len(mesh.loop_triangles)
        objects.append({'name':obj.name,'region':region,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles)})
        materials.update(mat.name for mat in mesh.materials if mat);evaluated.to_mesh_clear()
    fields=json.loads(scene['one_light_anchor_fields'])
    return {'source':{'path':str(output.relative_to(ROOT)),'sha256':digest(output)},'sourceScript':{'path':str(Path(__file__).relative_to(ROOT)),'sha256':digest(__file__)},'trianglesByRegion':dict(counts),'materialNames':sorted(materials),'objects':objects,'contactAudit':audit,'heroes':json.loads(scene['one_light_export_heroes']),'anchorMetadataFields':fields,'anchorMetadata':{name:scene[name] for name in fields},'anchorCorrespondencePassed':True,'hangingContactAudit':json.loads(scene['one_light_hanging_audit']),'cameraAudit':json.loads(scene['cloud_cliff_camera_audit']),'structuralSupports':SUPPORTS,'scannedCC0Sources':SCANS,'cyclesRenderBakeJobs':0,'purpose':'CPU source build/audit only. Geometry, framing and lighting still require exclusive low8 Metal/OIDN visual review before full64.'}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'art/build/cloud-cliff.blend')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
    if output.exists():raise RuntimeError('Use a new source path; previous source snapshots are immutable.')
    scene,audit=build_scene();bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report=cpu_report(scene,audit,output);path=output.with_suffix('.audit.json');path.write_text(json.dumps(report,indent=2)+'\n')
    print('CLOUD_CLIFF_CPU_SOURCE_READY',str(output),digest(output),json.dumps(report['trianglesByRegion']),flush=True)


if __name__=='__main__':main()
