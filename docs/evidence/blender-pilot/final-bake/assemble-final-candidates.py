from pathlib import Path
from hashlib import sha256
from copy import deepcopy
import json,shutil,argparse
root=Path.cwd();build=root/'art/build';source=build/'snow-roof-final'
h=lambda p:sha256(p.read_bytes()).hexdigest()
expected={'raw':'0deec9fd71d4c49e666e5b091f15af3067efbcdb7e3c350bcb85a2bf7f980dea','prepared':'6ed42644cd3a6c1026b079740957280df0274e9e9a0eaf5f8d3da514725079c1'}
actual={'raw':h(source/'snow-roof.raw.glb'),'prepared':h(source/'snow-roof-prepared.blend')}
assert actual==expected,('Post-batch source identity changed; obtain fresh modeler audits.',actual)
parser=argparse.ArgumentParser();parser.add_argument('--cross',type=Path,required=True);parser.add_argument('--cross-sha',required=True);args=parser.parse_args()
cross=args.cross
assert h(cross)==args.cross_sha
helper=root/'scripts/prune-validated-baked.mjs'
summaries=[];shared=None
for profile in ['quality','mobile']:
 base=build/f'snow-roof-final-{profile}';optimized=build/f'snow-roof-final-{profile}-optimized-postbatch'
 m=json.loads((base/'manifest.json').read_text());receipt=json.loads((optimized/'snow-roof.receipt.json').read_text())
 assert not m.get('partialPreview')
 assert set(m['lightmaps'])=={'court','gate','hall'}
 assert all(set(p)=={'night','dusk','day','lamp'} for p in m['lightmaps'].values())
 assert receipt['inputs']['raw']['sha256']==actual['raw']
 assert receipt['inputs']['preparedBlend']['sha256']==actual['prepared']
 assert h(base/'snow-roof.glb')==receipt['inputs']['input']['sha256']
 assert h(optimized/'snow-roof.glb')==receipt['output']['sha256']
 for file in m['files']:
  path=base/file['uri'];assert path.stat().st_size==file['bytes'] and h(path)==file['sha256']
 lights={f['uri']:f['sha256'] for f in m['files'] if f['uri'].endswith('.ktx2')}
 assert len(lights)==12
 if shared is None:shared=lights
 else:assert shared==lights
 m['compression']['geometryCounts']={k:receipt['input'][k] for k in ['vertices','triangles','geometryBytes']}
 m['compression']['geometryProfile']='full-source-export'
 (base/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
 candidate=deepcopy(m)
 for file in candidate['files']:
  if file['uri']=='snow-roof.glb':
   file.update(bytes=receipt['output']['bytes'],sha256=receipt['output']['sha256'])
  else:shutil.copyfile(base/file['uri'],optimized/file['uri'])
 shutil.copyfile(cross,optimized/'geometry-equivalence.json')
 for name in ['snow-roof.receipt.json','geometry-equivalence.json']:
  path=optimized/name;candidate['files'].append({'uri':name,'bytes':path.stat().st_size,'sha256':h(path),'role':'delivery-proof'})
 candidate['totalBytes']=sum(f['bytes'] for f in candidate['files'])
 candidate['compression']['geometryCounts']={k:receipt['output'][k] for k in ['vertices','triangles','geometryBytes']}
 candidate['compression']['geometryProfile']='proven-hidden-export-prune'
 candidate['compression']['optimization']={'helper':{'path':'scripts/prune-validated-baked.mjs','sha256':h(helper)},'receipt':{'uri':'snow-roof.receipt.json','sha256':h(optimized/'snow-roof.receipt.json'),'profile':receipt['profile']},'crossProfileProof':{'uri':'geometry-equivalence.json','sha256':h(cross)},'inputs':receipt['inputs'],'removedTriangles':receipt['removedTriangles'],'removedVertices':receipt['removedVertices'],'retainedTriangleAttributesBitExact':receipt['invariants']['retainedTriangleAttributesBitExact'],'windingPreserved':receipt['invariants']['windingPreserved'],'imagePayloadBytesUnchanged':receipt['invariants']['imagePayloadBytesUnchanged'],'fullSourceBakeOccludersRetained':True}
 (optimized/'manifest.json').write_text(json.dumps(candidate,indent=2)+'\n')
 assert candidate['bakeFingerprint']==m['bakeFingerprint'] and candidate['geometryFingerprint']==m['geometryFingerprint'] and candidate['lightmaps']==m['lightmaps']
 for folder,data in [(base,m),(optimized,candidate)]:
  for f in data['files']:
   p=folder/f['uri'];assert p.stat().st_size==f['bytes'] and h(p)==f['sha256']
  assert data['totalBytes']==sum(f['bytes'] for f in data['files'])
  summaries.append({'path':str(folder.relative_to(root)),'profile':profile,'optimized':folder==optimized,'manifestSha256':h(folder/'manifest.json'),'assetBytes':data['totalBytes'],'manifestBytes':(folder/'manifest.json').stat().st_size,'referencedBytesIncludingManifest':data['totalBytes']+(folder/'manifest.json').stat().st_size,'sceneBytes':(folder/'snow-roof.glb').stat().st_size,'geometry':data['compression']['geometryCounts'],'lightmapBytes':sum(f['bytes'] for f in data['files'] if f['uri'].endswith('.ktx2'))})
report={'sourceIdentityGate':actual,'lightmapFileHashesIdenticalAcrossAllCandidates':shared,'crossProfileProofSha256':h(cross),'assemblyScriptSha256':h(Path(__file__)),'candidates':summaries,'status':'Complete staged candidates; browser review and live adoption remain separate.'}
(source/'candidate-summary.json').write_text(json.dumps(report,indent=2)+'\n')
for c in summaries:print(c['path'],c['assetBytes'],c['manifestSha256'])
