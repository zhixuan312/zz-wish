"""Render independently illuminated far plates on the existing Snow Court projection."""

from argparse import ArgumentParser
import json
import math
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import snow_court_backdrop as terrain


LIGHTING = terrain.ROOT / 'shared/snow-court-directional-light.json'
LOOKS = ('dawn', 'morning', 'evening', 'night')
WIDTH = 2048
SAMPLES = 8
plates = terrain.plates


def receipt_fields(lighting):
    projection = json.loads(terrain.PROJECTION.read_text())
    source = json.loads(LIGHTING.read_text())['looks'][lighting]
    air = source['airRadiance']
    rear_air = source.get('rearAirRadiance', air)
    direction = source['directionEngine']
    for vector in (air, rear_air, direction):
        if len(vector) != 3 or not all(math.isfinite(component) for component in vector):
            raise ValueError(f'Snow Court {lighting} requires finite three-component lighting data.')
    if min(*air, *rear_air) < 0 or direction[1] <= 0 or not math.isclose(math.hypot(*direction), 1., rel_tol=.02):
        raise ValueError(f'Snow Court {lighting} requires non-negative air radiance and an upward unit light vector.')
    for name in ('discDegrees', 'discIntensity', 'skyStrength'):
        if not math.isfinite(source[name]) or source[name] <= 0:
            raise ValueError(f'Snow Court {lighting} requires a positive {name}.')
    if (WIDTH * projection['height']) % projection['width']:
        raise ValueError('Directional plates must use the original projection aspect ratio.')
    return {
        'lighting': lighting,
        'directionEngine': direction,
        'lightTransport': terrain.look_transport(source),
        'summitAirRadiance': air if lighting == 'night' else [component * .55 for component in air],
        'rearAirRadiance': rear_air,
        'width': WIDTH,
        'height': WIDTH * projection['height'] // projection['width'],
        'samples': SAMPLES,
        'directionalLightSha256': plates.digest(LIGHTING),
        'projectionSha256': plates.digest(terrain.PROJECTION),
        'siteSha256': plates.digest(terrain.SITE),
        'backdropSourceSha256': plates.digest(Path(terrain.__file__)),
        'directionalBackdropSourceSha256': plates.digest(Path(__file__)),
        'renderHelpersSha256': plates.digest(Path(plates.__file__)),
    }, projection, air


def build_layers(scene, projection, peak, elevation, sky_air, metadata):
    # The original near flank and cloud still supply occlusion and transport
    # to the single far layer. The sky remains transparent to the runtime.
    far, fields = terrain.mountain(elevation, peak['bearingTarget'], projection['position'])
    rear = terrain.rear_ridge(elevation)
    mid = terrain.pass_flank(elevation, peak['nearRidgeDepth'])
    stands = terrain.pines(mid)
    metadata['geometry'] = terrain.describe(far, rear, fields, mid, stands, projection, peak['bearingTarget'])

    bpy = plates.bpy
    layers = {name: bpy.data.collections.new(f'Snow Court {name} plate') for name in terrain.LAYER_NAMES}
    for collection in layers.values():
        scene.collection.children.link(collection)

    air = plates.air_perspective(sky_air)
    summit_air = air if metadata['summitAirRadiance'] == sky_air else plates.air_perspective(metadata['summitAirRadiance'])
    rear_air = air if metadata['rearAirRadiance'] == sky_air else plates.air_perspective(metadata['rearAirRadiance'])
    summit = plates.mesh(layers['far'], 'SRTM summit and connected winter cirques', far,
                         [terrain.summit_material(summit_air)], smooth=True)
    summit.data.set_sharp_from_angle(angle=math.radians(terrain.SUMMIT_CREASE_DEGREES))
    for name, values in fields.items():
        summit.data.attributes.new(name, 'FLOAT', 'POINT').data.foreach_set('value', values)
    distant = plates.mesh(layers['far'], 'Separate surveyed watershed beyond Snow Court', rear,
                          [terrain.rear_material(rear_air)], smooth=True)
    distant.data.set_sharp_from_angle(angle=math.radians(terrain.REAR_CREASE_DEGREES))
    flank = plates.mesh(layers['mid'], 'Grounded descending pass flank', mid,
                        [terrain.hillside_material(air)], smooth=True)
    prototypes = bpy.data.collections.new('Winter pine instance templates')
    scene.collection.children.link(prototypes)
    library = plates.crown_library(prototypes, terrain.forest_materials(air), far=True)
    woods = plates.forest(layers['mid'], library, stands)
    terrain.high_haze(layers['cloud'])
    return layers, (flank, woods)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--lighting', choices=LOOKS, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--dem', type=Path, default=Path(os.environ.get('TMPDIR', '/tmp')) / 'snow-p1-dem/N33E107.hgt.gz')
    parser.add_argument('--device', choices=('METAL', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI'), default='METAL')
    parser.add_argument('--resume', action='store_true')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    options.samples = SAMPLES
    options.layers = ('far',)
    options.no_denoise = False

    metadata, projection, air = receipt_fields(options.lighting)
    metadata.update({
        'denoise': True,
        'alpha': 'straight',
        'colorSpace': 'scene-linear Rec.709',
        'exposureAppliedStops': 0,
        'runtimePreExposureMultiplier': projection['preExposure'],
        'terrainSource': terrain.TILE_URL,
        'terrainSha256': terrain.TILE_SHA,
        'requestedDevice': options.device,
    })
    peak = json.loads(terrain.SITE.read_text())['peak']
    elevation = terrain.read_tile(options.dem)

    import bpy
    from mathutils import Vector

    plates.bpy, plates.Vector = bpy, Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    metadata['devices'] = plates.configure(scene, options, metadata['width'], metadata['height'])
    metadata['blenderVersion'] = bpy.app.version_string
    plates.set_world(scene, metadata['lightTransport'], projection['preExposure'], f'Snow Court {options.lighting}')
    plates.projection_camera(scene, projection)
    layers, occluders = build_layers(scene, projection, peak, elevation, air, metadata)

    options.out.mkdir(parents=True, exist_ok=options.resume)
    plates.render(scene, layers, occluders, options, metadata)


if __name__ == '__main__':
    main()
