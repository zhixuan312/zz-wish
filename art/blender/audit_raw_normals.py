"""Read-only actual raw glTF NORMAL versus evaluated prepared triangle corners."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

parser=argparse.ArgumentParser(description=__doc__)
for flag in ['prepared','raw','out']:parser.add_argument('--'+flag,type=Path,required=True)
parser.add_argument('--hero',help='Audit this authored dynamic hero instead of the static lightmap regions.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda path:sha256(path.read_bytes()).hexdigest()
inputs={name:{'path':str(path.resolve()),'sha256':sha(path)}for name,path in [('prepared',args.prepared),('raw',args.raw)]}
pointkey=lambda point:struct.pack('<fff',*(0. if value==0 else value for value in point))
engine=lambda point:(float(point.x),float(point.z),float(-point.y))


def canonical(points,normals):
    keys=[pointkey(point)for point in points]
    rotation=min(range(3),key=lambda k:tuple(keys[k:]+keys[:k]))
    return b''.join(keys[rotation:]+keys[:rotation]),tuple(normals[rotation:]+normals[:rotation])


bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
graph=bpy.context.evaluated_depsgraph_get();reference=defaultdict(list);prepared_count=Counter()
for obj in bpy.context.scene.objects:
    selected=(obj.get('one_light_dynamic') and obj.get('hero_id')==args.hero)if args.hero else(obj.get('one_light_static') and not obj.get('one_light_dynamic'))
    if obj.type!='MESH' or not selected:continue
    evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
    matrix=evaluated.matrix_world;normal_matrix=matrix.to_3x3().inverted().transposed()
    region=obj.get('lightmap_region')
    for triangle in mesh.loop_triangles:
        material=mesh.materials[mesh.polygons[triangle.polygon_index].material_index].name
        positions=[engine(matrix@mesh.vertices[vi].co)for vi in triangle.vertices]
        normals=[engine((normal_matrix@mesh.corner_normals[li].vector).normalized())for li in triangle.loops]
        key,normals=canonical(positions,normals);reference[(region,material,key)].append(normals);prepared_count[region]+=1
    evaluated.to_mesh_clear()

data=args.raw.read_bytes();cursor=12;document=None;binary=None
while cursor<len(data):
    size,kind=struct.unpack_from('<II',data,cursor);chunk=data[cursor+8:cursor+8+size];cursor+=8+size
    if kind==0x4e4f534a:document=json.loads(chunk)
    elif kind==0x004e4942:binary=chunk
if data[:4]!=b'glTF' or struct.unpack_from('<I',data,8)[0]!=len(data)or document is None or binary is None:raise RuntimeError('Not an intact raw GLB.')


def accessor(index):
    record=document['accessors'][index];view=document['bufferViews'][record['bufferView']]
    if record.get('sparse')or view.get('extensions',{}).get('EXT_meshopt_compression'):raise RuntimeError('Expected actual uncompressed raw input.')
    code={5121:'B',5123:'H',5125:'I',5126:'f'}[record['componentType']];width={'SCALAR':1,'VEC3':3}[record['type']];size=struct.calcsize('<'+code*width)
    offset=view.get('byteOffset',0)+record.get('byteOffset',0);stride=view.get('byteStride',size)
    return record,[struct.unpack_from('<'+code*width,binary,offset+i*stride)for i in range(record['count'])]


def matrix(node):
    if 'matrix'in node:return Matrix([node['matrix'][i:i+4]for i in range(0,16,4)]).transposed()
    q=node.get('rotation',[0,0,0,1]);return Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(node.get('scale',[1,1,1])))


actual=defaultdict(list);raw_count=Counter();semantics=Counter();normal_formats=[];length_error=0.


def visit(index,parent):
    global length_error
    node=document['nodes'][index];world=parent@matrix(node)
    if 'mesh'in node:
        region=node.get('extras',{}).get('lightmap_region');normal_matrix=world.to_3x3().inverted().transposed()
        for primitive in document['meshes'][node['mesh']]['primitives']:
            semantics.update(primitive['attributes'].keys())
            pformat,positions=accessor(primitive['attributes']['POSITION']);nformat,normals=accessor(primitive['attributes']['NORMAL']);_,indices=accessor(primitive['indices'])
            if nformat['componentType']!=5126 or nformat.get('normalized'):raise RuntimeError('Actual raw NORMAL is not nonnormalized FLOAT32.')
            normal_formats.append({'node':node.get('name'),'count':nformat['count'],'componentType':nformat['componentType'],'normalized':bool(nformat.get('normalized'))})
            positions=[tuple(world@Vector(point))for point in positions];normals=[tuple((normal_matrix@Vector(normal)).normalized())for normal in normals]
            for normal in normals:length_error=max(length_error,abs(math.sqrt(sum(value*value for value in normal))-1))
            material=document['materials'][primitive['material']]['name'];flat=[row[0]for row in indices]
            for offset in range(0,len(flat),3):
                corners=flat[offset:offset+3];key,values=canonical([positions[i]for i in corners],[normals[i]for i in corners]);actual[(region,material,key)].append(values);raw_count[region]+=1
    for child in node.get('children',[]):visit(child,world)


for node in document['scenes'][document.get('scene',0)]['nodes']:visit(node,Matrix.Identity(4))

population=Counter();maximum=0.;failures=[];tolerance=.000001
for key in set(reference)|set(actual):
    before,after=reference.get(key,[]),actual.get(key,[])
    population['geometryTriangleGroups']+=1
    if len(before)!=len(after):
        population['positionOrMultiplicityMismatchedGroups']+=1
        if len(failures)<10:failures.append({'region':key[0],'material':key[1],'preparedTriangles':len(before),'rawTriangles':len(after)})
        continue
    population['uniqueTriangleGroups'if len(before)==1 else 'coincidentTriangleGroups']+=1
    errors=[[max(abs(a-b)for x,y in zip(left,right)for a,b in zip(x,y))for left in before]for right in after]
    maximum=max(maximum,max((min(row)for row in errors),default=0.))
    # Require a complete one-to-one assignment for duplicate coincident faces.
    matched={}
    def assign(row,seen):
        for column,error in enumerate(errors[row]):
            if error>tolerance or column in seen:continue
            seen.add(column)
            if column not in matched or assign(matched[column],seen):matched[column]=row;return True
        return False
    if all(assign(row,set())for row in range(len(after))):population['oneToOneNormalMatchedTriangles']+=len(after)
    else:
        population['normalMismatchedTriangleGroups']+=1
        if len(failures)<10:failures.append({'region':key[0],'material':key[1],'normalErrors':errors})
allowed={'POSITION','NORMAL','COLOR_0','COLOR_1','TEXCOORD_0','TEXCOORD_1'}
unexpected=sorted(set(semantics)-allowed)
redundant_accessors=[row.get('name')for row in document['accessors']if any(token in row.get('name','').lower()for token in ['custom_normal','frozen_world_normal'])]
passed=not failures and not unexpected and not redundant_accessors and prepared_count==raw_count
report={'version':1,'inputs':inputs,'selection':{'hero':args.hero,'scope':'dynamic hero'if args.hero else'static lightmap regions'},'passed':passed,'method':'Decode actual uncompressed glTF accessors and hierarchy; transform raw NORMAL by inverse transpose into world Y-up. Evaluate prepared CORNER normals and positions into the same engine basis. Match exact FLOAT32 triangle positions and cyclic winding; duplicate coincident triangle groups require a complete one-to-one normal assignment at1e−6. No normal attribute other than standard NORMAL is used.',
        'preparedTrianglesByRegion':dict(prepared_count),'rawTrianglesByRegion':dict(raw_count),'association':dict(population),'maximumBestMatchedWorldNormalComponentError':maximum,'normalComponentTolerance':tolerance,
        'standardNormalAccessorFormats':normal_formats,'semanticPrimitiveCounts':dict(semantics),'unexpectedOrRedundantSemantics':unexpected,'redundantNormalAccessorNames':redundant_accessors,'noCustomNormalOrEquivalentStream':not unexpected and not redundant_accessors,'maximumWorldNormalUnitLengthErrorAfterTransform':length_error,'failureExamples':failures,'sourcePreparedOrRawModified':False,'renderBakeEncoderGpuJobs':0,'scriptSha256':sha(Path(__file__))}
for name,path in [('prepared',args.prepared),('raw',args.raw)]:
    if sha(path)!=inputs[name]['sha256']:raise RuntimeError('Frozen normal input changed.')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('RAW_NORMAL_PROOF',json.dumps({'path':str(args.out),'sha256':sha(args.out),'passed':passed,'maximum':maximum,'population':dict(population),'unexpected':unexpected}),flush=True)
if not passed:raise RuntimeError('Actual raw NORMAL proof failed.')
