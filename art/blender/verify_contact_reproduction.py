"""Verify portable Snow contact recipes reproduce frozen certificate/donor arrays.
Blender Python CPU arrays only; no model changes, rendering, bakes or encoding.
"""
import argparse,hashlib,json,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--original',type=Path,required=True);p.add_argument('--recipient-reproduction',type=Path,required=True);p.add_argument('--donor-reproduction',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);a.out=a.out.resolve()
if not a.out.is_relative_to(ROOT) or a.out.exists():raise RuntimeError('New repository proof path required')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def arrays_equal(x,y):
 with np.load(x,allow_pickle=False) as left,np.load(y,allow_pickle=False) as right:
  assert left.files==right.files
  rows=[]
  for name in left.files:
   l=left[name];r=right[name];assert l.dtype==r.dtype and l.shape==r.shape and l.tobytes()==r.tobytes(),name
   rows.append({'name':name,'shape':list(l.shape),'dtype':str(l.dtype),'sha256':hashlib.sha256(l.tobytes()).hexdigest()})
  return rows
record='contact-texel-certificates.json';assert sha(a.original/record)==sha(a.recipient_reproduction/record)
r=arrays_equal(a.original/'contact-texel-centres.npz',a.recipient_reproduction/'contact-texel-centres.npz');d=arrays_equal(a.original/'contact-valid-donors.npz',a.donor_reproduction/'contact-valid-donors.npz')
report={'scope':'Portable source-bound recipes reproduce original contact permissions exactly; NPZ ZIP container timestamps may differ, decoded arrays and full JSON certificates are byte-exact.','originalRecipientMetadataSha256':sha(a.original/'contact-visibility-classification.json'),'originalDonorMetadataSha256':sha(a.original/'contact-valid-donors.json'),'reproducedRecipientMetadataSha256':sha(a.recipient_reproduction/'contact-visibility-classification.json'),'reproducedDonorMetadataSha256':sha(a.donor_reproduction/'contact-valid-donors.json'),'fullTexelCertificateJsonSha256':sha(a.original/record),'recipientArrays':r,'donorArrays':d,'scripts':{str(path.relative_to(ROOT)):sha(path) for path in [ROOT/'art/blender/classify_snow_contact.py',ROOT/'art/blender/certify_snow_contact_donors.py',Path(__file__).resolve()]},'modelRenderBakeImageOrPublicWrites':False}
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,indent=2)+'\n');print('CONTACT_PORTABLE_REPRODUCTION_PASS',a.out,sha(a.out),flush=True)
