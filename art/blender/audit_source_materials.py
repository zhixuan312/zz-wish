"""CPU-only actual source GLB material/COLOR_0 audit; no render or bake."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend',type=Path,required=True)
parser.add_argument('--out-dir',type=Path,required=True)
parser.add_argument('--require-charred-wicks',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
args.out_dir=args.out_dir.resolve()
if not args.out_dir.is_relative_to(ROOT/'art/build') or args.out_dir.exists():raise RuntimeError('New separate art/build output required')
args.out_dir.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=sha(args.blend)
bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
 if obj.type=='MESH' and obj.get('one_light_static'):obj.select_set(True)
out=args.out_dir/'source-material-probe.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,export_yup=True,export_cameras=False,export_lights=False)
data=out.read_bytes();cursor=12;doc=None;binary=None
while cursor<len(data):
 size,kind=struct.unpack_from('<II',data,cursor);chunk=data[cursor+8:cursor+8+size];cursor+=8+size
 if kind==0x4e4f534a:doc=json.loads(chunk)
 elif kind==0x004e4942:binary=chunk
if doc is None or binary is None:raise RuntimeError('Expected actual GLB JSON/BIN')
def values(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 types={5121:('B',255),5123:('H',65535),5126:('f',1)};code,normal=types[a['componentType']]
 n={'VEC3':3,'VEC4':4}[a['type']];size=struct.calcsize('<'+code*n);stride=v.get('byteStride',size);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [tuple(x/normal if a.get('normalized') else x for x in struct.unpack_from('<'+code*n,binary,offset+i*stride)) for i in range(a['count'])]
colors={};primitives=[]
for mesh in doc['meshes']:
 for primitive in mesh['primitives']:
  mi=primitive['material'];mat=doc['materials'][mi];entry={'mesh':mesh.get('name'),'material':mat.get('name'),'semantics':sorted(primitive['attributes'])}
  if 'COLOR_0' in primitive['attributes']:
   samples=values(primitive['attributes']['COLOR_0']);entry['color0Min']=[min(x[k] for x in samples) for k in range(3)];entry['color0Max']=[max(x[k] for x in samples) for k in range(3)]
   colors.setdefault(mi,[]).append(entry)
  if mat.get('extras',{}).get('one_light_surface_tint') and 'COLOR_0' not in primitive['attributes']:raise RuntimeError('Actual exported SurfaceTint COLOR_0 missing: '+mat['name'])
  primitives.append(entry)
materials=[]
painted_finish=[]
for i,mat in enumerate(doc['materials']):
 pbr=mat.get('pbrMetallicRoughness',{});actual=pbr.get('baseColorFactor',[1,1,1,1]);expected=mat.get('extras',{}).get('one_light_export_basecolor_factor')
 authored=mat.get('extras',{}).get('one_light_authored_srgb_hex')
 if authored:
  values=[int(authored.lstrip('#')[j:j+2],16)/255 for j in [0,2,4]];linear=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in values]+[1]
  declared=mat['extras'].get('one_light_basecolor_linear',[])
  if len(declared)!=4 or max(abs(a-b) for a,b in zip(declared,linear))>.000001:raise RuntimeError('Authored hex was not correctly linearized: '+mat['name'])
  if expected!=[1.,1.,1.,1.] and max(abs(a-b) for a,b in zip(actual,linear))>.000001:raise RuntimeError('Actual source-hex linear factor differs: '+mat['name'])
 if expected is not None and max(abs(a-b) for a,b in zip(actual,expected))>.000001:raise RuntimeError('Export dropped tint/factor: '+mat['name']+' actual='+str(actual)+' expected='+str(expected))
 if mat.get('name')=='Aged bronze':
  if all(abs(x-1)<.000001 for x in actual[:3]) or not colors.get(i):raise RuntimeError('Actual bronze is white or lost COLOR_0')
  if min(min(p['color0Min']) for p in colors[i])>.94:raise RuntimeError('Actual patina values are absent/white')
  if 'normalTexture' not in mat or 'metallicRoughnessTexture' not in pbr:raise RuntimeError('Actual cast-bronze pitting/roughness textures missing')
 if mat.get('extras',{}).get('one_light_cast_bronze_uv'):
  if 'normalTexture' not in mat or 'metallicRoughnessTexture' not in pbr:raise RuntimeError('Authored cast-bronze PBR channel dropped: '+mat['name'])
 if mat.get('extras',{}).get('one_light_painted_fine_finish'):
  if 'normalTexture' not in mat or 'metallicRoughnessTexture' not in pbr or not colors.get(i):raise RuntimeError('Actual fine painted timber PBR/COLOR_0 channel missing')
  if abs(mat['normalTexture'].get('scale',1)-.12)>1e-6 or abs(pbr.get('roughnessFactor',1)-1)>1e-6:raise RuntimeError('Actual paint normal scale/roughness factor differs')
  texture=doc['textures'][pbr['metallicRoughnessTexture']['index']];image_definition=doc['images'][texture['source']]
  view=doc['bufferViews'][image_definition['bufferView']];image_bytes=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
  image_path=args.out_dir/('painted-finish-roughness-'+str(i)+'.png');image_path.write_bytes(image_bytes)
  image=bpy.data.images.load(str(image_path),check_existing=False);image.colorspace_settings.name='Non-Color'
  import numpy as np
  pixels=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32);image.pixels.foreach_get(pixels);rough=pixels.reshape(-1,4)[:,1]
  limits=[float(rough.min()),float(rough.max())];bpy.data.images.remove(image)
  if limits[0]<.72 or limits[1]>.92:raise RuntimeError('Actual exported paint roughness is outside the matte mapped range')
  painted_finish.append({'material':mat['name'],'normalScale':mat['normalTexture']['scale'],'actualExportedRoughnessGreenRange':limits,'embeddedRoughnessImageSha256':hashlib.sha256(image_bytes).hexdigest(),'color0Minimum':min(min(row['color0Min']) for row in colors[i]),'color0Maximum':max(max(row['color0Max']) for row in colors[i]),'passed':True})
 if mat.get('extras',{}).get('one_light_absorbed_oil'):
  if max(actual[:3])>.01 or not .06<=pbr.get('roughnessFactor',1)<=.12 or pbr.get('metallicFactor',1)!=0:raise RuntimeError('Exported oil lost its absorbed dark albedo/tight liquid reflection')
 if mat.get('extras',{}).get('one_light_used_inner'):
  if max(actual[:3])>.025 or pbr.get('roughnessFactor',0)<.70 or not colors.get(i):raise RuntimeError('Used interior staining/roughness/COLOR_0 missing from actual GLB')
 if 'console' in mat.get('name','').lower() or mat.get('extras',{}).get('lacquer_finish'):
  if abs(pbr.get('roughnessFactor',1)-.58)>.000001 or 'normalTexture' not in mat or 'baseColorTexture' not in pbr:raise RuntimeError('Actual worn lacquer PBR channels missing')
 materials.append({'name':mat.get('name'),'baseColorFactor':actual,'expectedAuthoredFactor':expected,'authoredSrgbHex':authored,'metallicFactor':pbr.get('metallicFactor',1),'roughnessFactor':pbr.get('roughnessFactor',1),'baseColorTexture':pbr.get('baseColorTexture'),'normalTexture':mat.get('normalTexture'),'metallicRoughnessTexture':pbr.get('metallicRoughnessTexture'),'surfaceTintPrimitiveCount':len(colors.get(i,[]))})
if sha(args.blend)!=source_hash:raise RuntimeError('Frozen source changed during CPU export audit')
wick_rows=[]
if args.require_charred_wicks:
 for wick in json.loads(bpy.context.scene['static_lamp_wicks_engine']):
  nodes=[n for n in doc['nodes'] if n.get('name')==wick['wickObject'] and 'mesh' in n]
  if len(nodes)!=1:raise RuntimeError('Actual exported wick node missing: '+wick['wickObject'])
  actual=[]
  for primitive in doc['meshes'][nodes[0]['mesh']]['primitives']:
   mat=doc['materials'][primitive['material']];factor=mat.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1]);emissive=mat.get('emissiveFactor',[0,0,0])
   if max(factor[:3])>.03 or max(emissive)>0:raise RuntimeError('Whole wick is not dark/nonemissive in actual GLB: '+wick['wickObject'])
   actual.append({'material':mat.get('name'),'baseColorLinear':factor,'emissiveFactor':emissive})
  wick_rows.append({'wickObject':wick['wickObject'],'actualMaterialDefinitions':actual,'passed':True})
report={'scope':'Actual source GLB data only; no native render/bake, KTX encoding or public writes. Actual packed material verification is still required.','source':{'path':str(args.blend),'sha256':source_hash},'rawProbe':{'path':str(out),'sha256':sha(out),'bytes':out.stat().st_size},'allExplicitAuthoredBaseColorFactorsMatch':True,'bronzeFactorNonWhiteAndPatinaColor0Present':True,'allRequiredSurfaceTintPrimitivesHaveColor0':True,'materials':materials,'primitives':primitives,'sourceUnchanged':True,'scriptSha256':sha(Path(__file__))}
report['actualExportedCharredWicks']=wick_rows
report['actualExportedPaintedTimberFinish']=painted_finish
path=args.out_dir/'material-audit.json';path.write_text(json.dumps(report,indent=2)+'\n')
print('SOURCE_MATERIAL_EXPORT_PASS',json.dumps({'path':str(path),'sha256':sha(path),'materials':len(materials),'primitives':len(primitives)}),flush=True)
