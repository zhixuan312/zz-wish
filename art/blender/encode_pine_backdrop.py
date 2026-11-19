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


def encode_scanlines(path, width, height, exposure):
    rgba = np.empty((height, width, 4), dtype=np.uint8)
    clipped = 0
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
            clipped += int(np.count_nonzero((rgb.max(axis=1) > 8.) & (alpha > 0.)))
            rgba[y - ymin, :, :3] = np.rint(np.log2(1 + 8 * np.clip(rgb, 0, 8)) * (255 / np.log2(65)))
            rgba[y - ymin, :, 3] = np.rint(alpha * 255)
    return rgba, clipped


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
    args = parser.parse_args()
    contract = json.loads((ROOT / 'shared/pine-gate-backdrop.json').read_text())
    render = json.loads((args.input / 'render.json').read_text())
    width, height = render['width'], render['height']
    if width * contract['height'] != height * contract['width'] or not (width > 0 and height > 0):
        raise ValueError('The input must cover the authored projection with the original aspect ratio.')
    if render['alpha'] != 'straight' or render['colorSpace'] != 'scene-linear Rec.709' or render['exposureAppliedStops'] != 0:
        raise ValueError('Expected straight-alpha scene-linear masters before camera exposure.')
    if not 1 <= args.quality <= 100:
        raise ValueError('WebP quality must be between 1 and 100.')
    args.out.mkdir(parents=True, exist_ok=False)
    variants = {}
    for name in LAYERS:
        spec = render['plates'][name]
        master = args.input / f'{name}.exr'
        if spec['file'] != master.name or spec['bytes'] != master.stat().st_size:
            raise ValueError(f'Master for {name} differs from its render receipt.')
        image, clipped = encode_scanlines(master, width, height, contract['preExposure'])
        dilate_rgb(image)
        target = args.out / f'pine-vista-{name}.webp'
        with tempfile.TemporaryDirectory(dir=args.out, prefix='encode-') as scratch:
            png = Path(scratch) / 'linear-log-rgba.png'
            write_rgba_png(png, image)
            subprocess.run(['cwebp', '-quiet', '-q', str(args.quality), '-alpha_q', '100', '-exact',
                            '-m', '4', str(png), '-o', str(target)], check=True)
        variants[name] = {'uri': target.name, 'bytes': target.stat().st_size, 'sha256': digest(target),
                          'masterSha256': digest(master), 'clippedRadiancePixels': clipped}
        print('PINE_BACKDROP_PLATE', name, json.dumps(variants[name]), flush=True)
    (args.out / 'encode.json').write_text(json.dumps({
        'width': width, 'height': height, 'encoding': 'log2-8-8', 'preExposure': contract['preExposure'],
        'colorSpace': 'linear', 'alpha': 'straight', 'webpQuality': args.quality,
        'renderSha256': digest(args.input / 'render.json'), 'layers': variants,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
