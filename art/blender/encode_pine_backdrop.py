"""Encode straight, scene-linear Cycles plates for Pine Gate's AgX renderer."""

import argparse
from hashlib import file_digest
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib

import numpy as np

from pine_valley_exr import read_header


LAYERS = ('far', 'mid', 'cloud')
ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def encode_scanlines(path, width, height, exposure, factor=1):
    out_width, out_height = width // factor, height // factor
    rgba = np.empty((out_height, out_width, 4), dtype=np.uint8)
    filtered = np.zeros((out_height, out_width, 4), dtype=np.float32) if factor > 1 else None
    clipped = 0
    clipped_coverage = 0.

    def encode(y, rgb, alpha):
        nonlocal clipped, clipped_coverage
        clipped_mask = (rgb.max(axis=1) > 8.) & (alpha > 0.)
        clipped += int(np.count_nonzero(clipped_mask))
        clipped_coverage += float(alpha[clipped_mask].sum(dtype=np.float64))
        rgba[y, :, :3] = np.rint(np.log2(1 + 8 * np.clip(rgb, 0, 8)) * (255 / np.log2(65)))
        rgba[y, :, 3] = np.rint(alpha * 255)

    with path.open('rb') as stream:
        header = read_header(stream)
        xmin, ymin, xmax, ymax = struct.unpack('<4i', header['dataWindow'])
        if header['compression'] != b'\0' or (xmax - xmin + 1, ymax - ymin + 1) != (width, height):
            raise ValueError('Expected the original uncompressed Cycles scanlines and extent.')
        names = tuple(header['channels'][index:index + 2] for index in range(0, 72, 18))
        if names != (b'A\0', b'B\0', b'G\0', b'R\0'):
            raise ValueError('Expected the straight A, B, G, R Cycles channels.')
        offsets = struct.unpack(f'<{height}Q', stream.read(8 * height))
        seen = set()
        for offset in offsets:
            stream.seek(offset)
            y, size = struct.unpack('<iI', stream.read(8))
            if y in seen or not ymin <= y <= ymax or size != width * 16:
                raise ValueError('Unexpected OpenEXR scanline index or size.')
            seen.add(y)
            channels = np.frombuffer(stream.read(size), dtype='<f4').reshape(4, width)
            alpha, rgb = channels[0], channels[:0:-1].T * exposure
            if not np.isfinite(channels).all() or alpha.min() < 0 or alpha.max() > 1:
                raise ValueError('Invalid radiance or alpha')
            if filtered is None:
                encode(y - ymin, rgb, alpha)
            else:
                # Filter scene-linear radiance in premultiplied form so thin
                # needles, creek foam and cloud coverage keep their silhouette.
                row = filtered[(y - ymin) // factor]
                row[:, :3] += (rgb * alpha[:, None]).reshape(out_width, factor, 3).sum(axis=1)
                row[:, 3] += alpha.reshape(out_width, factor).sum(axis=1)
    if filtered is not None:
        for y, row in enumerate(filtered):
            weight = row[:, 3]
            straight = np.divide(row[:, :3], weight[:, None], out=np.zeros_like(row[:, :3]), where=weight[:, None] > 0)
            encode(y, straight, weight / (factor * factor))
    return rgba, clipped, clipped_coverage


def dilate_rgb(rgba):
    # Alpha stays untouched. Neighboring colors fill the transparent gutter
    # so interpolation across a silhouetted tree or cloud does not turn dark.
    filled = rgba[:, :, 3] > 0
    for _ in range(4):
        previous = filled.copy()
        for target, source in (
            ((slice(1, None), slice(None)), (slice(None, -1), slice(None))),
            ((slice(None, -1), slice(None)), (slice(1, None), slice(None))),
            ((slice(None), slice(1, None)), (slice(None), slice(None, -1))),
            ((slice(None), slice(None, -1)), (slice(None), slice(1, None))),
        ):
            fill = ~filled[target] & previous[source]
            rgba[target][:, :, :3][fill] = rgba[source][:, :, :3][fill]
            filled[target] |= fill


def write_rgba_png(path, rgba):
    def chunk(name, data):
        stream.write(struct.pack('>I', len(data)))
        stream.write(name + data)
        stream.write(struct.pack('>I', zlib.crc32(name + data)))

    height, width, _ = rgba.shape
    compression = zlib.compressobj(level=2)
    with path.open('wb') as stream:
        stream.write(b'\x89PNG\r\n\x1a\n')
        chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0))
        for row in rgba:
            data = compression.compress(b'\0' + row.tobytes())
            if data:
                chunk(b'IDAT', data)
        chunk(b'IDAT', compression.flush())
        chunk(b'IEND', b'')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--quality', type=int, default=88)
    parser.add_argument('--width', type=int, help='Optional integer downsample width; the Cycles master is left untouched.')
    parser.add_argument('--layers', choices=LAYERS, nargs='+', default=LAYERS)
    parser.add_argument('--night-shadows', action='store_true',
                        help='Preserve moonlit terrain RGB losslessly. Use the given quality for clouds.')
    args = parser.parse_args()
    contract = json.loads((ROOT / 'shared/pine-gate-backdrop.json').read_text())
    render = json.loads((args.input / 'render.json').read_text())
    width, height = render['width'], render['height']
    if width * contract['height'] != height * contract['width'] or not (width > 0 and height > 0):
        raise ValueError('The input must cover the authored projection with the original aspect ratio.')
    if render['alpha'] != 'straight' or render['colorSpace'] != 'scene-linear Rec.709' or render['exposureAppliedStops'] != 0:
        raise ValueError('Expected straight-alpha scene-linear masters before camera exposure.')
    if args.night_shadows and render.get('lighting') != 'night':
        raise ValueError('The night-shadow profile requires moonlit masters.')
    output_width = width if args.width is None else args.width
    if output_width <= 0 or width % output_width or height % (width // output_width):
        raise ValueError('Output width must be an integer downsample of both master dimensions.')
    factor = width // output_width
    if not 1 <= args.quality <= 100:
        raise ValueError('WebP quality must be between 1 and 100.')
    args.out.mkdir(parents=True, exist_ok=False)
    variants = {}
    for name in dict.fromkeys(args.layers):
        spec = render['plates'][name]
        master = args.input / f'{name}.exr'
        master_hash = digest(master)
        if spec['file'] != master.name or spec['bytes'] != master.stat().st_size or spec['sha256'] != master_hash:
            raise ValueError(f'Master for {name} differs from its render receipt.')
        image, clipped, clipped_coverage = encode_scanlines(master, width, height, contract['preExposure'], factor)
        dilate_rgb(image)
        target = args.out / f'pine-vista-{name}.webp'
        with tempfile.TemporaryDirectory(dir=args.out, prefix='encode-') as scratch:
            png = Path(scratch) / 'linear-log-rgba.png'
            write_rgba_png(png, image)
            # VP8 quantization and chroma subsampling flatten the dark terrain
            # into visible blocks after log decoding and the AgX view.
            lossless = args.night_shadows and name != 'cloud'
            profile = ['-lossless', '-q', '100', '-m', '6'] if lossless else ['-q', str(args.quality), '-m', '4']
            subprocess.run(['cwebp', '-quiet', *profile, '-alpha_q', '100', '-exact',
                            str(png), '-o', str(target)], check=True)
        variants[name] = {'uri': target.name, 'bytes': target.stat().st_size, 'sha256': digest(target),
                          'masterSha256': master_hash, 'clippedRadiancePixels': clipped,
                          'clippedOpaquePixelEquivalent': round(clipped_coverage, 2),
                          **({'webpEncoding': 'VP8L' if lossless else 'VP8'} if args.night_shadows else {})}
        print('PINE_BACKDROP_PLATE', name, json.dumps(variants[name]), flush=True)
    (args.out / 'encode.json').write_text(json.dumps({
        'width': output_width, 'height': height // factor, 'encoding': 'log2-8-8',
        'masterWidth': width, 'masterHeight': height, 'filter': 'premultiplied-linear-box' if factor > 1 else 'none',
        'preExposure': contract['preExposure'],
        'colorSpace': 'linear', 'alpha': 'straight', 'webpQuality': args.quality,
        'renderSha256': digest(args.input / 'render.json'), 'layers': variants,
        **({'webpProfile': 'night-shadows'} if args.night_shadows else {}),
        **({'lighting': 'night', 'projectionSha256': render['projectionSha256']} if render.get('lighting') == 'night' else {}),
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
