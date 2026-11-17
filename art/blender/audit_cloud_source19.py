"""Actual saved Source19 replacement scope, closed topology and skyline audit."""
import argparse,array,hashlib,json,math,sys
from collections import defaultdict
from pathlib import Path
import bpy
from mathutils import Matrix,Vector

p=argparse.ArgumentParser();p.add_argument('--before',type=Path,required=True);p.add_argument('--after',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);sha=lambda b:hashlib.sha256(b).hexdigest();pack=lambda v:array.array('f',v).tobytes()
def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()));scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();objects={};material_names=set();full_geometry={}
    for obj in scene.objects:
        if obj.type!='MESH' or not(obj.get('one_light_static')or obj.get('one_light_dynamic')):continue
        ev=obj.evaluated_get(graph);mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles();uv=mesh.uv_layers.get('UVMap');tint=mesh.color_attributes.get('SurfaceTint');tint=tint if tint and tint.domain=='CORNER'else None;NM=ev.matrix_world.to_3x3().inverted().transposed();corners=[]
        P=[ev.matrix_world@v.co for v in mesh.vertices]
        for li,loop in enumerate(mesh.loops):
            n=NM@mesh.corner_normals[li].vector;n.normalize();corners.append(pack(P[loop.vertex_index])+pack(n)+pack(uv.data[li].uv if uv else(0,0))+pack(tint.data[li].color if tint else(1,1,1,1)))
        records=[];materials=set()
        for tri in mesh.loop_triangles:
            mat=mesh.materials[tri.material_index];name=mat.name if mat else'';materials.add(name);q=[corners[i]for i in tri.loops];records.append(name.encode()+b'\0'+min(b''.join(q[k:]+q[:k])for k in range(3)))
        objects[obj.name]={'cornersSha256':sha(b''.join(sorted(records))),'triangles':len(records),'vertices':len(P),'matrixWorld':[list(row)for row in obj.matrix_world],'materials':sorted(materials),'region':obj.get('region'),'dynamic':bool(obj.get('one_light_dynamic'))}
        full_geometry[obj.name]={'points':P,'triangles':[tuple(t.vertices)for t in mesh.loop_triangles]}
        if not obj.name.startswith(('Far photographic rock massif','Far closed scanned massif')):material_names.update(materials)
        ev.to_mesh_clear()
    # Original protected transport materials AND actual native cloud/air graphs.
    material_names.update(name for name in['Cloud eroded layered banks and lower water-droplet haze','Cloud clear blue mountain distance air']if bpy.data.materials.get(name))
    material_graphs={}
    for name in material_names:
        mat=bpy.data.materials.get(name)
        if not mat or not mat.use_nodes:continue
        nodes=list(mat.node_tree.nodes);rows=[]
        for node in nodes:
            def value(socket):
                v=getattr(socket,'default_value',None)
                return v if v is None or isinstance(v,(str,float,int,bool))else list(v)
            row={'type':node.bl_idname,'inputs':[value(s)for s in node.inputs]}
            for key in['operation','blend_type','data_type','attribute_name','interpolation_type','clamp','use_clamp']:
                if hasattr(node,key):row[key]=getattr(node,key)
            if getattr(node,'image',None):row['image']={'path':str(Path(bpy.path.abspath(node.image.filepath)).resolve()),'colourSpace':node.image.colorspace_settings.name}
            rows.append(row)
        links=sorted((nodes.index(l.from_node),list(l.from_node.outputs).index(l.from_socket),nodes.index(l.to_node),list(l.to_node.inputs).index(l.to_socket))for l in mat.node_tree.links)
        material_graphs[name]=sha(json.dumps({'nodes':rows,'links':links},sort_keys=True).encode())
    lights={o.name:{'matrix':[list(r)for r in o.matrix_world],'type':o.data.type,'energy':o.data.energy,'color':list(o.data.color),'radius':getattr(o.data,'shadow_soft_size',None),'size':getattr(o.data,'size',None),'role':o.get('bake_role')}for o in scene.objects if o.type=='LIGHT'}
    cameras={o.name:{'matrix':[list(r)for r in o.matrix_world],'lens':o.data.lens,'sensorHeight':o.data.sensor_height,'sensorWidth':o.data.sensor_width,'sensorFit':o.data.sensor_fit,'shiftX':o.data.shift_x,'shiftY':o.data.shift_y,'clipStart':o.data.clip_start,'clipEnd':o.data.clip_end,'viewport':json.loads(o['cover_viewport'])}for o in scene.objects if o.type=='CAMERA'}
    world=[(list(n.inputs['Color'].default_value),n.inputs['Strength'].default_value)for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'];anchors={name:scene[name]for name in json.loads(scene['one_light_anchor_fields'])}
    return{'sha256':sha(path.read_bytes()),'objects':objects,'geometry':full_geometry,'materials':material_graphs,'lights':lights,'world':world,'anchors':anchors,'cameras':cameras,'field':scene['cloud_cliff_live_clouds'],'contacts':json.loads(scene['resting_contact_audit']),'hanging':json.loads(scene['one_light_hanging_audit']),'replacementMetadata':json.loads(scene.get('source19_massif_replacements','[]'))}
before=snapshot(a.before);after=snapshot(a.after);failures=[]
old_names=sorted(name for name in before['objects']if name.startswith('Far photographic rock massif'))
new_names=sorted(name for name in after['objects']if name.startswith('Far closed scanned massif'))
if len(old_names)!=6 or len(new_names)!=6:failures.append('Exactly six declared old/new massifs required')
protected=set(before['objects'])-set(old_names)
if set(after['objects'])-set(new_names)!=protected:failures.append('Unexpected protected object additions/removals')
protected_rows=[]
for name in sorted(protected):
    equal=before['objects'][name]==after['objects'].get(name);protected_rows.append({'name':name,'exact':equal,'cornerSha256':before['objects'][name]['cornersSha256']})
    if not equal:failures.append('Protected evaluated geometry/normal/UV0/tint/material differs: '+name)
globals={key:before[key]==after[key]for key in['materials','lights','world','anchors','field']}
if not all(globals.values()):failures.append({'protectedGlobals':globals})
phone='Reference_cover-phone';expected_origin=Vector((5.2,-4.8,1.45));expected_target=Vector((3.77,5,.62));M=Matrix.Translation(expected_origin)@(expected_target-expected_origin).to_track_quat('-Z','Y').to_matrix().to_4x4();actual=after['cameras'][phone]
phone_error=max(abs(M[i][j]-actual['matrix'][i][j])for i in range(4)for j in range(4));camera_pass=set(before['cameras'])==set(after['cameras'])and all(before['cameras'][name]==after['cameras'][name]for name in before['cameras']if name!=phone)and phone_error<=1e-6 and abs(actual['lens']-12/math.tan(math.radians(49)/2))<=2e-6 and actual['shiftX']==0 and actual['shiftY']==0 and actual['sensorFit']=='VERTICAL'
if not camera_pass:failures.append('Only the exact approved phone camera may differ')
def engine(v):return[v.x,v.z,-v.y]
def bounds(points):return{'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)]}
def project(points,camera):
    width,height=camera['viewport'];origin=Vector((camera['matrix'][0][3],camera['matrix'][1][3],camera['matrix'][2][3]));inverse=Matrix(camera['matrix']).to_3x3().transposed();f=height*camera['lens']/camera['sensorHeight'];result=[]
    for p0 in points:
        q=inverse@(p0-origin);result.append((width/2+q.x*f/-q.z,height/2-q.y*f/-q.z))
    return[min(p[0]for p in result),min(p[1]for p in result),max(p[0]for p in result),max(p[1]for p in result)]
replacements=[]
for old_name,new_name in zip(old_names,new_names):
    old=before['geometry'][old_name];new=after['geometry'][new_name];ob=bounds([engine(p)for p in old['points']]);nb=bounds([engine(p)for p in new['points']]);ids={};weld=[]
    for point in new['points']:
        key=tuple(point)
        if key not in ids:ids[key]=len(ids)
        weld.append(ids[key])
    edges=defaultdict(int)
    for tri in new['triangles']:
        t=[weld[i]for i in tri]
        for x,y in zip(t,t[1:]+t[:1]):edges[tuple(sorted((x,y)))]+=1
    topology_pass=bool(edges)and all(n==2 for n in edges.values());world_pass=all(nb['min'][k]>=ob['min'][k]and nb['max'][k]<=ob['max'][k]+(2 if k==1 else 0)for k in range(3));front_pass=nb['max'][2]<=ob['max'][2]
    projections={name:{'old':project(old['points'],after['cameras'][name]),'new':project(new['points'],after['cameras'][name])}for name in['Reference_cover-desktop',phone]};skyline_pass=all(row['new'][1]>=row['old'][1]-2 for row in projections.values())
    passed=topology_pass and world_pass and front_pass and skyline_pass and 1000<=len(new['triangles'])<=2000
    replacements.append({'old':old_name,'new':new_name,'oldBounds':ob,'newBounds':nb,'oldTriangles':len(old['triangles']),'newTriangles':len(new['triangles']),'actualBoundaryOrNonmanifoldEdges':sum(n!=2 for n in edges.values()),'closedTopologyPassed':topology_pass,'actualPriorWorldEnvelopePassed':world_pass,'behindPriorFacingPlanePassed':front_pass,'actualPriorSkylinePassed':skyline_pass,'actualCoverProjections':projections,'passed':passed})
    if not passed:failures.append({'replacementFailed':new_name})
contacts=after['contacts']['passed']and len(after['contacts']['groups'])==18 and after['hanging']['passed']and len(after['hanging']['pairs'])==6
if not contacts:failures.append('Actual18 resting/6 hanging failed')
report={'version':1,'passed':not failures,'before':{'path':str(a.before),'sha256':before['sha256']},'after':{'path':str(a.after),'sha256':after['sha256']},'protectedObjects':protected_rows,'protectedGlobalChecks':globals,'approvedPhoneOnlyPassed':camera_pass,'approvedPhoneMaximumMatrixComponentError':phone_error,'replacements':replacements,'restingGroups':len(after['contacts']['groups']),'hangingPairs':len(after['hanging']['pairs']),'contactsPassed':contacts,'failures':failures,'renderBakeGpuJobs':0,'scriptSha256':sha(Path(__file__).read_bytes()),'scope':'Six explicitly authorized far objects only. Actual saved evaluated world triangle/corner hashes preserve every other source position/normal/UV0/tint/material/transform. Actual original used material/volume graphs, field contract, lights/world/anchors exact. Saved new geometric edge multiplicity, actual old/new world bounds and actual-camera projected top bounds checked independently of author metadata. Native/PBR appearance and final bytes remain optical/delivery gates.'}
if a.out.exists():raise RuntimeError('Fresh report required')
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,indent=2)+'\n');print('SOURCE19_ACTUAL_SCOPE',report['passed'],len(protected_rows),len(replacements),str(a.out),sha(a.out.read_bytes()))
if failures:raise RuntimeError('Source19 actual scope failed; preserve report')
