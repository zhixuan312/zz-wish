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
PADDY_WATER_DEPTH = .056
PADDY_LEFT_WATER_MARGIN, PADDY_RIGHT_WATER_MARGIN = .336, .341
LONG_BUND_RISE, LONG_BUND_VARIATION, CROSS_BUND_RISE = .106, .012, .104
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
        if 0 < index < len(OFFSETS) - 1:
            # The surveyed outer grade holds the footprint. Let the inner
            # bunds wrap in coherent bends around each side of the spur.
            fraction = index / (len(OFFSETS) - 1)
            swell = math.sin(math.pi * fraction)
            bank += swell * (.93 * math.sin((depth - FIELD_NEAR) * .33 + fraction * 2.7)
                             + .36 * math.sin((depth - FIELD_NEAR) * .69 - fraction * 3.1))
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

    def terrain(self, far, hole=None):
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
                if hole and not far:
                    x0, x1, d0, d1 = hole
                    if x0 <= self.x[i] < x1 and d0 <= self.depths[j] < d1:
                        continue
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
    moisture: list = field(default_factory=list)

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


def bank_moisture(land, banks, spans):
    # Follow the real wet footprint. A bank darkens above the waterline and
    # dries out as it leaves the pond, including across the end bunds.
    ranges = {}
    result = []
    for (x, depth, height), managed in zip(banks.points, banks.masks):
        if managed < .002:
            result.append(0.)
            continue
        if depth not in ranges:
            river = land.east_water(depth)
            edges = [land.edge(depth, i, river) for i in range(len(OFFSETS))]
            ranges[depth] = [(edges[bed['bed'] - 1] + PADDY_LEFT_WATER_MARGIN,
                              edges[bed['bed']] - PADDY_RIGHT_WATER_MARGIN,
                              max(0., bed['start'] - depth, depth - bed['end']), bed['water']) for bed in spans]
        candidates = ranges[depth]
        falloff = 0.
        for left, right, along, water in candidates:
            distance = math.hypot(max(0., left - x, x - right), along)
            if distance >= .43 or abs(height - water) >= .19:
                continue
            near = (1. - smooth(.038, .43, distance)) * (1. - smooth(.019, .19, abs(height - water)))
            falloff = max(falloff, near)
        result.append(falloff)
    return result


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
            if x1 - x0 <= PADDY_LEFT_WATER_MARGIN + PADDY_RIGHT_WATER_MARGIN + .02:
                raise ValueError(f'Paddy {index + 1} has no room for both banks at {depth:.3f} m.')
            cross = CROSS_BUND_RISE * clamp((.24 - min(abs(depth - c) for c in transverse)) / .155)
            crest = LONG_BUND_RISE + LONG_BUND_VARIATION * math.sin(depth * .41 + index * 1.21)
            profile = ((.15, 0), (.216, crest), (.267, crest), (.343, 0),
                       (x1 - x0 - .345, 0), (x1 - x0 - .274, crest), (x1 - x0 - .225, crest),
                       (x1 - x0 - .166, 0))
            row = [(x0 + offset, depth, base + max(h, cross)) for offset, h in profile]
            bed.append(row)
            if index:
                outer_left.append([(x0, depth, HEIGHTS[index - 1] + .085), row[0]])
            outer_right.append([row[-1], (x1, depth, base + .085)])
        first = len(banks.faces)
        banks.loft(bed, [1.] * len(bed))
        for j, (front, back) in enumerate(zip(bed, bed[1:])):
            midpoint = .5 * (front[3][1] + back[3][1])
            submerged = max(front[3][2], back[3][2]) < base + PADDY_WATER_DEPTH
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

        water_height = base + PADDY_WATER_DEPTH
        for a, b in spans:
            def edges(depth):
                return (land.edge(depth, index) + PADDY_LEFT_WATER_MARGIN,
                        land.edge(depth, index + 1) - PADDY_RIGHT_WATER_MARGIN)

            rows = []
            for depth in stations(a, b, 48):
                x0, x1 = edges(depth)
                rows.append([(x0, depth, water_height), (x1, depth, water_height)])
            floods.loft(rows)
            audit.append({'bed': index + 1, 'start': a, 'end': b, 'water': water_height,
                          'minimumCrestClearance': min(CROSS_BUND_RISE, LONG_BUND_RISE - LONG_BUND_VARIATION)
                          - PADDY_WATER_DEPTH})

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
    banks.moisture = bank_moisture(land, banks, audit)
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


