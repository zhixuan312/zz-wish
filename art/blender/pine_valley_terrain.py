"""Elevation and landscape meshes for the Pine Gate Cycles plates."""

import base64
from bisect import bisect_right
from dataclasses import dataclass, field
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import re
import struct

ROOT = Path(__file__).resolve().parents[2]
ELEVATION = ROOT / 'web/src/engine/places/pine-gate-elevation.data.js'
ELEVATION_SHA256 = '08775a297288efb8bf5d10cda9e83f5933fad67a893cc9a593d9e634b3e1c70b'
FIELD_NEAR, FIELD_FAR = 87., 116.
FAR_START = 214.
OFFSETS = (-10.4, -7.6, -4.8, -1.7, 1.7, 4.8, 7.8, 10.6)
HEIGHTS = (-7.31, -6.68, -6.05, -5.42, -4.79, -4.16, -3.53)


def clamp(value, low=0., high=1.):
    return min(high, max(low, value))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3. - 2. * t)


def stations(a, b, count):
    return [lerp(a, b, i / count) for i in range(count + 1)]


def enclosing(axis, value):
    i = clamp(bisect_right(axis, value) - 1, 0, len(axis) - 2)
    return i, clamp((value - axis[i]) / (axis[i + 1] - axis[i]))


class Landscape:
    def __init__(self):
        raw = ELEVATION.read_bytes()
        if sha256(raw).hexdigest() != ELEVATION_SHA256:
            raise ValueError('Pine Gate elevation recipe output differs from its pinned hash.')
        source = raw.decode()

        def setting(name):
            return json.loads(re.search(rf'^export const {name} = (.+?);$', source, re.M)[1])

        self.x = setting('columns')
        self.depths = sorted(set((*setting('depths'), FAR_START)))
        self.axis = setting('terraceAxis')
        self.drains = setting('drains')
        block = re.search(r'^export const elevations = `([\s\S]+?)`;', source, re.M)[1]
        data = base64.b64decode(block)
        measured_depths = setting('depths')
        stride = len(self.x)
        step = setting('heightStep')
        samples = [sample * step for sample, in struct.iter_unpack('<h', data)]
        if len(samples) != stride * len(measured_depths) or step != .02:
            raise ValueError('Unexpected Pine Gate elevation grid shape or scale.')
        self.heights = []
        for depth in self.depths:
            j, t = enclosing(measured_depths, depth)
            exposure = smooth(18., 42., depth)
            river = self.east_water(depth)
            for i, x in enumerate(self.x):
                h = lerp(samples[j * stride + i], samples[(j + 1) * stride + i], t)
                self.heights.append(self.grade(x, depth, lerp(-29., h, exposure), river))

    def center(self, depth):
        first = self.axis[0][0]
        t = clamp((depth - first) / 4., 0., len(self.axis) - 1)
        i = min(int(t), len(self.axis) - 2)
        return lerp(self.axis[i][1], self.axis[i + 1][1], t - i)

    def east_water(self, depth):
        crossings = []
        for a, b in zip(self.drains[0], self.drains[0][1:]):
            if min(-a[1], -b[1]) <= depth <= max(-a[1], -b[1]):
                crossings.append(lerp(a[0], b[0], (depth + a[1]) / (a[1] - b[1]))
                                 if a[1] != b[1] else min(a[0], b[0]))
        return min(crossings, default=math.inf)

    def edge(self, depth, index, river=None):
        center = self.center(depth) + 2.8
        river = self.east_water(depth) if river is None else river
        spread = min(1.13 + .57 * smooth(90., 113., depth),
                     max(.56, (river - 1.95 - center) / (OFFSETS[-1] + 1.1)))
        bank = .81 * math.sin(depth * .26 + index * .71) + .40 * math.sin(depth * .62 - index * .83)
        return center + spread * OFFSETS[index] + bank

    def grade(self, x, depth, height, river):
        if x < -60. or x > 90. or not 82. < depth < 133.:
            return height
        left, right = self.edge(depth, 0, river), self.edge(depth, 7, river)
        end = smooth(82., 87., depth) * (1. - smooth(116., 133., depth))
        east = max(right + .4, min(right + 17., river - .68))
        margin = smooth(left - 8.2, left, x) * (1. - smooth(right, east, x))
        graded = lerp(-7.93, -3.87, clamp((x - left) / (right - left)))
        return lerp(height, graded, margin * end)

    def height(self, x, depth):
        i, u = enclosing(self.x, x)
        j, v = enclosing(self.depths, depth)
        stride = len(self.x)
        a = j * stride + i
        h = self.heights
        if u + v <= 1.:
            return h[a] + u * (h[a + 1] - h[a]) + v * (h[a + stride] - h[a])
        d = h[a + stride + 1]
        return d + (1. - u) * (h[a + stride] - d) + (1. - v) * (h[a + 1] - d)

    def terrain(self, far):
        cut = self.depths.index(FAR_START)
        rows = range(cut, len(self.depths)) if far else range(cut + 1)
        points, faces, normals = [], [], []
        stride = len(self.x)
        for j in rows:
            back, front = max(0, j - 1), min(len(self.depths) - 1, j + 1)
            for i, x in enumerate(self.x):
                left, right = max(0, i - 1), min(stride - 1, i + 1)
                points.append((x, self.depths[j], self.heights[j * stride + i]))
                rx = (self.heights[j * stride + left] - self.heights[j * stride + right]) / (self.x[right] - self.x[left])
                ry = (self.heights[back * stride + i] - self.heights[front * stride + i]) / (self.depths[front] - self.depths[back])
                length = math.sqrt(rx * rx + ry * ry + 1.)
                normals.append((rx / length, ry / length, 1. / length))
        for j in range(len(rows) - 1):
            for i in range(stride - 1):
                a = j * stride + i
                b = a + stride
                faces.extend(((a, a + 1, b), (a + 1, b + 1, b)))
        return Batch(points, faces, normals=normals)


