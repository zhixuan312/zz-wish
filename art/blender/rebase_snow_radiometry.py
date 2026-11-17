"""Uniform source radiance rebase plus one common native/runtime pre-exposure.

Only flux strengths, camera exposure and their actual metadata change. Source
geometry, UVs, normals, albedo, dye, roughness, image maps and contacts stay exact.
Linked strength signals receive a dedicated multiplier, never an upstream colour
or albedo edit. No rendering, baking, image encoding or public operation occurs.
"""
import argparse
from copy import deepcopy
import json
import math
from pathlib import Path
import sys

import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
import freeze_source_modifiers as frozen
from resting_contacts import RestingContacts
import snow_lantern_transport as transport


def ref(path):
    path=Path(path)
    return {'path':str(path),'sha256':transport.sha(path),'bytes':path.stat().st_size}


def all_trees():
    trees={}
    for kind,owners in [('material',bpy.data.materials),('world',bpy.data.worlds)]:
        for owner in owners:
            if owner.use_nodes and owner.node_tree:
                trees[kind+':'+owner.name]=owner.node_tree
    for tree in bpy.data.node_groups:
        if tree.bl_idname=='ShaderNodeTree':trees['group:'+tree.name]=tree
    return trees


def normalize_graph(after,before,records):
    result=deepcopy(after)
    added={row['scaleNode'] for row in records if row.get('scaleNode')}
    result['nodes']=[node for node in result['nodes'] if node['name'] not in added]
    result['links']=[link for link in result['links'] if link[0] not in added and link[2] not in added]
    old_nodes={node['name']:node for node in before['nodes']}
    for node in result['nodes']:
        sockets={row['socket'] for row in records if row['node']==node['name'] and not row.get('scaleNode')}
        old_inputs=dict(old_nodes[node['name']]['inputs'])
        node['inputs']=[(key,old_inputs[key] if key in sockets else value) for key,value in node['inputs']]
    result['links']+= [tuple(row['originalLink']) for row in records if row.get('originalLink')]
    result['links']=sorted(result['links'])
    return result


