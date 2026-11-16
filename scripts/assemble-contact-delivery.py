"""Assemble a source-bound F32/contact-padding candidate without public writes."""
from pathlib import Path
from hashlib import sha256
from copy import deepcopy
import json,shutil,struct,argparse
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--padding',type=Path,default=ROOT/'art/build/snow-roof-contact-padding-production');p.add_argument('--geometry',type=Path,default=ROOT/'art/build/snow-roof-float32-optimized');p.add_argument('--out',type=Path,default=ROOT/'art/build/snow-roof-final-contact-delivery');a=p.parse_args();a.padding=a.padding.resolve();a.geometry=a.geometry.resolve();a.out=a.out.resolve()
h=lambda p:sha256(p.read_bytes()).hexdigest()
if not a.out.is_relative_to(ROOT/'art/build') or a.out in [a.padding,a.geometry] or (a.out/'manifest.json').exists():raise RuntimeError('New separate art/build destination required.')
m=json.loads((a.padding/'manifest.json').read_text());r=json.loads((a.geometry/'snow-roof.receipt.json').read_text());padding=json.loads((a.padding/'contact-padding.receipt.json').read_text());independent=a.padding/'independent-contact-padding-proof.json'
if not independent.exists():raise RuntimeError('Independent eight-map padding proof required before assembly.')
i=json.loads(independent.read_text());assert len(i['maps'])==8 and i['allOtherMapsByteIdentical'] and i['sourceBakeFingerprintUnchanged'] and i['originalTransportMastersUnchanged'] and i['geometryMatchesExplicitValidatedInput'];assert i['candidateManifestSha256']==h(a.padding/'manifest.json')
assert not m.get('partialPreview') and len(padding['maps'])==8
assert set(padding['maps'])=={region+'/'+look for region in ['court','hall'] for look in ['night','dusk','day','lamp']}
assert all(v['uncertifiedAndVisibleBaseRGBAFloatBitsUnchanged'] and v['changedOutsideCertified']==0 for v in padding['maps'].values())
assert r['inputs']['input']['sha256']==padding['geometry']['sha256']
for item in r['inputs'].values():assert h(ROOT/item['path'])==item['sha256']
geometry=a.geometry/'snow-roof.glb';assert h(geometry)==r['output']['sha256'];assert r['encoding']['positionComponentType']==5126 and r['encoding']['positionFilter']=='NONE' and r['encoding']['quantizationTransformsRun']==0
raw=geometry.read_bytes();length=int.from_bytes(raw[12:16],'little');j=json.loads(raw[20:20+length]);binstart=28+length;binary=raw[binstart:]
positions=[];rough=[]
for mi,mesh in enumerate(j['meshes']):
 for pi,prim in enumerate(mesh['primitives']):
  assert all(k in prim['attributes'] for k in ['POSITION','TEXCOORD_0','TEXCOORD_1','COLOR_0']);acc=j['accessors'][prim['attributes']['POSITION']];view=j['bufferViews'][acc['bufferView']];assert acc['componentType']==5126 and not acc.get('normalized',False) and view['extensions']['EXT_meshopt_compression'].get('filter','NONE')=='NONE';positions.append(acc['componentType']);mat=j['materials'][prim['material']];rough.append({'key':f'{mi}/{pi}','material':mat.get('name'),'minimum':mat.get('extras',{}).get('one_light_min_roughness')})