@dataclass
class Batch:
    points: list = field(default_factory=list)
    faces: list = field(default_factory=list)
    masks: list = field(default_factory=list)
    normals: list = field(default_factory=list)
    sediment_faces: list = field(default_factory=list)

    def loft(self, rows, weights=None, reverse=False):
        start, width = len(self.points), len(rows[0])
        for j, row in enumerate(rows):
            self.points.extend(row)
            if weights is not None:
                self.masks.extend([weights[j]] * width)
            if j >= len(rows) - 1:
                continue
            for i in range(width - 1):
                a = start + j * width + i
                b = a + width
                quad = (a, a + 1, b + 1, b)
                self.faces.append(quad[::-1] if reverse else quad)


def earth_contact(batch, land, edge, across, width, reverse=False):
    rows, weights = [], []
    for t in stations(0., 1., 5):
        mix = smooth(0., 1., t)
        row = []
        for x, depth, height in edge:
            x2, d2 = across(x, depth, t * width)
            offset = height - land.height(x, depth)
            row.append((x2, d2, land.height(x2, d2) + lerp(offset, -.12, mix)))
        rows.append(row)
        weights.append(1. - mix)
    batch.loft(rows, weights, reverse)


def paddies(land):
    banks, floods, seedlings = Batch(), Batch(), Batch()
    ends = [[], []]
    audit = []
    rng = random.Random(1459)
    for index, base in enumerate(HEIGHTS):
        split = 98.5 + 2.7 * math.sin(index * .74 + .35)
        near = FIELD_NEAR + .86 + 1.5 * math.sin(index * .93) ** 2
        # Leave the highest bed's headland against the native rock spur.
        if index == len(HEIGHTS) - 1:
            near += .61
        spans = ((near, split - .21), (split + .37, FIELD_FAR - 1.14 - 1.8 * math.cos(index * 1.12) ** 2))
        transverse = (spans[0][0] - .32, (spans[0][1] + spans[1][0]) * .5, spans[1][1] + .32)
        ticks = sorted(set(stations(FIELD_NEAR, FIELD_FAR, 66) + [
            c + offset for c in transverse for offset in (-.24, -.085, .085, .24)
        ]))
        bed, outer_left, outer_right = [], [], []
        for depth in ticks:
            x0, x1 = land.edge(depth, index), land.edge(depth, index + 1)
            cross = .23 * clamp((.24 - min(abs(depth - c) for c in transverse)) / .155)
            crest = .224 + .017 * math.sin(depth * .41 + index * 1.21)
            profile = ((.24, 0), (.31, crest), (.37, crest), (.46, 0),
                       (x1 - x0 - .49, 0), (x1 - x0 - .41, crest), (x1 - x0 - .36, crest),
                       (x1 - x0 - .30, 0))
            row = [(x0 + offset, depth, base + max(h, cross)) for offset, h in profile]
            bed.append(row)
            if index:
                outer_left.append([(x0, depth, HEIGHTS[index - 1] + .085), row[0]])
            outer_right.append([row[-1], (x1, depth, base + .085)])
        first = len(banks.faces)
        banks.loft(bed, [1.] * len(bed))
        for j, (front, back) in enumerate(zip(bed, bed[1:])):
            midpoint = .5 * (front[3][1] + back[3][1])
            submerged = max(front[3][2], back[3][2]) < base + .056
            if submerged and any(a <= midpoint <= b for a, b in spans):
                banks.sediment_faces.append(first + 7 * j + 3)
        if outer_left:
            banks.loft(outer_left, [1.] * len(outer_left))
        else:
            earth_contact(banks, land, [row[0] for row in bed], lambda x, d, t: (x - t, d), 1.5)
        banks.loft(outer_right, [1.] * len(bed))
        if index == len(HEIGHTS) - 1:
            earth_contact(banks, land, [row[-1] for row in outer_right],
                          lambda x, d, t: (x + t, d), 1.5, reverse=True)

        for end, (row, outer) in enumerate(((bed[0], outer_right[0]), (bed[-1], outer_right[-1]))):
            x0, depth, _ = row[0]
            x1 = row[-1][0]
            ends[end].extend([(x, depth, base) for x in stations(x0, x1, 6)] + [outer[-1]])

        water_height = base + .056
        for a, b in spans:
            def edges(depth):
                return land.edge(depth, index) + .452, land.edge(depth, index + 1) - .487

            rows = []
            for depth in stations(a, b, 48):
                x0, x1 = edges(depth)
                rows.append([(x0, depth, water_height), (x1, depth, water_height)])
            floods.loft(rows)
            audit.append({'bed': index + 1, 'start': a, 'end': b, 'water': water_height,
                          'minimumCrestClearance': min(.23, .224 - .017) - .056})

            # The young rice leaves most of the water open to the sky.
            for depth in stations(a + .35, b - .35, max(1, round((b - a) / .46))):
                x0, x1 = edges(depth)
                for fraction in (.20, .41, .62, .82):
                    if rng.random() < .22:
                        continue
                    x = lerp(x0, x1, fraction) + rng.uniform(-.06, .06)
                    d = depth + rng.uniform(-.08, .08)
                    z = base + .017
                    for _ in range(3):
                        angle, blade = rng.uniform(0., math.tau), rng.uniform(.13, .24)
                        dx, dy = math.cos(angle), math.sin(angle)
                        k = len(seedlings.points)
                        seedlings.points.extend(((x - dy * .018, d + dx * .018, z),
                                                 (x + dy * .018, d - dx * .018, z),
                                                 (x + dx * .09, d + dy * .09, z + blade)))
                        seedlings.faces.append((k, k + 1, k + 2))

    for end, profile in enumerate(ends):
        def across(x, depth, offset):
            shifted = depth + (offset if end else -offset)
            return x + land.center(shifted) - land.center(depth), shifted

        earth_contact(banks, land, profile, across, 1.9, reverse=not end)
    return banks, floods, seedlings, audit


