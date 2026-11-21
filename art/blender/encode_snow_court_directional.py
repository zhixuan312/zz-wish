"""Encode a verified directional Snow Court far plate as linear-log WebP."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from encode_pine_backdrop import digest, dilate_rgb, encode_scanlines, write_rgba_png
from snow_court_directional_backdrop import LOOKS, receipt_fields


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--quality', type=int, default=94)
    args = parser.parse_args()
    if not 1 <= args.quality <= 100:
        parser.error('WebP quality must be between 1 and 100.')

    receipt_bytes = (args.input / 'render.json').read_bytes()
    render = json.loads(receipt_bytes)
    lighting = render.get('lighting')
    if lighting not in LOOKS:
        raise ValueError(f'Unknown directional Snow Court look: {lighting}.')
    expected, projection, _ = receipt_fields(lighting)
    if (any(render.get(key) != value for key, value in expected.items())
            or render.get('colorSpace') != 'scene-linear Rec.709' or render.get('alpha') != 'straight'
            or render.get('runtimePreExposureMultiplier') != projection['preExposure']
            or render.get('exposureAppliedStops') != 0 or set(render.get('plates') or {}) != {'far'}):
        raise ValueError('The directional far master must match the original projection and authored light.')
    spec = render['plates']['far']
    master = args.input / 'far.exr'
    master_hash = digest(master)
    if (spec.get('file') != master.name or spec.get('samples') != expected['samples']
            or master.stat().st_size != spec.get('bytes') or master_hash != spec.get('sha256')):
        raise ValueError('The directional far master differs from its render receipt.')

    width, height = expected['width'], expected['height']
    image, clipped, coverage = encode_scanlines(master, width, height, projection['preExposure'])
    dilate_rgb(image)
    lossless = lighting == 'night'
    profile = (['-lossless', '-q', '100', '-m', '6'] if lossless
               else ['-q', str(args.quality), '-sharp_yuv', '-m', '4'])
    args.out.mkdir(parents=True, exist_ok=False)
    output = args.out / 'pine-vista-far.webp'
    with TemporaryDirectory(dir=args.out, prefix='.raster-') as scratch:
        png = Path(scratch) / 'source.png'
        write_rgba_png(png, image)
        subprocess.run(['cwebp', '-quiet', *profile, '-alpha_q', '100', '-exact',
                        str(png), '-o', str(output)], check=True)

    (args.out / 'render.json').write_bytes(receipt_bytes)
    encode = {
        **expected,
        'encoding': 'log2-8-8',
        'masterWidth': width,
        'masterHeight': height,
        'preExposure': projection['preExposure'],
        'colorSpace': 'linear',
        'alpha': 'straight',
        'webpQuality': args.quality,
        'renderSha256': sha256(receipt_bytes).hexdigest(),
        'encoderSha256': digest(Path(__file__)),
        'layers': {'far': {
            'uri': output.name, 'bytes': output.stat().st_size, 'sha256': digest(output),
            'masterSha256': master_hash, 'webpEncoding': 'VP8L' if lossless else 'VP8',
            'clippedRadiancePixels': clipped, 'clippedOpaquePixelEquivalent': round(coverage, 3),
        }},
    }
    (args.out / 'encode.json').write_text(json.dumps(encode, indent=2) + '\n')
    print('SNOW_COURT_DIRECTIONAL_FAR', lighting, output.stat().st_size, args.out)


if __name__ == '__main__':
    main()
