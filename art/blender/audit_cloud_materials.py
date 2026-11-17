"""CPU export/role audit; never renders, bakes, or edits the source snapshot."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys
import bpy

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
before=sha256(a.source.read_bytes()).hexdigest()
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type=='MESH' and (obj.get('one_light_static') or obj.get('one_light_dynamic')):obj.select_set(True)
path=a.out/'source-materials.raw.glb'
bpy.ops.export_scene.gltf(filepath=str(path.resolve()),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+length])
materials=[]
for m in g['materials']:
    roles=[];pbr=m.get('pbrMetallicRoughness',{})
    for key in ['baseColorTexture','metallicRoughnessTexture']:
        if key in pbr:roles.append(key)
    for key in ['normalTexture','occlusionTexture','emissiveTexture']:
        if key in m:roles.append(key)
    materials.append({'name':m.get('name'),'roles':roles,'pbr':pbr,'extensions':m.get('extensions',{}),'extras':m.get('extras',{})})
for m in materials:
    authored=m['extras'].get('one_light_basecolor_linear')
    if authored and max(abs(a-b) for a,b in zip(authored,m['pbr'].get('baseColorFactor',[1,1,1,1])))>1e-6:raise RuntimeError('Source base colour multiplier was not exported: '+m['name'])
    if m['name'].startswith(('Cloud weathered','Cloud worn','Cloud aged','Cloud lime')):
        if not all(role in m['roles'] for role in ['baseColorTexture','normalTexture','metallicRoughnessTexture']):raise RuntimeError('Source image graph was not exported: '+m['name'])
glass=next(m for m in materials if m['name']=='Storm real clear glass')
if glass['extensions'].get('KHR_materials_transmission',{}).get('transmissionFactor')!=1:raise RuntimeError('Hero glass lost actual transmission.')
brass_indices={i for i,m in enumerate(g['materials']) if m.get('name','').startswith(('Storm old cast brass','Storm worn brass high points'))}
brass_primitives=[primitive for mesh in g['meshes'] for primitive in mesh['primitives'] if primitive.get('material') in brass_indices]
if not brass_primitives or any('COLOR_0' not in primitive['attributes'] for primitive in brass_primitives):raise RuntimeError('Authored brass patina lost SurfaceTint COLOR_0.')
bin_offset=28+length
for primitive in brass_primitives:
    accessor=g['accessors'][primitive['attributes']['COLOR_0']];view=g['bufferViews'][accessor['bufferView']]
    offset=bin_offset+view.get('byteOffset',0)+accessor.get('byteOffset',0)
    if accessor['componentType']==5121 and all(v==255 for v in data[offset:offset+accessor['count']*4]):raise RuntimeError('Brass vertex patina exported as white.')
if sha256(a.source.read_bytes()).hexdigest()!=before:raise RuntimeError('Source changed during audit.')
report={'source':{'path':str(a.source),'sha256':before},'actualRaw':{'path':str(path),'sha256':sha256(data).hexdigest(),'bytes':len(data)},'materials':materials,'embeddedImages':len(g.get('images',[])),'brassPrimitivesWithActualColor0':len(brass_primitives),'glassTransmissionExported':True,'sourceUnchanged':True,'renderBakeJobs':0,'scope':'Actual glTF export proves image roles, glass transmission and vertex patina presence. Visual native/runtime equivalence still requires captures.'}
(a.out/'material-role-proof.json').write_text(json.dumps(report,indent=2)+'\n')
print('CLOUD_MATERIAL_ROLES_PASS',len(materials),len(brass_primitives),flush=True)