refs={}
for mat in j['materials']:
 for role,path in [('baseColorTexture',mat.get('pbrMetallicRoughness',{}).get('baseColorTexture')),('metallicRoughnessTexture',mat.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')),('normalTexture',mat.get('normalTexture')),('occlusionTexture',mat.get('occlusionTexture')),('emissiveTexture',mat.get('emissiveTexture'))]:
  if path:
   t=j['textures'][path['index']];idx=t.get('extensions',{}).get('KHR_texture_basisu',{}).get('source',t.get('source'));refs.setdefault(idx,[]).append({'material':mat.get('name'),'slot':role,'texture':path['index']})
images=[]
for i,image in enumerate(j['images']):
 v=j['bufferViews'][image['bufferView']];d=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];dfd=int.from_bytes(d[48:52],'little');images.append({'image':i,'name':image.get('name'),'roles':sorted({v['slot'] for v in refs.get(i,[])}),'references':refs.get(i,[]),'width':int.from_bytes(d[20:24],'little'),'height':int.from_bytes(d[24:28],'little'),'mipLevels':int.from_bytes(d[40:44],'little'),'transfer':'linear' if d[dfd+14]==1 else 'sRGB','codec':{166:'UASTC',163:'ETC1S'}[d[dfd+12]],'bytes':len(d),'sha256':sha256(d).hexdigest()})
a.out.mkdir(parents=True,exist_ok=True)
for f in m['files']:
 if f['uri']=='snow-roof.glb':shutil.copyfile(geometry,a.out/f['uri']);f.update(bytes=geometry.stat().st_size,sha256=h(geometry))
 else:
  source=a.padding/f['uri'];assert source.stat().st_size==f['bytes'] and h(source)==f['sha256'];shutil.copyfile(source,a.out/f['uri'])
for source,name in [(a.geometry/'snow-roof.receipt.json','geometry.receipt.json'),(a.geometry/'independent-geometry-proof.json','independent-geometry-proof.json'),(independent,'independent-contact-padding-proof.json')]:
 shutil.copyfile(source,a.out/name);m['files'].append({'uri':name,'bytes':source.stat().st_size,'sha256':h(source),'role':'delivery-proof'})
c=m['compression'];c.pop('positionPrecisionDiagnostic',None);c.pop('contactPaddingDiagnostic',None)
c['geometryProfile']='source-proven-float32-position-hidden-pruned-exact-weld'
c['geometryCounts']={k:r['output'][k] for k in ['vertices','triangles','geometryBytes']}
c['positionPrecision']={'componentType':5126,'normalized':False,'meshoptFilter':'NONE','authoredFloat32SourcePreserved':True}
c['uvVerification']={'source':'Actual production F32 GLB JSON','meshes':len(j['meshes']),'primitives':len(positions),'colourPrimitives':len(positions),'regions':sorted({n.get('extras',{}).get('lightmap_region') for n in j['nodes'] if n.get('extras',{}).get('lightmap_region')}),'primitiveRoughness':rough,'roughnessClamps':[{'name':mat.get('name'),'minimum':mat['extras']['one_light_min_roughness']} for mat in j['materials'] if mat.get('extras',{}).get('one_light_min_roughness') is not None],'positionComponentTypes':sorted(set(positions)),'extensions':j['extensionsUsed']}
c['images']=images;c['uniqueMaterialImageBytes']=sum(v['bytes'] for v in images);c['bytesByRoleUnion']={}
for i in images:
 key='+'.join(i['roles']);c['bytesByRoleUnion'][key]=c['bytesByRoleUnion'].get(key,0)+i['bytes']
c['optimization']={'receipt':{'uri':'geometry.receipt.json','sha256':h(a.geometry/'snow-roof.receipt.json')},'profile':{**r['profile'],'sha256':h(ROOT/r['profile']['path'])},'independentProof':{'uri':'independent-geometry-proof.json','sha256':h(a.geometry/'independent-geometry-proof.json')},'input':r['input'],'output':r['output'],'encoding':r['encoding'],'authoredPositionProof':r['authoredPositionProof'],'sourceFaceSelection':r['sourceFaceSelection'],'invariants':r['invariants']}
c['contactPadding']={'receipt':{'uri':'contact-padding.receipt.json','sha256':h(a.padding/'contact-padding.receipt.json')},'independentProof':{'uri':independent.name,'sha256':h(independent)},'policy':padding['policy'],'correctedPasses':sorted(padding['maps']),'gate4ByteIdentical':True,'allVisibleAndUncertifiedLinearRGBAFloatBitsExact':True,'originalTransportMastersUnmodified':True,'lossyDecodedSamplesNotClaimedBitExact':True,'geometryApplicability':'Padding certified on exact F32 input; production geometry preserves every retained visible position/UV/color/material attribute and original source bake occluders are retained in the immutable bake source.'}
c['transformOrder']+=['FACE-proven-hidden-export-prune','exact-attribute-record-weld','meshopt-existing-streams-no-new-quantization','certified-hidden-only-nearest-contact-padding']
m['transportProvenance']={'sourceBlendSha256':m['bake']['sourceBlendSha256'],'sourceGeometryFingerprint':m['geometryFingerprint'],'sourceBakeFingerprint':m['bakeFingerprint'],'samples':m['bake']['samples'],'engine':m['bake']['engine'],'sourceNightLighting':m['bake']['sourceNightLighting'],'meaning':'Original64-sample Metal/Cycles+MetalOIDN transport, unchanged. Sampling-domain padding is a separately bound image derivative.'}
m['totalBytes']=sum(f['bytes'] for f in m['files']);(a.out/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
for f in m['files']:assert (a.out/f['uri']).stat().st_size==f['bytes'] and h(a.out/f['uri'])==f['sha256']
for looks in m['lightmaps'].values():
 assert set(looks)=={'night','dusk','day','lamp'}
 for e in looks.values():assert e['samples']==64 and e['bakeDevice']=='METAL' and e['denoiseDevice']=='METAL' and e['mipLevels']==3 and e['anisotropy']==1 and e['logGain']==4096
print('FINAL_CONTACT_DELIVERY',a.out,'bytes',m['totalBytes'],'manifestSHA',h(a.out/'manifest.json'),'sceneSHA',h(geometry))
