"""Encode the verified Snow Court day or night EXRs as linear-log WebP."""

from argparse import ArgumentParser
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from encode_pine_backdrop import digest, dilate_rgb, encode_scanlines, write_rgba_png
from snow_court_backdrop import PROJECTION, SITE


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--width', type=int)
    parser.add_argument('--quality', type=int, default=90)
    args = parser.parse_args()
    projection = json.loads(PROJECTION.read_text())
    receipt = args.input / 'render.json'
    render = json.loads(receipt.read_text())
    width, height = render['width'], render['height']
    author = Path(__file__).with_name('snow_court_backdrop.py')
    if (render['projectionSha256'] != digest(PROJECTION) or render['siteSha256'] != digest(SITE)
            or render['sources']['author'] != digest(author)
            or render['colorSpace'] != 'scene-linear Rec.709' or render['alpha'] != 'straight'
            or render['runtimePreExposureMultiplier'] != projection['preExposure']
            or render['exposureAppliedStops'] != 0 or render['lighting'] not in ('day', 'night')
            or width * projection['height'] != height * projection['width']):
        raise ValueError('The Snow Court master must match the authored projection and unexposed linear transport.')
    output_width = args.width or width
    if output_width <= 0 or width % output_width or height % (width // output_width):
        raise ValueError('Delivery width must divide the original aperture.')
    if not 1 <= args.quality <= 100:
        raise ValueError('WebP quality must be between 1 and 100.')
    factor = width // output_width
    variants = {}
    args.out.mkdir(parents=True, exist_ok=False)
    for name in projection['distances']:
        spec = render['plates'][name]
        master = args.input / f'{name}.exr'
        master_hash = digest(master)
        if master.stat().st_size != spec['bytes'] or master_hash != spec['sha256']:
            raise ValueError(f'Snow Court master changed after rendering: {name}.')
        image, clipped, coverage = encode_scanlines(master, width, height, projection['preExposure'], factor)
        dilate_rgb(image)
        output = args.out / f'pine-vista-{name}.webp'
        lossless = render['lighting'] == 'night' and name != 'cloud'
        profile = (['-lossless', '-q', '100', '-m', '6'] if lossless
                   else ['-q', str(args.quality), '-sharp_yuv', '-m', '4'])
        with TemporaryDirectory(dir=args.out, prefix='.raster-') as scratch:
            png = Path(scratch) / 'source.png'
            write_rgba_png(png, image)
            subprocess.run(['cwebp', '-quiet', *profile, '-alpha_q', '100', '-exact',
                            str(png), '-o', str(output)], check=True)
        variants[name] = {'uri': output.name, 'bytes': output.stat().st_size, 'sha256': digest(output),
                          'webpEncoding': 'VP8L' if lossless else 'VP8',
                          'masterSha256': master_hash, 'clippedRadiancePixels': clipped,
                          'clippedOpaquePixelEquivalent': round(coverage, 3)}
    (args.out / 'encode.json').write_text(json.dumps({
        'width': output_width, 'height': height // factor, 'encoding': 'log2-8-8',
        'masterWidth': width, 'masterHeight': height, 'preExposure': projection['preExposure'],
        'colorSpace': 'linear', 'alpha': 'straight', 'webpQuality': args.quality,
        'lighting': render['lighting'], 'lightTransport': render['lightTransport'],
        'projectionSha256': render['projectionSha256'], 'siteSha256': render['siteSha256'],
        'backdropSourceSha256': render['sources']['author'],
        'renderSha256': digest(receipt), 'layers': variants,
    }, indent=2) + '\n')
    print('SNOW_COURT_PLATES', sum(item['bytes'] for item in variants.values()), args.out)


if __name__ == '__main__':
    main()
