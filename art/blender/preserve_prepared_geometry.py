"""Use accepted prepared mesh bytes with a separately proven UV2-only layout.

No source is edited and no GI is reused. This avoids fresh Bevel evaluation
rounding when testing a different atlas allocation. Topology/material indices,
world transforms and zero-area status must match before copying actual old mesh
data. Only the new Lightmap, chart IDs and certified hidden mask are transferred.
"""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
for k in ['geometry','layout','out','report']:
    parser.add_argument('--'+k,type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs={k:{'path':str(getattr(args,k)),'sha256':sha(getattr(args,k))}for k in ['geometry','layout']}
if args.out.exists() or args.report.exists() or not args.out.resolve().is_relative_to(ROOT/'art/build'):
    raise RuntimeError('New ignored output required')
bpy.ops.wm.open_mainfile(filepath=str(args.geometry.resolve()))
names={o['lightmap_region']:o.name for o in bpy.context.scene.objects if o.type=='MESH' and o.get('one_light_static') and not o.get('one_light_dynamic')}
canonical_world={o['lightmap_region']:[list(row) for row in o.matrix_world] for o in bpy.context.scene.objects if o.type=='MESH' and o.get('one_light_static') and not o.get('one_light_dynamic')}
normal_metadata={k:bpy.context.scene[k] for k in ['one_light_normal_transfer','one_light_normal_transfer_policy']}
source_binding=bpy.context.scene['one_light_source_binding']
bpy.ops.wm.open_mainfile(filepath=str(args.layout.resolve()))
scene=bpy.context.scene
if scene['one_light_source_binding']!=source_binding:
    raise RuntimeError('Actual authored source identity differs')
current={o['lightmap_region']:o for o in scene.objects if o.type=='MESH' and o.get('one_light_static') and not o.get('one_light_dynamic')}
if set(current)!=set(names):
    raise RuntimeError('Region population differs')
with bpy.data.libraries.load(str(args.geometry.resolve()),link=False)as(data_from,data_to):
    data_to.objects=list(names.values())
loaded={o['lightmap_region']:o for o in data_to.objects}


def values(collection,property,width,typecode):
    result=array(typecode,[0])*(len(collection)*width)
    collection.foreach_get(property,result)
    return result


rows={}
for region,obj in current.items():
    old=loaded[region]
    # Library-loaded objects are deliberately not linked into the scene, so
    # their lazy matrix_world is not a dependency-graph measurement.
    if [list(row) for row in obj.matrix_world]!=canonical_world[region]:
        raise RuntimeError('Actual region transform differs')
    a,b=obj.data,old.data
    for collection,property,width,typecode in [('loops','vertex_index',1,'i'),('polygons','loop_start',1,'i'),('polygons','loop_total',1,'i'),('polygons','material_index',1,'i')]:
        if values(getattr(a,collection),property,width,typecode).tobytes()!=values(getattr(b,collection),property,width,typecode).tobytes():
            raise RuntimeError('Canonical topology/material correspondence differs: '+region)
    if len(a.vertices)!=len(b.vertices):
        raise RuntimeError('Vertex indexing differs')
    flags={}
    for name in ['one_light_uv_excluded','one_light_uv_chart','one_light_uv_zero_area']:
        attribute=a.attributes.get(name)
        flags[name]=None if attribute is None else (attribute.data_type,values(attribute.data,'value',1,'b' if attribute.data_type=='BOOLEAN' else 'i'))
    if flags['one_light_uv_zero_area'] is not None:
        original=b.attributes.get('one_light_uv_zero_area')
        if not original or values(original.data,'value',1,'b').tobytes()!=flags['one_light_uv_zero_area'][1].tobytes():
            raise RuntimeError('Actual zero-area geometry classification changed')
    uvs=values(a.uv_layers['Lightmap'].data,'uv',2,'f')
    material_slots=list(a.materials)
    if len(material_slots)!=len(b.materials):
        raise RuntimeError('Material slot correspondence differs')
    before_uv=np.frombuffer(values(a.uv_layers['UVMap'].data,'uv',2,'f'),dtype=np.float32)
    canonical_uv=np.frombuffer(values(b.uv_layers['UVMap'].data,'uv',2,'f'),dtype=np.float32)
    positions_a=np.frombuffer(values(a.vertices,'co',3,'f'),dtype=np.float32)
    positions_b=np.frombuffer(values(b.vertices,'co',3,'f'),dtype=np.float32)
    rows[region]={'topologyMaterialIndicesWorldMatrixAndZeroAreaStatusExact':True,'maximumFreshEvaluationUV0DifferenceRestoredFromAcceptedMesh':float(np.max(np.abs(before_uv-canonical_uv))),
                  'maximumFreshEvaluationPositionComponentDifferenceRestoredFromAcceptedMesh':float(np.max(np.abs(positions_a-positions_b))),
                  'vertices':len(b.vertices),'triangles':len(b.polygons),'canonicalPositionSha256':hashlib.sha256(positions_b.tobytes()).hexdigest(),'canonicalUV0Sha256':hashlib.sha256(canonical_uv.tobytes()).hexdigest()}
    mesh=b.copy()
    canonical_material_indices=values(b.polygons,'material_index',1,'i')
    mesh.materials.clear()
    for material in material_slots:
        mesh.materials.append(material)
    # Blender clears polygon assignments when slots are cleared. Restore the
    # explicitly verified canonical indices after binding actual current PBRs.
    mesh.polygons.foreach_set('material_index',canonical_material_indices)
    mesh.uv_layers['Lightmap'].data.foreach_set('uv',uvs)
    for name,record in flags.items():
        if record is None:
            if mesh.attributes.get(name):
                mesh.attributes.remove(mesh.attributes[name])
            continue
        datatype,data=record
        attribute=mesh.attributes.get(name)or mesh.attributes.new(name,type=datatype,domain='FACE')
        attribute.data.foreach_set('value',data)
    obj.data=mesh
    bpy.data.objects.remove(old,do_unlink=True)
for k,v in normal_metadata.items():
    scene[k]=v
for k in ['one_light_prepared_preview_audit','one_light_prepared_contact_audit_binding']:
    if k in scene:
        del scene[k]
scene['one_light_uv_reallocation']=json.dumps({'policy':'Accepted prepared mesh bytes; fresh Lightmap/chart/closed-snow mask only. Fresh GI and proof gates required.','geometry':inputs['geometry'],'layout':inputs['layout']})
args.out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(args.out.resolve()))
report={'scope':__doc__,'inputs':inputs,'output':{'path':str(args.out),'sha256':sha(args.out)},'regions':rows,'sourcePreparedAndMasterFilesUnchanged':True,'cyclesRenderBakeGpuJobs':0,'scriptSha256':sha(Path(__file__))}
for k,record in inputs.items():
    if sha(getattr(args,k))!=record['sha256']:
        raise RuntimeError('Actual input changed')
args.report.write_text(json.dumps(report,indent=2)+'\n')
print('CANONICAL_PREPARED_GEOMETRY_READY',sha(args.report),flush=True)
