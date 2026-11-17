"""Bounded Source18 geometry derivative of immutable Source17; CPU only."""
import argparse,hashlib,importlib.util,json,math,sys
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'art/blender'))
from resting_contacts import RestingContacts
from cloud_massif_ledge18 import dress_massif_sides
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--approve-phone145',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=a.source.resolve();out=a.output.resolve();sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
if sha(source)!='6aa1b86785c3126c43902c57381612da468e75edb808ee2d2257d8437595ea73' or out.exists():raise RuntimeError('Frozen Source17 and new output required')
bpy.ops.wm.open_mainfile(filepath=str(source));spec=importlib.util.spec_from_file_location('cloud_source',ROOT/'art/blender/cloud_cliff.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for name in ['STATIC','HERO','LIGHTS','CAMERAS','RUNTIME']:setattr(m,name,bpy.data.collections[name])
m.TARGET=m.STATIC;m.REGION='far';m.CONTACTS=RestingContacts.from_scene();m.SUPPORTS.extend(json.loads(bpy.context.scene['cloud_cliff_structural_supports']));m.SCANS.extend(json.loads(bpy.context.scene['cloud_cliff_asset_sources']))
hosts=sorted([o for o in m.STATIC.objects if o.name.startswith('Far photographic rock massif')],key=lambda o:o.name)
created,boundary=dress_massif_sides(m,hosts);scene=bpy.context.scene;scene['cloud_cliff_asset_sources']=json.dumps(m.SCANS);scene['source18_geologic_boundary_audit']=json.dumps(boundary)
scene['cloud_cliff_phone_view_proposal']=json.dumps({'position':[5.2,1.45,4.8],'target':[3.77,.62,-5.0],'fov':49,'size':[390,844],'status':'CPU projection/clearance proposal only; original actual cover cameras remain unchanged pending Root selection.'})
if a.approve_phone145:
    view={'position':[5.2,1.45,4.8],'target':[3.77,.62,-5.0],'fov':49,'size':[390,844]};camera=bpy.data.objects['Reference_cover-phone'];camera.location=m.point(view['position']);camera.rotation_euler=(m.point(view['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=24;camera.data.lens=12/math.tan(math.radians(view['fov'])/2)
    views=json.loads(scene['cloud_cliff_cover_views']);views['Reference_cover-phone']=view;scene['cloud_cliff_cover_views']=json.dumps(views);scene['cloud_cliff_phone_view_proposal']=json.dumps({**view,'status':'Root-approved actual source18 CPU projection: body161–328px,42px toform370,actual geometry clearance0.56483m; final native/runtime optics still pending.'});scene['cloud_cliff_camera_audit']=json.dumps(m.camera_audit(scene))
scene['cloud_cliff_source_revision']='v18 CPU geometry candidate: Source17 original meshes, medium and lighting unchanged; real closed CC0 rock ledges bury actual top/side crop segments above Y=-65; no compositor or opacity mask. '+('Phone camera uses the Root-approved 1.45m/FOV49 pose; native/runtime optics remain pending.' if a.approve_phone145 else 'Phone camera proposal is metadata only; actual camera remains unchanged.')
bounds=json.loads(scene['cloud_cliff_far_world_bounds']);graph=bpy.context.evaluated_depsgraph_get();points=[];rows=[]
for obj in m.STATIC.objects:
    if obj.type!='MESH' or obj.get('region')!='far':continue
    ev=obj.evaluated_get(graph);data=ev.to_mesh();local=[m.engine(ev.matrix_world@v.co)for v in data.vertices];points.extend(local);rows.append({'name':obj.name,'min':[min(p[k]for p in local)for k in range(3)],'max':[max(p[k]for p in local)for k in range(3)]});ev.to_mesh_clear()
bounds['terrain']={'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)],'objects':rows};scene['cloud_cliff_far_world_bounds']=json.dumps(bounds)
recipes=[Path(__file__),ROOT/'art/blender/cloud_massif_ledge18.py',ROOT/'art/blender/cloud_cliff.py'];scene['cloud_source_authoring_recipes']=json.dumps([{'path':str(path.relative_to(ROOT)),'sha256':sha(path)}for path in recipes])
bpy.context.view_layer.update();audit=m.CONTACTS.audit(fail=True);hero=json.loads(scene['one_light_export_heroes'])[0];scene['one_light_hanging_audit']=json.dumps(m.suspension_audit(hero))
if not json.loads(scene['one_light_hanging_audit'])['passed']:raise RuntimeError('Actual hanging contact failed')
out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out));report=m.cpu_report(scene,audit,out);report['derivationSource']={'path':str(source.relative_to(ROOT)),'sha256':sha(source)};report['authoringRecipes']=json.loads(scene['cloud_source_authoring_recipes']);report['physicalBoundaryCertificates']=boundary
out.with_suffix('.audit.json').write_text(json.dumps(report,indent=2)+'\n');print('SOURCE18_CPU_CANDIDATE',str(out),sha(out),len(created),boundary['allSelectedBoundaryEdgesPhysicallyBuried'],flush=True)
