"""Level spring paddies cut into the western off-site slope."""

from bisect import bisect_left, bisect_right
from dataclasses import dataclass
import math
import random

from pine_valley_terrain import Batch, PADDY_WATER_DEPTH, lerp, smooth, stations


CONTOUR_LEVELS = (3.1, 2.1, 1.1, .1, -.9, -1.9, -2.9, -3.9, -4.9)
FIELD_DEPTH = (39.7, 63.6)
PORT_DEPTHS = (51.5, 58.5)
BUND_HEIGHT = .123
SKIRT_WIDTH = 2.7
SPILL_HALF_WIDTH = .15
GRADE_DATUM = -.9
TERRACE_GRADE_FRACTION = .60


@dataclass(frozen=True)
class Pond:
    floor: float
    start: float
    end: float

    @property
    def level(self):
        return self.floor + PADDY_WATER_DEPTH


def fitted_contour(land, depth, elevation):
    """Find the surveyed contour on the eastern face of the western spur."""
    left, right = -23., 7.
    if not land.height(left, depth) > elevation > land.height(right, depth):
        raise ValueError(f'The western field contour at {depth:.2f} m is outside the surveyed hillside.')
    for _ in range(22):
        x = .5 * (left + right)
        if land.height(x, depth) > elevation:
            left = x
        else:
            right = x
    return .5 * (left + right)


