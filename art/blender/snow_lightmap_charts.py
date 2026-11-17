"""Connected metre-scale source lightmap charts; material UVMap is untouched.

These charts are authored before bevel evaluation. The baker packs them into
unique Lightmap atlases and independently checks overlap, area and visibility.
No geometry, normals, tint, transforms or material coordinates are changed.
"""
import math
from array import array

import bpy
from mathutils import Vector


def source_uv(obj, coordinates, method):
    if len(coordinates) != len(obj.data.polygons):
        raise RuntimeError('Source chart polygon count mismatch: ' + obj.name)
    # addUvMesh joins coincident UV edges. Disconnected 3D components must
    # therefore have distinct initial UV domains even inside one draw mesh.
    parents=list(range(len(obj.data.vertices)))
    def root(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for edge in obj.data.edges:
        a,b=map(root,edge.vertices)
        if a!=b:parents[a]=b
    bounds={};component=[]
    for polygon,values in zip(obj.data.polygons,coordinates):
        key=root(polygon.vertices[0]);component.append(key)
        minimum,maximum=bounds.setdefault(key,[float('inf'),float('-inf')])
        bounds[key]=[min(minimum,min(u for u,v in values)),max(maximum,max(u for u,v in values))]
    if len(bounds)>1:
        cursor=0;offsets={}
        for key,(minimum,maximum) in bounds.items():
            offsets[key]=cursor-minimum;cursor+=maximum-minimum+.05
        coordinates=[[(u+offsets[key],v) for u,v in values] for key,values in zip(component,coordinates)]
    uv = obj.data.uv_layers.get('SourceLightmap') or obj.data.uv_layers.new(name='SourceLightmap')
    for polygon, values in zip(obj.data.polygons, coordinates):
        if len(values) != len(polygon.loop_indices):
            raise RuntimeError('Source chart corner count mismatch: ' + obj.name)
        for loop, value in zip(polygon.loop_indices, values):
            uv.data[loop].uv = value
    obj.data.uv_layers.active = obj.data.uv_layers['UVMap']
    obj.data.uv_layers['UVMap'].active_render = True
    obj['one_light_authored_uv2'] = method
    return obj


def engine(p):
    return Vector((p.x, p.z, -p.y))


def box_net(obj, dimensions, center=(0, 0, 0)):
    width, height, depth = dimensions
    rows = []
    for polygon in obj.data.polygons:
        normal = engine(polygon.normal)
        axis = max(range(3), key=lambda k: abs(normal[k]))
        values = []
        for li in polygon.loop_indices:
            p = engine(obj.data.vertices[obj.data.loops[li].vertex_index].co)
            x, y, z = [p[k] - center[k] for k in range(3)]
            if axis == 2:
                uv = (depth + x + width / 2, depth + y + height / 2) if normal[2] < 0 else (depth + width + depth + width / 2 - x, depth + y + height / 2)
            elif axis == 0:
                uv = (depth + width + z + depth / 2, depth + y + height / 2) if normal[0] > 0 else (depth - z - depth / 2, depth + y + height / 2)
            else:
                uv = (depth + x + width / 2, depth + height + z + depth / 2) if normal[1] > 0 else (depth + x + width / 2, depth - z - depth / 2)
            values.append(uv)
        rows.append(values)
    return source_uv(obj, rows, 'Connected six-face box net before bevel; metre scale.')


def lathe_uv(obj, profile, rings, segments):
    maximum = max(r for r, h in profile)
    circumference = math.tau * maximum
    lengths = [0]
    for a, b in zip(profile, profile[1:]):
        lengths.append(lengths[-1] + math.hypot(a[0] - b[0], a[1] - b[1]))
    lookup = {vi: (row, col) for row, ring in enumerate(rings) for col, vi in enumerate(ring)}
    rows = []
    for polygon in obj.data.polygons:
        ids = [lookup[vi] for vi in polygon.vertices]
        low = min(row for row, col in ids)
        high = max(row for row, col in ids)
        if low == high or profile[low][0] == 0 or profile[high][0] == 0 or abs(profile[low][1] - profile[high][1]) < 1e-8:
            values = []
            for row, col in ids:
                a = col / segments * math.tau
                radius = profile[row][0]
                values.append((circumference + maximum * 2 + radius * math.cos(a), low * maximum * 3 + radius * math.sin(a)))
        else:
            columns = [col for row, col in ids]
            seam = max(columns) - min(columns) > segments / 2
            values = [((col + segments if seam and col == 0 else col) / segments * circumference, lengths[row]) for row, col in ids]
        rows.append(values)
    return source_uv(obj, rows, 'Lathe meridian strip plus true planar cap charts; metre scale.')


def tube_coordinates(points, radii, radial=10, closed=False):
    maximum = max(radii)
    circumference = math.tau * maximum
    lengths = [0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + (Vector(b) - Vector(a)).length)
    if closed:
        lengths.append(lengths[-1] + (Vector(points[0]) - Vector(points[-1])).length)
    rows = [[(col / radial * circumference, lengths[row]), ((col + 1) / radial * circumference, lengths[row]),
             ((col + 1) / radial * circumference, lengths[row + 1]), (col / radial * circumference, lengths[row + 1])]
            for row in range(len(points) if closed else len(points) - 1) for col in range(radial)]
    if not closed:
        for row, reverse in [(0, True), (len(points) - 1, False)]:
            ids = list(reversed(range(radial))) if reverse else list(range(radial))
            rows.append([(circumference + maximum * 2 + radii[row] * math.cos(col / radial * math.tau),
                          maximum * (2 + (4 if row else 0)) + radii[row] * math.sin(col / radial * math.tau)) for col in ids])
    return rows


def beam_uv(obj, a, b, radius, end_radius, radial=10):
    # Snow beam() writes side polygons first, then the two true end caps.
    rows = tube_coordinates([a, b], [radius, end_radius], radial)
    return source_uv(obj, rows, 'Tapered beam body strip with separate end caps; metre scale.')


def torus_uv(obj, major, wire):
    rows=[]
    for polygon in obj.data.polygons:
        angles=[]
        for vi in polygon.vertices:
            p=obj.data.vertices[vi].co
            angles.append(((math.atan2(p.y,p.x)/math.tau)%1,(math.atan2(p.z,math.hypot(p.x,p.y)-major)/math.tau)%1))
        wrap_u=max(u for u,v in angles)-min(u for u,v in angles)>.5
        wrap_v=max(v for u,v in angles)-min(v for u,v in angles)>.5
        rows.append([((u+1 if wrap_u and u<.5 else u)*math.tau*major,(v+1 if wrap_v and v<.5 else v)*math.tau*wire) for u,v in angles])
    return source_uv(obj,rows,'True torus periodic major/minor chart; material UV0 unchanged.')


def grid_uv(obj, columns, width, length):
    count = len(obj.data.vertices)
    rows = max(1, count // columns - 1)
    return source_uv(obj, [[(vi % columns / (columns - 1) * width, vi // columns / rows * length)
                            for vi in polygon.vertices] for polygon in obj.data.polygons],
                     'Connected curved roof/terrain grid; metre scale.')


def closed_grid_uv(obj, columns, rows, width, length):
    top_count = columns * rows
    coordinates = []
    for polygon in obj.data.polygons:
        ids = list(polygon.vertices)
        if all(vi < top_count for vi in ids) or all(vi >= top_count for vi in ids):
            bottom = ids[0] >= top_count
            coordinates.append([(vi % top_count % columns / (columns - 1) * width,
                                 vi % top_count // columns / (rows - 1) * length + (length * 1.2 if bottom else 0)) for vi in ids])
        else:
            # A connected perimeter skirt, isolated from top and bottom.
            values = []
            for vi in ids:
                i = vi % top_count
                x, z = i % columns / (columns - 1) * width, i // columns / (rows - 1) * length
                if i < columns: perimeter = x
                elif i % columns == columns - 1: perimeter = width + z
                elif i // columns == rows - 1: perimeter = width + length + width - x
                else: perimeter = width * 2 + length + length - z
                values.append((perimeter, length * 2.5 + (.15 if vi >= top_count else 0)))
            if max(x for x, y in values) - min(x for x, y in values) > width + length:
                values = [(width * 2 + length * 2 if x == 0 else x, y) for x, y in values]
            coordinates.append(values)
    return source_uv(obj, coordinates, 'Connected top/bottom heightfield grids and perimeter skirt; metre scale.')


def planar_uv(obj, axes=(0, 2)):
    return source_uv(obj, [[tuple(engine(obj.data.vertices[vi].co)[a] for a in axes)
                            for vi in polygon.vertices] for polygon in obj.data.polygons],
                     'One non-overlapping heightfield plane; metre scale.')


def profile_uv(obj, count, rings, cap_indices, strip_axis):
    """Extruded closed outline with ring-index topology and true end planes."""
    first = [engine(obj.data.vertices[i].co) for i in range(count)]
    distances = [0]
    for i in range(count):
        distances.append(distances[-1] + (first[(i + 1) % count] - first[i]).length)
    span = max(.01, distances[-1])
    centers = [sum((engine(obj.data.vertices[row * count + i].co) for i in range(count)), Vector()) / count for row in range(rings)]
    across = [0]
    for a, b in zip(centers, centers[1:]):
        across.append(across[-1] + (b - a).length)
    axes = [k for k in range(3) if k != strip_axis]
    coordinates = []
    for polygon in obj.data.polygons:
        ids = list(polygon.vertices)
        if polygon.index in cap_indices:
            coordinates.append([(span * 1.2 + engine(obj.data.vertices[vi].co)[axes[0]],
                                 span * (1.2 if polygon.index == min(cap_indices) else 2.4) + engine(obj.data.vertices[vi].co)[axes[1]]) for vi in ids])
        else:
            cols = [vi % count for vi in ids]
            seam = max(cols) - min(cols) > count / 2
            coordinates.append([(distances[count] if seam and vi % count == 0 else distances[vi % count], across[vi // count]) for vi in ids])
    return source_uv(obj, coordinates, 'Extruded outline side strip with two planar caps; metre scale.')


def complete_source_charts(objects):
    """UV-only fallback for remaining infrequent pieces, once in multi-edit."""
    fallback = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        if obj.data.uv_layers.get('SourceLightmap'):
            continue
        if obj.get('source_cc0_asset') or obj.get('source_asset') or obj.name.startswith('Forged door pull ring'):
            old = obj.data.uv_layers['UVMap']
            uv = obj.data.uv_layers.new(name='SourceLightmap')
            uv.data.foreach_set('uv', [c for row in old.data for c in row.uv])
            obj['one_light_authored_uv2'] = 'Retain original nonoverlapping scan or torus charts, independent object owner.'
        else:
            uv = obj.data.uv_layers.new(name='SourceLightmap')
            obj.data.uv_layers.active = uv
            fallback.append(obj)
    if fallback:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in fallback:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = fallback[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(89), island_margin=0, area_weight=0, correct_aspect=False, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        for obj in fallback:
            obj['one_light_authored_uv2'] = 'Pre-modifier fallback planar patches, independently packed and audited.'
    density=[]
    for obj in objects:
        if obj.type == 'MESH':
            # addUvMesh drops valid triangles whose UV area is below float
            # epsilon (~1.19e-7). Uniform centimetre units retain tiny bevels
            # and icicle tips without changing any density/stretch ratio.
            layer=obj.data.uv_layers['SourceLightmap'];obj.data.calc_loop_triangles();world_area=uv_area=0
            for triangle in obj.data.loop_triangles:
                p=[obj.matrix_world@obj.data.vertices[vi].co for vi in triangle.vertices]
                uv=[layer.data[li].uv for li in triangle.loops]
                world_area+=(p[1]-p[0]).cross(p[2]-p[0]).length*.5
                uv_area+=abs((uv[1].x-uv[0].x)*(uv[2].y-uv[0].y)-(uv[1].y-uv[0].y)*(uv[2].x-uv[0].x))*.5
            if world_area>1e-12 and uv_area<=0:raise RuntimeError('Source chart has no area: '+obj.name)
            scale=math.sqrt(world_area/uv_area) if uv_area else 1
            density.append({'object':obj.name,'worldAreaM2':world_area,'sourceUVAreaBeforeScale':uv_area,'metreAreaNormalizationScale':scale})
            coordinates=array('f',[0])*(len(layer.data)*2)
            layer.data.foreach_get('uv',coordinates)
            for i in range(len(coordinates)):coordinates[i]*=100*scale
            layer.data.foreach_set('uv',coordinates)
            obj.data.uv_layers.active = obj.data.uv_layers['UVMap']
            obj.data.uv_layers['UVMap'].active_render = True
    return {'fallbackObjects': [obj.name for obj in fallback], 'fallbackCount': len(fallback),
            'allMeshObjectsAuthored': all(o.data.uv_layers.get('SourceLightmap') for o in objects if o.type == 'MESH'),
            'coordinateUnit':'centimetre; uniform100xmetre charts to avoid xatlas absolute UV-area epsilon; packed Lightmap remains normalized0–1',
            'densityPolicy':'Each object chart area normalized to its actual source world surface area before centimetre conversion; analytical distortion ratios within an object retained, material UV0 untouched.',
            'densityMeasurements':density,
            'policy': 'Only SourceLightmap UVs added. All geometry/UVMap/normals/colors/contacts are unchanged; atlas packing and complete proof gates remain mandatory.'}