def forest_spacing(depth, far):
    if far:
        return lerp(1.02, 4.1, smooth(FAR_START, 660., depth))
    return lerp(.49, .83, smooth(57., FAR_START, depth))


def climate(x, depth, size, salt):
    ix, iz = math.floor(x / size), math.floor(depth / size)

    def patch(ax, az):
        key = ((ax + 2009) * 0x9e3779b1 ^ (az + 1877) * 0x85ebca6b ^ salt) & 0xffffffff
        key = ((key ^ (key >> 16)) * 0x45d9f3b) & 0xffffffff
        return (key ^ (key >> 16)) / 4294967295.

    u, v = smooth(0., 1., x / size - ix), smooth(0., 1., depth / size - iz)
    return lerp(lerp(patch(ix, iz), patch(ix + 1, iz), u), lerp(patch(ix, iz + 1), patch(ix + 1, iz + 1), u), v)


def forest_points(land, far, variants=4):
    rng = random.Random(6624 + far)
    batches = [([], [], []) for _ in range(variants)]
    start = FAR_START if far else 27.
    end = min(land.depths[-1], 810.) if far else FAR_START
    d0 = start
    while d0 < end:
        spacing = forest_spacing(d0, far)
        lateral = min(land.x[-1] - 2., 1.34 * (d0 + 8.))
        for col in range(math.ceil(lateral * 2. / spacing)):
            depth = d0 + rng.uniform(.045, .955) * spacing
            x = -lateral + (col + rng.uniform(.025, .975)) * spacing
            if depth >= end or not land.x[0] + 2. < x < land.x[-1] - 2.:
                continue
            y = land.height(x, depth)
            if y < -28.6:
                continue
            river = math.inf if far else land.east_water(depth)
            from_stream = abs(x - river)
            if from_stream < .28 + .18 * (.5 + .5 * math.cos(depth * 1.04)):
                continue
            if not far and 84. < depth < 119. and land.edge(depth, 0, river) - .86 < x < land.edge(depth, 7, river) + .80:
                continue

            steep = math.hypot(land.height(x + .65, depth) - land.height(x - .65, depth),
                               land.height(x, depth + .65) - land.height(x, depth - .65)) / 1.3
            wet = climate(x, depth, 16., 197)
            patch = climate(x, depth, 4.7, 331)
            ridge = smooth(.88, 2.8, steep)
            density = lerp(.80, .995, .64 * wet + .36 * patch) * lerp(1., .65, ridge)
            if rng.random() > density:
                continue

            stream_shrub = 1. - smooth(.43, 1.35, from_stream)
            age = clamp(.64 * rng.random() + .36 * wet - .06 * ridge - .36 * stream_shrub)
            height = lerp(.40, 1.20, age ** .95)
            width = lerp(.82, 1.28, patch) * height * (1. + .24 * stream_shrub)
            if age < .32:
                kind = 0
            elif ridge > .39 or (wet > .58 and patch < .48):
                kind = 2
            else:
                kind = rng.choice((1, 1, 3))
            points, scales, rotation = batches[kind]
            points.append((x, depth, y - .029))
            scales.append((width, width, height))
            rotation.append((rng.uniform(-.112, .112), rng.uniform(-.112, .112), rng.uniform(0., math.tau)))
        d0 += spacing
    return batches


