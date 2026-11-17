"""Exact source/prepared UV0+tint corner-value audit, without native jobs."""
import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys
import bpy

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--prepared',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);digest=lambda path:sha256(path.read_bytes()).hexdigest()
initial={str(path):digest(path) for path in [a.source,a.prepared,a.manifest]}
def corner_sets(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()));scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();result=defaultdict(set)
    for obj in scene.objects:
        if obj.type!='MESH' or not obj.get('one_light_static') or obj.get('one_light_dynamic'):continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);uv=mesh.uv_layers['UVMap'];tint=mesh.color_attributes.get('SurfaceTint')
        for face in mesh.polygons:
            material=mesh.materials[face.material_index].name
            for li in face.loop_indices:
                position=evaluated.matrix_world@mesh.vertices[mesh.loops[li].vertex_index].co
                colour=tuple(tint.data[li if tint.domain=='CORNER' else mesh.loops[li].vertex_index].color) if tint else (1,1,1,1)
                result[material].add(struct.pack('<9f',*position,*uv.data[li].uv,*colour))
        evaluated.to_mesh_clear()
    return result
source=corner_sets(a.source);prepared=corner_sets(a.prepared);rows=[]
for name in sorted(set(source)|set(prepared)):
    before=source[name];after=prepared[name]
    rows.append({'material':name,'sourceUniqueCornerValues':len(before),'preparedUniqueCornerValues':len(after),'missing':len(before-after),'extra':len(after-before),'sha256':sha256(b''.join(sorted(after))).hexdigest(),'passed':before==after})
manifest=json.loads(a.manifest.read_text());generated=manifest['bake']['generatedCoordinates']
if any(row.get('required') is not False for row in generated['receivers'].values()):raise RuntimeError('This no-implicit-Generated proof cannot cover procedural receiver coordinates.')
passed=all(row['passed'] for row in rows)
report={'version':1,'sourceBlendSha256':initial[str(a.source)],'preparedBlendSha256':initial[str(a.prepared)],'mappingPolicy':generated['policy'],'generatedReceivers':generated['receivers'],'geometryFingerprint':manifest['geometryFingerprint'],'receiverProfiles':manifest['bake']['receiverProfiles'],'sourceMaterialUVAndTintCornerValueSetsExact':passed,'materials':rows,'sourceExplicitImageUVMapOnly':True,'requiresRootNativeVisualReview':True,'scope':'Every evaluated material/Float32 world position/UVMap/SurfaceTint corner-value tuple is preserved exactly through evaluation/join/triangulation. This set proof does not assert identical quad interpolation, render pixels or lossy delivery codecs. Native source/prepared and runtime captures remain visual gates.','inputs':initial,'scriptSha256':digest(Path(__file__)),'renderBakeEncodingJobs':0}
if any(digest(Path(path))!=value for path,value in initial.items()):raise RuntimeError('Frozen input changed during mapping audit.')
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,indent=2)+'\n')
print('CLOUD_PREPARED_MAPPING',passed,str(a.out),digest(a.out),flush=True)
if not passed:raise RuntimeError('Prepared material UV/tint correspondence failed.')
