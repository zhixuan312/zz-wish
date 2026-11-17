"""CPU-only source scope and literal analytic cloud-field audit; no Cycles jobs."""
from __future__ import annotations
import argparse
from hashlib import sha256
from collections import Counter
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector


def file_info(path):
    return {'path':str(path),'bytes':path.stat().st_size,'sha256':sha256(path.read_bytes()).hexdigest()}


def engine(p):return [float(p.x),float(p.z),float(-p.y)]


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();objects={}
    for obj in scene.objects:
        if obj.type=='MESH' and (obj.get('one_light_static') or obj.get('one_light_dynamic')):
            evaluated=obj.evaluated_get(graph)
            mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
            normal_matrix=evaluated.matrix_world.to_3x3().inverted().transposed()
            uv=mesh.uv_layers.get('UVMap');tint=mesh.color_attributes.get('SurfaceTint');triangles=[]
            for tri in mesh.loop_triangles:
                corners=[]
                for li in tri.loops:
                    p=evaluated.matrix_world@mesh.vertices[mesh.loops[li].vertex_index].co
                    n=(normal_matrix@mesh.corner_normals[li].vector).normalized()
                    colour=list(tint.data[li].color) if tint else [1,1,1,1]
                    coords=list(uv.data[li].uv) if uv else [0,0]
                    corners.append(struct.pack('<12f',*p,*n,*coords,*colour))
                # Winding is preserved; only cyclic starting-corner order is ignored.
                triangles.append(min(b''.join(corners[i:]+corners[:i]) for i in range(3))+struct.pack('<I',tri.material_index))
            objects[obj.name]={'sha256':sha256(b''.join(sorted(triangles))).hexdigest(),
                               'triangles':len(triangles),'vertices':len(mesh.vertices),
                               'region':obj.get('region'),'dynamic':bool(obj.get('one_light_dynamic')),
                               'materials':[m.name if m else None for m in mesh.materials]}
            evaluated.to_mesh_clear()
        elif obj.type=='LIGHT':
            objects[obj.name]={'type':'LIGHT','matrixWorld':[list(row) for row in obj.matrix_world],
                              'energy':obj.data.energy,'colour':list(obj.data.color),
                              'lightType':obj.data.type,'role':obj.get('bake_role'),
                              'radius':getattr(obj.data,'shadow_soft_size',None),
                              'size':getattr(obj.data,'size',None),'sizeY':getattr(obj.data,'size_y',None),
                              'angle':getattr(obj.data,'angle',None)}
        elif obj.type=='CAMERA':
            objects[obj.name]={'type':'CAMERA','matrixWorld':[list(row) for row in obj.matrix_world],
                              'angle':obj.data.angle,'lens':obj.data.lens,
                              'sensor':obj.data.sensor_width,'viewport':obj.get('cover_viewport')}
        elif obj.get('one_light_dynamic'):
            objects[obj.name]={'type':obj.type,'matrixWorld':[list(row) for row in obj.matrix_world]}
    world=[{'colour':list(n.inputs['Color'].default_value),'strength':n.inputs['Strength'].default_value}
           for n in scene.world.node_tree.nodes if n.type=='BACKGROUND']
    fields=json.loads(scene['one_light_anchor_fields'])
    cloud=next((o for o in scene.objects if o.get('density_contract_sha256')),None)
    cloud_counts=Counter(n.operation for n in cloud.data.materials[0].node_tree.nodes if n.type=='MATH') if cloud else {}
    return {'objects':objects,'world':world,'anchors':{k:scene[k] for k in fields},
            'supports':scene['cloud_cliff_structural_supports'],
            'contactGroups':scene['resting_contact_groups'],'contactAudit':scene['resting_contact_audit'],
            'hangingAudit':scene['one_light_hanging_audit'],'cameraAudit':scene['cloud_cliff_camera_audit'],
            'cloudContract':json.loads(scene['cloud_cliff_live_clouds']),'cloudMathCounts':dict(cloud_counts)}


