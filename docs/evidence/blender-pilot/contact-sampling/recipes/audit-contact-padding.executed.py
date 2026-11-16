import bpy,numpy as np,json,hashlib,math
from pathlib import Path
from collections import Counter
ROOT=Path('/Users/xuan/Documents/code/zz-wish');DIAG=ROOT/'art/build/fringe-geometry-diagnosis';OUT=ROOT/'art/build/snow-roof-contact-padding-diagnostic';BASE=ROOT/'art/build/snow-roof-float32-position-diagnostic';SOURCE=ROOT/'art/build/snow-roof-final'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();same=lambda a,b:np.array_equal(a.view(np.uint32),b.view(np.uint32))
cls=json.loads((DIAG/'contact-visibility-classification.json').read_text());dm=json.loads((DIAG/'contact-valid-donors.json').read_text());receipt=json.loads((OUT/'contact-padding.receipt.json').read_text());manifest=json.loads((OUT/'manifest.json').read_text());baseline=json.loads((BASE/'manifest.json').read_text());recips=dict(np.load(DIAG/'contact-texel-centres.npz'));donors=dict(np.load(DIAG/'contact-valid-donors.npz'));changes=dict(np.load(OUT/'changed-texels.npz'))
assert sha(DIAG/'contact-texel-centres.npz')==cls['compactCentres']['sha256'];assert sha(DIAG/'contact-valid-donors.npz')==dm['donorFile']['sha256'];assert sha(DIAG/'contact-visibility-classification.json')==dm['recipientClassificationSha256'];assert sha(DIAG/'contact-texel-certificates.json')==dm['recipientRecordsSha256']
for item in cls['inputs'].values():assert sha(ROOT/item['path'])==item['sha256']
assert receipt['classification']['sha256']==sha(DIAG/'contact-visibility-classification.json');assert receipt['classification']['maskSha256']==sha(DIAG/'contact-texel-centres.npz');assert receipt['donorMetadata']['sha256']==sha(DIAG/'contact-valid-donors.json');assert receipt['donorMetadata']['dataSha256']==sha(DIAG/'contact-valid-donors.npz');assert receipt['changedProofSha256']==sha(OUT/'changed-texels.npz')
assert manifest['bakeFingerprint']==baseline['bakeFingerprint'];assert receipt['sourceBakeFingerprint']==baseline['bakeFingerprint'];assert sha(OUT/'snow-roof.glb')==sha(BASE/'snow-roof.glb')==receipt['geometry']['sha256']
permitted={};centres={}
for i in range(len(donors['region'])):
 region=int(donors['region'][i]);x,y=map(int,donors['xyBottomLeft'][i]);chart=int(donors['chartRaw'][i]);owner=int(donors['ownerId'][i]);centres[(region,x,y)]=(chart,owner)
 if donors['validDonor'][i]:permitted[(region,x,y)]=(chart,owner)
hidden={(int(r),int(x),int(y)) for r,(x,y),h in zip(recips['region'],recips['xyBottomLeft'],recips['hidden']) if h}
assert not(hidden&set(permitted))
offsets=sorted((dx*dx+dy*dy,dy,dx) for dy in range(-8,9) for dx in range(-8,9) if dx*dx+dy*dy<=64)
report={'scope':'Independent staged two-night-map contact-padding proof. No rendering, baking, OIDN, encoding, source/runtime/public edits. Candidate is optical-only; lossy KTX neighborhoods are not claimed bit-exact.','inputs':cls['inputs'],'sourceClassificationSha256':sha(DIAG/'contact-visibility-classification.json'),'donorMetadataSha256':sha(DIAG/'contact-valid-donors.json'),'donorMaskSha256':sha(DIAG/'contact-valid-donors.npz'),'candidateReceiptSha256':sha(OUT/'contact-padding.receipt.json'),'regions':{},'allOther10MapsByteIdentical':True,'geometryByteIdentical':True,'sourceBakeFingerprintUnchanged':True,'originalTransportMastersUnchanged':True}
def load(path):
 im=bpy.data.images.load(str(path),check_existing=False);im.colorspace_settings.name='Non-Color';a=np.empty(im.size[0]*im.size[1]*4,np.float32);im.pixels.foreach_get(a);shape=(im.size[1],im.size[0],4);bpy.data.images.remove(im);return a.reshape(shape)
