"""Six closed photographic massifs replacing only six rejected open scans."""
import argparse,hashlib,importlib.util,json,math,sys
from collections import Counter,defaultdict
from pathlib import Path
import bpy,bmesh
from mathutils import Matrix,Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'art/blender'))
from resting_contacts import RestingContacts
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=a.source.resolve();out=a.output.resolve();sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
if sha(source)!='6aa1b86785c3126c43902c57381612da468e75edb808ee2d2257d8437595ea73' or out.exists():raise RuntimeError('Immutable Source17 and a new output required')
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
spec=importlib.util.spec_from_file_location('cloud_source19_base',ROOT/'art/blender/cloud_cliff.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for name in ['STATIC','HERO','LIGHTS','CAMERAS','RUNTIME']:setattr(m,name,bpy.data.collections[name])
m.TARGET=m.STATIC;m.REGION='far';m.CONTACTS=RestingContacts.from_scene();m.SUPPORTS.extend(json.loads(scene['cloud_cliff_structural_supports']));m.SCANS.extend(json.loads(scene['cloud_cliff_asset_sources']))
# Explicitly approved source camera. All remaining source cameras are retained.
view={'position':[5.2,1.45,4.8],'target':[3.77,.62,-5.0],'fov':49,'size':[390,844]}
phone=bpy.data.objects['Reference_cover-phone'];phone.location=m.point(view['position']);phone.rotation_euler=(m.point(view['target'])-phone.location).to_track_quat('-Z','Y').to_euler();phone.data.sensor_fit='VERTICAL';phone.data.sensor_height=24;phone.data.lens=12/math.tan(math.radians(49)/2)
views=json.loads(scene['cloud_cliff_cover_views']);views['Reference_cover-phone']=view;scene['cloud_cliff_cover_views']=json.dumps(views)
bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
def bounds(points):return {'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)]}
def projected(points,camera):
    width,height=json.loads(camera['cover_viewport']);scene.render.resolution_x=width;scene.render.resolution_y=height
    q=[world_to_camera_view(scene,camera,m.point(p))for p in points]
    return[min(p.x for p in q)*width,(1-max(p.y for p in q))*height,max(p.x for p in q)*width,(1-min(p.y for p in q))*height]
cameras=[bpy.data.objects['Reference_cover-desktop'],phone];old=[]
for obj in sorted([o for o in m.STATIC.objects if o.name.startswith('Far photographic rock massif')],key=lambda o:o.name):
    ev=obj.evaluated_get(graph);mesh=ev.to_mesh();mesh.calc_loop_triangles();points=[m.engine(ev.matrix_world@v.co)for v in mesh.vertices]
    old.append({'name':obj.name,'worldBounds':bounds(points),'triangles':len(mesh.loop_triangles),'projectedBounds':{c.name:projected(points,c)for c in cameras}});ev.to_mesh_clear()
if len(old)!=6:raise RuntimeError('Exactly the six declared rejected open massifs required')
old_names={row['name']for row in old}
for name in old_names:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
m.SCANS[:]=[row for row in m.SCANS if not(set(row.get('objects',[]))&old_names)]
imports=m.scan_cliff('rock_moss_set_01',(0,0,0),(1,1,1),ratio=.25,region='far',lean=0)
for obj in imports:
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-10);bm.to_mesh(obj.data);bm.free();obj.data.update();obj.data.calc_loop_triangles()
    for mod in obj.modifiers:mod.ratio=min(1,1600/max(1,len(obj.data.loop_triangles)))
bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();templates={}
for index,obj in enumerate(imports):
    if index==3:continue # Actual source variant04 is nonmanifold; never selected.
    ev=obj.evaluated_get(graph);mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
    normals=[n.vector.copy()for n in mesh.corner_normals];templates[index]={'mesh':mesh,'normals':normals,'triangles':len(mesh.loop_triangles)}
for obj in imports:bpy.data.objects.remove(obj,do_unlink=True)
rows=[];created=[];choices=[0,1,2,4,5,2]
for index,old_row in enumerate(old):
    template=templates[choices[index]];mesh=template['mesh'].copy();points=[m.engine(v.co)for v in mesh.vertices]
    # Stand the photographed longest axis upright, with unequal rigid yaw.
    yaw=[.13,-.27,.32,-.18,.39,-.34][index];R=Matrix.Rotation(yaw,3,'Y')@Matrix.Rotation(math.pi/2,3,'X')
    rotated=[R@Vector(p)for p in points];local=bounds(rotated);target=old_row['worldBounds'];span=[target['max'][k]-target['min'][k]for k in range(3)]
    low=[target['min'][0]+span[0]*.035,target['min'][1]+1,target['min'][2]+.5]
    high=[target['max'][0]-span[0]*.035,target['max'][1]-1,target['max'][2]-1]
    height_factor=1
    for attempt in range(80):
        fitted=[];scale=[(high[k]-low[k])/(local['max'][k]-local['min'][k])for k in range(3)];scale[1]*=height_factor
        for p0 in rotated:fitted.append(Vector(tuple(low[k]+(p0[k]-local['min'][k])*scale[k]for k in range(3))))
        projections={c.name:projected(fitted,c)for c in cameras}
        if all(projections[c.name][1]>=old_row['projectedBounds'][c.name][1]-2 for c in cameras):break
        height_factor*=.99
    else:raise RuntimeError('Closed scan cannot fit actual prior skyline envelope')
    transform=Matrix.Diagonal(Vector(scale))@R;normal_matrix=transform.inverted().transposed()
    for vertex,p0 in zip(mesh.vertices,fitted):vertex.co=m.point(p0)
    attr=mesh.attributes.get('custom_normal')
    if attr:mesh.attributes.remove(attr)
    attr=mesh.attributes.new('custom_normal','FLOAT_VECTOR','CORNER')
    for li,n in enumerate(template['normals']):
        direction=normal_matrix@Vector(m.engine(n));direction.normalize();attr.data[li].vector=m.point(direction)
    mesh.update();name='Far closed scanned massif %02d'%(index+1);obj=bpy.data.objects.new(name,mesh);m.STATIC.objects.link(obj);m.tag(obj,'far')
    obj['source_cc0_asset']='rock_moss_set_01';obj['source_file']='web/public/models/rock_moss_set_01/rock_moss_set_01.gltf';obj['source_sha256']=m.digest(ROOT/obj['source_file'])
    row={'object':name,'replaces':old_row['name'],'sourceVariant':choices[index]+1,'lodTriangles':template['triangles'],'lodTargetTriangles':1600,'old':old_row,'newWorldBounds':bounds(fitted),'newProjectedBounds':projections,'actualHeightFactor':height_factor,'engineAffineLinearRows':[list(row)for row in transform],'policy':'One real closed scanned rock per old open wall, affine-fitted inside old actual world envelope with front at least1m behind its prior front. Actual source UV0/photographic PBR unchanged; imported LOD corner normals transformed by inverse transpose. Both actual cover skylines bounded by prior projected top minus2px. No83ledges or geometric crop mask.'}
    obj['source19_massif_replacement']=json.dumps(row);rows.append(row);created.append(obj)
m.SCANS[-1]['objects']=[o.name for o in created];m.SCANS[-1]['purpose']='Six real closed photographic massifs replacing only six rejected open scans, preserving original skyline/world bounds.'
scene['cloud_cliff_asset_sources']=json.dumps(m.SCANS);scene['source19_massif_replacements']=json.dumps(rows)
scene['cloud_cliff_source_revision']='v19 CPU source candidate: only six rejected open far-rock walls replaced with six actual watertight CC0 scans at1600triLOD; all other Source17 physical meshes/medium/lighting unchanged. Root-approved phone1.45m/FOV49. Actual native/runtime optics pending.'
scene['cloud_source_authoring_recipes']=json.dumps([{'path':str(Path(__file__).relative_to(ROOT)),'sha256':sha(Path(__file__))},{'path':'art/blender/cloud_cliff.py','sha256':sha(ROOT/'art/blender/cloud_cliff.py')}])
bpy.context.view_layer.update();audit=m.CONTACTS.audit(fail=True);hero=json.loads(scene['one_light_export_heroes'])[0];scene['one_light_hanging_audit']=json.dumps(m.suspension_audit(hero));scene['cloud_cliff_camera_audit']=json.dumps(m.camera_audit(scene))
far=json.loads(scene['cloud_cliff_far_world_bounds']);P=[];objects=[];graph=bpy.context.evaluated_depsgraph_get()
for obj in created:
    ev=obj.evaluated_get(graph);data=ev.to_mesh();q=[m.engine(ev.matrix_world@v.co)for v in data.vertices];P.extend(q);objects.append({'name':obj.name,**bounds(q)});ev.to_mesh_clear()
far['terrain']={**bounds(P),'objects':objects};scene['cloud_cliff_far_world_bounds']=json.dumps(far)
out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out));report=m.cpu_report(scene,audit,out);report['derivationSource']={'path':str(source.relative_to(ROOT)),'sha256':sha(source)};report['replacements']=rows;report['authoringRecipes']=json.loads(scene['cloud_source_authoring_recipes']);out.with_suffix('.audit.json').write_text(json.dumps(report,indent=2)+'\n')
print('SOURCE19_CPU_READY',str(out),sha(out),json.dumps(report['trianglesByRegion']),flush=True)