def density(contract,p):
    def envelope(bank,position=None):
        pos=p if position is None else position
        q2=sum(((pos[a]-bank['centre'][a])/bank['radii'][a])**2 for a in range(3))
        lo=(1-bank['edgeWidth'])**2;t=max(0,min(1,(q2-lo)/(1-lo)))
        return 1-t*t*(3-2*t)
    def waves(records):return sum(w['weight']*math.sin(sum(p[a]*w['vector'][a] for a in range(3))+w['phase']) for w in records)
    if contract['version']==2:
        return max(b['density']*envelope(b) for b in contract['banks'])*(1+contract['modulationAmplitude']*waves(contract['waves']))
    breakup=contract['breakup']
    if contract['version']>=4:
        def permute(x):
            x=x%289
            return ((34*x+1)*x)%289
        def noise(position):
            cell=[math.floor(x) for x in position];fraction=[x-c for x,c in zip(position,cell)]
            u=[f**3*(f*(6*f-15)+10) for f in fraction];result=0
            for z in [0,1]:
                for y in [0,1]:
                    for x in [0,1]:
                        h=permute(permute(permute(cell[0]+x)+(cell[1]+y)%289)+(cell[2]+z)%289)/288
                        weight=(u[0] if x else 1-u[0])*(u[1] if y else 1-u[1])*(u[2] if z else 1-u[2])
                        result+=h*weight
            return result
        octave_values=[max(0,min(1,noise([x*o['frequency']+offset for x,offset in zip(p,o['offset'])]))) for o in contract['noise']['octaves']]
        field=max(0,min(1,sum(o['weight']*n for o,n in zip(contract['noise']['octaves'],octave_values))))
        threshold=breakup['thresholdBase']-breakup['noiseAmplitude']*field
    else:
        threshold=breakup['thresholdBase']+breakup['coarseAmplitude']*waves(contract['waves'])+breakup['detailAmplitude']*waves(contract['detailWaves'])
    bank_position=p
    if contract.get('domainWarp'):
        warp=contract['domainWarp']
        mixtures=([sum(n*w for n,w in zip(octave_values,weights)) for weights in warp['octaveMixturesEngine']]
                  if warp.get('octaveMixturesEngine') else [octave_values[i] for i in warp['octaveForAxis']])
        bank_position=[x+scale*n+offset for x,n,scale,offset in zip(p,mixtures,warp['scaleEngine'],warp['offsetEngine'])]
    union=max(b['density']*max(0,min(1,(envelope(b,bank_position)-threshold)/breakup['normalization'])) for b in contract['banks'])
    substrate=contract['substrate']
    return union+substrate['density']*envelope(substrate)


NODE_PROGRAMS={}


