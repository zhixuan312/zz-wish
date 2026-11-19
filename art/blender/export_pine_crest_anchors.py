"""Export surveyed foliage mounts from the actual baked tree source."""

from argparse import ArgumentParser
import json
from pathlib import Path
import sys
from zlib import crc32

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resting_contacts import engine


def rounded(vector):
    return [round(axis, 6) for axis in vector]


def old_foliage_pads(scene):
    for twig in sorted(scene.objects, key=lambda obj: obj.name):
        if not (twig.type == 'MESH' and twig.name.startswith(('Ancient western pine', 'Ancient eastern pine'))
                and 'lateral twig' in twig.name):
            continue
        points = [twig.matrix_world @ vertex.co for vertex in twig.data.vertices]
        if len(points) != 9:
            raise ValueError('An older pine twig must have three rings with three sides.')
        rings = [Vector(engine(sum(points[start:start + 3], Vector()) / 3)) for start in (0, 3, 6)]
        _, elbow, tip = rings
        length = (tip - elbow).length
        outward = (tip - elbow).normalized()
        yield {
            'root': rounded(elbow.lerp(tip, .80)),
            'outward': rounded(outward),
            'width': round(min(.61, max(.34, .29 + length * .40)), 6),
            'seed': crc32(twig.name.encode('utf-8')),
        }


def main():
    parser = ArgumentParser()
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    manifest = json.loads(args.manifest.read_text())
    pads = list(old_foliage_pads(bpy.context.scene))
    if len(pads) != 130 or min(pad['root'][1] for pad in pads) < 7.:
        raise ValueError('Expected 130 attached foliage pads clear of the walking route.')
    with args.out.open('x') as handle:
        json.dump({'geometryFingerprint': manifest['geometryFingerprint'], 'pads': pads},
                  handle, separators=(',', ':'))
        handle.write('\n')


if __name__ == '__main__':
    main()
