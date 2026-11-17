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
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Matrix, noise

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from resting_contacts import RestingContacts, engine as engine_point
from snow_round1_details import tube_path, append_mesh, soft_ribbon, winter_tree_meshes, mature_winter_tree_meshes
from snow_bronze_maps import bronze_maps
from snow_paint_maps import painted_finish_maps
from snow_lightmap_charts import source_uv, box_net, lathe_uv, beam_uv, tube_coordinates, grid_uv, closed_grid_uv, planar_uv, profile_uv, torus_uv, complete_source_charts
MATERIALS = ROOT / 'web/public/materials/scans'
RNG = random.Random(61903)
STATIC = None
REGION = 'court'
CACHE = {}
CONTACTS = None
FIXED_LAMPS = []
INCENSE = []


def point(p):
    return Vector((p[0], -p[2], p[1]))


def resting_contact_height(x, z, support_meshes):
    """Return actual engine-Y contact height from evaluated support triangles.

    All resting-group placement uses this one helper at an actual evaluated
    lowest bearing vertex. The independent audit casts its own rays again.
    """
    tree, owners = CONTACTS.support(support_meshes)
    hit, normal, triangle, distance = tree.ray_cast(
        point((x, 50, z)), Vector((0, 0, -1)), 100)
    if hit is None:
        raise RuntimeError('No actual evaluated support beneath resting contact')
    return float(hit.z)


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
    modifier.segments = min(segments, 2)
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
    box_net(obj,dimensions)
    obj.location=point(location);obj.rotation_euler[2]=rotation
    obj.matrix_world = obj.matrix_basis
    uv_world(obj)
    if edge and min(dimensions)>.045:bevel(obj,edge)
    return obj


def cylinder(name, radius, depth, location, material, vertices=24, edge=.006, region=None):
    obj=lathe(name,[(0,-depth/2),(radius,-depth/2),(radius,depth/2),(0,depth/2)],location,material,vertices,region)
    if edge:bevel(obj,edge)
    return obj


def lathe(name, profile, location, material, segments=32, region=None):
    vertices, faces, rings = [], [], []
    for radius, height in profile:
        ring=[]
        for i in range(1 if abs(radius)<1e-9 else segments):
            ring.append(len(vertices))
            vertices.append((location[0]+math.cos(i/segments*math.tau)*radius,location[1]+height,location[2]+math.sin(i/segments*math.tau)*radius))
        rings.append(ring)
    for row in range(len(profile) - 1):
        a,b=rings[row],rings[row+1]
        for i in range(segments):
            j = (i + 1) % segments
            if len(a)==1 and len(b)==1:break
            if len(a)==1:faces.append((a[0],b[i],b[j]))
            elif len(b)==1:faces.append((a[i],b[0],a[j]))
            else:faces.append((a[i],b[i],b[j],a[j]))
    obj = mesh_object(name, vertices, faces, material, region)
    lathe_uv(obj,profile,rings,segments)
    if material and material.get('one_light_cast_bronze_uv'):
        uv=obj.data.uv_layers['UVMap'].data;circumference=math.tau*max(r for r,h in profile)
        for polygon in obj.data.polygons:
            values=[]
            for li in polygon.loop_indices:
                p=obj.data.vertices[obj.data.loops[li].vertex_index].co
                u=(math.atan2(-p.y-location[2],p.x-location[0])/math.tau)%1
                values.append((li,u,(p.z-location[1])/.22))
            seam=max(v[1] for v in values)-min(v[1] for v in values)>.5
            for li,u,v in values:uv[li].uv=(((u+1 if seam and u<.5 else u)*circumference/.22),v)
    for polygon in obj.data.polygons:
        polygon.use_smooth = abs(polygon.normal.z)<.995
    return obj