def node_density(material,p):
    """Compile the actual saved node DAG once; no source author helper is used."""
    key=material.as_pointer()
    if key not in NODE_PROGRAMS:
        program=[];memo={};constants={}
        def input_ref(socket):
            if socket.is_linked:return output_ref(socket.links[0].from_socket)
            value=socket.default_value;value=tuple(value) if hasattr(value,'__len__') else float(value)
            if value not in constants:
                constants[value]=len(program);program.append(('CONSTANT',value,[]))
            return constants[value]
        def output_ref(socket):
            pointer=socket.as_pointer()
            if pointer in memo:return memo[pointer]
            node=socket.node;kind=node.type;op=None;refs=[]
            if kind=='NEW_GEOMETRY':pass
            elif kind=='VECT_MATH':op=node.operation;refs=[input_ref(node.inputs[i]) for i in [0,1]]
            elif kind=='SEPXYZ':op=['X','Y','Z'].index(socket.name);refs=[input_ref(node.inputs[0])]
            elif kind=='COMBXYZ':refs=[input_ref(node.inputs[n]) for n in ['X','Y','Z']]
            elif kind=='MAP_RANGE':
                if node.interpolation_type!='SMOOTHSTEP' or not node.clamp:raise RuntimeError('Unexpected envelope map')
                refs=[input_ref(node.inputs[n]) for n in ['Value','From Min','From Max','To Min','To Max']]
            elif kind=='MATH':
                op=node.operation;count=3 if op=='MULTIPLY_ADD' else 1 if op in ['FLOOR','SINE'] else 2
                refs=[input_ref(node.inputs[i]) for i in range(count)]
            else:raise RuntimeError('Unexpected density node '+kind)
            index=len(program);program.append((kind,op,refs));memo[pointer]=index;return index
        volume=next(n for n in material.node_tree.nodes if n.type=='PRINCIPLED_VOLUME')
        final=input_ref(volume.inputs['Density']);NODE_PROGRAMS[key]=(program,final)
    program,final=NODE_PROGRAMS[key];values=[]
    for kind,op,refs in program:
        if kind=='CONSTANT':value=op
        elif kind=='NEW_GEOMETRY':value=(p[0],-p[2],p[1])
        elif kind=='SEPXYZ':value=values[refs[0]][op]
        elif kind=='COMBXYZ':value=tuple(values[i] for i in refs)
        elif kind=='VECT_MATH':
            a,b=[values[i] for i in refs]
            if op=='SUBTRACT':value=tuple(x-y for x,y in zip(a,b))
            elif op=='DIVIDE':value=tuple(x/y for x,y in zip(a,b))
            elif op=='DOT_PRODUCT':value=sum(x*y for x,y in zip(a,b))
            else:raise RuntimeError('Unexpected vector operation '+op)
        elif kind=='MAP_RANGE':
            x,a,b,lo,hi=[values[i] for i in refs];t=max(0,min(1,(x-a)/(b-a)))
            value=lo+(hi-lo)*t*t*(3-2*t)
        elif kind=='MATH':
            a=values[refs[0]];b=values[refs[1]] if len(refs)>1 else None
            if op=='MAXIMUM':value=max(a,b)
            elif op=='MINIMUM':value=min(a,b)
            elif op=='ADD':value=a+b
            elif op=='SUBTRACT':value=a-b
            elif op=='MULTIPLY':value=a*b
            elif op=='DIVIDE':value=a/b
            elif op=='MULTIPLY_ADD':value=a*b+values[refs[2]]
            elif op=='FLOOR':value=math.floor(a)
            elif op=='SINE':value=math.sin(a)
            else:raise RuntimeError('Unexpected scalar operation '+op)
        values.append(value)
    return values[final]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--before',type=Path,required=True)
    parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--physical-reference',type=Path)
    a=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);a.before=a.before.resolve();a.source=a.source.resolve();a.output=a.output.resolve()
    if a.output.exists():raise RuntimeError('Use a new immutable audit path')
    inputs=[a.before,a.source]+([a.physical_reference.resolve()] if a.physical_reference else [])
    original_hashes=[file_info(p) for p in inputs]
    before=snapshot(a.before)
    physical_reference=snapshot(a.physical_reference.resolve()) if a.physical_reference else None
    after=snapshot(a.source)
    if physical_reference:
        for key in ['objects','world','anchors','supports','contactGroups','contactAudit','hangingAudit','cameraAudit']:
            if physical_reference[key]!=after[key]:raise RuntimeError('Physical reference changed: '+key)
    removed=set(before['objects'])-set(after['objects']);added=set(after['objects'])-set(before['objects'])
    expected_removed={'Middle cloud valley continuous ridge','Far blue continuous ridge'}
    contract=json.loads(bpy.context.scene['cloud_cliff_live_clouds'])
    expected_added={'Exposed gallery rock-face drop and strata'}
    if contract['version']==2:expected_added|={'Middle cloud valley jointed rock massif','Far blue stratified rock massif'}
    if contract['version']>=3:expected_added|={f'Far photographic rock massif {i+1:02d}' for i in range(6)}
    if removed!=expected_removed or added!=expected_added:raise RuntimeError('Unexpected source object scope '+str([removed,added]))
    changed=[name for name in before['objects'].keys()&after['objects'].keys() if before['objects'][name]!=after['objects'][name]]
    if changed:raise RuntimeError('Existing physical object/light/camera changed: '+', '.join(changed))
    for key in ['world','anchors','supports','contactGroups','contactAudit','hangingAudit','cameraAudit']:
        if before[key]!=after[key]:raise RuntimeError('Accepted source contract changed: '+key)
    scene=bpy.context.scene
    cloud=next(o for o in scene.objects if o.get('density_contract_sha256'))
    positions=[]
    for bank in contract['banks']:
        c=bank['centre'];r=bank['radii']
        for x in [-1.03,-.99,-.85,-.5,0,.5,.85,.99,1.03]:
            for y in [-1,-.85,-.5,0,.5,.85,1]:
                for z in [-1,-.5,0,.5,1]:positions.append([c[0]+r[0]*x,c[1]+r[1]*y,c[2]+r[2]*z])
    if contract.get('substrate'):
        c=contract['substrate']['centre'];r=contract['substrate']['radii']
        for x in [-1,-.75,-.25,0,.5,.9,1]:
            for y in [-1,-.5,0,.5,1]:
                for z in [-1,-.5,0,.5,1]:positions.append([c[0]+r[0]*x,c[1]+r[1]*y,c[2]+r[2]*z])
    errors=[abs(density(contract,p)-node_density(cloud.data.materials[0],p)) for p in positions]
    if max(errors)>1e-6:raise RuntimeError('Literal cloud graph diverges from published contract')
    edge_values=[]
    for bank in contract['banks']:
        p=list(bank['centre']);p[1]+=bank['radii'][1]+.001;edge_values.append({'bank':bank['id'],'supportTopY':p[1]-.001,'unionDensityJustAboveOwnSupport':density(contract,p)})
    warp_proof=None
    if contract.get('domainWarp'):
        warp=contract['domainWarp'];expanded=[]
        for bank in contract['banks']:
            expanded.append({'id':bank['id'],
                             'min':[bank['centre'][a]-bank['radii'][a]-warp['sampleOffsetBounds']['max'][a] for a in range(3)],
                             'max':[bank['centre'][a]+bank['radii'][a]-warp['sampleOffsetBounds']['min'][a] for a in range(3)]})
        if expanded!=contract['expandedBankBounds']:raise RuntimeError('Published bank warp bounds are incorrect')
        bounds=contract['bounds']
        if not all(bounds['min'][a]<=b['min'][a] and bounds['max'][a]>=b['max'][a] for b in expanded for a in range(3)):raise RuntimeError('Warp escapes source volume bounds')
        if physical_reference and bounds!=physical_reference['cloudContract']['bounds']:raise RuntimeError('Domain warp unexpectedly enlarged the fixed global support')
        labels=[n.label for n in cloud.data.materials[0].node_tree.nodes if n.label.startswith('Cloud unweighted octave ')]
        if sorted(labels)!=['Cloud unweighted octave 0','Cloud unweighted octave 1','Cloud unweighted octave 2']:raise RuntimeError('Expected exactly three shared octave values')
        if physical_reference and after['cloudMathCounts'].get('FLOOR')!=physical_reference['cloudMathCounts'].get('FLOOR'):raise RuntimeError('Added noise hash/floor evaluations')
        graph=bpy.context.evaluated_depsgraph_get();hero_points=[]
        for obj in scene.objects:
            if obj.type!='MESH' or not obj.get('one_light_dynamic'):continue
            evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh()
            hero_points.extend(engine(evaluated.matrix_world@v.co) for v in mesh.vertices);evaluated.to_mesh_clear()
        pivot=json.loads(scene['one_light_anchor_registry'])['storm']['hangingPivot']
        radius=max(math.dist(p,pivot) for p in hero_points)
        minimum_y=pivot[1]-radius-.03
        if minimum_y<=bounds['max'][1]:raise RuntimeError('Actual HERO sphere can intersect finite cloud support')
        warp_proof={'expandedBankBoundsExact':True,'sameGlobalBoundsAsPhysicalReference':bool(physical_reference),
                    'horizontalWarpCoveredByExistingGlobalVolume':True,
                    'sampleOffsetRanges':warp['sampleOffsetBounds'],'existingUnweightedOctaves':len(labels),
                    'hashFloorNodesBefore':physical_reference['cloudMathCounts'].get('FLOOR') if physical_reference else None,
                    'hashFloorNodesAfter':after['cloudMathCounts'].get('FLOOR'),
                    'hero':{'actualEvaluatedVertices':len(hero_points),'pivotEngine':pivot,'maximumPivotDistanceMetres':radius,
                            'minimumYUnderAnyPivotRotationAnd30mmTranslation':minimum_y,'cloudMaximumSupportY':bounds['max'][1],
                            'minimumGuaranteedClearanceMetres':minimum_y-bounds['max'][1]},
                    'timeScope':'All times, including any hour: each octave is explicitly clamped0..1, so warp ranges are time-independent; bank centres/substrate are never advected. This is an interval proof, not sampled visibility.'}
    group_proof=None
    if contract.get('bankGroups'):
        groups=contract['bankGroups'];lobes=contract['banks'];indices=[]
        if len(groups)!=12 or len(lobes)!=48 or not contract.get('parentDensityRemoved'):raise RuntimeError('Expected12 culling groups and48 child-only density lobes')
        ratios=[];drops=[]
        for group in groups:
            parent=group['parentReference'];p=parent['centre'];r=parent['radii'];cull=group['expandedCullBounds']
            if 'density' in group or 'density' in parent or len(group['lobeIndices'])!=4:raise RuntimeError('Opaque parent density or invalid child count')
            for index in group['lobeIndices']:
                child=lobes[index];indices.append(index)
                ratio=[a/b for a,b in zip(child['radii'],r)];ratios.append(ratio)
                drop=parent['topY']-child['centre'][1]-child['radii'][1];drops.append(drop)
                if not(.3<=ratio[0]<=.45 and .55<=ratio[1]<=.75 and .3<=ratio[2]<=.45 and 1-1e-6<=drop<=3+1e-6):raise RuntimeError('Child lobe ratio/top scope failed')
                if child['group']!=group['id']:raise RuntimeError('Child/group binding failed')
                actual=contract['expandedBankBounds'][index]
                if not all(cull['min'][a]<=actual['min'][a] and cull['max'][a]>=actual['max'][a] for a in range(3)):raise RuntimeError('Group cull clips actual child support')
                if not all(p[a]-r[a]<=child['centre'][a]-child['radii'][a] and p[a]+r[a]>=child['centre'][a]+child['radii'][a] for a in range(3)):raise RuntimeError('Child escapes parent authoring AABB')
        if sorted(indices)!=list(range(48)):raise RuntimeError('Missing/duplicated grouped child')
        node_labels=[n.label for n in cloud.data.materials[0].node_tree.nodes if n.type=='MAP_RANGE']
        expected=[f'Cloud density lobe {i}' for i in range(48)]+['Cloud lower substrate envelope']
        if sorted(node_labels)!=sorted(expected):raise RuntimeError('Actual graph includes missing/extra/parent envelopes')
        group_proof={'groups':12,'densityLobes':48,'lobesPerGroup':4,'opaqueParentDensityEnvelopes':0,
                     'actualNativeEnvelopeNodes':len(node_labels),'childRadiusRatioRanges':[[min(r[a] for r in ratios),max(r[a] for r in ratios)] for a in range(3)],
                     'topDropRangeMetres':[min(drops),max(drops)],'everyChildWithinPublishedGroupCull':True,
                     'cullingRule':'Original WORLD point must be tested against expanded group AABB; parent ellipsoid density is never evaluated. All48 unique child indices are covered once.'}
    report={'passed':True,'inputs':original_hashes,'unchangedObjects':len(before['objects'])-len(removed),
            'removedObjects':sorted(removed),'addedObjects':sorted(added),
            'invariants':['world','all existing gallery/HERO/scanned cliff geometry, UV0, normals, tints, winding and material bindings','all LIGHT energy/colour/radius/transforms','all cameras','18 resting groups and source contact measurements','six hanging measurements','full source anchor strings'],
            'cloudContract':contract,'cloudContractCanonicalSha256':sha256(json.dumps(contract,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'actualNativeNodeGraph':{'samples':len(positions),'maximumAbsoluteDensityError':max(errors),'limit':1e-6,'supportTops':edge_values},
            'allPhysicalReferenceObjectsExact':len(physical_reference['objects']) if physical_reference else None,
            'domainWarpProof':warp_proof,
            'childLobeGroupProof':group_proof,
            'worldBounds':json.loads(scene['cloud_cliff_far_world_bounds']),
            'nativeRenderJobs':0,'limits':'CPU scope/math proof only. Does not claim visual acceptance, runtime optical equivalence, UV coverage, prepared/export correspondence or final package budget.'}
    if [file_info(p) for p in inputs]!=original_hashes:raise RuntimeError('Immutable source bytes changed')
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n')
    print('CLOUD_MORPHOLOGY_SCOPE_PASS',len(changed),len(positions),max(errors),str(a.output),flush=True)


if __name__=='__main__':main()
