"""Author a single Snow Court relight from its accepted prepared receivers."""

import argparse
from hashlib import file_digest, sha256
import json
import math
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake_export import receiver_profile, source_binding
import pine_valley_backdrop as plates
from snow_court_backdrop import look_transport
from snow_court_site import area


ROOT = Path(__file__).resolve().parents[2]
RIG = ROOT / 'shared/snow-court-directional-light.json'
SITE = ROOT / 'shared/snow-roof-court-site.json'
R54_NIGHT = ROOT / 'shared/snow-court-backdrop.json'
LOOKS = ('dawn', 'morning', 'evening', 'night')
WEST_WORLD = 'Low western sun over the winter court'
MOON_BOUNCE = 'Moonlit snow bounce below the east rest-room eave'


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def receiver_identity(scene):
    profiles = {
        obj['lightmap_region']: receiver_profile(obj)
        for obj in scene.objects
        if obj.type == 'MESH' and obj.get('one_light_static') and not obj.get('one_light_dynamic')
    }
    if set(profiles) != {'altar', 'court', 'gate', 'hall'}:
        raise RuntimeError('Load the four prepared Snow Court receiver regions.')
    fingerprint = sha256()
    for region, profile in sorted(profiles.items()):
        fingerprint.update(region.encode())
        fingerprint.update(profile['receiverFingerprint'].encode())
        fingerprint.update(profile['lightmapUVFingerprint'].encode())
    return profiles, fingerprint.hexdigest()


def light_transport(world, pre_exposure):
    graph = world.node_tree
    sky = next(node for node in graph.nodes if node.type == 'TEX_SKY')
    background = next(node for node in graph.nodes if node.type == 'BACKGROUND')
    y = math.sin(sky.sun_elevation)
    radius = math.cos(sky.sun_elevation)
    return {
        'directionEngine': [radius * math.sin(sky.sun_rotation), y, -radius * math.cos(sky.sun_rotation)],
        'solarElevationDegrees': math.degrees(sky.sun_elevation),
        'solarAzimuthDegrees': math.degrees(sky.sun_rotation) % 360,
        'solarDiameterDegrees': math.degrees(sky.sun_size),
        'solarIntensity': sky.sun_intensity,
        'atmosphereStrength': background.inputs['Strength'].default_value * pre_exposure,
        'altitudeMetres': sky.altitude,
        'airDensity': sky.air_density,
        'aerosolDensity': sky.aerosol_density,
        'ozoneDensity': sky.ozone_density,
    }


def confirm_transport(actual, source):
    for name, expected in look_transport(source).items():
        if not math.isclose(actual[name], expected, rel_tol=2e-6, abs_tol=2e-5):
            raise RuntimeError(f'Saved Snow Court sky has unexpected {name}: {actual[name]} vs {expected}.')


def add_night_snow_bounce():
    site = json.loads(SITE.read_text())
    room = next(room for room in site['rooms'] if room['name'] == 'East rest room')
    floor = site['court']['level']
    # A broad low source represents reflected moonlight from the snow in
    # front of the east room. The existing beam and eave occlude that bounce.
    lamp = area(MOON_BOUNCE, (room['west'] - 1.44, floor + .36, room['front'] + 1.32),
                (room['west'] + .18, floor + 1.26, room['front'] - .86),
                5.6, '#becfe6', 2.35)
    # The night bake retains ambient sources. An authored solar world and
    # the visitor lamp pass mute them in the shared baker.
    lamp['bake_role'] = 'ambient'
    bpy.context.view_layer.update()


