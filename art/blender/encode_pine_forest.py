"""Keep the native forest-layer pixels inside the approved route's view."""

from argparse import ArgumentParser
import json
import math
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from encode_pine_backdrop import digest, dilate_rgb, encode_scanlines, write_rgba_png


# Bounds cover the desktop camera sweep at 2.45:1 and the phone sweep at
# 1:1, with at least half a metre of breathing room at every cropped edge.
# The renderer keeps the original fully framed, scene-linear masters.
VISIBLE_BOUNDS = {
    29.: (-4.85, 4., 4.5),
    23.: (-9., 7.75, 5.6),
    17.: (-9., 9., 6.65),
    11.7: (-9., 9., 7.65),
    8.4: (-9., 9., 8.25),
}


def encode_forest(source, output, quality, alpha_quality):
    original = json.loads((source / 'forest.json').read_text())
    projection = Path(__file__).resolve().parents[2] / 'shared/pine-gate-backdrop.json'
    pre_exposure = json.loads(projection.read_text())['preExposure']
    if original.get('preExposure', pre_exposure) != pre_exposure:
        raise ValueError('The forest plates disagree with the Pine Gate camera exposure.')
    forest = original['descriptor']
    width, height = forest['width'], forest['height']
    metres_wide, metres_high = forest['widthMetres'], forest['heightMetres']
    centre = float(forest['centerY'])
    metres_per_pixel = metres_wide / width
    original_left = -metres_wide / 2
    original_top = centre + metres_high / 2
    output.mkdir(parents=True, exist_ok=False)
    cropped = []
    for layer, file in zip(forest['layers'], original['files'], strict=True):
        master = source / Path(file['uri']).with_suffix('.exr')
        if digest(master) != file['masterSha256'] or layer['uri'] != file['uri']:
            raise ValueError('Forest master or layer identity differs from the render receipt.')
        left, right, top = VISIBLE_BOUNDS[layer['z']]
        first_col = max(0, math.floor((left - original_left) / metres_per_pixel))
        last_col = min(width, math.ceil((right - original_left) / metres_per_pixel))
        first_row = max(0, math.floor((original_top - top) / metres_per_pixel))
        target_width, target_height = last_col - first_col, height - first_row
        layer.update(width=target_width, height=target_height,
                     widthMetres=target_width * metres_per_pixel, heightMetres=target_height * metres_per_pixel,
                     centerX=original_left + (first_col + last_col) * .5 * metres_per_pixel,
                     centerY=original_top - (first_row + height) * .5 * metres_per_pixel)
        rgba, _, _ = encode_scanlines(master, width, height, pre_exposure)
        tile = rgba[first_row:, first_col:last_col].copy()
        dilate_rgb(tile)
        target = output / file['uri']
        with TemporaryDirectory(dir=output, prefix='encode-') as scratch:
            png = Path(scratch) / 'native-cropped-radiance.png'
            write_rgba_png(png, tile)
            subprocess.run(['cwebp', '-quiet', '-q', str(quality), '-alpha_q', str(alpha_quality),
                            '-exact', '-m', '4', str(png), '-o', str(target)], check=True)
        cropped.append({'uri': target.name, 'bytes': target.stat().st_size, 'sha256': digest(target),
                        'masterSha256': file['masterSha256'],
                        'crop': [first_col, first_row, target_width, target_height]})
    original.update(files=cropped, webpQuality=quality, alphaQuality=alpha_quality,
                    sourceReceiptSha256=digest(source / 'forest.json'), cropMode='Native texels of the camera sweep.')
    (output / 'forest.json').write_text(json.dumps(original, indent=2) + '\n')
    print(f'PINE_APPROACH_FOREST_BYTES {sum(file["bytes"] for file in cropped)}')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--quality', type=int, default=76)
    parser.add_argument('--alpha-quality', type=int, default=100)
    arguments = parser.parse_args()
    encode_forest(arguments.input, arguments.out, arguments.quality, arguments.alpha_quality)
