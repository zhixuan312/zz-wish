"""One Light: Snow Roof Court, Blender 5.3 source scene.

Rebuild with:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python art/blender/snow_roof.py -- --output art/build/snow-roof.blend

All dimensions are metres. Helpers accept the runtime's (x, y-up, z) points;
Blender stores (x, -z, y). glTF's Y-up export restores the runtime coordinates.
STATIC contains only architecture/scenery. Visitor_Lamp_Anchor is an EMPTY;
its body, flame, fuel level, smoke and moving shadow remain runtime objects.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
MATERIALS = ROOT / 'web/public/materials/scans'
RNG = random.Random(61903)
STATIC = None
REGION = 'court'
CACHE = {}


def point(p):
    return Vector((p[0], -p[2], p[1]))


def mesh_object(name, vertices, faces, material, region=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([point(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    STATIC.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    tag(obj, region)
    uv_world(obj)
    return obj


def tag(obj, region=None):
    obj['one_light_static'] = True
    obj['region'] = region or REGION
    obj['lightmap_uv'] = 'Lightmap'
    obj['units'] = 'metres'
    return obj


def move_to_static(obj, region=None):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    STATIC.objects.link(obj)
    return tag(obj, region)


def uv_world(obj, metres=1.6):
    """Deterministic material UVs. The baker owns the separate Lightmap atlas."""
    if obj.type != 'MESH':
        return
    uv = obj.data.uv_layers.get('UVMap') or obj.data.uv_layers.new(name='UVMap')
    for polygon in obj.data.polygons:
        normal = polygon.normal
        dominant = max(range(3), key=lambda j: abs(normal[j]))
        axes = [(1, 2), (0, 2), (0, 1)][dominant]
        for loop_index in polygon.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            world = obj.matrix_world @ vertex
            uv.data[loop_index].uv = (world[axes[0]] / metres, world[axes[1]] / metres)
    obj.data.uv_layers.active = uv


def bevel(obj, amount=.018, segments=2):
    modifier = obj.modifiers.new('Worn eased edges', 'BEVEL')
    modifier.width = amount
    modifier.segments = segments
    modifier.affect = 'EDGES'
    modifier.limit_method = 'ANGLE'
    modifier.angle_limit = .35
    modifier.harden_normals = True
    modifier = obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    modifier.keep_sharp = True
    modifier.weight = 40
    return obj


def box(name, dimensions, location, material, edge=.015, rotation=0, region=None):
    w,h,d=[q/2 for q in dimensions]
    vertices=[(-w,-h,-d),(w,-h,-d),(w,h,-d),(-w,h,-d),(-w,-h,d),(w,-h,d),(w,h,d),(-w,h,d)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
    obj=mesh_object(name,vertices,faces,material,region)
    obj.location=point(location);obj.rotation_euler[2]=rotation
    obj.matrix_world = obj.matrix_basis
    uv_world(obj)
    if edge:bevel(obj,edge)
    return obj


def cylinder(name, radius, depth, location, material, vertices=24, edge=.006, region=None):
    obj=lathe(name,[(0,-depth/2),(radius,-depth/2),(radius,depth/2),(0,depth/2)],location,material,vertices,region)
    if edge:bevel(obj,edge)
    return obj


def lathe(name, profile, location, material, segments=32, region=None):
    vertices, faces = [], []
    for radius, height in profile:
        vertices.extend((location[0] + math.cos(i / segments * math.tau) * radius,
                         location[1] + height,
                         location[2] + math.sin(i / segments * math.tau) * radius)
                        for i in range(segments))
    for row in range(len(profile) - 1):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((row * segments + i, (row + 1) * segments + i,
                          (row + 1) * segments + j, row * segments + j))
    obj = mesh_object(name, vertices, faces, material, region)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def beam(name, a, b, radius, material, end_radius=None, region=None):
    av,bv=Vector(a),Vector(b);axis=(bv-av).normalized()
    reference=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0))
    u=axis.cross(reference).normalized();v=axis.cross(u).normalized()
    vertices=[];faces=[];segments=10
    for center,r in [(av,radius),(bv,end_radius if end_radius is not None else radius*.8)]:
        for i in range(segments):
            vertex=center+u*math.cos(i/segments*math.tau)*r+v*math.sin(i/segments*math.tau)*r
            vertices.append(tuple(vertex))
    for i in range(segments):
        j=(i+1)%segments;faces.append((i,j,segments+j,segments+i))
    faces.extend([tuple(reversed(range(segments))),tuple(range(segments,segments*2))])
    obj=mesh_object(name,vertices,faces,material,region)
    for polygon in obj.data.polygons:polygon.use_smooth=len(polygon.vertices)==4
    return obj


def color(value):
    if isinstance(value, str):
        value = int(value.lstrip('#'), 16)
    return ((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255, 1)


def material(name, tint='#ffffff', scan=None, rough=.8, metal=0, emission=0):
    if name in CACHE:
        return CACHE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color(tint)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        bsdf.inputs['Emission Color'].default_value = color(tint)
        bsdf.inputs['Emission Strength'].default_value = emission
    if scan:
        directory = MATERIALS / scan
        for filename, socket, noncolor in [('diffuse.jpg', 'Base Color', False), ('roughness.jpg', 'Roughness', True), ('normal.jpg', 'Normal', True)]:
            path = directory / filename
            if not path.exists():
                continue
            image = bpy.data.images.load(str(path), check_existing=True)
            if noncolor:
                image.colorspace_settings.name = 'Non-Color'
            texture = nodes.new('ShaderNodeTexImage')
            texture.image = image
            texture.label = scan + ' ' + socket
            texture.extension = 'REPEAT'
            uv = nodes.new('ShaderNodeUVMap')
            uv.uv_map = 'UVMap'
            links.new(uv.outputs['UV'], texture.inputs['Vector'])
            if socket == 'Base Color':
                multiply = nodes.new('ShaderNodeMixRGB')
                multiply.blend_type = 'MULTIPLY'
                multiply.inputs[0].default_value = 1
                multiply.inputs[2].default_value = color(tint)
                links.new(texture.outputs['Color'], multiply.inputs[1])
                links.new(multiply.outputs[0], bsdf.inputs[socket])
            elif socket == 'Normal':
                normal = nodes.new('ShaderNodeNormalMap')
                normal.inputs['Strength'].default_value = .6
                links.new(texture.outputs['Color'], normal.inputs['Color'])
                links.new(normal.outputs['Normal'], bsdf.inputs[socket])
            else:
                links.new(texture.outputs['Color'], bsdf.inputs[socket])
    if name.startswith('Snow'):
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 210
        noise.inputs['Detail'].default_value = 2
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .23
        bump.inputs['Distance'].default_value = .015
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        existing = list(bsdf.inputs['Normal'].links)
        if existing:
            links.new(existing[0].from_socket, bump.inputs['Normal'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Subsurface Weight'].default_value = .055
    CACHE[name] = mat
    return mat


def light(name, location, energy, tint, radius=.1, role='fixture'):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = energy
    data.color = color(tint)[:3]
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    bpy.data.collections['LIGHTS'].objects.link(obj)
    obj.location = point(location)
    obj['bake_role'] = role
    return obj


def window(name, x, y, z, width, height, wood, paper, facing=1):
    box(name + ' paper backing', (width, height, .024), (x, y, z - .12 * facing), paper, .003)
    for side in [-1, 1]:
        box(name + ' frame jamb', (.085, height + .14, .12), (x + side * (width / 2 + .025), y, z), wood, .012)
        box(name + ' horizontal frame', (width + .16, .085, .12), (x, y + side * (height / 2 + .025), z), wood, .012)
    for i in range(1, max(2, int(width / .16))):
        xx = x - width / 2 + i * width / max(2, int(width / .16))
        box(name + ' lattice upright', (.025, height, .035), (xx, y, z + .015 * facing), wood, .004)
    for i in range(1, max(2, int(height / .22))):
        yy = y - height / 2 + i * height / max(2, int(height / .22))
        box(name + ' lattice crossbar', (width, .024, .038), (x, yy, z + .018 * facing), wood, .004)


def profile_arm(name, x, y, z, reach, width, thickness, mat, turn=False):
    # A carved, cambered solid timber arm: broad at the bearing, thin at the
    # rising tails. Successive arms pass across one another at their housings.
    samples=16
    upper=[];lower=[]
    for i in range(samples+1):
        u=-reach+2*reach*i/samples
        tail=abs(u/reach)
        upper.append((u,.06+.065*tail**3))
        lower.append((u,.06+.065*tail**3-thickness*(1-.45*tail)))
    contour=upper+list(reversed(lower));vertices=[]
    for side in [-1,1]:
        for u,v in contour:
            vertices.append((x+u if turn else x+side*width/2,y+v,z+side*width/2 if turn else z+u))
    n=len(contour);faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
    obj=mesh_object(name,vertices,faces,mat)
    # Recalculate this closed solid independently of its chosen arm direction.
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    bevel(obj,.012,3)
    return obj


def bracket_set(x,y,z,wood,paint,gold):
    lathe('Carved timber bearing block',[(.18,0),(.24,.025),(.245,.09),(.19,.14),(.16,.17)],(x,y-.08,z),wood,24)
    for tier in range(3):
        yy=y+.10+tier*.19
        reach=.32+tier*.23
        profile_arm('Interlocking curved bracket arm',x,yy,z,reach,.17,.15,wood,False)
        profile_arm('Crossed curved bracket arm',x,yy+.075,z,reach*.83,.16,.13,paint,True)
        # Exposed stepped tenons and their end-grain caps make the joinery legible.
        for side in [-1,1]:
            box('Bracket projecting tenon',(.13,.075,.055),(x,yy+.04,z+side*reach),wood,.008)
            box('Faded ochre bracket end',(.115,.048,.012),(x,yy+.04,z+side*(reach+.031)),gold,.004)
    for side in [-1,1]:
        profile_arm('Outer sweeping knee brace',x+side*.26,y+.19,z,.44,.11,.11,wood,False)


def roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,x,t,side):
    # A concave roof pitch relaxes at the eaves, then turns visibly upward. The
    # corner rise is local to the flying eave, not a flat slab tilted at the end.
    kick=min(.42,.18+rise*.09)
    corner=min(.34,.16+rise*.065)
    transverse=abs((x-cx)/(width/2))
    yy=y_eave+rise*max(0,1-t)**1.5+kick*t**8+corner*transverse**6*t**5
    return (x,yy,ridge_z+side*half_depth*t)


def tiled_roof(name,cx,y_eave,ridge_z,width,half_depth,rise,tile,wood,snow,region=None):
    for side in [-1,1]:
        # The underside and snow follow the same continuous curved surface.
        nx,ny=max(16,int(width/.3)),24
        vertices=[];faces=[]
        for row in range(ny+1):
            for col in range(nx+1):
                xx=cx-width/2+width*col/nx
                vertices.append(roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,row/ny,side))
        for row in range(ny):
            for col in range(nx):
                i=row*(nx+1)+col;faces.append((i,i+1,i+nx+2,i+nx+1))
        if side>0:faces=[tuple(reversed(face)) for face in faces]
        mesh_object(name+' curved roof boarding',vertices,faces,wood,region)
        cols=max(10,int(width/.255));rows=max(8,int(math.hypot(half_depth,rise)/.345))
        # Wide concave pan tiles alternate with narrow convex covers over their
        # seams. Every row has a real overlapping lip and curved eave-end shell.
        for cover in [False,True]:
            vertices=[];faces=[];across=6 if not cover else 5;along=2
            count=cols if not cover else cols-1
            for row in range(rows):
                t0=max(0,(row-.04)/rows);t1=min(1.018,(row+1.13)/rows)
                for col in range(count):
                    center=cx-width/2+(col+(.5 if not cover else 1))*width/cols
                    radius=(width/cols*.49) if not cover else .063
                    start=len(vertices)
                    for length in range(along+1):
                        t=t0+(t1-t0)*length/along
                        for k in range(across+1):
                            a=(k/across-.5)*math.pi
                            xx=center+math.sin(a)*radius
                            p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,t,side)
                            cross=(math.cos(a)*.057 if cover else -math.cos(a)*.029)
                            # Lower ends lie18mm above the next course: a real shingle overlap, not coincident shells.
                            fall=.018*length/along
                            vertices.append((p[0],p[1]+.055+cross+fall+(.005 if cover else 0),p[2]))
                    for length in range(along):
                        for k in range(across):
                            i=start+length*(across+1)+k
                            faces.append((i,i+1,i+across+2,i+across+1))
                    # The exposed curved thickness at each tile's lower end.
                    end=start+along*(across+1)
                    for k in range(across+1):
                        p=vertices[end+k];vertices.append((p[0],p[1]-.012,p[2]-.003*side))
                    lower=len(vertices)-(across+1)
                    for k in range(across):faces.append((end+k,end+k+1,lower+k+1,lower+k))
            if side>0:faces=[tuple(reversed(face)) for face in faces]
            obj=mesh_object(name+(' convex cover tile rows' if cover else ' concave pan tile rows'),vertices,faces,tile,region)
            for polygon in obj.data.polygons:polygon.use_smooth=True
        # Snow is thinner and wind-scoured at the perimeter so tile courses and
        # upturned flying eaves remain visible in the night silhouette.
        vertices=[];faces=[]
        for row in range(ny+1):
            for col in range(nx+1):
                xx=cx-width/2+.09+(width-.18)*col/nx
                tmax=.865+.035*math.sin(xx*1.2)+.018*math.sin(xx*4.1)
                t=row/ny*tmax
                p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,t,side)
                depth=.115+.025*math.sin(xx*1.7+row*.4)+.018*math.cos(xx*4.1-row)
                vertices.append((p[0],p[1]+depth,p[2]))
        for row in range(ny):
            for col in range(nx):
                i=row*(nx+1)+col;faces.append((i,i+1,i+nx+2,i+nx+1))
        if side>0:faces=[tuple(reversed(face)) for face in faces]
        cap=mesh_object(name+' curved settled snow cap',vertices,faces,snow,region)
        for polygon in cap.data.polygons:polygon.use_smooth=True
        # Curved exposed rafters and transverse purlins support the roof rather
        # than a single rectangular fascia floating under it.
        for i in range(max(8,int(width/.4))):
            xx=cx-width/2+(i+.5)*.4
            for j in range(9):
                a=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,j/9,side)
                b=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,(j+1)/9,side)
                beam(name+' curved exposed rafter',(a[0],a[1]-.11,a[2]),(b[0],b[1]-.11,b[2]),.042,wood,.042,region)
        for t in [.3,.6,.84]:
            p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,cx,t,side)
            beam(name+' round roof purlin',(cx-width/2,p[1]-.19,p[2]),(cx+width/2,p[1]-.19,p[2]),.085,wood,.085,region)
        # Flying fascia is a shaped solid following the raised corners.
        for i in range(nx):
            a=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,cx-width/2+width*i/nx,1,side)
            b=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,cx-width/2+width*(i+1)/nx,1,side)
            beam(name+' curved eave fascia',(a[0],a[1]-.06,a[2]),(b[0],b[1]-.06,b[2]),.07,wood,.07,region)
    # Individual half-round ridge caps overlap along the ridge. Plain curled end
    # profiles are construction pieces, without figures or ranked ornaments.
    ridge_y=y_eave+rise+.12;segments=max(8,int(width/.32));vertices=[];faces=[]
    for col in range(segments):
        x0=cx-width/2+col*width/segments;x1=x0+width/segments+.025;start=len(vertices)
        for xx in [x0,x1]:
            for j in range(9):
                a=j/8*math.pi
                vertices.append((xx,ridge_y+math.sin(a)*.13,ridge_z+math.cos(a)*.13))
        for j in range(8):faces.append((start+j,start+9+j,start+10+j,start+j+1))
    ridge=mesh_object(name+' overlapping half-round ridge caps',vertices,faces,tile,region)
    for polygon in ridge.data.polygons:polygon.use_smooth=True
    for side in [-1,1]:
        xx=cx+side*(width/2-.1)
        # Upward-curving plain ridge finials formed from layered clay, not beasts.
        for i in range(6):
            a=(xx+side*i*.045,ridge_y+.04+i*i*.012,ridge_z)
            b=(xx+side*(i+1)*.045,ridge_y+.04+(i+1)**2*.012,ridge_z)
            beam(name+' plain curved ridge end',a,b,.085-i*.009,tile,.076-i*.009,region)


def worn_step(name,width,height,depth,location,mat):
    vertices=[];faces=[];nx=64;nz=5
    for row in range(nz+1):
        z=-depth/2+depth*row/nz
        for col in range(nx+1):
            x=-width/2+width*col/nx
            wear=.025*math.exp(-(x/.73)**2)*(row/nz)**2
            chip=sum(.013*math.exp(-((x-c)/.07)**2) for c in [-1.17,-.43,.81,1.3])*(row/nz)**5
            nose=.016*math.sin(x*14.7)*(.4+.6*math.sin(x*3.1)**2)*(row/nz)**7
            vertices.append((location[0]+x,location[1]+height/2-wear-chip,location[2]+z-nose))
    for row in range(nz):
        for col in range(nx):
            i=row*(nx+1)+col;faces.append((i+nx+1,i+nx+2,i+1,i))
    for edge in [[i for i in range(nx+1)],[nz*(nx+1)+i for i in reversed(range(nx+1))],[i*(nx+1) for i in reversed(range(nz+1))],[i*(nx+1)+nx for i in range(nz+1)]]:
        bottom=[]
        for i in edge:
            p=vertices[i];bottom.append(len(vertices));vertices.append((p[0],location[1]-height/2,p[2]))
        for j in range(len(edge)-1):faces.append((edge[j],edge[j+1],bottom[j+1],bottom[j]))
    obj=mesh_object(name,vertices,faces,mat)
    bevel(obj,.014,3)
    return obj


def irregular_paver(name,x,z,width,depth,height,mat):
    outline=[(-.5,-.5),(.4,-.5),(.5,-.37),(.5,.43),(.40,.5),(-.43,.5),(-.5,.39)]
    vertices=[]
    for yy in [height-.13,height]:
        for px,pz in outline:
            vertices.append((x+px*width+RNG.uniform(-.008,.008),yy+RNG.uniform(-.002,.002),z+pz*depth+RNG.uniform(-.008,.008)))
    n=len(outline);faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]
    for i in range(n):faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
    obj=mesh_object(name,vertices,faces,mat)
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    bevel(obj,.015,3)
    return obj


def import_prop(name,path,location,target_height,select_mesh=None):
    # Actual CC0 mesh and its UV/material textures are preserved. A single child
    # of the two-panel screen may be repeated as a constructed multi-leaf screen.
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/path))
    imported=[obj for obj in bpy.data.objects if obj not in before]
    meshes=[obj for obj in imported if obj.type=='MESH' and (select_mesh is None or select_mesh in obj.name)]
    if not meshes:raise RuntimeError('No mesh found in '+str(path))
    for obj in meshes:
        obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.matrix_world=Matrix.Identity(4)
    if select_mesh:
        # Orient a hinged source leaf back to a straight freestanding panel.
        import numpy as np
        xy=np.array([[v.co.x,v.co.y] for v in meshes[0].data.vertices])
        eig,axes=np.linalg.eigh(np.cov(xy.T));axis=axes[:,eig.argmax()]
        axis=axis if axis[0]>=0 else -axis
        angle=math.atan2(float(axis[1]),float(axis[0]));rotation=Matrix.Rotation(-angle,4,'Z')
        for obj in meshes:obj.data.transform(rotation)
    corners=[obj.data.vertices[i].co.copy() for obj in meshes for i in range(len(obj.data.vertices))]
    lo=Vector(tuple(min(p[k] for p in corners) for k in range(3)));hi=Vector(tuple(max(p[k] for p in corners) for k in range(3)))
    scale=target_height/(hi.z-lo.z);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    for obj in meshes:
        for v in obj.data.vertices:v.co=(v.co-center)*scale
        obj.location=point(location);obj.name=name+' '+obj.name;move_to_static(obj)
        if obj.data.uv_layers:obj.data.uv_layers[0].name='UVMap'
        obj['source_asset']=str(path);obj['source_license']='CC0-1.0'
    for obj in imported:
        if obj not in meshes:bpy.data.objects.remove(obj,do_unlink=True)
    return meshes


def snow_field(material_snow):
    # A non-uniform grid concentrates real geometry along the walked line. There
    # are no footprint props, decals or floating dark polygons above this snow.
    xs = sorted(set([float(i) for i in range(-26, 27, 2)] + [-1.6, -1.3, 1.3, 1.6] + [round(-1.2 + i * .08, 4) for i in range(31)]))
    zs = sorted(set([float(i) for i in range(-13, 6)] + [round(5 + i * .12, 4) for i in range(326)] + [float(i) for i in range(45, 54)]))
    nx, nz = len(xs), len(zs)
    vertices, faces, prints = [], [], []
    for i in range(78):
        zz = 43 - i * .47
        xx = (.13 if i % 2 else -.13) + .06 * math.sin(i * .13)
        prints.append((xx, zz, (-.13 if i % 2 else .13)))
    for z in zs:
        candidates = [p for p in prints if abs(z - p[1]) < .55]
        for x in xs:
            height = .11 + .025 * math.sin(x * 1.7 + z * .23) + .02 * math.cos(z * .8 - x * .33)
            if abs(x) < .55:
                for px, pz, angle in candidates:
                    dx, dz = x - px, z - pz
                    u, vv = dx * math.cos(angle) - dz * math.sin(angle), dx * math.sin(angle) + dz * math.cos(angle)
                    # Rounded toe and narrower heel overlap into one boot-shaped depression.
                    q = min((u / .078) ** 2 + ((vv + .105) / .125) ** 2,
                            (u / .10) ** 2 + ((vv - .065) / .17) ** 2)
                    if q < 2.5:
                        height -= .067 * math.exp(-q * 2.2)
                        height += .008 * math.exp(-((math.sqrt(q) - 1.08) / .22) ** 2)
            if abs(x) < 5.7 and -7 < z < 4.8:
                height = -.03
            vertices.append((x, height, z))
    for row in range(nz - 1):
        for col in range(nx - 1):
            i = row * nx + col
            faces.append((i + nx, i + nx + 1, i + 1, i))
    obj = mesh_object('Snow with physically depressed footprint track', vertices, faces, material_snow, 'court')
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def small_fixture(name, x, y, z, bronze, warm, role='fixture'):
    lathe(name + ' bronze foot', [(0, 0), (.065, 0), (.07, .018), (.04, .045), (.045, .06), (0, .06)], (x, y, z), bronze)
    lathe(name + ' shallow bowl', [(0, .05), (.04, .05), (.07, .08), (.074, .11), (.065, .12), (.058, .08), (0, .075)], (x, y, z), bronze)
    cylinder(name + ' warm wick', .012, .04, (x, y + .12, z), warm, 12, 0)
    light(name + ' warm spill', (x, y + .19, z), 8, '#ffad66', .07, role)


def bare_tree(x, z, height, bark, snow):
    base = (x, .08, z)
    top = (x + RNG.uniform(-.2, .2), height, z + RNG.uniform(-.2, .2))
    beam('Winter tree trunk', base, top, .16, bark, .055)
    for i in range(10):
        t = .35 + i / 10 * .5
        angle = i * 2.39 + RNG.uniform(-.25, .25)
        origin = (x, height * t, z)
        length = (1 - t) * height * .7
        middle = (x + math.cos(angle) * length * .6, height * t + .45, z + math.sin(angle) * length * .6)
        end = (x + math.cos(angle) * length, height * t + 1.0, z + math.sin(angle) * length)
        beam('Bare winter bough', origin, middle, .045, bark, .025)
        beam('Bare winter bough tip', middle, end, .025, bark, .009)
        for j in range(3):
            q = .25 + j * .25
            a = angle + (1 if j % 2 else -1) * .65
            start = tuple(middle[k] * (1 - q) + end[k] * q for k in range(3))
            terminal = (start[0] + math.cos(a) * .55, start[1] + .45, start[2] + math.sin(a) * .55)
            beam('Winter fine twig', start, terminal, .009, bark, .003)
        if i % 2 == 0:
            beam('Snow resting on bough', (origin[0], origin[1] + .035, origin[2]), (middle[0], middle[1] + .035, middle[2]), .032, snow, .016)


def build_scene():
    global STATIC, REGION, RNG
    RNG = random.Random(61903)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name in ['STATIC', 'LIGHTS', 'RUNTIME', 'CAMERAS']:
            bpy.data.collections.remove(collection)
    for name in ['STATIC', 'LIGHTS', 'RUNTIME', 'CAMERAS']:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    STATIC = bpy.data.collections['STATIC']
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Cold winter sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.19, .28, .47, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .15

    granite = material('Worn granite', '#9d9d94', 'stone_pavers', .92)
    paving = [material('Dark hall paving %d' % i, c, 'stone_pavers', .62) for i, c in enumerate(['#4c4d4a', '#555450', '#434542'])]
    brick = material('Weathered brick footings', '#9b8f81', 'dark_brick_wall', .9)
    plaster = material('Patched lime plaster', '#c4c0b5', 'white_plaster_rough_01', .95)
    red = material('Aged red painted timber', '#9b3d2c', 'weathered_planks', .65)
    dark_wood = material('Dark old timber', '#69503a', 'weathered_planks', .78)
    teal = material('Faded teal beam paint', '#406c68', 'weathered_planks', .72)
    gold = material('Tarnished gilded edges', '#b89b55', rough=.39, metal=.76)
    screen_gold = material('Gilded screen panels', '#aa8b44', 'weathered_planks', .5, .62)
    snow = material('Snow settled dry grains', '#e3eaf2', 'snow_004', rough=.93)
    paper = material('Ivory window paper', '#c3b49b', rough=.92)
    warm = material('Other lamps warm wick', '#ffbc78', rough=.5, emission=3)
    bronze = material('Aged bronze', '#746041', rough=.42, metal=.78)
    soot = material('Soot-darkened clay', '#36312a', rough=.97)

    REGION = 'hall'
    # Varied old paving follows neither a perfect square grid nor a repeating
    # identical outline; stones have eased, chipped boundaries and slight settlement.
    zz=-6.55
    while zz<2.12:
        depth=RNG.uniform(.48,.78);depth=min(depth,2.2-zz)
        xx=-5.18
        while xx<5.15:
            width=RNG.uniform(.48,.93);width=min(width,5.2-xx)
            irregular_paver('Settled irregular paving stone',xx+width/2,zz+depth/2,width-.018,depth-.018,.60+RNG.uniform(-.006,.006),RNG.choice(paving))
            xx+=width
        zz+=depth
    box('Hall foundation', (10.8,.52,9.0), (0,.26,-2.3), brick, .045)
    # Main hall in the exact runtime nook frame: origin(0,.6,-.5), front z2.2, back z-6.6.
    box('Hall rear wall', (10.6,4.5,.32), (0,2.85,-6.6), plaster, .025)
    for side in [-1,1]:
        box('Hall side wall', (.34,4.5,8.8), (side*5.3,2.85,-2.3), plaster, .025)
        box('Front lower wall', (3.95,1.0,.32), (side*3.125,1.1,2.2), plaster, .025)
        box('Front upper wall', (3.95,1.8,.32), (side*3.125,4.2,2.2), plaster, .025)
        for xx,ww in [(side*1.725,1.15),(side*4.5,1.2)]:
            box('Window jamb plaster', (ww,1.7,.32), (xx,2.45,2.2), plaster, .02)
        window('Main hall lattice', side*3.1,2.45,2.2,1.6,1.7,red,paper)
    box('Door head lintel', (2.3,1.5,.38), (0,4.35,2.2), red, .025)
    for xx in [-1.03,1.03]:box('Main door jamb',(.16,3.05,.38),(xx,2.125,2.2),red,.022)
    box('Stone door threshold', (2.0,.14,.48), (0,.67,2.28), granite, .025)
    # Open leaves are genuine constructed boards with battens and iron rings.
    for side in [-1,1]:
        hinge = bpy.data.objects.new('Open door hinge', None)
        STATIC.objects.link(hinge)
        hinge.location = point((side*.98,.6,2.14))
        hinge.rotation_euler[2] = side*1.22
        tag(hinge,'hall')
        for board in range(5):
            obj=box('Red door plank',(.185,2.91,.07),(side*(.1+board*.19),2.1,2.14),red,.012)
            matrix=obj.matrix_world.copy();obj.parent=hinge;obj.matrix_world=matrix
            # Keep the leaf hinged at its jamb; board local coordinates run toward the centre when shut.
            obj.location=Vector((-side*(.1+board*.19),0,1.5));obj.rotation_euler=(0,0,0)
        for hh in [.45,1.45,2.45]:
            obj=box('Door rear batten',(.92,.10,.10),(0,0,0),dark_wood,.012)
            obj.parent=hinge;obj.location=Vector((-side*.48,-.06,hh))
        for row in range(6):
            for col in range(3):
                obj=lathe('Worn bronze door stud',[(0,0),(.023,0),(.024,.007),(.018,.021),(0,.027)],(0,0,0),bronze,16)
                obj.parent=hinge;obj.location=Vector((-side*(.19+col*.28),-.048,.40+row*.42));obj.rotation_euler=(math.pi/2,0,0)
        for hh in [.44,1.45,2.46]:
            obj=box('Forged door hinge strap',(.075,.27,.022),(0,0,0),bronze,.012)
            obj.parent=hinge;obj.location=Vector((-side*.04,-.06,hh))
        obj=lathe('Door ring backplate',[(0,0),(.067,0),(.07,.009),(.06,.016),(0,.016)],(0,0,0),bronze,24)
        obj.parent=hinge;obj.location=Vector((-side*.72,-.052,1.43));obj.rotation_euler=(math.pi/2,0,0)
        # A real loose metal ring, not a painted circle on the leaf.
        bpy.ops.mesh.primitive_torus_add(major_radius=.077,minor_radius=.008,major_segments=28,minor_segments=8)
        obj=move_to_static(bpy.context.object,'hall');obj.name='Forged door pull ring';obj.data.materials.append(bronze)
        obj.parent=hinge;obj.location=Vector((-side*.72,-.079,1.36));obj.rotation_euler=(math.pi/2,0,0);uv_world(obj)
    # Columns stand on granite drums, with visible timber shoulders and bracket sets.
    for xx,zz in [(-2.7,1.0),(2.7,1.0),(-2.7,-4.2),(2.7,-4.2)]:
        lathe('Carved granite column base',[(.28,0),(.29,.025),(.28,.075),(.24,.10),(.255,.14),(.24,.18),(.205,.23)],(xx,.6,zz),granite,40)
        lathe('Round entasis red timber column',[(.195,0),(.198,.08),(.19,.2),(.196,.9),(.197,1.6),(.187,2.8),(.169,3.9),(.177,4.2)],(xx,.8,zz),red,40)
        bracket_set(xx,4.72,zz,dark_wood,teal,gold)
    # Front porch columns transfer the deep eave loads to the terrace.
    for xx in [-4.7,-2.35,2.35,4.7]:
        lathe('Porch granite base',[(.27,0),(.29,.04),(.25,.14),(.20,.23)],(xx,.6,3.55),granite,36)
        lathe('Porch entasis column',[(.18,0),(.185,.2),(.19,1.6),(.17,3.5),(.16,4.05)],(xx,.82,3.55),red,36)
        bracket_set(xx,4.69,3.55,dark_wood,teal,gold)
    box('Dark boarded ceiling',(10.6,.16,8.8),(0,5.12,-2.3),dark_wood,.012)
    for zz in [1.1,-.5,-2.3,-4.1]:
        box('Painted transverse beam',(10.4,.28,.24),(0,4.85,zz),teal,.025)
        for yy in [4.73,4.98]:box('Worn gilded beam rule',(10.3,.025,.255),(0,yy,zz),gold,.004)
        for xx in [-4.15,-3.3,-1.65,-.55,.55,1.65,3.3,4.15]:
            box('Recessed painted beam panel',(.66,.15,.025),(xx,4.85,zz+.135),red,.012)
            for side in [-1,1]:
                box('Painted panel relief frame',(.7,.018,.035),(xx,4.85+side*.083,zz+.15),teal,.007)
                box('Painted panel relief frame',(.018,.18,.035),(xx+side*.34,4.85,zz+.15),teal,.007)
                beam('Abstract ochre panel line',(xx-.24,4.85,zz+.165),(xx,4.85+side*.048,zz+.165),.006,gold,.006)
                beam('Abstract ochre panel line',(xx,4.85+side*.048,zz+.165),(xx+.24,4.85,zz+.165),.006,gold,.006)
    tiled_roof('Main hall',0,5.15,-2.3,12,6.7,2.65,material('Dark clay roof tile','#6c7073','grey_roof_tiles',rough=.85),dark_wood,snow,'hall')
    # Terrace and short worn steps align exactly with the walk's rise to the hall floor.
    box('Front terrace',(11,.6,2.4),(0,.3,3.4),granite,.045)
    for i in range(3):
        worn_step('Chipped and worn granite step',3.2,.2,.43,(0,.5-i*.2,4.8+i*.4),granite)
        for side in [-1,1]:box('Step-edge snow',(.55,.055,.34),(side*1.29,.615-i*.2,4.8+i*.4),snow,.03)
    # Narrow icicles hang from the sheltered edge rather than floating over the court.
    ice=material('Cloudy icicle ice','#ccdbe5',rough=.24)
    for i in range(47):
        xx=-5.8+i*.25+RNG.uniform(-.035,.035)
        length=.06+RNG.random()**2*.29
        edge=roof_surface(0,5.15,-2.3,12,6.7,2.65,xx,1,1)
        beam('Eave icicle',(xx,edge[1]-.03,edge[2]),(xx,edge[1]-.03-length,edge[2]),.014+length*.02,ice,.001)

    # Actual Poly Haven CC0 antique joinery and screen panels replace the box
    # altar and schematic diamond screen. Their original photo UVs are retained.
    import_prop('Scanned console altar','web/public/models/chinese_console_table/chinese_console_table.gltf',(0,.6,-4.85),1.03)
    # Round side pedestals support the unchanged outer lamp positions.
    for xx in [-1.45,1.45]:
        lathe('Turned altar side lamp pedestal',[(.13,0),(.15,.04),(.09,.12),(.065,.75),(.11,.91),(.17,.96),(.17,1.03)],(xx,.6,-4.75),dark_wood,32)
    for i,xx in enumerate([-1.51,0,1.51]):
        import_prop('Scanned screen leaf','web/public/models/chinese_screen_panels/chinese_screen_panels.gltf',(xx,1.3,-6.31),3.6,select_mesh='panels_a' if i%2==0 else 'panels_b')
    for xx in [-2.34,2.34]:
        lathe('Gilded screen edge molding',[(.028,0),(.038,.04),(.028,3.5),(.045,3.58),(.045,3.62)],(xx,1.3,-6.23),gold,16)
    for xx in [-1.45,-.95,.95,1.45]:small_fixture('Other altar lamp',xx,1.63,-4.75,bronze,warm)
    lathe('Sooted clay bowl',[(0,0),(.14,0),(.18,.15),(.17,.19),(.15,.18),(.10,.04),(0,.035)],(0,1.63,-4.85),soot)
    for i in range(4):beam('Smouldering incense',(i*.025-.04,1.75,-4.85),(i*.028-.04,1.98+RNG.uniform(-.015,.015),-4.85),.0028,dark_wood,.0028)
    for side in [-1,1]:
        box('Plain kneeling stool',(.55,.17,.34),(side*.85,.695,-3.3),dark_wood,.025)
    # A broom, stacked bowls and repaired threshold give the room a maintained human scale.
    beam('Broom handle',(4.5,.66,-5.8),(4.75,2.25,-5.85),.018,dark_wood,.018)
    for i in range(35):beam('Broom straw',(4.5,.77,-5.8),(4.38+RNG.random()*.26,.64,-5.72+RNG.random()*.1),.0035,material('Dry straw','#b3a17c',rough=.95),.002)
    for i in range(3):lathe('Stacked plain bowls',[(0,0),(.11,0),(.15,.09),(.14,.11),(.1,.03),(0,.02)],(4.62,.6+i*.055,-4.9),soot)
    # The suspension and fixed anchor are static; the person's red gauze lantern is not part of this export.
    beam('Visitor lantern suspension',(0,4.73,-.5),(0,3.25,-.5),.007,bronze,.007)
    anchor=bpy.data.objects.new('Visitor_Lamp_Anchor',None)
    bpy.data.collections['RUNTIME'].objects.link(anchor)
    anchor.location=point((0,3.22,-.5))
    anchor['runtime_lamp']='gauze';anchor['runtime_owned']=True
    light('Visitor flame bake basis',(0,2.99,-.5),45,'#ffbd78',.04,'lamp')
    light('Cool court light entering doorway',(0,2.2,4.4),65,'#b4cdf6',1.4,'ambient')

    REGION='gate'
    for side in [-1,1]:box('Gate plaster pier',(2.6,3.7,2.4),(side*2.7,1.85,18),plaster,.045)
    box('Gate lintel',(2.8,.48,2.4),(0,3.48,18),dark_wood,.025)
    for side in [-1,1]:
        lathe('Gate round stone drum',[(.24,0),(.26,.04),(.23,.14),(.17,.20)],(side*1.64,.1,19.35),granite,32)
        lathe('Gate round red column',[(.14,0),(.15,.9),(.14,2.4),(.13,3.2)],(side*1.64,.3,19.35),red,32)
        bracket_set(side*1.64,3.40,19.35,dark_wood,teal,gold)
    tiled_roof('Court gate',0,3.8,18,9,2.1,.95,material('Gate roof tiles','#73777b','grey_roof_tiles',rough=.85),dark_wood,snow,'gate')
    for side in [-1,1]:
        box('Gate red door jamb',(.2,2.9,.18),(side*1.48,1.45,19.23),red,.025)
        box('Gate threshold end',(.45,.13,1.2),(side*1.55,.065,18),granite,.04)
    # Two unobtrusive fixed gate lamps provide warm pools while leaving the blue snow dominant.
    for side in [-1,1]:
        box('Gate lamp shelf',(.38,.10,.33),(side*2.0,1.55,19.25),granite,.02)
        small_fixture('Gate shelf lamp',side*2.0,1.6,19.25,bronze,warm)

    REGION='court'
    snow_field(snow)
    for side in [-1,1]:
        box('Court front wall',(8.0,2.55,.55),(side*8,1.275,18),plaster,.035)
        box('Front wall coping snow',(8.2,.17,.72),(side*8,2.63,18),snow,.055)
        box('Court side wall',(.55,2.55,28),(side*12,1.275,4),plaster,.035)
        box('Side wall coping snow',(.72,.17,28.2),(side*12,2.63,4),snow,.055)
        # Low side halls use plain roofs and shallow porches at the same construction scale as the main hall.
        box('Side hall back',(.3,2.5,11),(side*10.7,1.4,3),plaster,.025)
        for zz in [-2.3,1.1,4.5,7.9]:
            cylinder('Side hall porch column',.11,2.6,(side*8.9,1.5,zz),red,24,.01)
        tiled_roof('Side hall',side*10,2.95,3,4.7,6.5,.95,material('Side hall roof tiles','#666d72','grey_roof_tiles',rough=.85),dark_wood,snow,'court')
        for zz in [-.8,4.0]:
            box('Snow bench seat',(1.3,.15,.5),(side*7.0,.5,zz),granite,.025)
            for dx in [-.4,.4]:box('Stone bench leg',(.2,.4,.35),(side*7+dx,.2,zz),granite,.025)
            box('Snow over bench',(1.3,.08,.5),(side*7,.62,zz),snow,.035)
    box('Court back wall',(24,2.55,.55),(0,1.275,-10),plaster,.035)
    box('Back wall snow',(24.2,.17,.72),(0,2.63,-10),snow,.055)
    for xx,zz,hh in [(-16,11,6.5),(17,6,7.5),(-15,-7,7.0),(16,-9,6.8)]:bare_tree(xx,zz,hh,dark_wood,snow)

    # Actual source cameras make the spatial contract inspectable in Blender as well as in runtime captures.
    cameras={
        'Outside':((2.4,1.75,45),(0,3.1,16)),
        'Gate':((0,1.7,23),(0,2.6,2.2)),
        'Court':((0,1.7,11),(0,2.5,1.7)),
        'Door':((0,2.15,3.4),(0,2.5,-3.0)),
        'Choose':((.75,2.22,1.05),(0,2.75,-1.1)),
        'Lit':((.5,2.2,.9),(0,2.9,-.5)),
        'CourtThroughDoor':((1.3,2.2,-2.9),(0,2.75,1.1)),
        'EaveDetail':((5.8,5.6,8.0),(2.5,5.72,3.9)),
        'DoorFloorDetail':((3,1.8,8.5),(1.1,1.2,2.5)),
        'RoofRidgeDetail':((8.3,7.2,10),(4.7,6.15,.3)),
    }
    reference_path=ROOT/'docs/evidence/blender-pilot/reference-cameras.json'
    if reference_path.exists():
        reference=json.loads(reference_path.read_text())
        for name,view in reference['desktop'].items():
            cameras['Reference_'+name]=(view['position'],view['target'])
    for name,(location,target) in cameras.items():
        data=bpy.data.cameras.new(name);data.sensor_fit='VERTICAL';data.sensor_height=24;data.lens=32 if name=='DoorFloorDetail' else 41.848973326090906
        obj=bpy.data.objects.new(name,data);bpy.data.collections['CAMERAS'].objects.link(obj)
        obj.location=point(location);obj.rotation_euler=(point(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=bpy.data.objects.get('Reference_outside',bpy.data.objects['Outside'])
    # The baker can replace these ambient settings for night/dusk/day without editing architecture.
    sun_data=bpy.data.lights.new('Moon basis','SUN');sun_data.energy=.45;sun_data.color=(.60,.72,1.0);sun_data.angle=.11
    sun=bpy.data.objects.new('Moon basis',sun_data);bpy.data.collections['LIGHTS'].objects.link(sun)
    sun.rotation_euler=(math.radians(22),math.radians(-28),math.radians(-35));sun['bake_role']='ambient'
    scene['one_light_place']='snow-roof';scene['runtime_origin']='glTF Y-up; metres';scene['visitor_lamp_anchor']=[0,3.22,-.5]
    scene['lightmap_contract']='UVMap is material UV; baker creates packed Lightmap as second channel.'
    bpy.context.view_layer.update()
    return scene


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default=str(ROOT/'art/build/snow-roof.blend'))
    arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    args=parser.parse_args(arguments)
    scene=build_scene()
    output=Path(args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    meshes=[obj for obj in bpy.data.collections['STATIC'].objects if obj.type=='MESH']
    print('ONE_LIGHT_MODEL_READY',output,'meshes',len(meshes),'source_polygons',sum(len(obj.data.polygons) for obj in meshes),'anchor',list(scene['visitor_lamp_anchor']))


if __name__=='__main__':
    main()
