"""Derive bounded contact padding for selected looks; retain all original transport.
No Cycles/OIDN, geometry, material values or original transport masters change.
"""
import bpy,numpy as np,json,sys,argparse,hashlib,subprocess,shutil,time,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'art/blender'));import bake_export as baker
parser=argparse.ArgumentParser();parser.add_argument('--donors',type=Path,required=True);parser.add_argument('--donor-metadata',type=Path,required=True);parser.add_argument('--out',type=Path,default=ROOT/'art/build/snow-roof-contact-padding-diagnostic');parser.add_argument('--passes',default='night',help='night or night,dusk,day,lamp; no new transport is computed.');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
args.donors=args.donors.resolve();args.donor_metadata=args.donor_metadata.resolve()
passes=args.passes.split(',')
if len(set(passes))!=len(passes) or any(p not in ['night','dusk','day','lamp'] for p in passes):raise ValueError('Choose unique authored pass names.')
modifiedUris={f'{region}-{look}.ktx2' for region in ['court','hall'] for look in passes}
source=ROOT/'art/build/snow-roof-final';base=ROOT/'art/build/snow-roof-float32-position-diagnostic';classification=ROOT/'art/build/fringe-geometry-diagnosis/contact-visibility-classification.json';maskpath=classification.with_name('contact-texel-centres.npz');out=args.out.resolve()
if out==source or out==base or 'public' in out.parts or not out.is_relative_to(ROOT/'art/build'):raise RuntimeError('Separate art/build diagnostic directory required.')
if (out/'manifest.json').exists():raise RuntimeError('Existing diagnostic refused.')
out.mkdir(parents=True,exist_ok=True);h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();same=lambda a,b:np.array_equal(a.view(np.uint32),b.view(np.uint32))
cert=json.loads(classification.read_text());assert h(maskpath)==cert['compactCentres']['sha256']
for item in cert['inputs'].values():assert h(ROOT/item['path'])==item['sha256']
metadata=json.loads(args.donor_metadata.read_text());assert metadata['recipientClassificationSha256']==h(classification);assert metadata['inputs']==cert['inputs'];assert metadata['donorFile']['sha256']==h(args.donors);assert all(c['uniqueOwnerVerified'] for c in metadata['chartOwners']);donors=np.load(args.donors,allow_pickle=False);recipients=np.load(maskpath,allow_pickle=False)
print('DONOR_SCHEMA',donors.files,flush=True)
required={'region','xyBottomLeft','chartRaw','ownerId','validDonor'}
if not required.issubset(donors.files):raise RuntimeError('Explicit donor-valid ownership schema required: '+str(required))
manifest=json.loads((base/'manifest.json').read_text());proof={'policy':'certified-hidden-centres-nearest-visible-same-chart-owner-euclidean8-v1','scope':'Only certified hidden base recipients change. All uncertified/visible original denoised base RGBA samples remain bit-exact. No re-OIDN or new transport. KTX is lossy and its decoded block neighborhoods are measured separately.','classification':{'path':str(classification.relative_to(ROOT)),'sha256':h(classification),'maskSha256':h(maskpath)},'donorMetadata':{'path':str(args.donor_metadata.relative_to(ROOT)),'sha256':h(args.donor_metadata),'dataSha256':h(args.donors)},'geometry':{'sha256':h(base/'snow-roof.glb'),'precision':'genuine FLOAT32, unpruned staging base; optimized production geometry is assembled separately'},'regions':{},'maps':{},'passes':passes,'changedProof':'changed-texels.npz','noRadianceThreshold':True,'scriptSha256':h(Path(__file__)),'sourceBakeFingerprint':manifest['bakeFingerprint']}
scene=bpy.context.scene;scene.view_settings.view_transform='Raw';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
changes={};offsets=sorted([(dx*dx+dy*dy,dy,dx) for dy in range(-8,9) for dx in range(-8,9) if dx*dx+dy*dy<=64])
ktx='/tmp/one-light-ktx-tools/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload/usr/local/bin/toktx'
for code,region in enumerate(['court','hall']):
 with np.load(source/f'{region}-coverage.npz',allow_pickle=False) as data:labels=data['labels'].copy()
 height,width=labels.shape
 eligible=np.flatnonzero((recipients['region']==code)&recipients['hidden']);xy=recipients['xyBottomLeft'][eligible].astype(np.int32);charts=recipients['chartRaw'][eligible].astype(np.int32)
 valid=np.zeros((height,width),bool);owner=np.full((height,width),-1,np.int32);donorchart=np.full((height,width),-1,np.int32)
 selected=(donors['region']==code)&donors['validDonor'];dxy=donors['xyBottomLeft'][selected].astype(np.int32);valid[dxy[:,1],dxy[:,0]]=True;owner[dxy[:,1],dxy[:,0]]=donors['ownerId'][selected];donorchart[dxy[:,1],dxy[:,0]]=donors['chartRaw'][selected]
 # Every recipient receives its same geometric snow-owner label, even though it is not a valid donor.
 selected=donors['region']==code;axy=donors['xyBottomLeft'][selected].astype(np.int32);owner[axy[:,1],axy[:,0]]=donors['ownerId'][selected]
 wantedOwner=owner[xy[:,1],xy[:,0]];assigned=np.zeros(len(xy),bool);targetxy=np.full_like(xy,-1);distance=np.full(len(xy),-1,np.int32)
 for squared,dy,dx in offsets:
  pending=np.flatnonzero(~assigned);tx=xy[pending,0]+dx;ty=xy[pending,1]+dy;inside=(tx>=0)&(tx<width)&(ty>=0)&(ty<height);pending=pending[inside];tx=tx[inside];ty=ty[inside]
  match=valid[ty,tx]&(donorchart[ty,tx]==charts[pending])&(owner[ty,tx]==wantedOwner[pending])&(wantedOwner[pending]>=0)&(labels[ty,tx]==charts[pending]+1)
  take=pending[match];targetxy[take]=np.column_stack([tx[match],ty[match]]);distance[take]=squared;assigned[take]=True
 used=np.flatnonzero(assigned);destination=xy[used];nearest=targetxy[used];assert np.all(labels[destination[:,1],destination[:,0]]==charts[used]+1)
 for look in passes:
  original=manifest['lightmaps'][region][look].copy();master=source/original['source'];raw=source/f'{region}-{look}-raw.exr';before={str(master):h(master),str(raw):h(raw)};assert before[str(master)]==original['masterSha256']
  im=bpy.data.images.load(str(master),check_existing=False);im.colorspace_settings.name='Non-Color';rgba=np.empty(width*height*4,np.float32);im.pixels.foreach_get(rgba);rgba=rgba.reshape(height,width,4);originalRGBA=rgba.copy();rgba[destination[:,1],destination[:,0],:3]=originalRGBA[nearest[:,1],nearest[:,0],:3]
  certified=np.zeros((height,width),bool);certified[xy[:,1],xy[:,0]]=True;unchanged=~certified
  assert same(rgba[unchanged],originalRGBA[unchanged]),'Uncertified/visible samples changed'
  changed=np.any(rgba.view(np.uint32)!=originalRGBA.view(np.uint32),axis=2);assert not np.any(changed&unchanged)
  assert not np.any(valid&certified),'Hidden recipients were used as donors'
  im.pixels.foreach_set(rgba.ravel());im.update();stem=out/f'{region}-{look}-contact-padding';entry=baker.save_linear(scene,im,stem,labels>0,gain=4096);bpy.data.images.remove(im)
  assert entry['scale']==original['scale'] and entry['logRange']==original['logRange'],'Global encoding normalization changed'
  check=bpy.data.images.load(str(stem.with_suffix('.exr')),check_existing=False);check.colorspace_settings.name='Non-Color';roundtrip=np.empty(width*height*4,np.float32);check.pixels.foreach_get(roundtrip);bpy.data.images.remove(check);roundtrip=roundtrip.reshape(height,width,4);assert same(roundtrip,rgba),'Derived EXR is not exact linear FLOAT32';assert same(roundtrip[unchanged],originalRGBA[unchanged])
  for p,digest in before.items():assert h(Path(p))==digest,'Original transport master changed'
  changedxy=np.column_stack(np.nonzero(changed)[::-1]);changes[region+'_xy']=destination;changes[region+'_donor']=nearest;changes[region+'_distanceSquared']=distance[used];changes[region+'_owner']=wantedOwner[used];changes[region+'_chartRaw']=charts[used];changes[region+'_'+look+'_oldRGB']=originalRGBA[destination[:,1],destination[:,0],:3];changes[region+'_'+look+'_newRGB']=rgba[destination[:,1],destination[:,0],:3]
  output=out/f'{region}-{look}.ktx2';subprocess.run([ktx,'--t2','--encode','uastc','--uastc_quality','2','--uastc_rdo_l','1','--uastc_rdo_m','--zcmp','18','--threads','2','--assign_oetf','linear','--assign_primaries','bt709','--mipmap','--levels','3',str(output),*[str(out/name) for name in entry['pngMipmaps']]],check=True)
  data=output.read_bytes();assert int.from_bytes(data[40:44],'little')==3;dfd=int.from_bytes(data[48:52],'little');assert data[dfd+12]==166 and data[dfd+14]==1
  proof['maps'][region+'/'+look]={'certifiedRecipients':len(xy),'recipientsWithin8':len(used),'changedBasePixels':int(changed.sum()),'unassignedHiddenPixels':int((~assigned).sum()),'maximumSourceDistancePixels':float(np.sqrt(distance[used].max())) if len(used) else 0,'uncertifiedAndVisibleBaseRGBAFloatBitsUnchanged':True,'derivedEXRRoundtripBitExact':True,'originalMasters':before,'derivedMaster':{'source':entry['source'],'sha256':h(stem.with_suffix('.exr'))},'changedOutsideCertified':0,'ktxBytes':len(data),'ktxSha256':h(output)}
  updated={**original,**entry,'uri':f'{region}-{look}.ktx2','bytes':len(data),'codec':'uastc','masterSha256':h(stem.with_suffix('.exr')),'transportMaster':{'source':original['source'],'sha256':original['masterSha256']},'samplingDomainExtension':{'policy':proof['policy'],'originalVisibleBasePreserved':True}}
  manifest['lightmaps'][region][look]=updated
  for f in manifest['files']:
   if f['uri']==updated['uri']:f.update(bytes=len(data),sha256=h(output))
  print('CONTACT_PAD_MAP',region,look,json.dumps(proof['maps'][region+'/'+look]),flush=True)
  del rgba,originalRGBA,roundtrip
 proof['regions'][region]={'certifiedRecipients':len(xy),'recipientsWithin8':len(used),'unassignedHiddenPixels':int((~assigned).sum()),'coordinateMappingSharedByAllLooks':True}
 del valid,owner,donorchart,labels
