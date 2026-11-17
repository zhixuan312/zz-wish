"""Two native cover projections using the shared Metal/OIDN preview runner."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import runpy
import sys
import importlib.util
import bpy

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--samples',type=int,default=8);p.add_argument('--look',choices=['authored','dusk','day'],default='authored')
p.add_argument('--views',choices=['both','desktop','phone'],default='both');p.add_argument('--scale',type=float,default=1.0)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.source=a.source.resolve();a.out=a.out.resolve()
if not 0<a.scale<=1:raise RuntimeError('Preview scale must be in(0,1]')
authored_source=a.source;authored_hash=sha256(a.source.read_bytes()).hexdigest();preset=None
if a.look!='authored':
    bpy.ops.wm.open_mainfile(filepath=str(a.source))
    spec=importlib.util.spec_from_file_location('one_light_cover_baker',ROOT/'art/blender/bake_export.py');baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
    snapshot=baker.snapshot_lighting(bpy.context.scene);baker.configure_light_pass(bpy.context.scene,a.look,snapshot);preset=dict(baker.PRESETS[a.look])
    for obj,energy,colour in snapshot[0]:
        if obj.get('bake_role')=='lamp':obj.data.energy=energy
    a.out.mkdir(parents=True,exist_ok=True);a.source=a.out/f'preview-only-{a.look}-lamp-on.blend'
    if a.source.exists():raise RuntimeError('Preserve earlier look candidates; choose a fresh output directory.')
    bpy.ops.wm.save_as_mainfile(filepath=str(a.source))
for name,source_width,source_height in [('desktop',1440,900),('phone',390,844)]:
    if a.views!='both' and name!=a.views:continue
    width=round(source_width*a.scale);height=round(source_height*a.scale)
    if abs(width/height-source_width/source_height)>1e-9:raise RuntimeError('Scaled preview must preserve the actual source projection aspect')
    directory=a.out/name
    sys.argv=[str(ROOT/'art/blender/preview.py'),'--','--scene',str(a.source),'--output',str(directory),'--cameras','Reference_cover-'+name,'--samples',str(a.samples),'--width',str(width),'--height',str(height),'--look','authored']
    runpy.run_path(str(ROOT/'art/blender/preview.py'),run_name='__cloud_preview__')
    metadata=json.loads((directory/'preview.json').read_text())
    metadata['sourceScript']=str(ROOT/'art/blender/cloud_cliff.py')
    metadata['sourceSha256']=sha256((ROOT/'art/blender/cloud_cliff.py').read_bytes()).hexdigest()
    metadata['denoisingUseGPU']=True;metadata['denoiserBackend']='OpenImageDenoise Metal (Cycles denoising_use_gpu=True)'
    metadata['authoredSource']=str(authored_source);metadata['authoredSourceBlendSha256']=authored_hash
    metadata['look']=a.look;metadata['appliedPreset']=preset
    metadata['previewOnlyOverrides']={'lampFactor':1,'transientLookClone':a.look!='authored'}
    metadata['lightingScope']=f'{a.look} source look with45W storm lamp basis ON; lamp preview override is not baked into the ambient pass. Source snapshot is immutable; this is not a baked-runtime colour match.'
    metadata['resolutionScope']={'sourceViewport':[source_width,source_height],'renderViewport':[width,height],'scale':a.scale,'sameCameraFovAndAspect':True}
    (directory/'preview.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('CLOUD_NATIVE_VIEW_READY',name,str(directory),metadata['blendSha256'],flush=True)