def close_turning_top(obj, segments):
    """Close the existing top rim with a physical bearing face, same silhouette."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    rim = list(bm.verts)[-segments:]
    face = bm.faces.new(list(reversed(rim)))
    face.smooth = False
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    uv_world(obj)
    # The added physical bearing cap has its own real circular source chart.
    uv=obj.data.uv_layers['SourceLightmap'];face=obj.data.polygons[-1]
    for li in face.loop_indices:
        p=obj.data.vertices[obj.data.loops[li].vertex_index].co
        uv.data[li].uv=(p.x+20,p.y+20)
    obj['physical_bearing_top'] = 'Closed actual top-rim face; no bounding-box support surrogate.'
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
    beam_uv(obj,a,b,radius,end_radius if end_radius is not None else radius*.8,segments)
    for polygon in obj.data.polygons:polygon.use_smooth=len(polygon.vertices)==4
    return obj


def curved_tube(name,points,radii,mat,radial=10,closed=False,region=None):
    vertices,faces=tube_path(points,radii,radial,closed)
    obj=mesh_object(name,vertices,faces,mat,region)
    source_uv(obj,tube_coordinates(points,radii,radial,closed),'Connected tube body and cap charts; metre scale.')
    for face in obj.data.polygons:face.use_smooth=True
    if mat.get('one_light_cast_bronze_uv'):uv_world(obj,.22)
    return obj


def cast_bronze_material(mat):
    if mat.get('one_light_cast_bronze_uv'):return
    maps,recipe=bronze_maps(ROOT);nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    orm=nodes.new('ShaderNodeTexImage');orm.image=bpy.data.images.load(str(maps['orm']['path']),check_existing=True);orm.image.colorspace_settings.name='Non-Color';orm.label='Authored cast bronze roughness and oxide metal fraction'
    links.new(uv.outputs['UV'],orm.inputs['Vector']);channels=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],channels.inputs[0]);links.new(channels.outputs['Green'],bsdf.inputs['Roughness']);links.new(channels.outputs['Blue'],bsdf.inputs['Metallic'])
    texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(maps['normal']['path']),check_existing=True);texture.image.colorspace_settings.name='Non-Color';texture.label='Authored fine cast pitting Normal GL'
    links.new(uv.outputs['UV'],texture.inputs['Vector']);normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.34;links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    mat['one_light_cast_bronze_uv']=True;mat['one_light_authored_material_recipe']=recipe
    mat['one_light_authored_pbr_maps']=json.dumps({key:{'path':str(value['path'].relative_to(ROOT)),'sha256':value['sha256'],'bytes':value['bytes']} for key,value in maps.items()})


def snow_coping(name,length,width,height,location,mat,turn=False,seed=1):
    vertices,faces=soft_ribbon(length,width,height,seed)
    vertices=[(location[0]+(z if turn else x),location[1]+y,location[2]+(x if turn else z)) for x,y,z in vertices]
    obj=mesh_object(name,vertices,faces,mat)
    steps=max(8,int(length/.27));closed_grid_uv(obj,9,steps+1,length,width)
    for face in obj.data.polygons:face.use_smooth=True
    obj['snow_volume_closed']=True
    return obj


def color(value):
    """Authored CSS-like albedo/emission hex decoded once into scene-linear."""
    values=linear_light_color(value)
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values[:3])+(values[3],)


def linear_light_color(value):
    """Explicit legacy scene-linear light chromaticities; no lighting retune."""
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
    mat['one_light_basecolor_linear']=list(color(tint))
    mat['one_light_export_basecolor_factor']=list(color(tint))
    mat['one_light_authored_srgb_hex']=tint
    mat['one_light_albedo_policy']='CSS-like authored hex -> IEC sRGB inverse transfer once; image sRGB decoded by image color space; imported factors unchanged.'
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
                multiply = nodes.new('ShaderNodeMix')
                multiply.data_type = 'RGBA'
                multiply.blend_type = 'MULTIPLY'
                multiply.inputs[0].default_value = 1
                multiply.inputs[7].default_value = color(tint)
                links.new(texture.outputs['Color'], multiply.inputs[6])
                links.new(multiply.outputs[2], bsdf.inputs[socket])
            elif socket == 'Normal':
                normal = nodes.new('ShaderNodeNormalMap')
                normal.inputs['Strength'].default_value = .6
                links.new(texture.outputs['Color'], normal.inputs['Color'])
                links.new(normal.outputs['Normal'], bsdf.inputs[socket])
            else:
                links.new(texture.outputs['Color'], bsdf.inputs[socket])
    if name.startswith('Snow'):
        # Real scan normals export to glTF. The former Generated bump stretched
        # centimetre grain across thin caps and did not survive PBR export.
        bsdf.inputs['Subsurface Weight'].default_value = .025
    CACHE[name] = mat
    return mat


def stable_roughness(mat, minimum, preserve_maps=False):
    mat['one_light_min_roughness']=minimum
    mat['one_light_roughness_runtime']='roughnessFactor=max(roughnessFactor,one_light_min_roughness), after roughnessmap_fragment'
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    if bsdf and not preserve_maps:
        for link in list(bsdf.inputs['Roughness'].links):mat.node_tree.links.remove(link)
        bsdf.inputs['Roughness'].default_value=max(minimum,bsdf.inputs['Roughness'].default_value)


def vertex_tint_shader(mat):
    if mat.get('one_light_surface_tint'):return
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bsdf=nodes.get('Principled BSDF');existing=list(bsdf.inputs['Base Color'].links)
    vertex=nodes.new('ShaderNodeVertexColor');vertex.layer_name='SurfaceTint';vertex.label='Exported COLOR_0: weathering and soot'
    mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    if existing:
        previous=existing[0].from_node
        if previous.type=='MIX' and previous.inputs[6].is_linked and not previous.inputs[7].is_linked:
            # One supported image×COLOR_0 multiply. Bake the constant tint into
            # actual vertex colours instead of nesting exporter-sensitive mixes.
            mat['one_light_vertex_base_tint']=list(previous.inputs[7].default_value[:3])
            mat['one_light_export_basecolor_factor']=[1.,1.,1.,1.]
            links.new(previous.inputs[6].links[0].from_socket,mix.inputs[6])
        else:links.new(existing[0].from_socket,mix.inputs[6])
    else:mix.inputs[6].default_value=bsdf.inputs['Base Color'].default_value
    links.new(vertex.outputs['Color'],mix.inputs[7]);links.new(mix.outputs[2],bsdf.inputs['Base Color'])
    mat['one_light_surface_tint']=True
    mat['one_light_vertex_color']='SurfaceTint / glTF COLOR_0 multiply'


def weather_plaster(mat):
    vertex_tint_shader(mat);mat['one_light_base_weathering']=True


def painted_timber_finish(mat):
    """Actual image roughness and fine scan normal survive ordinary glTF PBR."""
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    mapped=painted_finish_maps(ROOT)
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(mapped['path']),check_existing=True)
    texture.image.colorspace_settings.name='Non-Color';texture.label='CC0 timber scan remapped to matte paint roughness .73–.91'
    links.new(uv.outputs['UV'],texture.inputs['Vector']);links.new(texture.outputs['Color'],bsdf.inputs['Roughness'])
    bsdf.inputs['Roughness'].default_value=1
    normal_texture=nodes.new('ShaderNodeTexImage');normal_texture.image=bpy.data.images.load(str(MATERIALS/'weathered_planks/normal.jpg'),check_existing=True)
    normal_texture.image.colorspace_settings.name='Non-Color';normal_texture.label='Fine photographed timber grain under aged paint'
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.12
    links.new(uv.outputs['UV'],normal_texture.inputs['Vector']);links.new(normal_texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    mat['one_light_painted_fine_finish']=True
    mat['one_light_paint_map_provenance']=json.dumps({k:str(v) for k,v in mapped.items()})
    stable_roughness(mat,.70,True)


def soot_stains(mat, stains, strength):
    vertex_tint_shader(mat)
    mat['one_light_soot_stencils']=json.dumps(stains)
    mat['one_light_soot_strength']=strength


def apply_surface_tints():
    import bmesh
    for obj in list(STATIC.objects):
        if obj.type!='MESH' or not any(m and m.get('one_light_surface_tint') for m in obj.data.materials):continue
        # Refine the existing opaque surface, not a second coplanar decal mesh.
        target=None
        if obj.name.startswith('Gate plaster pier'):target=(1,-1,.18)
        if obj.name.startswith('Inset blue green ceiling panel') and obj.location.y>4:target=(2,-1,.20)
        if target:
            bm=bmesh.new();bm.from_mesh(obj.data)
            axis,sign,spacing=target
            candidate=max(bm.faces,key=lambda f:f.normal[axis]*sign)
            cuts=max(1,math.ceil(max(e.calc_length() for e in candidate.edges)/spacing)-1)
            bmesh.ops.subdivide_edges(bm,edges=list(candidate.edges),cuts=cuts,use_grid_fill=True)
            bm.to_mesh(obj.data);bm.free();obj.data.update();uv_world(obj)
        attr=obj.data.color_attributes.get('SurfaceTint') or obj.data.color_attributes.new(name='SurfaceTint',type='FLOAT_COLOR',domain='CORNER')
        obj.data.color_attributes.active_color=attr
        for polygon in obj.data.polygons:
            mat=obj.data.materials[polygon.material_index]
            stains=json.loads(mat.get('one_light_soot_stencils','[]')) if mat else []
            strength=mat.get('one_light_soot_strength',0) if mat else 0
            for loop_index in polygon.loop_indices:
                vertex=obj.data.vertices[obj.data.loops[loop_index].vertex_index]
                world=obj.matrix_world@vertex.co;engine=(world.x,world.z,-world.y)
                tint=list(mat.get('one_light_vertex_base_tint',[1.0,1.0,1.0])) if mat else [1.,1.,1.]
                if mat and mat.get('one_light_base_weathering'):
                    damp=max(0,1-engine[1]/1.25)**1.3*.56
                    variation=.72+.25*noise.noise(Vector((world.x*1.15,world.y*1.15,1.3)))
                    for k,dark in enumerate([.28,.30,.25]):tint[k]*=1-damp*variation*(1-dark)
                    patch=.92+.075*noise.noise(Vector((world.x*.72,world.y*.72,world.z*1.7)))
                    for k in range(3):tint[k]*=patch
                if mat and mat.get('one_light_bronze_patina'):
                    mottled=noise.noise(Vector((world.x*18.7,world.y*18.7,world.z*18.7)))
                    fine=noise.noise(Vector((world.x*71,world.y*71,world.z*71)))
                    patina=max(0,min(.72,(mottled+.24)*.72))
                    for k,value in enumerate([.38,.68,.56]):tint[k]*=(1-patina+patina*value)*(.91+.08*fine)
                if mat and mat.get('one_light_painted_timber'):
                    grain=.985+.008*math.sin(world.z*53+world.x*.6)+.006*noise.noise(world*18)
                    tint=[grain,grain,grain]
                if obj.get('footprint_centres_engine') and abs(engine[0])<.65:
                    qmin=10
                    for px,pz,angle in json.loads(obj['footprint_centres_engine']):
                        if abs(engine[2]-pz)>.4:continue
                        dx,dz=engine[0]-px,engine[2]-pz
                        u=dx*math.cos(angle)-dz*math.sin(angle);v=dx*math.sin(angle)+dz*math.cos(angle)
                        q=min((u/.092)**2+((v+.105)/.13)**2,(u/.108)**2+((v-.065)/.17)**2)
                        qmin=min(qmin,q)
                    packed=.30*math.exp(-qmin*1.5)
                    tint=[tint[0]*(1-packed),tint[1]*(1-packed*.85),tint[2]*(1-packed*.64)]
                amount=0
                for cx,cy,cz,rx,ry,rz in stains:
                    q=((engine[0]-cx)/rx)**2+((engine[1]-cy)/ry)**2+((engine[2]-cz)/rz)**2
                    amount+=strength*max(0,1-q)**1.7
                for k in range(3):tint[k]*=1-min(.72,amount)*.84
                attr.data[loop_index].color=(*tint,1)
        obj['surface_tint_export']='Preserve active SurfaceTint as glTF COLOR_0; multiply original base color/texture.'
        if any(m and m.get('one_light_painted_fine_finish') for m in obj.data.materials):
            # Grain follows the actual longest timber axis. Material UV0 only;
            # separately authored SourceLightmap charts retain their own layout.
            spans=[max(v.co[k] for v in obj.data.vertices)-min(v.co[k] for v in obj.data.vertices) for k in range(3)]
            long_axis=max(range(3),key=lambda k:spans[k]);uv=obj.data.uv_layers['UVMap'].data
            for polygon in obj.data.polygons:
                dominant=max(range(3),key=lambda k:abs(polygon.normal[k]));axes=[k for k in range(3) if k!=dominant]
                if long_axis in axes:axes=[next(k for k in axes if k!=long_axis),long_axis]
                for li in polygon.loop_indices:
                    p=obj.data.vertices[obj.data.loops[li].vertex_index].co
                    uv[li].uv=(p[axes[0]]/.42,p[axes[1]]/.42)
            obj['paint_finish_uv_policy']='Fine photograph-derived grain repeats at .42m; V follows actual longest timber axis.'


def kneeling_cushion(x,y,z):
    cloth=material('Worn woven cushion cloth','#746148',rough=.96)
    seam=material('Cushion stitched piping','#4c4031',rough=.98)
    vertices=[];faces=[];segments=40;rings=18;w,d,h=.62,.46,.125
    signed=lambda a,e:math.copysign(abs(a)**e,a)
    for row in range(rings+1):
        theta=row/rings*math.pi
        for col in range(segments):
            phi=col/segments*math.tau
            xx=w/2*signed(math.sin(theta)*math.cos(phi),.48)
            zz=d/2*signed(math.sin(theta)*math.sin(phi),.48)
            yy=h/2*math.cos(theta)
            yy+=.0025*math.sin(phi*11+row*.4)*math.sin(theta)**3
            vertices.append((x+xx,y+yy,z+zz))
    for row in range(rings):
        for col in range(segments):
            j=(col+1)%segments;i=row*segments+col
            faces.append((i,row*segments+j,(row+1)*segments+j,i+segments))
    obj=mesh_object('Soft sewn kneeling cushion',vertices,faces,cloth)
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    coordinates=[]
    for polygon in obj.data.polygons:
        cols=[vi%segments for vi in polygon.vertices];wrap=max(cols)-min(cols)>segments/2
        coordinates.append([((segments if wrap and vi%segments==0 else vi%segments)/segments*w*math.pi,vi//segments/rings*d*math.pi/2) for vi in polygon.vertices])
    source_uv(obj,coordinates,'Connected cushion meridians; no material UV change.')
    for polygon in obj.data.polygons:polygon.use_smooth=True
    for i in range(segments):
        a=i/segments*math.tau;b=(i+1)/segments*math.tau
        p=(x+w/2*signed(math.cos(a),.48),y-.003,z+d/2*signed(math.sin(a),.48))
        q=(x+w/2*signed(math.cos(b),.48),y-.003,z+d/2*signed(math.sin(b),.48))
        beam('Cushion sewn edge piping',p,q,.0026,seam,.0026)


def brass_burner(location,bronze,soot):
    x,y,z=location
    body=lathe('Brass incense burner with rolled lip',[(0,.085),(.10,.085),(.145,.108),(.18,.16),(.196,.245),(.202,.275),(.195,.293),(.181,.298),(.17,.286),(.17,.27),(.165,.25),(.14,.19),(0,.19)],location,bronze,64)
    bright=material('Burnished bronze high points','#ba9756',rough=.39,metal=.88)
    stable_roughness(bright,.39,True)
    cast_bronze_material(bright)
    lathe('Brass burner worn rim band',[(.186,.278),(.201,.282),(.202,.292),(.193,.301),(.183,.299)],location,bright,64)
    lathe('Brass burner cast belly band',[(.175,.155),(.185,.164),(.187,.173),(.181,.179)],location,bright,64)
    for i in range(3):
        a=i/3*math.tau
        path=[(x+math.cos(a)*r,y+h,z+math.sin(a)*r) for r,h in [(.115,.145),(.137,.105),(.145,.045),(.174,.016),(.184,.019)]]
        curved_tube('Brass burner cast curved leg',path,[.025,.024,.019,.024,.019],bronze,10)
    for side in [-1,1]:
        path=[(x+side*(.184+.105*math.sin(t*math.pi)),y+.185+.105*math.cos(t*math.pi),z+.006*math.sin(t*math.tau)) for t in [i/14 for i in range(15)]]
        curved_tube('Brass burner raised ring handle',path,[.015]*len(path),bronze,10)
    ash=material('Soft cold incense ash','#8e8880',rough=1)
    vertex_tint_shader(ash)
    vertices=[(x,y+.249,z)];faces=[];n=40
    for i in range(n):
        a=i/n*math.tau
        vertices.append((x+math.cos(a)*.145,y+.227+.006*math.sin(a*7)+.003*math.sin(a*17),z+math.sin(a)*.145))
    for i in range(n):faces.append((0,1+i,1+(i+1)%n))
    bottom=len(vertices)
    for xx,yy,zz in vertices.copy():vertices.append((xx,resting_contact_height(xx,zz,[body])+.0001,zz))
    for i in range(n):
        a=1+i;b=1+(i+1)%n;faces.extend([(a,b,b+bottom,a+bottom),(bottom,b+bottom,a+bottom)])
    with CONTACTS.group('burner ash', [body]):
        ash_surface=mesh_object('Ash mound in brass burner',vertices,faces,ash)
    for i in range(9):
        a=i*2.39;r=.022+.065*((i*7)%9)/9
        with CONTACTS.group('charred incense '+str(i), [ash_surface]):
            beam('Charred incense end in ash',(x+math.cos(a)*r,y+.25,z+math.sin(a)*r),(x+math.cos(a)*r+.01,y+.251,z+math.sin(a)*r+.008),.0018,soot,.0015)
    return ash_surface


def light(name, location, energy, tint, radius=.1, role='fixture'):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = energy
    data.color = linear_light_color(tint)[:3]
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
    samples=10
    upper=[];lower=[]
    for i in range(samples+1):
        u=-reach+2*reach*i/samples
        tail=abs(u/reach)
        upper.append((u,.06+.065*tail**3))
        lower.append((u,.06+.065*tail**3-thickness*(1-.45*tail)))
    contour=upper+list(reversed(lower));vertices=[];n=len(contour)
    middle=sum(v for u,v in contour)/n
    for lateral,inset in [(-width/2,True),(-width/2+.008,False),(width/2-.008,False),(width/2,True)]:
        for u,v in contour:
            if inset:u*=.989;v=middle+(v-middle)*.87
            vertices.append((x+u if turn else x+lateral,y+v,z+lateral if turn else z+u))
    faces=[tuple(reversed(range(n))),tuple(range(n*3,n*4))]
    for row in range(3):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    obj=mesh_object(name,vertices,faces,mat)
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    profile_uv(obj,n,4,{0,1},2 if turn else 0)
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
        nx,ny=max(16,int(width/.40)),14
        vertices=[];faces=[]
        for row in range(ny+1):
            for col in range(nx+1):
                xx=cx-width/2+width*col/nx
                vertices.append(roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,row/ny,side))
        for row in range(ny):
            for col in range(nx):
                i=row*(nx+1)+col;faces.append((i,i+1,i+nx+2,i+nx+1))
        if side>0:faces=[tuple(reversed(face)) for face in faces]
        boarding=mesh_object(name+' curved roof boarding',vertices,faces,wood,region)
        grid_uv(boarding,nx+1,width,math.hypot(half_depth,rise))
        cols=max(10,int(width/.255));rows=max(8,int(math.hypot(half_depth,rise)/.345))
        # Wide concave pan tiles alternate with narrow convex covers over their
        # seams. Every row has a real overlapping lip and curved eave-end shell.
        for cover in [False,True]:
            vertices=[];faces=[];across=4;along=1
            count=cols if not cover else cols-1
            for row in range(rows):
                t0=max(0,(row-.04)/rows);t1=min(1.018,(row+1.13)/rows)
                for col in range(count):
                    # Deep snow permanently encloses the upper courses. Keep
                    # the exposed eave courses and both barge edges; closed
                    # boarding remains the physical hidden roof/occluder.
                    if row<rows-3 and col not in [0,count-1]:continue
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
            stride=(along+2)*(across+1);tile_uv=[]
            for polygon in obj.data.polygons:
                values=[]
                for vi in polygon.vertices:
                    local=vi%stride;rr=local//(across+1);cc=local%(across+1)
                    values.append((cc/across*width/cols*(.43 if cover else .90),min(rr,along)/along*half_depth/rows+(.012 if rr>along else 0)))
                tile_uv.append(values)
            source_uv(obj,tile_uv,'Connected tile pan/cover patch and downturned lip per component.')
            for polygon in obj.data.polygons:polygon.use_smooth=True
        # Closed, soft snow volume. Its TOP stays above every tile/lip rather
        # than intersecting the periodic tile rows. Only the irregular outer
        # boundary thins down into the roof, so it cannot produce striped holes.
        vertices=[];faces=[];base_positions=[];snow_rows=16
        for row in range(snow_rows+1):
            q=(row/snow_rows)**.73
            for col in range(nx+1):
                xx=cx-width/2+.09+(width-.18)*col/nx
                fringe=noise.noise(Vector((xx*.64,side*.7,2.31)))
                detail=noise.noise(Vector((xx*1.73,side*1.4,7.0)))
                # A wind-scoured, nonperiodic margin reveals real tile courses
                # instead of making every eave end an identical isolated dot.
                tmax=.930+.043*math.sin(xx*.79+side*1.3)+.018*fringe+.012*detail
                t=q*tmax
                p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,t,side)
                n=noise.noise(Vector((xx*.65,p[2]*.55,4.2)))
                n2=noise.noise(Vector((xx*1.4,p[2]*1.1,1.8)))
                edge=max(0,(q-.79)/.21);edge=edge*edge*(3-2*edge)
                ridge=max(0,1-t/.15);ridge=ridge*ridge*(3-2*ridge)
                drift=.20*math.exp(-((xx-cx-width*.19)/(width*.24))**2)*math.sin(math.pi*q)**.7
                overhang_drop=max(0,t-1)*half_depth*.65
                body=max(.23,.34+.090*n+.050*n2+.15*ridge+drift)
                # The thin fringe enters the real pan-tile valleys locally;
                # only the deep body certifies fully enclosed hidden courses.
                depth=body*(1-edge)+.006*edge-overhang_drop
                vertices.append((p[0],p[1]+depth,p[2]))
                # The hidden underside embeds in the solid roof; no floating
                # snow lip or duplicate surface lies on the visible tile skin.
                base_positions.append((p[0],p[1]-.008-min(.10,overhang_drop),p[2]))
        top_count=len(vertices);vertices.extend(base_positions)
        top_faces=[]
        for row in range(snow_rows):
            for col in range(nx):
                i=row*(nx+1)+col;top_faces.append((i,i+1,i+nx+2,i+nx+1))
        if side>0:top_faces=[tuple(reversed(face)) for face in top_faces]
        faces.extend(top_faces)
        faces.extend(tuple(i+top_count for i in reversed(face)) for face in top_faces)
        boundary=list(range(nx+1))+[r*(nx+1)+nx for r in range(1,snow_rows+1)]+[snow_rows*(nx+1)+c for c in range(nx-1,-1,-1)]+[r*(nx+1) for r in range(snow_rows-1,0,-1)]
        for i,a in enumerate(boundary):
            b=boundary[(i+1)%len(boundary)]
            faces.append((a,b,b+top_count,a+top_count))
        cap=mesh_object(name+' curved settled snow cap',vertices,faces,snow,region)
        import bmesh
        bm=bmesh.new();bm.from_mesh(cap.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(cap.data);bm.free()
        closed_grid_uv(cap,nx+1,snow_rows+1,width,math.hypot(half_depth,rise))
        for polygon in cap.data.polygons:polygon.use_smooth=True
        cap['snow_deep_body_minimum_offset_metres']=.23
        cap['snow_fringe_policy']='Only the q>.79 soft feather enters tile valleys. Fresh actual BVH enclosure proof required; no uniform hidden-tile assumption.'
        cap['snow_volume_closed']=True
        # Curved exposed rafters and transverse purlins support the roof rather
        # than a single rectangular fascia floating under it.
        timber=([],[]);timber_uv=[];count=max(8,int(width/.60))
        start_t=.72 if name=='Main hall' else (.50 if name=='Court gate' else 0)
        for i in range(count):
            xx=cx-width/2+(i+.5)*width/count;path=[]
            for j in range(7):
                p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,xx,start_t+(1-start_t)*j/6,side)
                path.append((p[0],p[1]-.11,p[2]))
            vv,ff=tube_path(path,[.042]*len(path),8);append_mesh(timber,vv,ff)
            timber_uv.extend(tube_coordinates(path,[.042]*len(path),8))
        rafter=mesh_object(name+' continuous curved exposed rafters',*timber,wood,region)
        source_uv(rafter,timber_uv,'Connected curved rafter strips with end caps.')
        for polygon in rafter.data.polygons:polygon.use_smooth=True
        for t in [.3,.6,.84]:
            p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,cx,t,side)
            beam(name+' round roof purlin',(cx-width/2,p[1]-.19,p[2]),(cx+width/2,p[1]-.19,p[2]),.085,wood,.085,region)
        # Flying fascia is a shaped solid following the raised corners.
        path=[]
        for i in range(nx+1):
            p=roof_surface(cx,y_eave,ridge_z,width,half_depth,rise,cx-width/2+width*i/nx,1,side)
            path.append((p[0],p[1]-.06,p[2]))
        curved_tube(name+' continuous curved eave fascia',path,[.07]*len(path),wood,8,region=region)
    # Individual half-round ridge caps overlap along the ridge. Plain curled end
    # profiles are construction pieces, without figures or ranked ornaments.
    ridge_y=y_eave+rise+.12;segments=max(8,int(width/.32));vertices=[];faces=[]
    for col in range(segments):
        if col not in [0,1,segments-2,segments-1]:continue
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
    rng=random.Random(int((x+20)*17381+(z+20)*4199))
    coarse=[(-.5,-.5),(.4,-.5),(.5,-.37),(.5,.43),(.40,.5),(-.43,.5),(-.5,.39)]
    outline=[]
    for i,p in enumerate(coarse):
        for other in [coarse[i-1],coarse[(i+1)%len(coarse)]]:
            outline.append((p[0]*.91+other[0]*.09+rng.uniform(-.007,.007),p[1]*.91+other[1]*.09+rng.uniform(-.007,.007)))
    vertices=[];n=len(outline);settlement=[rng.uniform(-.0015,.0015) for _ in outline]
    for level,(yy,inset) in enumerate([(height-.13,0),(height-.017,0),(height,.013)]):
        for j,(px,pz) in enumerate(outline):
            vertices.append((x+px*(width-2*inset),yy+settlement[j],z+pz*(depth-2*inset)))
    faces=[tuple(reversed(range(n))),tuple(2*n+i for i in range(n))]
    for row in range(2):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    obj=mesh_object(name,vertices,faces,mat)
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    profile_uv(obj,n,3,{0,1},1)
    obj['efficient_profile']='Actual clipped corners and rounded two-band nosing, no evaluated bevel microfaces.'
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
        for mat in obj.data.materials:
            if mat:
                stable_roughness(mat,.36,True)
                if 'chinese_console_table' in str(path):
                    # Preserve the photographed albedo and UV0/normal detail,
                    # but remove the blotchy mirror response of the old ARM.
                    stable_roughness(mat,.58,False)
                    mat['lacquer_finish']='Worn broad satin lacquer; original albedo/normal UVs retained, constant .58 roughness.'
    for obj in imported:
        if obj not in meshes:bpy.data.objects.remove(obj,do_unlink=True)
    return meshes


def snow_field(material_snow):
    """One continuous snowfield, real footprints and outer stair-edge drifts.

    There is no overlapping bank shell, tangent ground contact or hidden-zero
    texel boundary between two snow owners. The centre walking line stays clear.
    """
    def smooth(a,b,v):
        q=max(0,min(1,(v-a)/(b-a)));return q*q*(3-2*q)
    prints=[((.15 if i%2 else -.15)+.045*math.sin(i*.13),43-i*.49,(-.13 if i%2 else .13)) for i in range(77)]
    def terrain(x,z):
        base=.11+.020*math.sin(x*1.7+z*.23)+.014*math.cos(z*.8-x*.33)
        if -10.5<z<18.5:base+=.23*math.exp(-((abs(x)-11.8)/.82)**2)
        if abs(x)>1.7:base+=(.28+.06*math.sin(x*.63))*math.exp(-((z-17.8)/.84)**2)
        base+=.16*math.exp(-((z+9.8)/.85)**2)
        if abs(x)<.58:
            base-=.021*math.exp(-(x/.45)**6)
            for px,pz,angle in prints:
                if abs(z-pz)>.48:continue
                dx,dz=x-px,z-pz;u=dx*math.cos(angle)-dz*math.sin(angle);v=dx*math.sin(angle)+dz*math.cos(angle)
                q=min((u/.092)**2+((v+.105)/.13)**2,(u/.108)**2+((v-.065)/.17)**2)
                if q<3:base-=.088*math.exp(-q*2);base+=.010*math.exp(-((math.sqrt(q)-1.08)/.23)**2)
        # Embedded beneath the built floor/terrace; no white object occupies
        # the doorway and no snow lies across the cleared central steps.
        if abs(x)<5.7 and -7<z<4.58:base=-.09
        # Held place pixel327,306 certified the former LEFT uplift as the
        # portal mound (worldx−2.168,z6.657). The swept left connection now
        # remains the original continuous base field; only the right drift
        # accumulates beside the steps. No buried cut or separate shell.
        if 1.55<x<3.25 and 4.85<z<7.50:
            support=.60-.20*smooth(4.98,5.18,z)-.20*smooth(5.38,5.58,z)
            support=support*(1-smooth(5.78,6.18,z))+base*smooth(5.78,6.18,z)
            cross=smooth(1.55,1.86,abs(x))*(1-smooth(2.03,3.25,abs(x)))
            along=smooth(4.85,5.35,z)*(1-smooth(6.20,7.50,z))
            drift=.060+.016*math.sin(z*7+abs(x)*3)+.009*math.sin(z*15-abs(x)*5)
            bank_top=min(.31,support+drift)
            base+=max(0,bank_top-base)*cross*along
        return base
    coarse=[-26,-21,-17,-13,-12,-10,-8,-6,-5.7,-3.3,-2.8,-1.7,-.62,.62,1.7,2.8,3.3,5.7,6,8,10,12,13,17,21,26]
    zs=sorted(set([-30,-22,-16,-13,-10,-7,-3,0,2,3.4]+[round(3.4+i*.10,4) for i in range(408)]+[45,49,54]))
    vertices=[];faces=[];rows=[]
    for z in zs:
        xs=list(coarse)
        if 5.9<z<44.2:xs += [-.50,-.36,-.25,-.16,-.08,0,.08,.16,.25,.36,.50]
        if 3.4<z<7.5:xs += [side*(.82+i*.13) for side in [-1,1] for i in range(17)]+[-.45,0,.45]
        xs=sorted(set(xs));row=[]
        for x in xs:row.append(len(vertices));vertices.append((x,terrain(x,z),z))
        rows.append(row)
    for previous,current in zip(rows,rows[1:]):
        i=j=0
        while i<len(previous)-1 or j<len(current)-1:
            ax=vertices[previous[i+1]][0] if i<len(previous)-1 else float('inf')
            bx=vertices[current[j+1]][0] if j<len(current)-1 else float('inf')
            if abs(ax-bx)<.000001:faces.append((previous[i],current[j],current[j+1],previous[i+1]));i+=1;j+=1
            elif ax<bx:faces.append((previous[i],current[j],previous[i+1]));i+=1
            else:faces.append((previous[i],current[j],current[j+1]));j+=1
    obj=mesh_object('Continuous snowfield footprints and stair-edge drifts',vertices,faces,material_snow,'court')
    planar_uv(obj)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    vertex_tint_shader(material_snow)
    obj['footprint_centres_engine']=json.dumps(prints)
    obj['snow_surface_policy']='One connected top mesh across field and stair-edge banks; no snow/snow contact seam or separate buried bank shell.'
    return obj
    obj['footprint_policy']='Single alternating walking line: real88mm depressions and compacted-snow vertex tint, not decals.'
    return obj


def small_fixture(name,x,y,z,bronze,warm,role='fixture',kind='bronze oil cup',size=1,fuel=.65,lit=True,watts=16):
    bright=material('Burnished bronze high points','#ba9756',rough=.39,metal=.88)
    cast_bronze_material(bright)
    dark=material('Oil-blackened rim and wick','#29231c',rough=.88)
    is_wax='candle' in kind;is_clay='clay' in kind
    body_mat=material('Unglazed old brown oil clay','#514438',rough=.91) if is_clay else bronze
    profile=[(0,0),(.048,0),(.065,.009),(.067,.022),(.052,.032),(.035,.038),(.034,.060),(.065,.073),(.083,.092),(.087,.119),(.083,.130),(.073,.134),(.067,.123),(.062,.098),(0,.094)]
    if is_clay:profile=[(0,0),(.068,0),(.09,.012),(.10,.025),(.115,.05),(.118,.064),(.11,.072),(.098,.068),(.09,.036),(0,.026)]
    profile=[(r*size,h*size) for r,h in profile]
    foot=lathe(name+' bronze foot',profile,(x,y,z),body_mat,64)
    rim=[(.108,.062),(.118,.066),(.116,.073),(.108,.075),(.10,.07)] if is_clay else [(.078,.124),(.087,.126),(.088,.132),(.081,.138),(.073,.136)]
    bowl=lathe(name+' cast rolled rim',[(r*size,h*size) for r,h in rim],(x,y,z),bright if not is_clay else body_mat,64)
    # Used interiors are oil/soot stained; only the narrow rolled crest remains
    # burnished. Material assignment changes no vessel/contact geometry.
    inner=material('Oil-sooted used clay interior' if is_clay else 'Oil-sooted used bronze interior','#211b12',rough=.80 if is_clay else .74,metal=0 if is_clay else .35)
    vertex_tint_shader(inner);inner['one_light_bronze_patina']=True;inner['one_light_used_inner']=True
    for obj,first_row in [(foot,6 if is_clay else 10),(bowl,3)]:
        obj.data.materials.append(inner);inner_index=len(obj.data.materials)-1
        for polygon in obj.data.polygons:
            if polygon.index//64>=first_row:polygon.material_index=inner_index
    floor_y=y+size*(.026 if is_clay else .094)
    fuel_y=y+size*((.034+.022*fuel) if is_clay else (.101+.017*fuel))
    fuel_mat=material('Old ivory candle wax','#b5a17d',rough=.88) if is_wax else material('Dark pooled lamp oil','#0f0b05',rough=.10)
    if not is_wax:fuel_mat['one_light_absorbed_oil']=True
    fuel_depth=max(.005,fuel_y-floor_y)
    fuel_obj=cylinder(name+(' remaining wax' if is_wax else ' pooled oil'),(.08 if is_clay else .059)*size,fuel_depth,(x,floor_y+fuel_depth/2,z),fuel_mat,48,0)
    wick_height=(.033 if is_clay else .024 if lit else .014)*size
    # The used fibre remains dark below the live runtime flame. The point
    # fixture supplies baked illumination; an entire glowing post is physical
    # neither as wick material nor as a substitute static flame body.
    wick=cylinder(name+' warm wick',.0065*size,wick_height,(x,fuel_y+wick_height*.42,z),dark,16,0)
    # Actual material volumes attach to the vessel, without floating decals.
    for j in range(2 if not is_wax else 3):
        angle=.7+j*2.14+size
        profile_drip=[(.114,.070),(.117,.056),(.103,.032),(.089,.021)] if is_clay else [(.083,.127),(.085,.107),(.073,.083),(.052,.071)]
        path=[(x+math.cos(angle)*r*size,y+h*size,z+math.sin(angle)*r*size) for r,h in profile_drip]
        curved_tube(name+(' wax drip' if is_wax else ' dark oil drip'),path,[.004,.005,.003,.001],fuel_mat if is_wax else dark,6)
    spill=light(name+' warm spill',(x,fuel_y+.075*size,z),watts if lit else 0,'#ffb46c',.010*size,role)
    return {'foot':foot,'bowl':bowl,'wick':wick,'light':spill,'lit':lit,'kind':kind,'actualWatts':watts if lit else 0,'fuelLevel':fuel}


def bare_tree(x, z, height, bark, snow, seed=None,crown_style=None):
    if seed is None:seed=int((x+70)*107+(z+90)*271+height*103)
    if crown_style:
        timber,caps,meta=mature_winter_tree_meshes((x,.05,z),height,seed,companion=crown_style=='companion')
    else:timber,caps,meta=winter_tree_meshes((x,.05,z),height,seed,detail=abs(x)<12 and z>-12)
    bark_uv=meta.pop('barkChartUV');snow_uv=meta.pop('snowChartUV')
    meta['originEngine']=[x,.05,z]
    obj=mesh_object('Winter tree irregular trunk boughs and twigs',*timber,bark,'court')
    source_uv(obj,bark_uv,'Connected winter tree branch strips; original bark UV unchanged.')
    for polygon in obj.data.polygons:polygon.use_smooth=True
    obj['winter_tree_geometry']=json.dumps(meta)
    if caps[0]:
        cap=mesh_object('Winter tree soft supported branch snow',*caps,snow,'court')
        source_uv(cap,snow_uv,'Connected supported branch snow strips.')
        for polygon in cap.data.polygons:polygon.use_smooth=True


def wall_coping(name,length,location,width,wood,snow,turn=False,seed=1):
    clay=material('Old grey wall coping clay','#626962','grey_roof_tiles',rough=.91)
    vertices=[];faces=[];count=max(2,int(length/.32));across=6
    for j in range(count):
        start=len(vertices);x0=-length/2+j*length/count;x1=x0+length/count+.018
        for xx in [x0,x1]:
            for k in range(across+1):
                a=(k/across-.5)*math.pi;zz=math.sin(a)*width*.5;yy=.035+math.cos(a)*.10
                vertices.append((location[0]+(zz if turn else xx),location[1]+yy,location[2]+(xx if turn else zz)))
        for k in range(across):faces.append((start+k,start+k+1,start+across+2+k,start+across+1+k))
    obj=mesh_object(name,vertices,faces,clay)
    for p in obj.data.polygons:p.use_smooth=True
    snow_coping(name+' soft wind-shaped snow',length+.14,width+.17,.21,(location[0],location[1]+.13,location[2]),snow,turn,seed)


def courtyard_wall(name,length,location,plaster,turn=False):
    nx=max(2,int(length/.48));ny=8;vertices=[];faces=[];w=.55;h=2.55
    for side in [-1,1]:
        for row in range(ny+1):
            yy=-h/2+h*row/ny
            for col in range(nx+1):
                xx=-length/2+length*col/nx;zz=side*w/2
                vertices.append((location[0]+(zz if turn else xx),location[1]+yy,location[2]+(xx if turn else zz)))
    count=(nx+1)*(ny+1)
    for row in range(ny):
        for col in range(nx):
            i=row*(nx+1)+col
            faces.extend([(i,i+nx+1,i+nx+2,i+1),(i+count,i+1+count,i+nx+2+count,i+nx+1+count)])
    boundary=list(range(nx+1))+[r*(nx+1)+nx for r in range(1,ny+1)]+[ny*(nx+1)+c for c in range(nx-1,-1,-1)]+[r*(nx+1) for r in range(ny-1,0,-1)]
    for i,a in enumerate(boundary):
        b=boundary[(i+1)%len(boundary)];faces.append((a,b,b+count,a+count))
    obj=mesh_object(name,vertices,faces,plaster,'court')
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    box_net(obj,(w,h,length) if turn else (length,h,w),location)
    return obj


def masonry_base(name,length,location,stone,turn=False,seed=1,height=.78,region='court'):
    """Two staggered courses with irregular eased faces, not uniform box rows."""
    rng=random.Random(seed);axis=0 if turn else 2
    for course in range(2):
        a=-length/2;row_height=height*(.48 if course==0 else .52)
        bottom=0 if course==0 else height*.48
        while a<length/2-.03:
            width=min(rng.uniform(.66,1.21),length/2-a)
            if width<.07:break
            halfw=(width-.022)/2;halfh=(row_height-.022)/2;cut=min(.045,width*.12)
            outline=[(-halfw+cut,-halfh), (halfw-cut*.7,-halfh), (halfw,-halfh+cut*.8),
                     (halfw,halfh-cut), (halfw-cut,halfh+rng.uniform(-.012,.012)),
                     (-halfw+cut*.8,halfh+rng.uniform(-.012,.012)),(-halfw,halfh-cut),(-halfw,-halfh+cut)]
            centre=a+width/2;yy=bottom+row_height/2;vertices=[];faces=[]
            # A broad face, small inset front chamfer and recessed mortar edge.
            for depth,scale in [(-.315,1),(.310+rng.uniform(-.009,.009),1),(.352+rng.uniform(-.009,.009),.94)]:
                for u,v in outline:
                    u=centre+u*scale;v=yy+v*scale
                    vertices.append((location[0]+(depth if turn else u),location[1]+v,location[2]+(u if turn else depth)))
            faces=[tuple(reversed(range(8))),tuple(range(16,24))]
            for ring in range(2):
                for k in range(8):faces.append((ring*8+k,ring*8+(k+1)%8,(ring+1)*8+(k+1)%8,(ring+1)*8+k))
            obj=mesh_object(name,vertices,faces,stone,region)
            import bmesh
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
            profile_uv(obj,8,3,[0,1],axis)
            obj['masonry_course']=course;obj['masonry_local_seed']=seed
            obj['masonry_finish']='Actual staggered irregular stone outlines, recessed mortar gaps and eased projecting face.'
            a+=width


def far_snow_roof(x,z,width,plaster,wood,snow):
    box('Distant courtyard building',(width,2.5,5.5),(x,1.25,z),plaster,.02)
    vertices=[];faces=[];nx=8;nz=12
    for row in range(nz+1):
        zz=-3.3+6.6*row/nz
        for col in range(nx+1):
            xx=-width/2-.35+(width+.7)*col/nx
            yy=2.7+1.55*max(0,1-abs(zz)/3.3)**1.3+.24+.035*math.sin(xx*1.7+zz)
            vertices.append((x+xx,yy,z+zz))
    for row in range(nz):
        for col in range(nx):
            i=row*(nx+1)+col;faces.append((i,i+nx+1,i+nx+2,i+1))
    obj=mesh_object('Distant snow-covered roof silhouette',vertices,faces,snow,'court')
    for face in obj.data.polygons:face.use_smooth=True
    for side in [-1,1]:beam('Distant roof dark eave',(x-width/2-.35,2.76,z+side*3.3),(x+width/2+.35,2.76,z+side*3.3),.085,wood,.085,'court')


def court_lantern(ground,granite,bronze,warm,snow):
    x,z=-5.5,11.4;y=.12
    with CONTACTS.group('court stone lantern foundation',[ground]):
        base=lathe('Court stone lantern base',[(0,0),(.29,0),(.31,.06),(.28,.14),(.21,.19),(0,.19)],(x,y,z),granite,24)
        for vertex in base.data.vertices:
            if vertex.co.z<=y+.0001:
                vertex.co.z=resting_contact_height(vertex.co.x,-vertex.co.y,[ground])+.0003
        lathe('Court stone lantern post',[(.16,0),(.12,.05),(.095,.64),(.16,.74),(.22,.79)],(x,y+.18,z),granite,24)
        shelf=box('Court stone lantern chamber shelf',(.48,.10,.48),(x,y+1.0,z),granite,.025)
        for dx in [-.20,.20]:
            for dz in [-.20,.20]:box('Court stone lantern chamber post',(.055,.38,.055),(x+dx,y+1.24,z+dz),granite,.015)
        roof=mesh_object('Court stone lantern hipped cap',[(x+dx,y+h,z+dz) for dx,h,dz in [(-.40,1.43,-.40),(.40,1.43,-.40),(.40,1.43,.40),(-.40,1.43,.40),(-.07,1.70,-.07),(.07,1.70,-.07),(.07,1.70,.07),(-.07,1.70,.07)]],[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7),(3,2,1,0)],granite)
        bevel(roof,.018,2)
        cap=snow_coping('Court lantern soft roof snow',.86,.86,.28,(x,y+1.47,z),snow,seed=901)
        for vertex in cap.data.vertices:
            dx=vertex.co.x-x;dz=-vertex.co.y-z
            roof_y=y+1.70-.27*max(abs(dx),abs(dz))/.40
            if vertex.co.z>y+1.401:vertex.co.z=roof_y+.115+.02*math.sin(dx*9+dz*7)
            else:vertex.co.z=min(vertex.co.z,roof_y-.02)
        with CONTACTS.group('court lantern oil cup',[shelf]):
            fixture=small_fixture('Court lantern oil cup',x,y+1.05,z,bronze,warm,kind='court bronze oil dish',size=.75,fuel=.58,watts=12)
        FIXED_LAMPS.append({'name':'court lantern','group':'court lantern oil cup',**fixture})


def court_incense_stand(ground,stone,soot):
    x,y,z=4.6,.12,9.5
    with CONTACTS.group('court incense stand',[ground]):
        base=lathe('Court incense stand stone base',[(0,0),(.28,0),(.30,.055),(.23,.15),(.13,.19),(.13,.62),(.26,.67),(.28,.73),(.26,.77),(.22,.77),(.21,.72),(0,.70)],(x,y,z),stone,32)
        for v in base.data.vertices:
            if v.co.z<=y+.0001:v.co.z=resting_contact_height(v.co.x,-v.co.y,[ground])+.0003
        with CONTACTS.group('court incense ash',[base]):
            ash=cylinder('Court incense cold ash',.17,.016,(x,y+.71,z),material('Court cold incense ash','#6a6861',rough=1),32,0)
        for i in range(3):
            with CONTACTS.group('court spent incense '+str(i),[ash]):
                beam('Court spent incense',(x-.06+i*.055,y+.73,z-.03+i*.02),(x-.01+i*.04,y+.735,z+.04+i*.01),.0025,soot,.002)


def scene_geometry_report(scene):
    """Actual evaluated counts/bounds for camera routing and package planning."""
    graph=bpy.context.evaluated_depsgraph_get();regions={};objects=[];bounds={}
    for obj in STATIC.objects:
        if obj.type!='MESH':continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
        world=[evaluated.matrix_world@v.co for v in mesh.vertices]
        area=sum((world[t.vertices[1]]-world[t.vertices[0]]).cross(world[t.vertices[2]]-world[t.vertices[0]]).length*.5 for t in mesh.loop_triangles)
        row={'object':obj.name,'region':obj.get('region'),'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'worldAreaM2':area};objects.append(row)
        region=regions.setdefault(row['region'],{'objects':0,'vertices':0,'triangles':0})
        for key in ['vertices','triangles']:region[key]+=row[key]
        region['worldAreaM2']=region.get('worldAreaM2',0)+area
        region['objects']+=1
        if obj.name.startswith(('Main door jamb','Red door plank','Round entasis red timber column','Porch entasis column','Stone door threshold','Door head lintel','Visitor lantern suspension')):
            points=[engine_point(evaluated.matrix_world@v.co) for v in mesh.vertices]
            bounds[obj.name]={'min':[min(p[k] for p in points) for k in range(3)],'max':[max(p[k] for p in points) for k in range(3)]}
        evaluated.to_mesh_clear()
    report={'regions':regions,'totalTriangles':sum(o['triangles'] for o in objects),'totalObjects':len(objects),'largestContributors':sorted(objects,key=lambda o:o['triangles'],reverse=True)[:35],
            'reductionPolicy':'Explicit paver edge profiles; no degenerate lathe poles; only snow-exposed tile courses and barge edges; aggregate winter branch meshes; one continuous snowfield/bank surface.'}
    scene['source_geometry_budget']=json.dumps(report)
    scene['architecture_bounds_engine']=json.dumps({'evaluatedObjects':bounds,'mainDoorClearWidthMetres':3.10,'mainDoorPlaneZ':2.2,'mainDoorOpeningTopY':4.11,
        'visitorLampAttachment':[-3.35,3.22,1.2],'visitorFlameBasis':[-3.35,2.80,1.2],'preferredBurningEye':[-4.05,2.40,1.8]})
    return report



def material_delivery_report(scene):
    rows=[]
    materials=sorted(set(m for o in STATIC.objects if o.type=='MESH' for m in o.data.materials if m),key=lambda m:m.name)
    for mat in materials:
        if not mat.use_nodes:continue
        bsdf=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if not bsdf:continue
        rows.append({'material':mat.name,'surfaceTintExported':bool(mat.get('one_light_surface_tint')),
            'roughness':float(bsdf.inputs['Roughness'].default_value),'metallic':float(bsdf.inputs['Metallic'].default_value),
            'expectedExportBaseColorFactor':list(mat.get('one_light_export_basecolor_factor',bsdf.inputs['Base Color'].default_value)),
            'minRuntimeRoughness':mat.get('one_light_min_roughness'),
            'images':[{'path':n.image.filepath,'role':n.label,'colorSpace':n.image.colorspace_settings.name} for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image],
            'nonExportingProceduralTextures':[n.type for n in mat.node_tree.nodes if n.type in ['TEX_NOISE','TEX_VORONOI','TEX_WAVE','TEX_MUSGRAVE']]})
    scene['source_material_delivery']=json.dumps({'policy':'Patina, paint grain, soot and weathering are frozen SurfaceTint. Image tint is frozen into COLOR_0 when needed; linked shader multiplication uses supported ShaderNodeMix RGBA. Scanned UV0/albedo/normal maps retained; table roughness is .58.','materials':rows})


def build_scene():
    global STATIC, REGION, RNG, CONTACTS, FIXED_LAMPS, INCENSE
    RNG = random.Random(61903)
    CONTACTS = RestingContacts(height_query=resting_contact_height)
    FIXED_LAMPS = []
    INCENSE = []
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
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    if hasattr(scene.cycles,'denoising_use_gpu'):scene.cycles.denoising_use_gpu=True
    scene.render.threads_mode = 'AUTO'
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Cold winter sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.19, .28, .47, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .22

    granite = material('Worn granite', '#9d9d94', 'stone_pavers', .92)
    base_stone = material('Exposed weathered foundation granite','#d4cbb6','stone_pavers',.96)
    paving = [material('Dark hall paving %d' % i, c, 'stone_pavers', .68) for i, c in enumerate(['#4c4d4a', '#555450', '#434542'])]
    walk_paving=material('Walk-polished worn dark stone','#41443f','stone_pavers',.48)
    brick = material('Weathered brick footings', '#9b8f81', 'dark_brick_wall', .9)
    plaster = material('Patched lime plaster', '#c4c0b5', 'white_plaster_rough_01', .95)
    red = material('Aged red painted timber', '#a74330', rough=.61)
    dark_wood = material('Dark old timber', '#69503a', 'weathered_planks', .78)
    teal = material('Faded teal beam paint', '#477d75', rough=.72)
    gold = material('Tarnished gilded edges', '#b89b55', rough=.39, metal=.76)
    screen_gold = material('Gilded screen panels', '#aa8b44', 'weathered_planks', .5, .62)
    snow = material('Snow settled dry grains', '#e3eaf2', 'snow_004', rough=.93)
    paper = material('Ivory window paper', '#bfb39a', rough=.98,emission=.035)
    warm = material('Other lamps warm wick', '#ffbc78', rough=.5, emission=3)
    bronze = material('Aged bronze', '#977044', rough=.46, metal=.88)
    soot = material('Soot-darkened clay', '#36312a', rough=.97)
    for painted in [red,teal]:
        vertex_tint_shader(painted);painted['one_light_painted_timber']=True;painted_timber_finish(painted)
    vertex_tint_shader(bronze);bronze['one_light_bronze_patina']=True
    weather_plaster(plaster)
    soot_stains(plaster,[(side*2.0,2.18,19.215,.20,.56,.045) for side in [-1,1]],.48)
    soot_stains(dark_wood,[(xx,5.025,-4.75,.28,.045,.35) for xx in [-1.45,-.95,.95,1.45]],.35)
    soot_stains(teal,[(xx,5.008,-4.75,.40,.065,.52) for xx in [-1.45,-.82,.71,1.475]],.33)
    stable_roughness(gold,.45)
    stable_roughness(bronze,.48)
    cast_bronze_material(bronze)
    for mat in paving:stable_roughness(mat,.58)
    stable_roughness(walk_paving,.43)

    REGION = 'hall'
    # Varied old paving follows neither a perfect square grid nor a repeating
    # identical outline; stones have eased, chipped boundaries and slight settlement.
    zz=-6.55
    while zz<2.12:
        depth=RNG.uniform(.48,.78);depth=min(depth,2.2-zz)
        xx=-5.18
        while xx<5.15:
            width=RNG.uniform(.48,.93);width=min(width,5.2-xx)
            irregular_paver('Settled irregular paving stone',xx+width/2,zz+depth/2,width-.018,depth-.018,.60+RNG.uniform(-.006,.006),walk_paving if abs(xx+width/2)<1.05 and -4.0<zz<2.2 else RNG.choice(paving))
            xx+=width
        zz+=depth
    box('Hall foundation', (10.8,.52,9.0), (0,.26,-2.3), brick, .045)
    # Main hall in the exact runtime nook frame: origin(0,.6,-.5), front z2.2, back z-6.6.
    rear_wall=box('Hall rear wall', (10.6,4.5,.32), (0,2.85,-6.6), plaster, .025)
    for side in [-1,1]:
        box('Hall side wall', (.34,4.5,8.8), (side*5.3,2.85,-2.3), plaster, .025)
        box('Front lower wall', (3.52,1.2,.32), (side*3.54,1.2,2.2), plaster, .025)
        box('Front upper wall', (3.52,.85,.32), (side*3.54,4.65,2.2), plaster, .025)
        for xx,ww in [(side*1.97,.38),(side*4.97,.66)]:
            box('Window jamb plaster', (ww,2.55,.32), (xx,2.875,2.2), plaster, .02)
        window('Main hall lattice', side*3.45,2.83,2.2,2.16,2.10,red,paper)
        box('Facade painted window header',(3.5,.22,.39),(side*3.54,4.10,2.2),teal,.018)
    box('Door head lintel', (3.52,.55,.42), (0,4.52,2.2), red, .025)
    box('Door framed transom backing',(3.12,.19,.10),(0,4.205,2.2),dark_wood,.01)
    for xx in [-1.0,-.5,0,.5,1.0]:box('Transom vertical joinery',(.038,.23,.12),(xx,4.205,2.18),teal,.005)
    for xx in [-1.65,1.65]:box('Main door jamb',(.20,3.95,.42),(xx,2.575,2.2),red,.022)
    box('Stone door threshold', (3.1,.09,.48), (0,.605,2.28), granite, .018)
    # Open leaves are genuine constructed boards with battens and iron rings.
    for side in [-1,1]:
        hinge = bpy.data.objects.new('Open door hinge', None)
        STATIC.objects.link(hinge)
        # The pin is physically outside the outer jamb face. Wide outward
        # leaves fold beside the facade rather than occluding the diagonal
        # hall-to-blue-court sightline or narrowing the walking opening.
        hinge.location = point((side*1.62,.6,2.46))
        hinge.rotation_euler[2] = side*2.86
        tag(hinge,'hall')
        hinge['hinge_policy']='Actual outer-jamb pin; outward164-degree leaf against exterior facade.'
        for hh in [.44,1.65,3.06]:
            box('Door jamb fixed hinge plate',(.15,.34,.025),(side*1.65,.6+hh,2.420),bronze,.008)
            cylinder('Door hinge full vertical pin',.017,.40,(side*1.62,.6+hh,2.46),bronze,16,0)
            for dy in [-.14,.14]:
                lathe('Door fixed jamb hinge knuckle',[(.020,-.045),(.035,-.045),(.035,.045),(.020,.045),(.020,-.045)],(side*1.62,.6+hh+dy,2.46),bronze,16)
            beam('Door hinge plate to pin lug',(side*1.65,.6+hh,2.425),(side*1.62,.6+hh,2.46),.019,bronze,.018)
            obj=lathe('Door leaf revolving hinge knuckle',[(.020,-.086),(.035,-.086),(.035,.086),(.020,.086),(.020,-.086)],(0,0,0),bronze,16)
            obj.parent=hinge;obj.location=Vector((0,0,hh))
        for board in range(7):
            obj=box('Red door plank',(.215,3.42,.075),(0,0,0),red,.010)
            matrix=obj.matrix_world.copy();obj.parent=hinge;obj.matrix_world=matrix
            # Keep the leaf hinged at its jamb; board local coordinates run toward the centre when shut.
            obj.location=Vector((-side*(.11+board*.22),0,1.78));obj.rotation_euler=(0,0,0)
        for hh in [.45,1.65,3.0]:
            obj=box('Door rear batten',(1.54,.12,.10),(0,0,0),dark_wood,.012)
            obj.parent=hinge;obj.location=Vector((-side*.77,.065,hh))
        for row in range(6):
            for col in range(4):
                obj=lathe('Worn bronze door stud',[(0,0),(.023,0),(.024,.007),(.018,.021),(0,.027)],(0,0,0),bronze,16)
                obj.parent=hinge;obj.location=Vector((-side*(.22+col*.35),-.039,.42+row*.54));obj.rotation_euler=(math.pi/2,0,0)
        for hh in [.44,1.65,3.06]:
            obj=box('Forged door hinge strap',(.075,.27,.022),(0,0,0),bronze,.012)
            obj.parent=hinge;obj.location=Vector((-side*.04,.043,hh))
        obj=lathe('Door ring backplate',[(0,0),(.067,0),(.07,.009),(.06,.016),(0,.016)],(0,0,0),bronze,24)
        obj.parent=hinge;obj.location=Vector((-side*1.22,-.041,1.11));obj.rotation_euler=(math.pi/2,0,0)
        # A real loose metal ring, not a painted circle on the leaf.
        bpy.ops.mesh.primitive_torus_add(major_radius=.077,minor_radius=.008,major_segments=28,minor_segments=8)
        obj=move_to_static(bpy.context.object,'hall');obj.name='Forged door pull ring';obj.data.materials.append(bronze)
        obj.parent=hinge;obj.location=Vector((-side*1.22,-.07,1.04));obj.rotation_euler=(math.pi/2,0,0);uv_world(obj)
        torus_uv(obj,.077,.008)
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
    for xx in [-3.5,0,3.5]:
        for zz in [-4.7,-2.4,-.1]:
            box('Inset blue green ceiling panel',(3.12,.035,1.95),(xx,5.025,zz),teal,.006)
            for side in [-1,1]:
                box('Ceiling panel red longitudinal frame',(.11,.12,2.16),(xx+side*1.62,4.99,zz),red,.01)
                box('Ceiling panel red cross frame',(3.35,.12,.10),(xx,4.99,zz+side*1.04),red,.01)
                beam('Ceiling abstract ochre lozenge',(xx-.42,4.947,zz),(xx,4.947,zz+side*.27),.012,gold,.012)
                beam('Ceiling abstract ochre lozenge',(xx,4.947,zz+side*.27),(xx+.42,4.947,zz),.012,gold,.012)
    for side in [-1,1]:
        box('Hall longitudinal carrying beam',(.25,.32,7.8),(side*2.7,4.65,-2.0),red,.025)
        for zz in [-4.6,-1.65,1.15]:
            box('Wall engaged timber post',(.17,3.75,.22),(side*5.09,2.52,zz),red,.015)
            bracket_set(side*5.02,4.55,zz,dark_wood,teal,gold)
        for zz in [-4.65,-1.65]:
            box('Side wall timber lower rail',(.12,.13,2.6),(side*5.10,1.12,zz),dark_wood,.01)
            box('Side wall painted upper rail',(.13,.17,2.6),(side*5.10,3.72,zz),teal,.01)
    for zz in [1.1,-.5,-2.3,-4.1]:
        box('Painted transverse beam',(10.4,.28,.24),(0,4.85,zz),teal,.025)
        for yy in [4.73,4.98]:box('Worn gilded beam rule',(10.3,.025,.255),(0,yy,zz),gold,.004)
        for xx in [-4.15,-3.3,-1.65,-.55,.55,1.65,3.3,4.15]:
            box('Recessed painted beam panel',(.66,.15,.035),(xx,4.85,zz+.13),red,.012)
            for side in [-1,1]:
                box('Painted panel relief frame',(.7,.018,.035),(xx,4.85+side*.083,zz+.15),teal,.007)
                box('Painted panel relief frame',(.018,.18,.035),(xx+side*.34,4.85,zz+.15),teal,.007)
                beam('Abstract ochre panel line',(xx-.24,4.85,zz+.15),(xx,4.85+side*.048,zz+.15),.006,gold,.006)
                beam('Abstract ochre panel line',(xx,4.85+side*.048,zz+.15),(xx+.24,4.85,zz+.15),.006,gold,.006)
    tiled_roof('Main hall',0,5.15,-2.3,12,6.7,2.65,material('Dark clay roof tile','#6c7073','grey_roof_tiles',rough=.85),dark_wood,snow,'hall')
    # Terrace and short worn steps align exactly with the walk's rise to the hall floor.
    box('Front terrace',(11,.6,2.4),(0,.3,3.4),granite,.045)
    for i in range(3):
        worn_step('Chipped and worn granite step',3.2,.2,.43,(0,.5-i*.2,4.8+i*.4),granite)
    # Narrow icicles hang from the sheltered edge rather than floating over the court.
    ice=material('Cloudy icicle ice','#ccdbe5',rough=.38)
    ice_rng=random.Random(18731)
    for i in range(29):
        xx=-5.65+i*.40+ice_rng.uniform(-.15,.15)
        length=.09+ice_rng.random()**1.5*.34
        edge=roof_surface(0,5.15,-2.3,12,6.7,2.65,xx,1,1)
        beam('Eave icicle',(xx,edge[1]-.03,edge[2]),(xx,edge[1]-.03-length,edge[2]),.014+length*.02,ice,.001)

    # Actual Poly Haven CC0 antique joinery and screen panels replace the box
    # altar and schematic diamond screen. Their original photo UVs are retained.
    floor_supports=[obj for obj in STATIC.objects if obj.name.startswith('Settled irregular paving stone')]
    with CONTACTS.group('scanned console altar', floor_supports):
        console=import_prop('Scanned console altar','web/public/models/chinese_console_table/chinese_console_table.gltf',(0,.6,-4.85),1.03)
    with CONTACTS.group('small personal offering bowl',console):
        lathe('Offering worn ceramic bowl',[(0,0),(.040,0),(.046,.009),(.073,.049),(.075,.061),(.063,.062),(.053,.021),(0,.017)],(-.35,1.63,-4.65),material('Old glazed offering ceramic','#807863',rough=.72),32)
    with CONTACTS.group('folded personal offering note',console):
        box('Offering folded paper note',(.13,.004,.095),(.33,1.63,-4.66),material('Aged folded offering paper','#c4b599',rough=.99),.001,rotation=.12)
    # Pedestals themselves rest on the actual irregular paving. Their top
    # profiles require a bearing cap: the old open rim cannot support a lamp.
    pedestals={}
    for xx in [-1.45,1.45]:
        with CONTACTS.group('turned pedestal '+str(xx), floor_supports):
            pedestals[xx]=close_turning_top(lathe('Turned altar side lamp pedestal',[(.13,0),(.15,.04),(.09,.12),(.065,.75),(.11,.91),(.17,.96),(.17,1.03)],(xx,.6,-4.75),dark_wood,32),32)
    # The accepted raised panel composition is physically wall-mounted, with
    # a real bearing rail and fasteners entering the rear masonry.
    mount_probes=[{'startEngine':[xx,1.25,-6.10],'directionEngine':[0,0,-1]} for xx in [-2.2,-.7,.7,2.2]]
    with CONTACTS.group('wall-mounted screen bearing rail', [rear_wall], mode='mounted', mount_probes=mount_probes):
        screen_rail=box('Wall-fastened screen bearing rail',(5.2,.10,.24),(0,1.25,-6.322),dark_wood,.006)
        for xx in [-2.2,-.7,.7,2.2]:
            beam('Screen rail wall fastener',(xx,1.25,-6.18),(xx,1.25,-6.52),.006,bronze,.006)
    for i,xx in enumerate([-1.51,0,1.51]):
        with CONTACTS.group('mounted screen leaf '+str(i), [screen_rail]):
            import_prop('Scanned screen leaf','web/public/models/chinese_screen_panels/chinese_screen_panels.gltf',(xx,1.3,-6.31),3.6,select_mesh='panels_a' if i%2==0 else 'panels_b')
    for xx in [-2.34,2.34]:
        with CONTACTS.group('screen edge molding '+str(xx), [screen_rail]):
            lathe('Gilded screen edge molding',[(.028,0),(.038,.04),(.028,3.5),(.045,3.58),(.045,3.62)],(xx,1.3,-6.23),gold,16)
    fixture_specs=[(-1.45,-.045,-.08,'bronze pedestal oil lamp',1.20,.81,True,18),
                   (-.95,.13,.10,'brown clay oil dish',.91,.34,True,14),
                   (.95,-.24,-.065,'spent bronze candle cup',.80,.08,False,0),
                   (1.45,.025,.11,'small bronze oil lamp',1.04,.55,True,17)]
    for xx,dx,dz,kind,size,fuel,lit,watts in fixture_specs:
        support=[pedestals[xx]] if xx in pedestals else console
        with CONTACTS.group('altar '+str(xx), support):
            fixture=small_fixture('Other altar lamp',xx+dx,1.63,-4.75+dz,bronze,warm,kind=kind,size=size,fuel=fuel,lit=lit,watts=watts)
        FIXED_LAMPS.append({'name':'altar '+str(xx),'group':'altar '+str(xx),**fixture})
    with CONTACTS.group('altar burner assembly', console):
        ash_surface=brass_burner((0,1.63,-4.85),bronze,soot)
        for i in range(4):
            with CONTACTS.group('smouldering incense '+str(i), [ash_surface]):
                rod=beam('Smouldering incense',(i*.025-.04,1.75,-4.85),(i*.028-.04,1.98+RNG.uniform(-.015,.015),-4.85),.0028,dark_wood,.0028)
            INCENSE.append(rod)
    spill_rng=random.Random(57122)
    with CONTACTS.group('altar spilled incense ash',console):
        ash_mat=material('Spilled cool grey incense ash','#847e72',rough=1)
        for i in range(12):
            xx=spill_rng.uniform(-.12,.18);zz=spill_rng.uniform(-4.63,-4.61)
            yy=resting_contact_height(xx,zz,console)+.0002
            radius=spill_rng.uniform(.006,.014)
            lathe('Spilled incense ash clump',[(0,0),(radius,0),(radius*.80,.003),(radius*.27,.006),(0,.005)],(xx,yy,zz),ash_mat,10)
    for side in [-1,1]:
        with CONTACTS.group('kneeling cushion '+str(side), floor_supports):
            kneeling_cushion(side*.85,.661,-3.3)
    # A broom, stacked bowls and repaired threshold give the room a maintained human scale.
    with CONTACTS.group('leaning broom', floor_supports):
        beam('Broom handle',(4.5,.66,-5.8),(4.75,2.25,-5.85),.018,dark_wood,.018)
        for i in range(35):beam('Broom straw',(4.5,.77,-5.8),(4.38+RNG.random()*.26,.64,-5.72+RNG.random()*.1),.0035,material('Dry straw','#b3a17c',rough=.95),.002)
    with CONTACTS.group('stacked bowl assembly', floor_supports):
        previous=None
        for i in range(3):
            with CONTACTS.group('stacked bowl '+str(i), [previous] if previous else floor_supports):
                previous=lathe('Stacked plain bowls',[(0,0),(.11,0),(.15,.09),(.14,.11),(.1,.03),(0,.02)],(4.62,.6+i*.055,-4.9),soot)
    # The suspension and fixed anchor are static; the person's red gauze lantern is not part of this export.
    beam('Visitor lantern suspension',(-3.35,4.73,1.2),(-3.35,3.22,1.2),.007,bronze,.007)
    anchor=bpy.data.objects.new('Visitor_Lamp_Anchor',None)
    bpy.data.collections['RUNTIME'].objects.link(anchor)
    anchor.location=point((-3.35,3.22,1.2))
    anchor['runtime_lamp']='gauze';anchor['runtime_owned']=True
    visitor_basis=light('Visitor flame bake basis',(-3.35,2.80,1.2),45,'#ffbd78',.04,'lamp')
    light('Cool court light entering doorway',(0,2.2,4.4),65,'#b4cdf6',1.4,'ambient')
    light('Soft warm hall interreflection',(0,3.8,-3.6),12,'#eac297',1.8,'ambient')

    REGION='gate'
    for side in [-1,1]:
        box('Gate plaster pier',(2.6,3.7,2.4),(side*2.7,1.85,18),plaster,.045)
        box('Weathered gate stone plinth',(2.72,.65,2.52),(side*2.7,.325,18),granite,.035)
        masonry_base('Gate exposed irregular foundation course',2.70,(side*2.7,0,18.97),base_stone,seed=820+side,height=.76,region='gate')
    box('Gate lintel',(2.8,.48,2.4),(0,3.48,18),dark_wood,.025)
    for side in [-1,1]:
        lathe('Gate round stone drum',[(.24,0),(.26,.04),(.23,.14),(.17,.20)],(side*1.64,.1,19.35),granite,32)
        lathe('Gate round red column',[(.14,0),(.15,.9),(.14,2.4),(.13,3.2)],(side*1.64,.3,19.35),red,32)
        bracket_set(side*1.64,3.40,19.35,dark_wood,teal,gold)
    tiled_roof('Court gate',0,3.8,18,9,2.1,.95,material('Gate roof tiles','#73777b','grey_roof_tiles',rough=.85),dark_wood,snow,'gate')
    for side in [-1,1]:
        box('Gate red door jamb',(.2,2.9,.18),(side*1.48,1.45,19.23),red,.025)
        box('Gate threshold end',(.45,.13,1.2),(side*1.55,.065,18),granite,.04)
    # Gate lamps light the actual passage and carved returns from both ends.
    for side in [-1,1]:
        shelf=box('Gate lamp shelf',(.38,.10,.33),(side*2.0,1.55,19.25),granite,.02)
        with CONTACTS.group('gate '+str(side), [shelf]):
            fixture=small_fixture('Gate shelf lamp',side*2.0,1.6,19.25,bronze,warm,kind='gate bronze oil cup',size=1.10 if side<0 else .98,fuel=.72 if side<0 else .46,watts=19)
        FIXED_LAMPS.append({'name':'gate '+str(side),'group':'gate '+str(side),**fixture})

    REGION='court'
    ground_snow=snow_field(snow)
    light('Moon and court reflected into gate passage',(0,2.15,17.0),28,'#a4bedf',1.5,'ambient')
    for side in [-1,1]:
        courtyard_wall('Court front wall',8.0,(side*8,1.275,18),plaster)
        wall_coping('Front wall clay coping',8.1,(side*8,2.55,18),.70,dark_wood,snow,seed=33+(side+1))
        courtyard_wall('Court side wall',28,(side*12,1.275,4),plaster,turn=True)
        wall_coping('Side wall clay coping',28.1,(side*12,2.55,4),.70,dark_wood,snow,turn=True,seed=72+(side+1))
        masonry_base('Front wall exposed irregular foundation course',8.0,(side*8,0,18),base_stone,seed=840+side)
        masonry_base('Side wall exposed irregular foundation course',28,(side*12,0,4),base_stone,turn=True,seed=870+side)
        # A complete long side hall supports its roof in the correct direction.
        box('Side hall back',(.3,2.5,11.4),(side*10.7,1.4,3),plaster,.025)
        for zz in [-2.7,8.7]:box('Side hall gable wall',(2.05,2.5,.28),(side*9.9,1.4,zz),plaster,.025)
        for zz in [-2.7,8.7]:
            top=[]
            for j in range(13):
                gx=side*(8.875+2.05*j/12);offset=gx-side*10
                roof=roof_surface(0,2.95,0,12.6,2.15,1.1,3-zz,abs(offset)/2.15,1 if offset>=0 else -1)
                top.append((gx,roof[1]-.19,zz))
            section=[(top[0][0],2.5),(top[-1][0],2.5)]+[(p[0],p[1]) for p in reversed(top)]
            vertices=[(xx,yy,zz+d) for d in [-.14,.14] for xx,yy in section];n=len(section)
            faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
            mesh_object('Side hall enclosed curved gable',vertices,faces,plaster,'court')
            curved_tube('Side hall exposed gable timber',[(p[0],p[1]+.07,p[2]) for p in top],[.065]*len(top),dark_wood,8,region='court')
        for zz in [-2.3,1.1,4.5,7.9]:
            cylinder('Side hall porch column',.11,2.6,(side*8.25,1.5,zz),red,24,.01)
        box('Side hall porch carrying beam',(.19,.21,11.2),(side*8.25,2.9,3),red,.015)
        before=set(STATIC.objects)
        tiled_roof('Side hall',0,2.95,0,12.6,2.15,1.1,material('Side hall roof tiles','#666d72','grey_roof_tiles',rough=.85),dark_wood,snow,'court')
        transform=Matrix.Translation(point((side*10,0,3)))@Matrix.Rotation(math.pi/2,4,'Z')
        for obj in set(STATIC.objects)-before:
            if obj.type=='MESH':obj.data.transform(transform)
        for zz in [-.8,4.0]:
            box('Snow bench seat',(1.3,.15,.5),(side*7.0,.5,zz),granite,.025)
            for dx in [-.4,.4]:box('Stone bench leg',(.2,.4,.35),(side*7+dx,.2,zz),granite,.025)
            snow_coping('Soft uneven snow over bench',1.30,.56,.095,(side*7,.575,zz),snow,seed=110+int(zz*3)+side)
    courtyard_wall('Court back wall',24,(0,1.275,-10),plaster)
    masonry_base('Back wall exposed irregular foundation course',24,(0,0,-10),base_stone,seed=902)
    wall_coping('Back wall clay coping',24.2,(0,2.55,-10),.70,dark_wood,snow,seed=94)
    bark=material('Rough winter bark','#534a3b',rough=.97)
    # Preserve the reviewed crooked crown seeds while fitting the actual40m
    # desktop camera and54-degree portrait view. Main trunks stay in frame.
    bare_tree(-3,22,6.6,bark,snow,seed=39422,crown_style='older')
    bare_tree(4.1,20.6,5.0,bark,snow,seed=39628,crown_style='companion')
    for xx,zz,hh in [(-7.0,11.5,5.2),(7.4,7.8,6.0),(-16,-8,7.1),(17,-7,6.2),(-19,-19,5.8),(-10,-22,6.1),(2,-24,5.2),(12,-21,6.0),(22,-18,6.5)]:bare_tree(xx,zz,hh,bark,snow)
    for xx,zz,width in [(-17,-14,8.5),(15,-18,10.0)]:far_snow_roof(xx,zz,width,plaster,dark_wood,snow)
    court_lantern(ground_snow,granite,bronze,warm,snow)
    court_incense_stand(ground_snow,granite,soot)

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
    scene['one_light_place']='snow-roof';scene['runtime_origin']='glTF Y-up; metres';scene['visitor_lamp_anchor']=[-3.35,3.22,1.2]
    scene['one_light_lamp_basis']=json.dumps({'position':[-3.35,2.80,1.2],'watts':45,'linearColor':list(linear_light_color('#ffbd78')[:3]),'pointRadiusMetres':float(visitor_basis.data.shadow_soft_size),'sourceObject':'Visitor flame bake basis'})
    scene['lightmap_contract']='UVMap is material UV; baker creates packed Lightmap as second channel.'
    altar_members=set()
    for entry in CONTACTS.entries:
        if entry['name'].startswith(('scanned console','turned pedestal','wall-mounted screen','mounted screen','screen edge','altar ','burner ash','charred incense','smouldering incense','small personal offering','folded personal offering')):altar_members.update(entry['members'])
    for obj in STATIC.objects:
        if obj.type!='MESH':continue
        altar_floor=False
        if obj.name.startswith('Settled irregular paving stone'):
            mean=sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            altar_floor=abs(mean.x)<2.3 and -6.6<-mean.y<-3.9
        if obj.name in altar_members or altar_floor:obj['region']='altar'
    altar_prefixes=('scanned console','turned pedestal','wall-mounted screen','mounted screen','screen edge','altar','burner ash','charred incense','smouldering incense','small personal offering','folded personal offering')
    altar_objects={name for entry in CONTACTS.entries if entry['name'].startswith(altar_prefixes) for name in entry['members']}
    for obj in STATIC.objects:
        if obj.type!='MESH':continue
        if obj.name in altar_objects:obj['region']='altar'
        elif obj.name.startswith('Settled irregular paving stone'):
            centre=sum((obj.matrix_world@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
            if abs(centre.x)<2.35 and -6.55<-centre.y<-3.7:obj['region']='altar'
    bpy.context.view_layer.update()
    apply_surface_tints()
    contact_audit=CONTACTS.audit(fail=True)
    entries={entry['name']:entry for entry in CONTACTS.entries}
    wicks=[]
    for fixture in FIXED_LAMPS:
        points=[p for _,_,p in CONTACTS.vertices([fixture['wick']])]
        center=sum(points,Vector())/len(points)
        top=max(p.z for p in points)
        crown=[p for p in points if abs(p.z-top)<.000001]
        tip=sum(crown,Vector())/len(crown)
        flame=tip+Vector((0,0,.003))
        wicks.append({'name':fixture['name'],'contactGroup':fixture['group'],
                      'wickObject':fixture['wick'].name,'pointLightObject':fixture['light'].name,
                      'supportObjects':entries[fixture['group']]['supports'],
                      'wickCenter':engine_point(center),'wickTip':engine_point(tip),
                      'flameAnchor':engine_point(flame),'pointLight':engine_point(fixture['light'].matrix_world.translation),
                      'linearColor':list(fixture['light'].data.color),
                      'lit':fixture['lit'],'kind':fixture['kind'],'watts':float(fixture['light'].data.energy),'actualWatts':float(fixture['light'].data.energy),'fuelLevel':fixture['fuelLevel'],'pointRadiusMetres':float(fixture['light'].data.shadow_soft_size)})
    tips=[]
    for rod in INCENSE:
        points=[p for _,_,p in CONTACTS.vertices([rod])]
        top=max(p.z for p in points)
        crown=[p for p in points if abs(p.z-top)<.000001]
        tip=sum(crown,Vector())/len(crown)
        tips.append({'object':rod.name,'tipEngine':engine_point(tip)})
    smoke=sum((blender_point for blender_point in [Vector(record['tipEngine']) for record in tips]),Vector())/len(tips)
    smoke.y+=.006
    scene['static_lamp_wicks_engine']=json.dumps(wicks)
    scene['static_incense_tips_engine']=json.dumps(tips)
    scene['static_incense_smoke_engine']=json.dumps(list(smoke))
    scene['static_incense_smoke_source']=json.dumps({'objects':[rod.name for rod in INCENSE],'tipMeanOffsetEngine':[0,.006,0],'derivation':'Mean actual evaluated highest incense-tip vertices, plus6mm upward.'})
    scene['static_incense_smoke_config']=json.dumps({'anchor':list(smoke),'strandCount':2,'riseMetres':.62,'widthMetres':.016,'opacity':.12,'speedMetresPerSecond':.032,'swayMetres':.022,'sourceObjects':[rod.name for rod in INCENSE]})
    scene['static_dust_config']=json.dumps({'boundsMin':[-4.8,.9,-5.9],'boundsMax':[4.8,4.7,1.9],'count':24,'radiusMetres':.0012,'speedMetresPerSecond':.008,'opacity':.12,'warmLightWeighted':True})
    scene['one_light_anchor_fields']=json.dumps(['static_lamp_wicks_engine','static_incense_tips_engine','static_incense_smoke_engine','static_incense_smoke_source','static_incense_smoke_config','static_dust_config','one_light_lamp_basis'])
    scene['resting_prop_inventory']=json.dumps({'registeredGroups':[entry['name'] for entry in CONTACTS.entries],
        'mountedSupport':'Raised scanned screen leaves and edge molding bear on a real wall-fastened rail with actual fastener/wall intersections.',
        'fixedArchitecture':'Columns, column drums, built-in masonry benches, thresholds, roof snow and bough snow are construction/settled weather volumes, not loose table/floor props. Their embedded bearing is intentional; no loose prop is exempted.'})
    scene['static_stability_notes']=json.dumps({'roofSnowDeepBodyTopOffsetLowerBound':.23,'roofFringePolicy':'Nonperiodic feather q>.79 deliberately enters tile valleys; hidden faces require actual geometry enclosure, never a uniform-depth assumption.','tileCoverAndLipOffsetUpperBound':.135,'weathering':'SurfaceTint COLOR_0; opaque geometry only, no decal planes','bronzeMinRoughness':.48,'wornBronzeHighlightMinRoughness':.39,'propRuntimeMinRoughness':.58,'walkPolishRoughness':.48,'paintFinish':'CC0 photograph-derived matte .73–.91 roughness and fine normal; tint variation under1.5%.','snowFieldPolicy':'Continuous field with low outer stair drifts; old two-bank contact-padding certificates are incompatible and retired.'})
    scene['static_floor_heights_engine']=json.dumps({'hallFloor':.6,'terrace':.6,'thresholdTop':.65,'thresholdZ':2.28,'steps':[{'z':4.8,'depth':.43,'top':.6,'wornCenterNosing':.575},{'z':5.2,'depth':.43,'top':.4,'wornCenterNosing':.375},{'z':5.6,'depth':.43,'top':.2,'wornCenterNosing':.175}],'snowTrackRange':[.01,.15]})
    scene['source_lightmap_charts']=json.dumps(complete_source_charts(list(STATIC.objects)))
    scene['source_albedo_policy']='Authored CSS-like hex colors are IEC sRGB-decoded once to scene-linear. Image color spaces and imported PBR factors remain unchanged. Patina/soot COLOR_0 is linear multiplier data. World/exposure/watts and explicit scene-linear light chromaticities are unchanged.'
    scene['source_authoring_helpers']=json.dumps(['art/blender/resting_contacts.py','art/blender/snow_round1_details.py','art/blender/snow_bronze_maps.py','art/blender/snow_paint_maps.py','art/blender/snow_lightmap_charts.py'])
    scene['source_authoring_sha256']=json.dumps({str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__).resolve(),ROOT/'art/blender/resting_contacts.py',ROOT/'art/blender/snow_round1_details.py',ROOT/'art/blender/snow_bronze_maps.py',ROOT/'art/blender/snow_paint_maps.py',ROOT/'art/blender/snow_lightmap_charts.py']})
    scene['authored_night_lighting']=json.dumps({'worldStrength':.22,'moonEnergy':.45,'fixtureWatts':[float(f['light'].data.energy) for f in FIXED_LAMPS],'warmInterreflectionWatts':12,'gateReflectedFillWatts':28})
    material_delivery_report(scene)
    scene_geometry_report(scene)
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
