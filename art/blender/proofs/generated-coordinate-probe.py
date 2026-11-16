import bpy,json,sys,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'art/blender'))
import bake_export as baker
scene=bpy.context.scene
class Options:device='METAL';samples=1;skip_bake=False;export_only=False
baker.configure_cycles(scene,Options())
o=bpy.data.objects['Snow over bench'];baker.select_only([o]);m=o.data
loc=np.array(m.texspace_location);size=np.array(m.texspace_size)
p=np.array([list(v.co) for v in m.vertices]);a=m.attributes.new(name='probeGenerated',type='FLOAT_VECTOR',domain='POINT');a.data.foreach_set('vector',((p-loc)/(2*size)+.5).astype('float32').ravel())
uv=m.uv_layers.new(name='ProbeUV');m.uv_layers.active=uv
for face in m.polygons:
 col=face.index%3;row=face.index//3
 for corner,li in enumerate(face.loop_indices):
  u,v=[(.1,.1),(.9,.1),(.9,.9),(.1,.9)][corner%4];uv.data[li].uv=((col+u)/3,(row+v)/2)
mat=bpy.data.materials.new('PROBE_GENERATED');mat.use_nodes=True;o.data.materials.clear();o.data.materials.append(mat);n=mat.node_tree.nodes;n.clear();tc=n.new('ShaderNodeTexCoord');at=n.new('ShaderNodeAttribute');at.attribute_name='probeGenerated';em=n.new('ShaderNodeEmission');out=n.new('ShaderNodeOutputMaterial');target=n.new('ShaderNodeTexImage');mat.node_tree.links.new(em.outputs[0],out.inputs['Surface'])
results={}
for name,socket in [('sourceGenerated',tc.outputs['Generated']),('interpolatedPoint',at.outputs['Vector'])]:
 mat.node_tree.links.new(socket,em.inputs['Color']);img=bpy.data.images.new('probe-'+name,width=192,height=128,float_buffer=True,alpha=True);img.colorspace_settings.name='Non-Color';target.image=img;n.active=target;bpy.ops.object.bake(type='EMIT',use_clear=True,uv_layer='ProbeUV',margin=0);v=np.array(img.pixels[:],dtype=np.float32).reshape(-1,4);results[name]=v.copy();bpy.data.images.remove(img)
g=bpy.context.evaluated_depsgraph_get();ev=bpy.data.meshes.new_from_object(o.evaluated_get(g),preserve_all_data_layers=True,depsgraph=g);o.modifiers.clear();o.data=ev
p=np.array([list(v.undeformed_co) for v in ev.vertices]);a=ev.attributes['probeGenerated'];a.data.foreach_set('vector',((p-loc)/(2*size)+.5).astype('float32').ravel());mat.node_tree.links.new(at.outputs['Vector'],em.inputs['Color']);img=bpy.data.images.new('probe-affine',width=192,height=128,float_buffer=True,alpha=True);img.colorspace_settings.name='Non-Color';target.image=img;n.active=target;bpy.ops.object.bake(type='EMIT',use_clear=True,uv_layer='ProbeUV',margin=0);results['evaluatedUndeformed']=np.array(img.pixels[:],dtype=np.float32).reshape(-1,4)
ref=results['sourceGenerated'];valid=np.max(ref[:,:3],axis=1)>1e-4
report={'sourceObject':'Snow over bench','sourceBlend':bpy.data.filepath,'device':'METAL','type':'EMIT','samples':1,'pixels':int(valid.sum()),'comparisons':{}}
for k,v in results.items():
 d=np.abs(v[valid,:3]-ref[valid,:3]);report['comparisons'][k]={'maxAbs':float(d.max()),'meanAbs':float(d.mean()),'p99Abs':float(np.percentile(d,99))}
print('GENERATED_COORDINATE_PROOF',json.dumps(report),flush=True);Path('art/build/snow-roof-final/generated-emission-proof.json').write_text(json.dumps(report,indent=2)+'\n')
