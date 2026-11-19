"""Unassociate Cycles RGB in its float, uncompressed scanline OpenEXR output."""

from array import array
from math import isfinite
import struct
import sys


def string(stream):
    name = bytearray()
    while char := stream.read(1):
        if char == b'\0':
            return name.decode('ascii')
        name.extend(char)
    raise ValueError('Truncated OpenEXR header')


def read_header(stream):
    magic, version = struct.unpack('<II', stream.read(8))
    if magic != 20000630 or version & ~0x400 != 2:
        raise ValueError('Expected single-part scanline OpenEXR 2.')
    header = {}
    while name := string(stream):
        string(stream)
        size, = struct.unpack('<I', stream.read(4))
        header[name] = stream.read(size)
    return header


def straighten(path, width, height):
    """Keep the Blender EXR header and convert the RGB in place by scanline."""
    stats = {'coveredPixels': 0, 'partialAlphaPixels': 0, 'alphaMin': 1., 'alphaMax': 0.}
    with path.open('r+b') as stream:
        header = read_header(stream)
        if header['compression'] != b'\0':
            raise ValueError('Expected uncompressed Cycles scanlines.')
        xmin, ymin, xmax, ymax = struct.unpack('<4i', header['dataWindow'])
        if (xmax - xmin + 1, ymax - ymin + 1) != (width, height):
            raise ValueError('OpenEXR dimensions differ from the projection contract.')
        expected = b''.join(name + b'\0' + struct.pack('<i4x2i', 2, 1, 1) for name in (b'A', b'B', b'G', b'R'))
        channels = bytearray(header['channels'])
        if len(channels) != len(expected) + 1:
            raise ValueError('Expected exactly four OpenEXR channels.')
        for i in range(4):
            # The perceptual linearity hint is immaterial without compression.
            channels[i * 18 + 6] = 0
        if channels != expected + b'\0':
            raise ValueError('Expected full-float A, B, G, R channels at full sampling.')
        offsets = struct.unpack(f'<{height}Q', stream.read(8 * height))
        for offset in offsets:
            stream.seek(offset)
            y, size = struct.unpack('<iI', stream.read(8))
            if y < ymin or y > ymax or size != width * 16:
                raise ValueError('Unexpected OpenEXR scanline shape.')
            row = array('f')
            row.frombytes(stream.read(size))
            if sys.byteorder != 'little':
                row.byteswap()
            alpha = row[:width]
            low, high = min(alpha), max(alpha)
            if not 0. <= low <= high <= 1.:
                raise ValueError('Cycles alpha outside 0–1.')
            stats['alphaMin'] = min(stats['alphaMin'], low)
            stats['alphaMax'] = max(stats['alphaMax'], high)
            if low == 1.:
                stats['coveredPixels'] += width
                continue
            if high == 0.:
                row[width:] = array('f', [0.]) * (width * 3)
            else:
                for i, a in enumerate(alpha):
                    if a == 1.:
                        stats['coveredPixels'] += 1
                        continue
                    if not isfinite(a):
                        raise ValueError('Cycles returned nonfinite alpha.')
                    if a:
                        stats['coveredPixels'] += 1
                        stats['partialAlphaPixels'] += 1
                    inverse = 1. / a if a else 0.
                    for channel in range(1, 4):
                        j = channel * width + i
                        straight = row[j] * inverse if a else 0.
                        if not isfinite(straight):
                            raise ValueError('Cycles returned nonfinite RGB after unassociation.')
                        row[j] = straight
            if sys.byteorder != 'little':
                row.byteswap()
            stream.seek(offset + 8)
            stream.write(row.tobytes())
    return stats