def drainage(land):
    creek, falls = Batch(), Batch()
    selected = None
    for branch, route in enumerate(land.drains):
        route = [(x, -z, area) for x, z, area in route]
        expanded = []
        for i in range(len(route) - 1):
            p0, p1, p2, p3 = route[max(i - 1, 0)], route[i], route[i + 1], route[min(i + 2, len(route) - 1)]
            for t in stations(0., 1., 5)[:-1]:
                def catmull(axis):
                    a, b, c, d = p0[axis], p1[axis], p2[axis], p3[axis]
                    return .5 * ((2. * b) + (c - a) * t + (2. * a - 5. * b + 4. * c - d) * t * t
                                 + (d - a + 3. * (b - c)) * t ** 3)

                expanded.append((catmull(0), catmull(1), lerp(p1[2], p2[2], t)))
        expanded.append(route[-1])
        rows = []
        for i, (x, depth, area) in enumerate(expanded):
            before, after = expanded[max(0, i - 1)], expanded[min(len(expanded) - 1, i + 1)]
            dx, dd = after[0] - before[0], after[1] - before[1]
            segment = max(.001, math.hypot(dx, dd))
            width = (.10 + .20 * math.sqrt(min(area, 1600.) / 1600.)) * (.64 if branch else 1.)
            width *= .79 + .20 * math.sin(depth * 1.38 + .43 * x) + .10 * math.sin(depth * 4.29)
            row = []
            for side in (-1., -.67, -.30, 0., .34, .72, 1.):
                edge, edge_depth = x + dd / segment * side * width, depth - dx / segment * side * width
                # Let narrow damp runnels meet the native bank by intersection.
                # A raised edge draws a continuous artificial line on a steep slope.
                lip = .033 + .011 * math.sin(depth * 2.2 + .8 * x)
                lip -= .061 * smooth(.34, 1., abs(side))
                row.append((edge, edge_depth, land.height(edge, edge_depth) + lip))
            rows.append(row)
            if branch or i < len(expanded) * .26 or i > len(expanded) * .78:
                continue
            for end in expanded[i + 5:i + 24]:
                span = math.hypot(end[0] - x, end[1] - depth)
                if not 3.7 < span < 5.2:
                    continue
                high, low = land.height(x, depth), land.height(*end[:2])
                if low < -8.50 or high - low < max(2.2, selected[2] if selected else 0.):
                    continue
                selected = ((x, depth, high), (end[0], end[1], low), high - low)
        creek.loft(rows)

    if selected is None:
        raise ValueError('The pinned drainage no longer contains its measured reach.')
    start, end, drop = selected
    dx, dd = end[0] - start[0], end[1] - start[1]
    reach = math.hypot(dx, dd)
    rows = []
    for t in stations(0., 1., 46):
        x, depth = lerp(start[0], end[0], t), lerp(start[1], end[1], t)
        width = .27 - .075 * math.sin(t * math.pi) + .095 * t
        row = []
        for lane in (-1., -.65, -.30, 0., .31, .64, 1.):
            offset = width * (lane + .054 * math.sin(t * 57. + lane * 4.))
            y = start[2] - drop * t ** 1.57 + .061 - .13 * (1. - smooth(.04, .28, t))
            y += .025 * math.sin(lane * 11. + t * 51.) * math.sin(math.pi * t)
            row.append((x + dd / reach * offset, depth - dx / reach * offset, y))
        rows.append(row)
    falls.loft(rows)
    occluded = sum(y < land.height(x, depth) for x, depth, y in falls.points)
    return creek, falls, end, {'dropMetres': drop, 'reachMetres': reach, 'occludedVertices': occluded,
                               'vertices': len(falls.points), 'buriedCreekBankVertices': sum(
                                   y < land.height(x, depth) for x, depth, y in creek.points)}