def snow_bounce_receipt(obj):
    return {
        'name': obj.name,
        'role': obj['bake_role'],
        'energy': obj.data.energy,
        'linearColour': list(obj.data.color),
        'worldMatrix': [list(row) for row in obj.matrix_world],
        'sizeMetres': obj.data.size,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--look', choices=LOOKS, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline-manifest', type=Path,
                        help='Raw bake manifest next to the accepted prepared blend.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    prepared = Path(bpy.data.filepath).resolve()
    output = args.output.resolve()
    receipt_path = output.with_suffix('.relight.json')
    if not prepared.is_file() or output.suffix != '.blend' or output.exists() or receipt_path.exists():
        raise RuntimeError('Load an existing prepared blend and supply a fresh .blend output.')
    output.parent.mkdir(parents=True, exist_ok=True)
    baseline_path = args.baseline_manifest or prepared.parent / 'baked/manifest.json'
    baseline = json.loads(baseline_path.read_text())
    scene = bpy.context.scene
    bound_source = source_binding(scene, prepared=True)
    profiles, fingerprint = receiver_identity(scene)
    pre_exposure = scene['one_light_camera_pre_exposure']
    worlds = json.loads(scene['one_light_ambient_worlds'])
    if (scene.get('one_light_place') != 'snow-roof' or baseline.get('place') != 'snow-roof'
            or scene.get('snow_court_directional_near_receipt')
            or worlds.get('dusk') != WEST_WORLD
            or baseline['geometryFingerprint'] != fingerprint
            or baseline['bake']['receiverProfiles'] != profiles
            or baseline['bake']['sourceBlendSha256'] != bound_source['sha256']
            or baseline['bake']['cameraPreExposure'] != pre_exposure):
        raise RuntimeError('Input is not the accepted Snow Court prepared scene and receiver set.')

    source_hooks = (
        Path(__file__), ROOT / 'art/blender/bake_export.py', ROOT / 'art/blender/pine_valley_backdrop.py',
        ROOT / 'art/blender/snow_court_backdrop.py', ROOT / 'art/blender/snow_court_site.py',
        ROOT / 'art/blender/snow_roof.py', SITE, RIG, R54_NIGHT,
    )
    provenance = {key: scene[key] for key in ('one_light_source_binding', 'source_authoring_sha256')}
    lunar_world = scene.world
    solar_world = bpy.data.worlds[worlds['day']]
    west_world = bpy.data.worlds[worlds['dusk']]
    preserved = {world.name: light_transport(world, pre_exposure) for world in (lunar_world, solar_world, west_world)}
    requested = json.loads(RIG.read_text())['looks'][args.look]
    if args.look == 'night':
        # This derivative adds local bounce under the accepted lunar world.
        # Far atmospheric lift can vary independently of that world strength.
        lunar = json.loads(R54_NIGHT.read_text())['light']['night']
        actual_moon = look_transport(requested)
        accepted_moon = look_transport(lunar)
        angles = ('solarElevationDegrees', 'solarAzimuthDegrees')
        if any(not math.isclose(actual_moon[axis], accepted_moon[axis], abs_tol=2e-5) for axis in angles):
            raise RuntimeError('The night look must preserve the accepted Snow Court moon direction.')
        confirm_transport(preserved[lunar_world.name], lunar)
        add_night_snow_bounce()
        world = lunar_world
        bake_pass = 'night'
    else:
        plates.bpy = bpy
        plates.set_world(scene, look_transport(requested), pre_exposure,
                         f'Snow Court {args.look} directional transport')
        world = scene.world
        world.use_fake_user = True
        scene['one_light_ambient_worlds'] = json.dumps({**worlds, 'dusk': world.name})
        scene.world = lunar_world
        bake_pass = 'dusk'

    receipt = {
        'look': args.look, 'pass': bake_pass, 'region': 'court',
        'preparedInput': {'path': str(prepared), 'sha256': digest(prepared)},
        'baselineManifestSha256': digest(baseline_path),
        'geometryFingerprint': fingerprint,
        'receiverFingerprint': profiles['court']['receiverFingerprint'],
        'lightmapUVFingerprint': profiles['court']['lightmapUVFingerprint'],
        'lightingSourceSha256': {str(path.resolve().relative_to(ROOT)): digest(path) for path in source_hooks},
        'worldName': world.name,
        'lightTransport': light_transport(world, pre_exposure),
    }
    if bake_pass == 'night':
        receipt['nightBounce'] = snow_bounce_receipt(scene.objects[MOON_BOUNCE])
    else:
        confirm_transport(receipt['lightTransport'], requested)
    scene['snow_court_directional_near_receipt'] = json.dumps(receipt, sort_keys=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    bpy.ops.wm.open_mainfile(filepath=str(output))
    bpy.context.view_layer.update()
    result = bpy.context.scene
    if (json.loads(result['snow_court_directional_near_receipt']) != receipt
            or any(result.get(key) != value for key, value in provenance.items())
            or receiver_identity(result) != (profiles, fingerprint)
            or digest(prepared) != receipt['preparedInput']['sha256']):
        raise RuntimeError('Saved relight does not preserve its receiver, UV or source identity.')
    saved_worlds = json.loads(result['one_light_ambient_worlds'])
    saved_name = result.world.name if bake_pass == 'night' else saved_worlds['dusk']
    if saved_name != receipt['worldName'] or light_transport(bpy.data.worlds[saved_name], pre_exposure) != receipt['lightTransport']:
        raise RuntimeError('Saved relight does not contain the measured world.')
    if any(light_transport(bpy.data.worlds[name], pre_exposure) != transport for name, transport in preserved.items()):
        raise RuntimeError('Saved relight changed a retained world.')
    if bake_pass == 'night' and snow_bounce_receipt(result.objects[MOON_BOUNCE]) != receipt['nightBounce']:
        raise RuntimeError('Saved relight changed the measured snow bounce light.')
    receipt['preparedOutput'] = {'path': str(output), 'sha256': digest(output)}
    with receipt_path.open('x') as stream:
        stream.write(json.dumps(receipt, indent=2) + '\n')
    print('SNOW_COURT_DIRECTIONAL_NEAR', json.dumps(receipt), flush=True)


if __name__ == '__main__':
    main()
