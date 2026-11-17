"""Read-only exact evaluated Source16→17 physical-scope audit. No render."""
import argparse,array,hashlib,json,math,struct,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector
p=argparse.ArgumentParser();p.add_argument('--before',type=Path,required=True);p.add_argument('--after',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--approved-phone145',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);sha=lambda b:hashlib.sha256(b).hexdigest()
def pack(values):return array.array('f',values).tobytes()
def scene_snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()));scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();meshes={};surfaces={}
    for obj in scene.objects:
        if obj.type!='MESH' or not(obj.get('one_light_static') or obj.get('one_light_dynamic')):continue
        ev=obj.evaluated_get(graph);mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles();normal_matrix=ev.matrix_world.to_3x3().inverted().transposed();uv=mesh.uv_layers.get('UVMap');col=mesh.color_attributes.get('SurfaceTint');col=col if col and col.domain=='CORNER' else None;corners=[];positions=[];uvs=[];normals=[];tints=[]
        for li,loop in enumerate(mesh.loops):
            pt=ev.matrix_world@mesh.vertices[loop.vertex_index].co;n=normal_matrix@mesh.corner_normals[li].vector;n.normalize();tex=tuple(uv.data[li].uv)if uv else(0,0);color=tuple(col.data[li].color)if col else(1,1,1,1)
            P=pack(pt);N=pack(n);U=pack(tex);C=pack(color);positions.append(P);normals.append(N);uvs.append(U);tints.append(C);corners.append(P+N+U+C)
        records=[];p_records=[];uv_records=[];t_records=[];mats=[]
        for tri in mesh.loop_triangles:
            material=mesh.materials[tri.material_index].name if mesh.materials[tri.material_index] else '';m=material.encode()+b'\0';ids=list(tri.loops)
            def canonical(values):v=[values[i]for i in ids];return m+min(b''.join(v[k:]+v[:k])for k in range(3))
            records.append(canonical(corners));p_records.append(canonical(positions));uv_records.append(canonical(uvs));t_records.append(canonical(tints));mats.append(material)
        meshes[obj.name]={'region':obj.get('region'),'hero':bool(obj.get('one_light_dynamic')),'vertices':len(mesh.vertices),'triangles':len(records),'cornerFieldsSha256':sha(b''.join(sorted(records))),'positionTrianglesSha256':sha(b''.join(sorted(p_records))),'materialUv0TrianglesSha256':sha(b''.join(sorted(uv_records))),'materialTintTrianglesSha256':sha(b''.join(sorted(t_records))),'materialCounts':{k:mats.count(k)for k in set(mats)},'matrixWorld':list(sum((list(r)for r in obj.matrix_world),[])),'boundary17':json.loads(obj.get('scan_boundary17_scope','null'))}
        ev.to_mesh_clear()
    used_materials={mat.name for obj in scene.objects if obj.type=='MESH' and(obj.get('one_light_static')or obj.get('one_light_dynamic')) for mat in obj.data.materials if mat}
    for mat in bpy.data.materials:
        if mat.name not in used_materials:continue
        if not mat.use_nodes or mat.name.startswith(('Cloud eroded','Cloud clear blue')):continue
        nodes=list(mat.node_tree.nodes);rows=[]
        for node in nodes:
            def default(socket):
                value=getattr(socket,'default_value',None)
                if value is None:return None
                return value if isinstance(value,(str,int,float,bool))else list(value)
            row={'type':node.bl_idname,'inputs':[default(s)for s in node.inputs]}
            for key in ['operation','blend_type','data_type','attribute_name']:
                if hasattr(node,key):row[key]=getattr(node,key)
            if hasattr(node,'image')and node.image:row['image']={'path':str(Path(bpy.path.abspath(node.image.filepath)).resolve()),'space':node.image.colorspace_settings.name}
            rows.append(row)
        links=sorted((nodes.index(l.from_node),list(l.from_node.outputs).index(l.from_socket),nodes.index(l.to_node),list(l.to_node.inputs).index(l.to_socket))for l in mat.node_tree.links)
        surfaces[mat.name]=sha(json.dumps({'nodes':rows,'links':links},sort_keys=True).encode())
    lights={o.name:{'matrixWorld':list(sum((list(r)for r in o.matrix_world),[])),'type':o.data.type,'energy':o.data.energy,'colour':list(o.data.color),'radius':getattr(o.data,'shadow_soft_size',None),'size':getattr(o.data,'size',None),'role':o.get('bake_role')}for o in scene.objects if o.type=='LIGHT'}
    cameras={o.name:{'matrixWorld':list(sum((list(r)for r in o.matrix_world),[])),'lens':o.data.lens,'sensorWidth':o.data.sensor_width,'sensorHeight':o.data.sensor_height,'sensorFit':o.data.sensor_fit,'viewport':o.get('cover_viewport')}for o in scene.objects if o.type=='CAMERA'}
    world=[(list(n.inputs['Color'].default_value),n.inputs['Strength'].default_value)for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'];fields=json.loads(scene['one_light_anchor_fields']);anchors={key:scene[key]for key in fields};contacts=json.loads(scene['resting_contact_audit']);hanging=json.loads(scene['one_light_hanging_audit']);contract=json.loads(scene['cloud_cliff_live_clouds'])
    return{'path':str(path),'sha256':sha(path.read_bytes()),'meshes':meshes,'materials':surfaces,'lights':lights,'cameras':cameras,'world':world,'anchors':anchors,'contactAudit':contacts,'hanging':hanging,'contract':contract}
before=scene_snapshot(a.before);after=scene_snapshot(a.after);names=set(before['meshes'])|set(after['meshes']);protected=[];far=[];failures=[]
added=[]
for name in sorted(names):
    old=before['meshes'].get(name);new=after['meshes'].get(name)
    if old is None and new is not None and name.startswith('Far real fractured boundary ledge '):
        added.append({'name':name,**new});continue
    if old is None or new is None:failures.append({'object':name,'reason':'Unexpected missing/additional protected object'});continue
    exact=old==new;protected.append({'name':name,'exact':exact,'before':old['cornerFieldsSha256'],'after':new['cornerFieldsSha256']})
    if not exact:failures.append({'object':name,'reason':'Protected actual evaluated fields differ','before':old,'after':new})
fields=['lights','world','anchors'];global_checks={key:before[key]==after[key]for key in fields}
phone_check=None
if a.approved_phone145:
    name='Reference_cover-phone';origin=Vector((5.2,-4.8,1.45));target=Vector((3.77,5,.62));rotation=(target-origin).to_track_quat('-Z','Y');matrix=Matrix.Translation(origin)@rotation.to_matrix().to_4x4();expected=list(sum((list(r)for r in matrix),[]));actual=after['cameras'][name]
    matrix_error=max(abs(x-y)for x,y in zip(expected,actual['matrixWorld']));lens_error=abs(actual['lens']-12/math.tan(math.radians(49)/2))
    phone_check={'allowedChange':'Only Root-approved actual phone position [5.2,1.45,4.8], target [3.77,.62,-5], vertical FOV49.','actual':actual,'expectedWorldMatrix':expected,'maximumMatrixComponentError':matrix_error,'lensErrorMillimetres':lens_error,'passed':matrix_error<=1e-6 and lens_error<=2e-6 and actual['sensorHeight']==24 and actual['sensorFit']=='VERTICAL'}
    global_checks['approvedPhoneCameraOnly']=phone_check['passed']and set(before['cameras'])==set(after['cameras'])and all(before['cameras'][key]==after['cameras'][key]for key in before['cameras']if key!=name)
else:global_checks['cameras']=before['cameras']==after['cameras']
global_checks['existingUsedMaterialsUnchanged']=all(after['materials'].get(key)==value for key,value in before['materials'].items())
new_materials=sorted(set(after['materials'])-set(before['materials']));global_checks['onlyRegisteredRockMaterialsAdded']=all(name.startswith('rock_moss_set_01')for name in new_materials)
for key,passed in global_checks.items():
    if not passed:failures.append({'field':key,'reason':'Protected global data differs'})
old_cloud=before['contract'];new_cloud=after['contract'];cloud_checks={key:old_cloud[key]==new_cloud[key]for key in['banks','bankGroups','substrate','bounds','noise','domainWarp','flowEngine','timeOrigin','nativeTime','albedoLinear','anisotropy']}
if before['contract']!=after['contract']:failures.append({'field':'entire physical medium contract','passed':False})
if not all(cloud_checks.values()):failures.append({'field':'cloud base','checks':cloud_checks})
contact_pass=after['contactAudit']['passed']and len(after['contactAudit']['groups'])==18;hanging_pass=after['hanging']['passed']
if not contact_pass or not hanging_pass:failures.append({'field':'actual contacts/hanging','passed':False})
result={'version':1,'before':{'path':before['path'],'sha256':before['sha256']},'after':{'path':after['path'],'sha256':after['sha256']},'passed':not failures,'globalByteExact':global_checks,'approvedPhoneProjection':phone_check,'unchangedBaseCloudContractFields':cloud_checks,'protectedObjects':protected,'farBoundaryObjects':far,'addedRealRockObjects':added,'newMaterialNames':new_materials,'materialDifferences':[{'name':key,'before':value,'after':after['materials'].get(key)}for key,value in before['materials'].items()if after['materials'].get(key)!=value],'entireMediumContractByteExact':before['contract']==after['contract'],'actualRestingGroups':len(after['contactAudit']['groups']),'restingPassed':contact_pass,'hangingPassed':hanging_pass,'failures':failures,'scope':'Unused Blender orphan materials are outside transport (the first diagnostic flagged only unused startup Material being purged). Every used original material remains exact. Source17→18 only registered closed rock attachments allowed; every original mesh including all6far is exact. Actual per-object evaluated world POSITION/NORMAL/UV0/SurfaceTint/material cyclic triangle records and physical globals. The approved phone camera is checked against its exact declared pose and vertical projection when explicitly requested; all other cameras remain exact. No array-order-only equality assumption.','renderBakeGpuJobs':False,'scriptSha256':sha(Path(__file__).read_bytes())};a.out.parent.mkdir(parents=True,exist_ok=True)
if a.out.exists():raise RuntimeError('Fresh report required')
a.out.write_text(json.dumps(result,indent=2)+'\n');print('CLOUD_SOURCE_SCOPE',result['passed'],len(protected),len(far),len(failures),str(a.out),sha(a.out.read_bytes()))
if failures:raise RuntimeError('Source scope failed; preserve report, no preview approval')