def standard_light_graph(light):
    """Energy is the only scaled sink in Blender's default multiplicative graph.

    The graph's unit Strength is independent of Light.energy; dividing both
    would apply the requested normalization twice. Unknown graphs fail closed.
    """
    if not light.use_nodes:return None
    tree=light.node_tree
    emissions=[node for node in tree.nodes if node.type=='EMISSION']
    outputs=[node for node in tree.nodes if node.type=='OUTPUT_LIGHT']
    if (len(tree.nodes)!=2 or len(emissions)!=1 or len(outputs)!=1
            or len(tree.links)!=1):
        raise RuntimeError('Nonstandard light graph requires an explicit sink: '+light.name)
    emission=emissions[0];link=tree.links[0]
    if (link.from_node!=emission or link.to_node!=outputs[0]
            or link.from_socket.name!='Emission' or link.to_socket.name!='Surface'
            or emission.inputs['Strength'].is_linked
            or emission.inputs['Strength'].default_value!=1.
            or emission.inputs['Color'].is_linked
            or list(emission.inputs['Color'].default_value)!=[1.,1.,1.,1.]):
        raise RuntimeError('Nondefault light response requires explicit review: '+light.name)
    return frozen.node_graph(tree)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['source','output','report']:parser.add_argument('--'+key,type=Path,required=True)
    parser.add_argument('--source-sha256',required=True)
    parser.add_argument('--factor',type=float,default=40.)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if args.factor!=40 or transport.sha(args.source)!=args.source_sha256:
        raise RuntimeError('Current authorized recipe requires actual Source16 and factor40')
    if args.output.exists() or args.report.exists():raise RuntimeError('New isolated outputs required')
    for path in [args.output,args.report]:
        if not path.resolve().is_relative_to(transport.ROOT/'art/build'):raise RuntimeError('Ignored outputs required')
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    scene=bpy.context.scene
    if float(scene.get('one_light_camera_pre_exposure',1.))!=1. or scene.get('one_light_radiometric_rebase'):
        raise RuntimeError('Refusing repeated radiometric normalization')
    before=frozen.evaluated_snapshots(scene)
    proxy_before=transport.proxy_profiles(scene)
    contacts_before=RestingContacts.from_scene().audit(fail=True,write_metadata=False)
    states_before=frozen.nonmesh_state(scene)
    trees=all_trees();graphs_before={key:frozen.node_graph(tree) for key,tree in trees.items()}
    light_rows=[];seen=set()
    for obj in scene.objects:
        if obj.type!='LIGHT' or obj.data.as_pointer() in seen:continue
        seen.add(obj.data.as_pointer())
        graph_before=standard_light_graph(obj.data)
        original=float(obj.data.energy);obj.data.energy=original/args.factor
        actual=float(obj.data.energy)
        if abs(actual-original/args.factor)>max(1e-10,abs(original/args.factor)*1e-6):raise RuntimeError('Light flux ratio failed')
        if standard_light_graph(obj.data)!=graph_before:raise RuntimeError('Light graph changed with energy write')
        light_rows.append({'object':obj.name,'data':obj.data.name,'type':obj.data.type,
                           'before':original,'after':actual,'expected':original/args.factor,
                           'defaultUnitEmissionGraphPreserved':True,
                           'physicalSink':'Light.energy only; unit node multiplier unchanged'})
    strengths=[]
    for owner,tree in trees.items():
        for node in list(tree.nodes):
            socket=node.inputs.get('Emission Strength') if node.bl_idname in {'ShaderNodeBsdfPrincipled','ShaderNodeVolumePrincipled'} else node.inputs.get('Strength') if node.type in {'EMISSION','BACKGROUND'} else None
            if socket is None:continue
            row={'owner':owner,'node':node.name,'socket':socket.identifier,'linked':socket.is_linked}
            if socket.is_linked:
                if len(socket.links)!=1:raise RuntimeError('Ambiguous radiance strength signal')
                link=socket.links[0];original_source=link.from_socket
                row['originalLink']=[link.from_node.name,link.from_socket.identifier,node.name,socket.identifier]
                tree.links.remove(link)
                scale=tree.nodes.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.use_clamp=False
                scale.name='ONE_LIGHT_RADIOMETRIC_REBASE_'+node.name+'_'+socket.identifier
                scale.inputs[1].default_value=1/args.factor
                tree.links.new(original_source,scale.inputs[0]);tree.links.new(scale.outputs[0],socket)
                row.update(scaleNode=scale.name,actualMultiplier=float(scale.inputs[1].default_value))
            else:
                original=float(socket.default_value);socket.default_value=original/args.factor
                actual=float(socket.default_value)
                if abs(actual-original/args.factor)>max(1e-10,abs(original/args.factor)*1e-6):raise RuntimeError('Graph strength ratio failed')
                row.update(before=original,after=actual,expected=original/args.factor)
            strengths.append(row)
    legacy_world=[]
    for world in bpy.data.worlds:
        if not world.use_nodes:
            original=list(world.color);world.color=[value/args.factor for value in original]
            legacy_world.append({'world':world.name,'before':original,'after':list(world.color)})
    graph_checks={key:normalize_graph(frozen.node_graph(tree),graphs_before[key],
                    [row for row in strengths if row['owner']==key])==graphs_before[key]
                  for key,tree in trees.items()}
    if not all(graph_checks.values()):raise RuntimeError('A non-flux material/world/group graph value changed')
    old_ev=float(scene.view_settings.exposure);scene.view_settings.exposure=old_ev+math.log2(args.factor)
    view=json.loads(scene.get('one_light_source_view_settings','{}')) or {key:getattr(scene.view_settings,key) for key in ['view_transform','look','exposure','gamma']}
    view['exposure']=float(scene.view_settings.exposure)
    scene['one_light_source_view_settings']=json.dumps(view)
    scene['one_light_camera_pre_exposure']=args.factor
    quantity='indirect-diffuse-radiance-per-unit-albedo'
    scene['one_light_lamp_pass_quantity']=quantity
    wicks=json.loads(scene['static_lamp_wicks_engine'])
    for wick in wicks:
        point=bpy.data.objects[wick['pointLightObject']]
        wick['watts']=wick['actualWatts']=float(point.data.energy)
    scene['static_lamp_wicks_engine']=json.dumps(wicks)
    basis=json.loads(scene['one_light_lamp_basis']);point=bpy.data.objects[basis['sourceObject']]
    basis['watts']=float(point.data.energy);basis['cameraPreExposure']=args.factor
    basis['transport']['quantity']=quantity;basis['transport']['cameraPreExposure']=args.factor
    basis['transport']['proposalStatus']='physical-candle-0.05W-pre-exposure40-low8-proposal-not-optically-approved'
    scene['one_light_lamp_basis']=json.dumps(basis)
    config=json.loads(scene[transport.META]);config['basis']=basis
    config['radiometricRebase']={'factor':args.factor,'parentSource':ref(args.source),'helperSha256':transport.sha(__file__)}
    scene[transport.META]=json.dumps(config,separators=(',',':'))
    scene['source_albedo_policy']='Authored CSS-like hex colours are decoded once to linear; image colour spaces, imported PBR factors and linear SurfaceTint multipliers are unchanged. Source17 uniformly divides source/world/emission flux by40 and applies common native/runtime pre-exposure40; light chromaticities and all non-emission material inputs stay unchanged.'
    backgrounds=[{'world':world.name,'node':node.name,'strength':float(node.inputs['Strength'].default_value),'linked':node.inputs['Strength'].is_linked} for world in bpy.data.worlds if world.use_nodes for node in world.node_tree.nodes if node.type=='BACKGROUND']
    scene['authored_night_lighting']=json.dumps({'radiometricDivisor':args.factor,'cameraPreExposure':args.factor,
        'nativeExposureEV':float(scene.view_settings.exposure),'worldBackgrounds':backgrounds,
        'lights':{obj.name:{'actualEnergy':float(obj.data.energy),'type':obj.data.type,'role':obj.get('bake_role'),'linearColor':list(obj.data.color)} for obj in scene.objects if obj.type=='LIGHT'},
        'fixtureWatts':[wick['actualWatts'] for wick in wicks],
        'meaning':'Actual Source17 physical radiometry; runtime/native share pre-exposure40 exactly once. No independent cloth gain.'})
    compact={'factor':args.factor,'parentSource':ref(args.source),'nativeEVBefore':old_ev,
        'nativeEVAfter':float(scene.view_settings.exposure),'commonPreExposure':args.factor,
        'lightDataCount':len(light_rows),'graphStrengthCount':len(strengths),
        'linkedStrengthMultipliers':sum(row['linked'] for row in strengths),'helperSha256':transport.sha(__file__),
        'nonFluxGraphValuesExact':True,'noAlbedoOrColourScaling':True,'lampPassQuantity':quantity}
    scene['one_light_radiometric_rebase']=json.dumps(compact,separators=(',',':'))
    fields=json.loads(scene['one_light_anchor_fields'])
    if 'one_light_radiometric_rebase' not in fields:fields.append('one_light_radiometric_rebase')
    scene['one_light_anchor_fields']=json.dumps(fields)
    helpers=json.loads(scene['source_authoring_helpers']);relative=str(Path(__file__).relative_to(transport.ROOT))
    if relative not in helpers:helpers.append(relative)
    scene['source_authoring_helpers']=json.dumps(helpers)
    hashes=json.loads(scene['source_authoring_sha256']);hashes[relative]=transport.sha(__file__)
    scene['source_authoring_sha256']=json.dumps(hashes)
    bpy.context.view_layer.update()
    geometry=frozen.compare(before,frozen.evaluated_snapshots(scene))
    contacts_after=RestingContacts.from_scene().audit(fail=True,write_metadata=False)
    state_after=frozen.nonmesh_state(scene)
    invariants={'allStaticMeshArraysByteExact':geometry['allFieldsByteExact'],
        'actualProxyGeometryNormalsUVMaterialSlotsByteExact':proxy_before==transport.proxy_profiles(scene),
        'all47ContactMeasurementsByteValueExact':contacts_before==contacts_after and len(contacts_after['groups'])==47,
        'allOriginalImagesExact':states_before['images']==state_after['images'],
        'allNonFluxGraphValuesAndLinksExact':all(graph_checks.values()),
        'allObjectTransformsAndPropertiesExact':states_before['objectPropertiesAndMatrices']==state_after['objectPropertiesAndMatrices'],
        'allLightChromaticitiesTypesRadiiExact':all({key:value for key,value in row.items() if key!='energy'}=={key:value for key,value in state_after['lights'][name].items() if key!='energy'} for name,row in states_before['lights'].items())}
    if not all(invariants.values()):raise RuntimeError('Radiometric-only scope failed: '+str(invariants))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
    report={'scope':__doc__,'source':ref(args.source),'output':ref(args.output),'factor':args.factor,
        'invariants':invariants,'lights':light_rows,'graphStrengths':strengths,'legacyWorldColours':legacy_world,
        'nonFluxGraphChecks':graph_checks,'nativeEVBefore':old_ev,'nativeEVAfter':float(scene.view_settings.exposure),
        'storedNativeViewSettings':view,'actualLampBasis':basis,'compactPhysicalCertificate':compact,
        'actualFixtureMetadata':wicks,'opticallyApproved':False,'renderBakeEncoderGpuJobs':0,
        'geometryComparison':geometry,'scriptSha256':transport.sha(__file__)}
    if transport.sha(args.source)!=args.source_sha256:raise RuntimeError('Immutable Source16 changed')
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n')
    print('SOURCE_RADIOMETRIC_REBASE_PASS',str(args.output),transport.sha(args.output),transport.sha(args.report),flush=True)


if __name__=='__main__':main()
