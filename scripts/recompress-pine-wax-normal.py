"""Losslessly rewrap the PNG stream of a verified Pine Gate wax normal."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from shutil import copyfile
import struct
import zlib


PNG = b'\x89PNG\r\n\x1a\n'


def png_chunks(body):
    if not body.startswith(PNG):
        raise ValueError('Expected a PNG normal map.')
    offset = len(PNG)
    while offset < len(body):
        size, kind = struct.unpack_from('>I4s', body, offset)
        end = offset + size + 12
        payload = body[offset + 8:end - 4]
        if end > len(body) or struct.unpack_from('>I', body, end - 4)[0] != zlib.crc32(kind + payload):
            raise ValueError('Invalid PNG chunk.')
        yield kind, payload, body[offset:end]
        offset = end


def recompress(body):
    chunks = list(png_chunks(body))
    filtered = zlib.decompress(b''.join(data for kind, data, _ in chunks if kind == b'IDAT'))
    compressor = zlib.compressobj(9, strategy=zlib.Z_FILTERED)
    data = compressor.compress(filtered) + compressor.flush()
    replacement = struct.pack('>I', len(data)) + b'IDAT' + data + struct.pack('>I', zlib.crc32(b'IDAT' + data))
    result = bytearray(PNG)
    for kind, _, original in chunks:
        if kind != b'IDAT':
            result.extend(original)
        elif replacement:
            result.extend(replacement)
            replacement = b''
    checked = list(png_chunks(result))
    if [chunk for kind, _, chunk in checked if kind != b'IDAT'] != [
            chunk for kind, _, chunk in chunks if kind != b'IDAT']:
        raise ValueError('The PNG metadata changed during recompression.')
    if zlib.decompress(b''.join(data for kind, data, _ in checked if kind == b'IDAT')) != filtered:
        raise ValueError('The original normal scanlines changed.')
    return bytes(result) if len(result) < len(body) else body, sha256(filtered).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    receipt = json.loads((args.source / 'wax-sculpt.json').read_bytes())
    normal = receipt['normalMaps']['pillar']
    original = (args.source / normal['uri']).read_bytes()
    if normal['bytes'] != len(original) or normal['sha256'] != sha256(original).hexdigest():
        raise ValueError('The wax normal differs from its source receipt.')
    body, filtered = recompress(original)
    args.output.mkdir()
    for profile in receipt['normalMaps'].values():
        if profile is not normal:
            copyfile(args.source / profile['uri'], args.output / profile['uri'])
    (args.output / normal['uri']).write_bytes(body)
    receipt['pillarPngRecompression'] = {
        'sourceBytes': len(original),
        'sourceSha256': normal['sha256'],
        'unchangedFilteredScanlineSha256': filtered,
    }
    normal.update(bytes=len(body), sha256=sha256(body).hexdigest())
    (args.output / 'wax-sculpt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'Lossless wax normal: {len(original)} to {len(body)} bytes.')


if __name__ == '__main__':
    main()