def forest_site(land, x, depth, height):
    dx = (land.height(x + .65, depth) - land.height(x - .65, depth)) / 1.3
    down = (land.height(x, depth + .65) - land.height(x, depth - .65)) / 1.3
    steep = smooth(.68, 2.65, math.hypot(dx, down))
    # Shallow hollows retain moisture; outward shoulders with a sun-facing
    # slope dry faster. Sample far enough apart to cross the SRTM triangles.
    ring = 4.8
    hollow = (land.height(x - ring, depth) + land.height(x + ring, depth)
              + land.height(x, depth - ring) + land.height(x, depth + ring)) * .25 - height
    shelter = smooth(-.81, .76, hollow)
    exposed = .60 * steep + .25 * smooth(.13, 1.62, .62 * dx + .38 * down) + .15 * (1. - shelter)

    # Bend stand boundaries across the underlying lattice. Small pockets
    # distinguish regeneration gaps from the broader pattern of mature trees.
    warp = 12. * (climate(x, depth, 35., 6287) - .5)
    stand = climate(x + warp, depth - .61 * warp, 19., 197)
    pocket = climate(x - .57 * warp, depth + warp, 8.4, 2197)
    soil = .42 * stand + .36 * pocket + .22 * shelter - .13 * exposed
    return smooth(.14, .60, soil), exposed, pocket


def placed_crown(points, origin, scale, rotation):
    sx, sy, sz = scale
    rx, ry, rz = rotation
    ax, ay, az = math.sin(rx), math.sin(ry), math.sin(rz)
    bx, by, bz = math.cos(rx), math.cos(ry), math.cos(rz)
    ox, oy, oz = origin
    placed = []
    for x, y, z in points:
        x, y, z = x * sx, y * sy, z * sz
        y, z = bx * y - ax * z, ax * y + bx * z
        x, z = by * x + ay * z, -ay * x + by * z
        placed.append((ox + bz * x - az * y, oy + az * x + bz * y, oz + z))
    return placed


def crown_cells(points, faces, pitch):
    """Rasterize actual foliage triangles at ground-cell centres."""
    cells = set()
    for a, b, c in faces:
        triangle = sorted((points[a], points[b], points[c]), key=lambda point: point[1])
        left, middle, right = triangle
        if right[1] == left[1]:
            continue
        long_slope = (right[0] - left[0]) / (right[1] - left[1])
        for start, end in ((left, middle), (middle, right)):
            if end[1] == start[1]:
                continue
            short_slope = (end[0] - start[0]) / (end[1] - start[1])
            for row in range(math.ceil(start[1] / pitch - .5), math.ceil(end[1] / pitch - .5)):
                y = (row + .5) * pitch
                x1 = left[0] + (y - left[1]) * long_slope
                x2 = start[0] + (y - start[1]) * short_slope
                lo = math.ceil(min(x1, x2) / pitch - .5)
                hi = math.floor(max(x1, x2) / pitch - .5)
                cells.update((col, row) for col in range(lo, hi + 1))
    return cells


def understory_prototypes(count):
    from pine_valley_crowns import crown_mesh

    prototypes = []
    for kind in range(count):
        crown, material = crown_mesh(kind, False)
        faces = [(face[0], face[i], face[i + 1]) for face, mark in zip(crown.faces, material)
                 if mark != 1 for i in range(1, len(face) - 1)]
        prototypes.append((crown.points, faces))
    return prototypes


