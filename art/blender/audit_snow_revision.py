"""Read-only geometry/UV0/light scope gate for a color and UV2 source revision."""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before',type=Path,required=True)
parser.add_argument('--after',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs={name:{'path':str(path.resolve()),'sha256':sha(path)} for name,path in [('before',args.before),('after',args.after)]}


def values(mesh,attribute,width,prop):
    data=array('f',[0])*(len(attribute)*width)
    attribute.foreach_get(prop,data)
    return data


def number(values):
    return struct.pack('<'+'f'*len(values),*[0.0 if x==0 else x for x in values])


def cyclic(rows):
    return min(b''.join(rows[i:]+rows[:i]) for i in range(len(rows)))


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()))
    scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();objects={}
    for obj in bpy.data.collections['STATIC'].objects:
        if obj.type!='MESH':continue
        mesh=obj.data;positions=[number(v.co) for v in mesh.vertices];uv=mesh.uv_layers['UVMap'].data
        geometry=[];uvs=[]
        for polygon in mesh.polygons:
            geometry.append(cyclic([positions[mesh.loops[li].vertex_index] for li in polygon.loop_indices]))
            uvs.append(cyclic([positions[mesh.loops[li].vertex_index]+number(uv[li].uv) for li in polygon.loop_indices]))
        evaluated=obj.evaluated_get(graph);em=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);em.calc_loop_triangles()
        ep=[number(v.co) for v in em.vertices];eu=em.uv_layers['UVMap'].data;normal_triangles=[];triangles=[]
        for triangle in em.loop_triangles:
            triangles.append(cyclic([ep[vi] for vi in triangle.vertices]))
            normal_triangles.append(cyclic([ep[vi]+number(em.corner_normals[li].vector)+number(eu[li].uv) for vi,li in zip(triangle.vertices,triangle.loops)]))
        colors={};tint=mesh.color_attributes.get('SurfaceTint')
        if tint:
            for polygon in mesh.polygons:
                mat=mesh.materials[polygon.material_index];base=list(mat.get('one_light_vertex_base_tint',[1,1,1]))
                for li in polygon.loop_indices:
                    key=positions[mesh.loops[li].vertex_index]+number(uv[li].uv)+mat.name.encode()
                    colors.setdefault(key,[]).append(tuple(tint.data[li].color[k]/base[k] if abs(base[k])>1e-12 else 0 for k in range(3)))
        objects[obj.name]={'baseGeometry':sha_bytes(sorted(geometry)),'baseUV0':sha_bytes(sorted(uvs)),
                          'evaluatedPositionsWinding':sha_bytes(sorted(triangles)),
                          'evaluatedNormalsUV0':sha_bytes(sorted(normal_triangles)),
                          'matrix':number([v for row in obj.matrix_world for v in row]).hex(),
                          'materials':[m.name for m in mesh.materials],
                          'tintMultipliers':{key:sorted(rows) for key,rows in colors.items()}}
        evaluated.to_mesh_clear()
    lights={obj.name:{'matrix':[list(row) for row in obj.matrix_world],'energy':obj.data.energy,'color':list(obj.data.color),
                      'radius':obj.data.shadow_soft_size if obj.data.type=='POINT' else obj.data.angle,'role':obj.get('bake_role')}
            for obj in scene.objects if obj.type=='LIGHT'}
    background=scene.world.node_tree.nodes['Background']
    view={key:getattr(scene.view_settings,key) for key in ['view_transform','look','exposure','gamma']}
    return objects,{'lights':lights,'world':{'color':list(background.inputs['Color'].default_value),'strength':background.inputs['Strength'].default_value},'view':view},json.loads(scene.get('source_lightmap_charts','null'))


def sha_bytes(rows):
    h=hashlib.sha256()
    for row in rows:h.update(row)
    return h.hexdigest()


before,lights_before,_=snapshot(args.before)
after,lights_after,chart_report=snapshot(args.after)
if set(before)!=set(after):raise RuntimeError('Source mesh inventory differs.')
fields=['baseGeometry','baseUV0','evaluatedPositionsWinding','evaluatedNormalsUV0','matrix','materials']
differences={field:[name for name in before if before[name][field]!=after[name][field]] for field in fields}
max_tint_error=0;missing_tint=[]
for name in before:
    a,b=before[name]['tintMultipliers'],after[name]['tintMultipliers']
    if set(a)!=set(b) or any(len(a[k])!=len(b[k]) for k in a):missing_tint.append(name);continue
    for key in a:
        for old,new in zip(a[key],b[key]):
            max_tint_error=max(max_tint_error,max(abs(x-y) for x,y in zip(old,new)))
report={'inputs':inputs,'scope':'Only authored material color conversion and SourceLightmap authoring. Geometry/materialUV0/normals/transforms and source light/world/exposure comparisons are independently measured.',
        'objectCount':len(before),'differences':differences,'lightingWorldExposureByteValueExact':lights_before==lights_after,
        'linearTintMultiplierMaximumError':max_tint_error,'tintAssociationDifferences':missing_tint,
        'sourceLightmapCharts':chart_report,'sourceOrModelModified':False,'renderBakeEncoderGpuJobs':0,
        'passed':not any(differences.values()) and lights_before==lights_after and not missing_tint and max_tint_error<.000002,
        'scriptSha256':sha(Path(__file__))}
for name,path in [('before',args.before),('after',args.after)]:
    if sha(path)!=inputs[name]['sha256']:raise RuntimeError('Frozen input changed.')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('SOURCE_REVISION_SCOPE',str(args.out),sha(args.out),report['passed'],{k:len(v) for k,v in differences.items()},max_tint_error,flush=True)
if not report['passed']:raise RuntimeError('Source scope requires review of actual differences.')
