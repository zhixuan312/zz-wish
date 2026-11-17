"""Read-only saved Snow radiometric rebase and physical-scope replay.

The source and parent must be the actual files bound by the authoring receipt.
Only declared flux sinks, native exposure and their metadata may differ. Nothing
is saved, rendered, baked, encoded or installed.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
import freeze_source_modifiers as frozen
import rebase_snow_radiometry as rebase
from resting_contacts import RestingContacts
import snow_lantern_transport as transport


def reference(path):
    path=Path(path)
    return {'path':str(path),'sha256':transport.sha(path),'bytes':path.stat().st_size}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ['source','build-audit','source-audit','report']:
        parser.add_argument('--'+key,type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if args.report.exists():raise RuntimeError('New audit output required')
    build=json.loads(args.build_audit.read_text())
    actual_contact=json.loads(args.source_audit.read_text())
    if (transport.sha(args.source)!=build['output']['sha256']
            or transport.sha(args.source)!=actual_contact['source']['sha256']
            or not actual_contact['contactAudit']['passed']):
        raise RuntimeError('Actual source/build/contact binding differs')
    parent=Path(build['source']['path'])
    if transport.sha(parent)!=build['source']['sha256']:
        raise RuntimeError('Frozen parent differs')
    bpy.ops.wm.open_mainfile(filepath=str(parent.resolve()))
    scene=bpy.context.scene
    meshes_before=frozen.evaluated_snapshots(scene)
    proxies_before=transport.proxy_profiles(scene)
    before=frozen.nonmesh_state(scene)
    graphs_before={key:frozen.node_graph(tree) for key,tree in rebase.all_trees().items()}
    light_graphs_before={obj.name:rebase.standard_light_graph(obj.data) for obj in scene.objects if obj.type=='LIGHT'}
    contact_before=RestingContacts.from_scene().audit(fail=True,write_metadata=False)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    scene=bpy.context.scene
    after=frozen.nonmesh_state(scene)
    geometry=frozen.compare(meshes_before,frozen.evaluated_snapshots(scene))
    graph_checks={key:rebase.normalize_graph(frozen.node_graph(tree),graphs_before[key],
                  [row for row in build['graphStrengths'] if row['owner']==key])==graphs_before[key]
                  for key,tree in rebase.all_trees().items()}
    if set(graphs_before)!=set(rebase.all_trees()):raise RuntimeError('Material/world/group tree ownership changed')
    lights=[]
    for obj in scene.objects:
        if obj.type!='LIGHT':continue
        previous=before['lights'][obj.name]
        ratio_error=abs(obj.data.energy-previous['energy']/40)
        lights.append({'object':obj.name,'actualWatts':float(obj.data.energy),
                       'previousWatts':previous['energy'],'ratioAbsoluteError':ratio_error,
                       'defaultLightGraphByteValueExact':rebase.standard_light_graph(obj.data)==light_graphs_before[obj.name]})
        if ratio_error>max(1e-10,abs(previous['energy']/40)*1e-6):raise RuntimeError('Saved light scaling failed')
    view=json.loads(scene['one_light_source_view_settings'])
    expected_ev=before['view']['exposure']+math.log2(40)
    if abs(scene.view_settings.exposure-expected_ev)>1e-6 or view['exposure']!=scene.view_settings.exposure:
        raise RuntimeError('Saved actual/stored native exposure differs')
    basis=json.loads(scene['one_light_lamp_basis']);point=bpy.data.objects[basis['sourceObject']]
    config=json.loads(scene[transport.META])
    actual_basis={'position':transport.engine(point.matrix_world.translation),'watts':float(point.data.energy),
                  'linearColor':list(point.data.color),'pointRadiusMetres':float(point.data.shadow_soft_size)}
    if any(basis[key]!=value for key,value in actual_basis.items()) or config['basis']!=basis:
        raise RuntimeError('Physical visitor basis metadata differs from saved light')
    if (scene['one_light_camera_pre_exposure']!=40 or basis['cameraPreExposure']!=40
            or scene['one_light_lamp_pass_quantity']!='indirect-diffuse-radiance-per-unit-albedo'
            or basis['transport']['quantity']!=scene['one_light_lamp_pass_quantity']):
        raise RuntimeError('Physical quantity/normalization handshake differs')
    profiles=transport.proxy_profiles(scene)
    digest=hashlib.sha256(json.dumps(profiles,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if digest!=config['actualProxyGeometrySha256']:raise RuntimeError('Saved proxy profile digest differs')
    tree,owners=transport.architecture_bvh(scene)
    anchor=transport.engine(bpy.data.objects['Visitor_Lamp_Anchor'].matrix_world.translation)
    support=transport.upward_support(tree,owners,anchor)
    if max(abs(a-b) for a,b in zip(support['pointEngine'],config['suspension']['pointEngine']))>1e-6:
        raise RuntimeError('Actual upward support ray changed')
    contacts=RestingContacts.from_scene().audit(fail=True,write_metadata=False)
    allowed_metadata={'one_light_source_view_settings','one_light_camera_pre_exposure',
        'one_light_lamp_pass_quantity','static_lamp_wicks_engine','one_light_lamp_basis',transport.META,
        'source_albedo_policy','authored_night_lighting','one_light_radiometric_rebase',
        'one_light_anchor_fields','source_authoring_helpers','source_authoring_sha256'}
    metadata_differences=sorted(key for key in set(before['sceneProperties'])|set(after['sceneProperties'])
        if before['sceneProperties'].get(key)!=after['sceneProperties'].get(key))
    invariants={'allStaticEvaluatedArraysByteExact':geometry['allFieldsByteExact'],
        'allProxyPositionNormalUVMaterialSlotsByteExact':profiles==proxies_before,
        'all47ContactsByteValueExact':contacts==contact_before and len(contacts['groups'])==47,
        'allNonFluxGraphsExact':all(graph_checks.values()),
        'allOriginalImagePathsSizesColorSpacesAndBytesExact':before['images']==after['images'],
        'allMaterialDiffuseFactorsPropertiesOwnershipExact':all(
            {key:value for key,value in row.items() if key!='graph'}==
            {key:value for key,value in after['materials'][name].items() if key!='graph'}
            for name,row in before['materials'].items()),
        'allOtherSceneMetadataExact':set(metadata_differences).issubset(allowed_metadata),
        'allObjectMatricesPropertiesOwnershipExact':before['objectPropertiesAndMatrices']==after['objectPropertiesAndMatrices'],
        'allDefaultLightGraphsExact':all(row['defaultLightGraphByteValueExact'] for row in lights),
        'allLightColorsTypesRadiiExact':all({k:v for k,v in row.items() if k!='energy'}==
             {k:v for k,v in after['lights'][name].items() if k!='energy'} for name,row in before['lights'].items()),
        'nativeViewExceptExposureExact':all(after['view'][key]==value for key,value in before['view'].items() if key!='exposure'),
        'cyclesSettingsExact':before['cycles']==after['cycles']}
    if not all(invariants.values()):raise RuntimeError('Saved radiometric-only scope failed: '+str(invariants))
    report={'scope':__doc__,'source':reference(args.source),'parent':reference(parent),
        'buildAudit':reference(args.build_audit),'sourceContactAudit':reference(args.source_audit),
        'passed':True,'invariants':invariants,'lights':lights,'materialWorldStrengths':build['graphStrengths'],
        'nonFluxGraphChecks':graph_checks,'actualVisitorBasis':actual_basis,'upwardSupport':support,
        'changedSceneMetadataKeys':metadata_differences,'allowedSceneMetadataKeys':sorted(allowed_metadata),
        'nativeExposureEV':float(scene.view_settings.exposure),'storedNativeViewSettings':view,
        'cameraPreExposure':40.,'lampPassQuantity':scene['one_light_lamp_pass_quantity'],
        'linkedEmissionStrengthCount':sum(row['linked'] for row in build['graphStrengths']),
        'staticObjects':len(meshes_before),'proxyObjects':len(profiles),'contactGroups':len(contacts['groups']),
        'maximumPositionComponentErrorMetres':geometry['maximumPositionComponentErrorMetres'],
        'maximumUV0ComponentError':geometry['maximumUV0ComponentError'],
        'maximumWorldNormalComponentError':geometry['maximumWorldNormalComponentError'],
        'opticallyApproved':False,'renderBakeEncoderGpuJobs':0,'sourceModified':False,
        'scriptSha256':transport.sha(__file__)}
    if transport.sha(parent)!=build['source']['sha256'] or transport.sha(args.source)!=build['output']['sha256']:
        raise RuntimeError('Immutable source changed')
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2)+'\n')
    print('SAVED_SNOW_RADIOMETRY_PASS',str(args.report),transport.sha(args.report),flush=True)


if __name__=='__main__':main()