def grow_slope_understory(land, batches, water_ribbons):
    # The mature crowns in these two exposed shoulders leave
    # irregular openings where seedlings can establish.
    shoulder_bounds = ((-5.8, 15.3, 120.6, 138.0), (13.5, 35.5, 102.4, 122.5))
    pitch = .10
    prototypes = understory_prototypes(len(batches))
    rng = random.Random(67191)
    growth = [([], [], []) for _ in batches]
    water_points = [point for ribbon in water_ribbons for point in ribbon.points
                    if 99. < point[1] < 140. and -8. < point[0] < 38.]

    def stamp(kind, origin, scale, rotation):
        points, faces = prototypes[kind]
        return crown_cells(placed_crown(points, origin, scale, rotation), faces, pitch)

    for x0, x1, d0, d1 in shoulder_bounds:
        canopy, trunks = set(), {}
        for forest in (batches, growth):
            for kind, (points, scales, rotations) in enumerate(forest):
                for origin, scale, rotation in zip(points, scales, rotations):
                    x, depth, _ = origin
                    if not x0 - 3. <= x <= x1 + 3. or not d0 - 3. <= depth <= d1 + 3.:
                        continue
                    canopy.update(stamp(kind, origin, scale, rotation))
                    key = math.floor(x / .32), math.floor(depth / .32)
                    trunks.setdefault(key, []).append((x, depth))

        step = .28
        candidates = [(x0 + (col + rng.uniform(.12, .88)) * step, d0 + (row + rng.uniform(.12, .88)) * step)
                      for row in range(math.ceil((d1 - d0) / step)) for col in range(math.ceil((x1 - x0) / step))]
        rng.shuffle(candidates)
        for x, depth in candidates:
            edge = min(x - x0, x1 - x, depth - d0, d1 - depth)
            if edge <= 0 or rng.random() >= smooth(0., 2.2, edge):
                continue
            distance = min((math.hypot(x - wx, depth - wd) for wx, wd, _ in water_points), default=math.inf)
            if distance < 1.38:
                continue
            if FIELD_NEAR - 1.2 <= depth <= FIELD_FAR + 1.2:
                left, right = land.edge(depth, 0), land.edge(depth, 7)
                if left - 1.4 < x < right + 1.4:
                    continue
            key = math.floor(x / .32), math.floor(depth / .32)
            if any((x - tx) ** 2 + (depth - td) ** 2 < .25 ** 2
                   for a in range(key[0] - 1, key[0] + 2) for b in range(key[1] - 1, key[1] + 2)
                   for tx, td in trunks.get((a, b), ())):
                continue

            y = land.height(x, depth)
            grove, exposure, pocket = forest_site(land, x, depth, y)
            moisture = .57 * (1. - exposure) + .27 * pocket + .16 * grove
            # On sunny ridges only sheltered, wetter hollows regenerate.
            # Ground beside a channel stays open and the first trees are low.
            bank = smooth(1.38, 3.2, distance)
            if rng.random() > lerp(.65, .94, moisture) * lerp(.50, 1., bank):
                continue
            age = .43 * moisture + .57 * rng.random()
            height = lerp(.58, 1.24, age) * lerp(.72, 1., bank)
            width = min(1.78 * height, lerp(.96, 1.70, age) * rng.uniform(.89, 1.17))
            kind = 0 if rng.random() > lerp(.40, .72, moisture) else 3
            origin = (x, depth, y - .029)
            scale = (width, width * rng.uniform(.82, 1.), height)
            rotation = (rng.uniform(-.12, .12), rng.uniform(-.12, .12), rng.uniform(0., math.tau))
            cover = stamp(kind, origin, scale, rotation)
            # Interlocking edges are natural, but a shaded sapling below an
            # already filled footprint will not break up an open slope.
            if not cover or len(cover - canopy) < .57 * len(cover):
                continue
            points, scales, rotations = growth[kind]
            points.append(origin)
            scales.append(scale)
            rotations.append(rotation)
            canopy.update(cover)
            trunks.setdefault(key, []).append((x, depth))
    return growth


def forest_points(land, far, variants=4, near_terraces=None, clearings=()):
    rng = random.Random(6624 + far)
    batches = [([], [], []) for _ in range(variants)]
    start = FAR_START if far else 27.
    end = min(land.depths[-1], 810.) if far else FAR_START
    d0 = start
    while d0 < end:
        spacing = forest_spacing(d0, far)
        far_pitch = max(1., spacing / .90) if far else 1.
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
            field_side = math.inf
            if not far and 84. < depth < 119.:
                left, right = land.edge(depth, 0, river), land.edge(depth, 7, river)
                if left - .86 < x < right + .80:
                    continue
                field_side = min(abs(x - left), abs(x - right))

            grove, exposed, pocket = forest_site(land, x, depth, y)
            density = lerp(.70, .99, grove) - .17 * exposed * (1. - grove)
            if rng.random() > density:
                continue

            # Preserve the rice and watercourse edges when mature crowns widen.
            live_edge = min(smooth(.43, 2.2, from_stream), smooth(.8, 3.8, field_side))
            age = clamp(.56 * grove + .44 * rng.random() - .22 * (1. - live_edge))
            height = lerp(.57, 1.83, age) * (1. - .17 * exposed) * far_pitch ** .78
            width = lerp(.68, 2.68, grove) * lerp(.72, 1.24, .48 * age + .52 * pocket)
            aspect = lerp(.73, 1., clamp(.63 * pocket + .37 * age))
            width *= lerp(.51, 1., live_edge) * far_pitch ** .95
            variety = rng.random()
            if variety < lerp(.48, .07, grove):
                kind = 0
            elif exposed > .55 and variety > .64:
                kind = 2
            elif variety < lerp(.69, .49, grove):
                kind = 1
            else:
                kind = 3 if variety < .79 else 2
            if kind == 0:
                height *= .83
                width *= .86
            width = min(width, 1.85 * height)
            euler = (rng.uniform(-.112, .112), rng.uniform(-.112, .112), rng.uniform(0., math.tau))
            if not far and any((x - cx) ** 2 + (depth - d) ** 2 < (r + .22 * width) ** 2
                               for cx, d, r in clearings):
                continue
            if near_terraces and not far:
                clearance = near_terraces.forest_margin(x, depth)
                if clearance < .48 + width * .28:
                    continue
                width *= lerp(.68, 1., smooth(.9, 2.9, clearance))
                y = near_terraces.ground_height(x, depth)
            points, scales, rotation = batches[kind]
            points.append((x, depth, y - .029))
            scales.append((width, width * aspect, height))
            rotation.append(euler)
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
