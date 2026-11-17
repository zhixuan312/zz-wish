"""Read-only evaluated scan-cap scope proof. No rendering/export/encoding."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys

import bpy


def info(path):return {'path':str(path),'bytes':path.stat().st_size,'sha256':sha256(path.read_bytes()).hexdigest()}


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path));graph=bpy.context.evaluated_depsgraph_get();result={}
    for obj in bpy.context.scene.objects:
        if not obj.name.startswith('Far photographic rock massif '):continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph)
        result[obj.name]={'positions':[tuple(v.co) for v in mesh.vertices],
                          'normals':[tuple(n.vector) for n in mesh.corner_normals],
                          'loops':[loop.vertex_index for loop in mesh.loops],
                          'faces':[tuple(p.vertices) for p in mesh.polygons],
                          'materialIndices':[p.material_index for p in mesh.polygons],
                          'materials':[m.name if m else None for m in mesh.materials],
                          'uv0':[tuple(u.uv) for u in mesh.uv_layers['UVMap'].data],
                          'sourceUv2':[tuple(u.uv) for u in mesh.uv_layers['SourceLightmap'].data],
                          'matrixWorld':[list(row) for row in evaluated.matrix_world],
                          'capScope':json.loads(obj['scan_cap_scope']) if obj.get('scan_cap_scope') else None}
        evaluated.to_mesh_clear()
    return result


def main():
    p=argparse.ArgumentParser();p.add_argument('--before',type=Path,required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.before=a.before.resolve();a.source=a.source.resolve();a.output=a.output.resolve()
    if a.output.exists():raise RuntimeError('Use a fresh immutable proof output')
    inputs=[info(a.before),info(a.source)];before=snapshot(a.before);after=snapshot(a.source)
    if set(before)!=set(after) or len(before)!=6:raise RuntimeError('Actual scan formation set changed')
    records=[]
    for name,old in before.items():
        new=after[name];scope=new['capScope']
        if not scope:raise RuntimeError('Source omits the cap scope declaration')
        for key in ['loops','faces','materialIndices','materials','uv0','sourceUv2','matrixWorld']:
            if old[key]!=new[key]:raise RuntimeError(name+' changed protected '+key)
        if len(old['positions'])!=len(new['positions']):raise RuntimeError('Vertex count changed')
        protected=[];moved=[];max_displacement=0
        for i,(left,right) in enumerate(zip(old['positions'],new['positions'])):
            if left[0]!=right[0] or left[1]!=right[1]:raise RuntimeError('Cap changed horizontal scan coordinates')
            if left[2]<=scope['capBaseYEngine']:
                protected.append(i)
                if left!=right:raise RuntimeError('Protected scan interior moved')
            elif left!=right:moved.append(i)
            max_displacement=max(max_displacement,abs(left[2]-right[2]))
        protected_set=set(protected);maximum_interior_normal_error=0
        for li,vertex in enumerate(old['loops']):
            if vertex in protected_set:
                maximum_interior_normal_error=max(maximum_interior_normal_error,max(abs(x-y) for x,y in zip(old['normals'][li],new['normals'][li])))
        if maximum_interior_normal_error>1e-6:raise RuntimeError('Protected interior normals changed beyond float IO')
        if len(protected)!=scope['protectedInteriorVertices'] or len(moved)!=scope['movedCapVertices']:raise RuntimeError('Actual cap counts differ from source declaration')
        uv_bytes=b''.join(struct.pack('<2f',*uv) for uv in old['uv0'])
        protected_bytes=b''.join(struct.pack('<3f',*old['positions'][i]) for i in protected)
        records.append({'name':name,'vertices':len(old['positions']),'movedCapVertices':len(moved),'protectedInteriorVertices':len(protected),
                        'capBaseYEngine':scope['capBaseYEngine'],'maximumVerticalDisplacementMetres':max_displacement,
                        'maximumProtectedInteriorNormalComponentError':maximum_interior_normal_error,
                        'photographicUv0Sha256':sha256(uv_bytes).hexdigest(),'protectedInteriorPositionsSha256':sha256(protected_bytes).hexdigest(),
                        'allHorizontalPositionsExact':True,'protectedInteriorPositionsExact':True,'allUv0AndSourceUv2Exact':True,
                        'topologyMaterialBindingsAndWorldTransformExact':True})
    if [info(a.before),info(a.source)]!=inputs:raise RuntimeError('Source input bytes changed')
    report={'passed':True,'inputs':inputs,'records':records,'normalLimit':1e-6,'nativeRenderJobs':0,
            'scope':'Actual evaluated six-scan source13 versus source14. Only upper-cap vertical displacement and its corresponding normal deformation are permitted; all other geometry/UV/material fields remain exact. This is source scope proof, not prepared/delivery or optical acceptance.'}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n')
    print('CLOUD_SCAN_CAP_SCOPE_PASS',sum(r['protectedInteriorVertices'] for r in records),sum(r['movedCapVertices'] for r in records),str(a.output),flush=True)


if __name__=='__main__':main()