for code,region in enumerate(['court','hall']):
 expected={}
 for r,x,y in hidden:
  if r!=code:continue
  co=centres[(r,x,y)]
  for d2,dy,dx in offsets:
   if permitted.get((r,x+dx,y+dy))==co:expected[(x,y)]=(x+dx,y+dy,d2,*co);break
 xy=changes[region+'_xy'];dn=changes[region+'_donor'];ds=changes[region+'_distanceSquared'];owners=changes[region+'_owner'];charts=changes[region+'_chartRaw']
 actual={(int(x),int(y)):(int(dx),int(dy),int(d2),int(c),int(o)) for (x,y),(dx,dy),d2,o,c in zip(xy,dn,ds,owners,charts)}
 assert actual==expected,(region,'Independent closest permitted donor map differs')
 # Require source coverage labels to prove ownership does not cross an atlas island.
 labels=np.load(SOURCE/f'{region}-coverage.npz')['labels']
 for (x,y),(dx,dy,d2,c,o) in actual.items():assert labels[y,x]==c+1 and labels[dy,dx]==c+1
 originalEntry=baseline['lightmaps'][region]['night'];master=SOURCE/originalEntry['source'];raw=SOURCE/f'{region}-night-raw.exr';assert sha(master)==originalEntry['masterSha256'];assert receipt['regions'][region]['originalMasters'][str(master)]==sha(master);assert receipt['regions'][region]['originalMasters'][str(raw)]==sha(raw)
 before=load(master);after=load(OUT/f'{region}-night-contact-padding.exr');assert before.shape==after.shape
 diff=np.any(before.view(np.uint32)!=after.view(np.uint32),axis=2);allowed=np.zeros(diff.shape,bool);allowed[xy[:,1],xy[:,0]]=True
 assert not np.any(diff&~allowed),(region,'Unassigned/visible base pixels changed')
 assert same(before[~allowed],after[~allowed]);assert same(before[:,:,3],after[:,:,3]);assert same(after[xy[:,1],xy[:,0],:3],before[dn[:,1],dn[:,0],:3]);assert same(changes[region+'_oldRGB'],before[xy[:,1],xy[:,0],:3]);assert same(changes[region+'_newRGB'],after[xy[:,1],xy[:,0],:3])
 assert int(diff.sum())==receipt['regions'][region]['changedBasePixels'];assert sha(OUT/f'{region}-night-contact-padding.exr')==receipt['regions'][region]['derivedMaster']['sha256'];assert sha(OUT/f'{region}-night.ktx2')==receipt['regions'][region]['ktxSha256']
 report['regions'][region]={'sourceMasterSha256':sha(master),'sourceRawTransportSha256':sha(raw),'derivedMasterSha256':sha(OUT/f'{region}-night-contact-padding.exr'),'assignedCertifiedHiddenRecipients':len(expected),'actualChangedBaseRGBAFloatPixels':int(diff.sum()),'maximumDonorDistancePixels':math.sqrt(max(v[2] for v in expected.values())),'sameOriginalChartAndOwner':True,'nearestPermittedDonorIncludingTieOrderIndependentlyVerified':True,'allUnassignedAndUncertifiedVisibleBaseFloatBitsExact':True,'allAlphaFloatBitsExact':True,'donorRGBCopiedFloatBitsExact':True,'changedOutsideCertifiedRecipientMask':0}
 del before,after,diff,allowed,labels
for file in baseline['files']:
 if file['uri'] in ['court-night.ktx2','hall-night.ktx2']:continue
 assert sha(BASE/file['uri'])==file['sha256']==sha(OUT/file['uri'])
for file in manifest['files']:assert sha(OUT/file['uri'])==file['sha256'] and (OUT/file['uri']).stat().st_size==file['bytes']
assert manifest['totalBytes']==sum(x['bytes'] for x in manifest['files'])
report['candidateManifestSha256']=sha(OUT/'manifest.json');report['scriptSha256']=sha(Path(__file__));p=OUT/'independent-contact-padding-proof.json';p.write_text(json.dumps(report,indent=2)+'\n');print('INDEPENDENT_CONTACT_PADDING_PASS',json.dumps({'output':str(p),'sha256':sha(p),'regions':report['regions']}),flush=True)
