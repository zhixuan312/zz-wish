"""Read-only actual OCIO image transforms, without rendering or GPU work."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

import bpy

parser=argparse.ArgumentParser(description=__doc__)
for flag in ['source','out']:parser.add_argument('--'+flag,type=Path,required=True)
parser.add_argument('--extra',type=Path)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
args.out.mkdir(parents=True,exist_ok=True)
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
before=sha(args.source);bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()));scene=bpy.context.scene
def fields(settings,names):return{name:getattr(settings,name,None)for name in names}
view_names=['view_transform','look','exposure','gamma','use_curve_mapping','use_white_balance','temperature','tint','use_hdr_view']
original={'view':fields(scene.view_settings,view_names),'display':scene.display_settings.display_device,'imageFormat':fields(scene.render.image_settings,['file_format','color_mode','color_depth','color_management']),'dither':scene.render.dither_intensity}
levels=[0.,.0001,.0003,.001,.003,.01,.03,.1,.3,1.,3.,10.]
colours={'neutral':[1,1,1],'pure-red':[1,0,0],'strong-red':[1,.01,.003],'warm-red':[1,.05,.02],'dye-a82a1c':[.3915724777393922,.023153366173251363,.011612245176281512],'candle-lit-dye':[.3915724777393922,.023153366173251363*189/255,.011612245176281512*120/255]}
probes=[{'name':name,'level':level,'runtimeEquivalentLinearRGB':[v*level for v in colour]}for name,colour in colours.items()for level in levels]
if args.extra:probes.extend(json.loads(args.extra.read_text()))
image=bpy.data.images.new('Read-only OCIO dark-red probes',width=len(probes),height=1,alpha=True,float_buffer=True)
image.colorspace_settings.name='Linear Rec.709'
pre_exposure=40.
image.pixels[:]=[component for probe in probes for component in [*(v/pre_exposure for v in probe['runtimeEquivalentLinearRGB']),1.]]
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='16';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.color_management='FOLLOW_SCENE';scene.render.dither_intensity=0
def read_png(path):
 data=path.read_bytes();cursor=8;compressed=b'';header=None
 while cursor<len(data):
  size=struct.unpack_from('>I',data,cursor)[0];kind=data[cursor+4:cursor+8];chunk=data[cursor+8:cursor+8+size];cursor+=size+12
  if kind==b'IHDR':header=struct.unpack('>IIBBBBB',chunk)
  elif kind==b'IDAT':compressed+=chunk
 width,height,bits,kind,_,_,interlace=header
 if height!=1 or bits!=16 or kind!=2 or interlace:raise RuntimeError('Expected one-row16bitRGB actual OCIO output')
 raw=zlib.decompress(compressed);method=raw[0];filtered=raw[1:];result=bytearray(len(filtered));bpp=6
 for i,value in enumerate(filtered):
  left=result[i-bpp]if i>=bpp else 0
  if method==0:out=value
  elif method in[1,4]:out=value+left
  elif method==2:out=value
  elif method==3:out=value+left//2
  else:raise RuntimeError('Unsupported PNG filter')
  result[i]=out&255
 return[[v/65535 for v in struct.unpack_from('>HHH',result,x*6)]for x in range(width)]
variants=[]
for label,transform,exposure in [('actual-agx','AgX',original['view']['exposure']),('agx-exposure-zero','AgX',0.),('standard-exposure-control','Standard',original['view']['exposure'])]:
 scene.view_settings.view_transform=transform;scene.view_settings.look='None';scene.view_settings.exposure=exposure
 path=args.out/(label+'.png');image.save_render(str(path.resolve()),scene=scene)
 variants.append({'name':label,'view':fields(scene.view_settings,view_names),'path':str(path),'sha256':sha(path),'displayRGB16':read_png(path)})
bpy.data.images.remove(image)
if sha(args.source)!=before:raise RuntimeError('Read-only source changed')
config=Path(bpy.utils.system_resource('DATAFILES',path='colormanagement/config.ocio'))
if not config.is_file():config=Path(bpy.app.binary_path).resolve().parents[1]/'Resources'/f'{bpy.app.version[0]}.{bpy.app.version[1]}'/'datafiles/colormanagement/config.ocio'
report={'scope':'Actual CPU OCIO via float image.save_render, not a Cycles/EEVEE render; noGPU. Source colour/view settings copied from savedSource17.16bitPNG decode uses exact output bytes, no screenshot sampler. Runtime equivalent linear input divided40 before actualnativeEV.','source':{'path':str(args.source),'sha256':before,'unchanged':True},'blender':bpy.app.version_string,'ocioConfig':{'path':str(config),'sha256':sha(config)},'originalSettings':original,'imageInputSpace':'Linear Rec.709','preExposure':pre_exposure,'probes':probes,'variants':variants,'renderBakeGpuJobs':0}
lut=config.parent/'luts/AgX_Base_sRGB.cube'
report['ocioAgXLut']={'path':str(lut),'sha256':sha(lut),'bytes':lut.stat().st_size}
(args.out/'native-report.json').write_text(json.dumps(report,indent=2)+'\n');print('OCIO_CPU_TERMINAL',json.dumps({'probes':len(probes),'originalSettings':original,'path':str(args.out/'native-report.json')}),flush=True)