np.savez_compressed(out/'changed-texels.npz',**changes);proof['changedProofSha256']=h(out/'changed-texels.npz')
for f in manifest['files']:
 if f['uri'] not in modifiedUris:
  p=base/f['uri'];assert h(p)==f['sha256'];shutil.copyfile(p,out/f['uri'])
(out/'contact-padding.receipt.json').write_text(json.dumps(proof,indent=2)+'\n');receipt=out/'contact-padding.receipt.json';manifest['files'].append({'uri':receipt.name,'bytes':receipt.stat().st_size,'sha256':h(receipt),'role':'sampling-domain-proof'});manifest['totalBytes']=sum(f['bytes'] for f in manifest['files']);manifest['compression']['contactPaddingDiagnostic']={'uri':receipt.name,'sha256':h(receipt),'passes':[region+'/'+look for region in ['hall','court'] for look in passes],'unchangedMapCount':12-len(modifiedUris),'gate4Unchanged':True,'mode':'production-candidate' if len(passes)==4 else 'two-map-optical-diagnostic','visibleLinearBaseSamplesBitExact':True,'lossyCodecNeighborhoodEffectsNotClaimedBitExact':True}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for f in manifest['files']:assert (out/f['uri']).stat().st_size==f['bytes'] and h(out/f['uri'])==f['sha256']
print('CONTACT_PADDING_DIAGNOSTIC_READY',out,'bytes',manifest['totalBytes'],flush=True)
