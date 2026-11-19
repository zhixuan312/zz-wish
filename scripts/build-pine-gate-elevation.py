#!/usr/bin/env python3
"""Derive the staged Pine Gate vista from the public SRTM Skadi source tile."""

from array import array
from argparse import ArgumentParser
from base64 import b64encode
from gzip import decompress
from hashlib import sha256
from json import dumps
from math import cos, hypot, radians
from pathlib import Path
from statistics import mean
from sys import byteorder
from textwrap import wrap
from urllib.request import urlopen

URL = "https://elevation-tiles-prod.s3.amazonaws.com/skadi/N23/N23E102.hgt.gz"
SOURCE_HASH = "659825761ce8e66d5e2359296f71de3dbfa3917a836bfbd0d79f9fb60751ea8d"
OUTPUT = "web/src/engine/places/pine-gate-elevation.data.js"
SIZE, COLUMN, ROW, DATUM = 3601, 1129, 1561, 942
SCALE, OFFSET_X = .044, 10
NORTH = 30.9 * SCALE
EAST = NORTH * cos(radians(24 - ROW / 3600))
HEIGHT_STEP = .02


def axis(ranges):
    samples = []
    for start, stop, step in ranges:
        count = round((stop - start) / step)
        samples += [round(start + (stop - start) * i / count, 4) for i in range(count)]
    return [*samples, ranges[-1][1]]


def elevation(tile, x, depth):
    col = COLUMN + (x + OFFSET_X) / EAST
    row = ROW - depth / NORTH
    c, r = int(col), int(row)
    dx, dy = col - c, row - r
    a, b = sample(tile, c, r), sample(tile, c + 1, r)
    g, h = sample(tile, c, r + 1), sample(tile, c + 1, r + 1)
    return ((a + (b - a) * dx) * (1 - dy) + (g + (h - g) * dx) * dy - DATUM) * SCALE


def sample(tile, col, row):
    height = tile[row * SIZE + col]
    if height == -32768:
        raise ValueError(f"No elevation at tile sample {col}, {row}")
    return height


def drainage(tile):
    """Find the steepest downslope neighbour, then accumulate upstream cells."""
    xmin, xmax, ymin, ymax = COLUMN - 75, COLUMN + 178, ROW - 206, ROW - 23
    heights = {
        (x, y): sample(tile, x, y)
        for x in range(xmin, xmax + 1)
        for y in range(ymin, ymax + 1)
    }
    measures = [
        (dx, dy, hypot(dx * EAST, dy * NORTH))
        for dx in (-1, 0, 1)
        for dy in (-1, 0, 1)
        if dx or dy
    ]
    downstream = {}
    flow = dict.fromkeys(heights, 1)
    for (x, y), height in heights.items():
        best = 0
        for dx, dy, length in measures:
            step = (x + dx, y + dy)
            gradient = (height - heights.get(step, height)) / length
            if gradient > best:
                best = gradient
                downstream[(x, y)] = step
    for cell in sorted(heights, key=heights.__getitem__, reverse=True):
        if step := downstream.get(cell):
            flow[step] += flow[cell]
    return downstream, flow


def waterfall(tile, downstream, flow, start, joins=None):
    line, cell = [], start
    while cell != joins and len(line) < 90:
        col, row = cell
        height = (sample(tile, col, row) - DATUM) * SCALE
        line.append([round((col - COLUMN) * EAST - OFFSET_X, 4),
                     round((row - ROW) * NORTH, 4), flow[cell]])
        step = downstream.get(cell)
        if height < -11.2 or not step:
            break
        cell = step
    return line, cell


def terrace_axis(tile):
    """Trace the east bank along a common elevation above the river."""
    axis_depths = range(68, 119, 4)
    bank = []
    for depth in axis_depths:
        profile = [(x / 4, elevation(tile, x / 4, depth)) for x in range(-130, 241)]
        _, low = min(profile, key=lambda row: row[1])
        floor = next(i for i, (_, h) in enumerate(profile) if h == low)
        east = next(x for x, h in profile[floor:] if h >= -6.2)
        bank.append([depth, east])
    return [[d, round(mean(p[1] for p in bank[max(0, i - 1):i + 2]), 4)]
            for i, (d, _) in enumerate(bank)]


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Pinned N23E102.hgt.gz. Otherwise download the public tile.")
    parser.add_argument("--output", type=Path, default=Path(OUTPUT))
    args = parser.parse_args()
    if args.source:
        raw = args.source.read_bytes()
    else:
        with urlopen(URL, timeout=90) as response:
            raw = response.read()
    if sha256(raw).hexdigest() != SOURCE_HASH:
        raise ValueError("The source tile does not match the documented SHA-256.")
    tile = array("h")
    tile.frombytes(decompress(raw))
    if byteorder == "little":
        tile.byteswap()
    if len(tile) != SIZE * SIZE:
        raise ValueError("The tile is not an SRTM one-arc-second grid.")
    columns = axis([(-710, -180, 15), (-180, -45, 4.4), (-45, 58, 1.55),
                    (58, 180, 4.3), (180, 780, 14)])
    depths = axis([(18, 147, 1.45), (147, 312, 3.8), (312, 695, 9.1)])
    packet = array("h", [round(elevation(tile, x, d) / HEIGHT_STEP) for d in depths for x in columns])
    if byteorder == "big":
        packet.byteswap()
    downstream, flow = drainage(tile)
    main_line, _ = waterfall(tile, downstream, flow, (1166, 1480))
    side_line, _ = waterfall(tile, downstream, flow, (1171, 1490), joins=(1163, 1493))
    assert len(main_line) > 20 and len(side_line) > 3
    encoded = b64encode(packet.tobytes()).decode("ascii")
    header = "// Generated by scripts/build-pine-gate-elevation.py. See docs/licenses/pine-gate-elevation.md.\n"
    prefix = (
        f"export const columns = {dumps(columns, separators=(',', ':'))};\n"
        f"export const depths = {dumps(depths, separators=(',', ':'))};\n"
        f"export const heightStep = {HEIGHT_STEP};\n"
        f"export const terraceAxis = {dumps(terrace_axis(tile), separators=(',', ':'))};\n"
        f"export const drains = {dumps([main_line, side_line], separators=(',', ':'))};\n"
    )
    data = "export const elevations = `\n" + "\n".join(wrap(encoded, 110)) + "\n`;\n"
    args.output.write_text(header + prefix + data)
    print(f"{len(columns)} × {len(depths)} samples, {len(packet) * 2} quantised bytes")
    print(f"Drainage reaches: {len(main_line)} main samples, {len(side_line)} side samples")


if __name__ == "__main__":
    main()