class NearTerraces:
    def __init__(self, land):
        self.land = land
        self.ponds = tuple(
            # Carry cut from the high side into the lower shoulders. Keep the
            # contour plan and use less abrupt retaining faces within it.
            Pond(lerp(GRADE_DATUM, .5 * (upper + lower), TERRACE_GRADE_FRACTION)
                 + irregularity - PADDY_WATER_DEPTH,
                 FIELD_DEPTH[0] + a, FIELD_DEPTH[1] - b)
            for upper, lower, a, b, irregularity in zip(CONTOUR_LEVELS, CONTOUR_LEVELS[1:],
                (1.05, .61, .49, .85, 1.14, 1.75, 2.05, 2.55),
                (1.23, .74, .51, .77, 1.19, 1.66, 2.31, 2.88),
                (0., .08, -.014, -.05, .068, -.07, .04, 0.))
        )
        # Each bed lets out into its immediate neighbour. Alternating the
        # gaps makes water cross each basin before it goes on downstream.
        self.spill_depths = (53.2, 57.2, 52.7, 56.5, 52.1, 55.6, 51.65)
        fit_depths = stations(*FIELD_DEPTH, 72)
        self.contours = {depth: tuple(fitted_contour(land, depth, height) for height in CONTOUR_LEVELS)
                         for depth in fit_depths}
        self.depths = tuple(self.contours)
        xmin = min(values[0] for values in self.contours.values()) - SKIRT_WIDTH - .44
        xmax = max(values[-1] for values in self.contours.values()) + SKIRT_WIDTH + .44
        self.x0, self.x1 = land.x[bisect_right(land.x, xmin) - 1], land.x[bisect_left(land.x, xmax)]
        self.d0 = land.depths[bisect_right(land.depths, FIELD_DEPTH[0] - SKIRT_WIDTH) - 1]
        self.d1 = land.depths[bisect_left(land.depths, FIELD_DEPTH[1] + SKIRT_WIDTH)]

    @property
    def bounds(self):
        return self.x0, self.x1, self.d0, self.d1

    def edges(self, depth):
        i = min(len(self.depths) - 2, max(0, bisect_right(self.depths, depth) - 1))
        a, b = self.depths[i:i + 2]
        t = min(1., max(0., (depth - a) / (b - a)))
        return tuple(lerp(left, right, t) for left, right in zip(self.contours[a], self.contours[b]))

    def forest_margin(self, x, depth):
        if not self.x0 - 3. < x < self.x1 + 3. or not self.d0 - 3. < depth < self.d1 + 3.:
            return math.inf
        edges = self.edges(depth)
        along = max(FIELD_DEPTH[0] + .25 - depth, depth - FIELD_DEPTH[1] + .45, 0.)
        across = max(edges[0] - x, x - edges[-1], 0.)
        return math.hypot(across, along)

    def spill(self, index, depth):
        edges = self.edges(depth)
        left, seam, right = edges[index:index + 3]
        return (lerp(left, seam, .80), lerp(seam, right, .26),
                self.ponds[index].level, self.ponds[index + 1].level)

    def opening(self, index, depth):
        edges = self.edges(depth)
        if index == 0:
            left, right = edges[:2]
            level = self.ponds[0].level
            return left, lerp(left, right, .28), level, level
        left, right = edges[-2:]
        level = self.ponds[-1].level
        return lerp(left, right, .75), right, level, level

    def row(self, depth, native_columns):
        edges = self.edges(depth)
        profile = []
        for index, pond in enumerate(self.ponds):
            left, right = edges[index:index + 2]
            end = min(abs(depth - pond.start), abs(depth - pond.end))
            cross = BUND_HEIGHT * (1. - smooth(.052, .23, end))
            # The outer bank ties to the fitted contour. The short inner
            # face is a steep old stone revetment supporting the terrace.
            if not index:
                profile.append((left, pond.floor + BUND_HEIGHT))
            else:
                rise = self.ponds[index - 1].floor - pond.floor
                wear = .024 * math.sin(depth * 2.73 + index * 1.56)
                for fraction, course in ((.041, .92), (.074, .68), (.104, .56), (.139, .17)):
                    profile.append((lerp(left, right, fraction),
                                    pond.floor + rise * course + .109 + wear))
            for fraction, rise in ((.16, .111), (.25, 0.), (.33, 0.), (.72, 0.), (.77, 0.),
                                   (.89, .117), (.96, .115), (1., BUND_HEIGHT)):
                x = lerp(left, right, fraction)
                profile.append((x, pond.floor + max(rise, cross)))

        release = smooth(self.d0, FIELD_DEPTH[0], depth) * (1. - smooth(FIELD_DEPTH[1], self.d1, depth))
        profile_x = [point[0] for point in profile]
        adapted = list(native_columns)
        adapted.extend(position for position, _height in profile)
        adapted.extend((edges[0] - SKIRT_WIDTH, edges[-1] + SKIRT_WIDTH))
        gates = []
        for i, spill_depth in enumerate(self.spill_depths):
            head, tail, high, low = self.spill(i, depth)
            adapted.extend((head, tail))
            if abs(depth - spill_depth) <= SPILL_HALF_WIDTH + .08:
                gates.append((head, tail, high, low, abs(depth - spill_depth)))
        for i, port_depth in enumerate(PORT_DEPTHS):
            head, tail, high, low = self.opening(i, depth)
            adapted.append(tail if i == 0 else head)
            if abs(depth - port_depth) <= SPILL_HALF_WIDTH + .08:
                gates.append((head, tail, high, low, abs(depth - port_depth)))
        # Include the natural grid coordinates in every row. The outside
        # edges then meet each original DEM triangle with zero height error.
        values, cultivated, moisture = [], [], []
        for x in sorted(adapted):
            index = min(len(profile) - 2, max(0, bisect_right(profile_x, x) - 1))
            a, b = profile[index:index + 2]
            part = min(1., max(0., (x - a[0]) / (b[0] - a[0])))
            terrace_height = lerp(a[1], b[1], part)
            for head, tail, high, low, lateral in gates:
                if head <= x <= tail:
                    fade = 1. - smooth(SPILL_HALF_WIDTH, SPILL_HALF_WIDTH + .075, lateral)
                    flow = lerp(high, low, (x - head) / (tail - head))
                    terrace_height = lerp(terrace_height, flow - .024, fade)
            across = max(edges[0] - x, x - edges[-1], 0.)
            blend = release * (1. - smooth(0., SKIRT_WIDTH, across))
            natural = self.land.height(x, depth)
            values.append((x, depth, lerp(natural, terrace_height, blend)))
            cultivated.append(blend)
            moisture.append(blend * (1. - smooth(.04, .54, min(abs(terrace_height - pond.level)
                                                               for pond in self.ponds))))
        return values, cultivated, moisture

    def meshes(self):
        earth, floods, shoots, spills, grass = Batch(), Batch(), Batch(), Batch(), Batch()
        steps = set(stations(self.d0, self.d1, 124)) | set(self.depths)
        steps.update(depth for depth in self.land.depths if self.d0 <= depth <= self.d1)
        for pond in self.ponds:
            for end in (pond.start, pond.end):
                steps.update(end + shift for shift in (-.23, -.10, -.052, 0., .052, .10, .23))
        for d in (*self.spill_depths, *PORT_DEPTHS):
            steps.update(d + shift for shift in (-.225, -.15, -.065, 0., .065, .15, .225))
        columns = [x for x in self.land.x if self.x0 <= x <= self.x1]
        rows = []
        self.ground_depths = sorted(steps)
        for depth in self.ground_depths:
            values, cultivated, moisture = self.row(depth, columns)
            rows.append(values)
            earth.masks.extend(cultivated)
            earth.moisture.extend(moisture)
        earth.loft(rows)
        earth.faces = [triangle for a, b, c, d in earth.faces for triangle in ((a, b, d), (b, c, d))]

        seam = [*rows[0], *rows[-1], *(p for row in rows for p in (row[0], row[-1]))]
        if any(abs(y - self.land.height(x, depth)) > 1e-8 for x, depth, y in seam):
            raise ValueError('The new terrace patch no longer meets the original hillside.')
        self.ground_rows = rows

        audit = []
        rng = random.Random(8027)
        for index, pond in enumerate(self.ponds):
            rows = []
            widths = []
            for depth in stations(pond.start, pond.end, 83):
                left, right = self.edges(depth)[index:index + 2]
                widths.append(right - left)
                rows.append([(lerp(left, right, fraction), depth, pond.level) for fraction in (.17, .889)])
            floods.loft(rows)
            if min(widths) < .52:
                raise ValueError(f'Working width of western paddy {index + 1} is too narrow to enclose water.')

            # Leave irregular planting gaps through the shallow clear water.
            d = pond.start + .30
            while d < pond.end - .29:
                left, right = self.edges(d)[index:index + 2]
                for across in (.32, .51, .69):
                    if rng.random() > .65:
                        continue
                    x = lerp(left, right, across) + rng.uniform(-.05, .05)
                    for _ in range(3):
                        angle, blade = rng.uniform(0., math.tau), rng.uniform(.09, .16)
                        self.rooted_blade(shoots, x, d, angle, .009, .055, blade)
                d += rng.uniform(.39, .56)
            audit.append({'bed': index + 1, 'waterLevelMetres': pond.level, 'waterDepthMetres': PADDY_WATER_DEPTH,
                          'minimumWidthMetres': min(widths), 'maximumWidthMetres': max(widths),
                          'startDepthMetres': pond.start, 'endDepthMetres': pond.end})
            for depth in stations(pond.start + .28, pond.end - .28, 93):
                if rng.random() < .22 or any(abs(depth - notch) < .24 for notch in (*PORT_DEPTHS, *self.spill_depths)):
                    continue
                left, right = self.edges(depth)[index:index + 2]
                self.grass_tuft(grass, rng, lerp(left, right, rng.uniform(.91, .981)), depth, (.075, .169))
                # The wall has breaks of bare masonry between the grass that
                # has rooted on its lower shelves. Keep the young rice clear.
                succession = math.sin(depth * 1.72 + index * .86) + .41 * math.sin(depth * 3.65)
                if index and succession > -.38:
                    self.grass_tuft(grass, rng, lerp(left, right, rng.uniform(.068, .138)), depth, (.16, .29))

        courses = [(self.spill, i, d) for i, d in enumerate(self.spill_depths)]
        courses.extend((self.opening, i, d) for i, d in enumerate(PORT_DEPTHS))
        for profile, index, depth in courses:
            rows = []
            for t in stations(0., 1., 17):
                row = []
                for side in (-.082, 0., .082):
                    head, tail, high, low = profile(index, depth + side)
                    row.append((lerp(head, tail, t), depth + side, lerp(high, low, t) + .003))
                rows.append(row)
            spills.loft(rows, reverse=True)

        return earth, floods, shoots, spills, grass, self.audit(audit, spills, shoots, grass)

    def grass_tuft(self, grass, rng, x, depth, height_range):
        for _ in range(rng.randint(5, 9)):
            site = depth + rng.uniform(-.083, .083)
            angle = rng.uniform(0., math.tau)
            offset, height = rng.uniform(.006, .017), rng.uniform(*height_range)
            self.rooted_blade(grass, x, site, angle, offset, .041, height)

    def rooted_blade(self, plants, x, depth, angle, width, lean, height):
        dx, dz = math.cos(angle), math.sin(angle)
        first = len(plants.points)
        roots = [(x + side * dz * width, depth - side * dx * width) for side in (-1, 1)]
        root_heights = [self.ground_height(px, pd) - .005 for px, pd in roots]
        plants.points.extend((px, pd, y) for (px, pd), y in zip(roots, root_heights))
        plants.points.append((x + dx * lean, depth + dz * lean, max(root_heights) + height))
        plants.faces.append((first, first + 1, first + 2))

    def audit(self, beds, spills, shoots, grass):
        depths, crests = [], []
        for index, pond in enumerate(self.ponds):
            for depth in stations(pond.start + .30, pond.end - .30, 36):
                left, right = self.edges(depth)[index:index + 2]
                for fraction in (.30, .38, .50, .62, .73):
                    depths.append(pond.level - self.ground_height(lerp(left, right, fraction), depth))
                if all(abs(depth - spill) > .235 for spill in (*self.spill_depths, *PORT_DEPTHS)):
                    for fraction in (.16, .90):
                        crests.append(self.ground_height(lerp(left, right, fraction), depth) - pond.level)
            for end in (pond.start, pond.end):
                left, right = self.edges(end)[index:index + 2]
                for fraction in (.26, .5, .75):
                    crests.append(self.ground_height(lerp(left, right, fraction), end) - pond.level)
        supported = [height - self.ground_height(x, depth) for x, depth, height in spills.points]
        root_gaps = [height - self.ground_height(x, depth) for batch in (shoots, grass)
                     for i, (x, depth, height) in enumerate(batch.points) if i % 3 != 2]
        if min(depths) < .033 or min(crests) < .040:
            raise ValueError('The evaluated western terraces do not hold their shallow water.')
        if min(supported) < .005 or max(supported) > .058:
            raise ValueError(f'The evaluated western spill courses are not supported: {min(supported)} to {max(supported)} m.')
        if max(root_gaps) > .002:
            raise ValueError('A new western rice or grass blade has a visible root gap.')
        return {'beds': beds, 'waterDepthChecks': len(depths), 'minimumWaterMetres': min(depths),
                'crestChecks': len(crests), 'minimumCrestMetres': min(crests),
                'spillChecks': len(supported), 'spillWaterOverCourseMetres': [min(supported), max(supported)],
                'rootChecks': len(root_gaps), 'maximumRootGapMetres': max(root_gaps)}

    def ground_height(self, x, depth):
        if not self.x0 < x < self.x1 or not self.d0 < depth < self.d1:
            return self.land.height(x, depth)
        index = bisect_right(self.ground_depths, depth) - 1
        front, back = self.ground_rows[index:index + 2]
        along = (depth - front[0][1]) / (back[0][1] - front[0][1])
        columns = [lerp(a[0], b[0], along) for a, b in zip(front, back)]
        i = bisect_right(columns, x) - 1
        left = lerp(front[i][2], back[i][2], along)
        middle_x = lerp(front[i + 1][0], back[i][0], along)
        middle = lerp(front[i + 1][2], back[i][2], along)
        right = lerp(front[i + 1][2], back[i + 1][2], along)
        if x <= middle_x and middle_x > columns[i]:
            return lerp(left, middle, (x - columns[i]) / (middle_x - columns[i]))
        return lerp(middle, right, (x - middle_x) / (columns[i + 1] - middle_x))

    def ports(self):
        intake_depth, outlet_depth = PORT_DEPTHS
        return ((self.edges(intake_depth)[0], intake_depth, self.ponds[0].level),
                (self.edges(outlet_depth)[-1], outlet_depth, self.ponds[-1].level))
