"""Instanced pine crown shapes for the scaled SRTM forest."""

import math
import random

from pine_valley_terrain import Batch

# Irregular tree architecture at leaf-cluster LOD. The approach's hero trees
# use the same primary-bough/lateral/needle hierarchy at individual-needle LOD.
PROFILES = (
    (.20, .24, .018, .11),  # young, narrow leader and live lower branches
    (.30, .34, .072, .25),  # mature, wider and asymmetric
    (.43, .32, .115, .37),  # seasoned ridge pine with windward bias
    (.24, .27, .082, .18),  # secondary grove crown
)


def plus(a, b, distance=1.):
    return tuple(x + y * distance for x, y in zip(a, b))


def unit(vector):
    length = math.hypot(*vector)
    return tuple(value / length for value in vector)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def lerp_point(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def add_wood(batch, marks, bends, radii, sides):
    first = len(batch.points)
    for i, (point, radius) in enumerate(zip(bends, radii)):
        axis = unit(plus(bends[min(i + 1, len(bends) - 1)], bends[max(0, i - 1)], -1.))
        sideways = unit(cross(axis, (0., 1., 0.) if abs(axis[2]) > .92 else (0., 0., 1.)))
        around = cross(axis, sideways)
        for side in range(sides):
            angle = math.tau * side / sides
            radial = plus(tuple(v * math.cos(angle) for v in sideways), around, math.sin(angle))
            batch.points.append(plus(point, radial, radius))
            if i < len(bends) - 1:
                a, b = first + i * sides + side, first + i * sides + (side + 1) % sides
                batch.faces.append((a, b, b + sides, a + sides))
                marks.append(1)
    end = first + (len(bends) - 1) * sides
    batch.faces.append(tuple(end + i for i in range(sides)))
    marks.append(1)


def fascicle(batch, marks, root, direction, length, phase, rng, far):
    across = unit(cross(direction, (0., 1., 0.) if abs(direction[2]) > .92 else (0., 0., 1.)))
    up = cross(direction, across)
    for blade in range(3 if far else 4):
        angle = phase + blade * 2.39 + rng.uniform(-.31, .31)
        out = plus(tuple(v * math.cos(angle) for v in across), up, math.sin(angle))
        spine = unit(plus(direction, out, rng.uniform(.39, 1.1)))
        side = unit(cross(spine, out))
        extent = length * rng.uniform(.67, 1.23)
        tip = plus(plus(root, spine, extent), (0., 0., 1.), extent * rng.uniform(-.13, .24))
        mid = plus(plus(root, spine, extent * .43), out, extent * .068)
        breadth = extent * rng.uniform(.20, .32)
        i = len(batch.points)
        batch.points.extend((root, plus(mid, side, breadth), tip,
                             plus(mid, side, -breadth), plus(mid, out, breadth * .49)))
        # A shallow folded blade represents one spray of needles at valley scale.
        batch.faces.extend(((i, i + 1, i + 4), (i + 1, i + 2, i + 4),
                            (i + 2, i + 3, i + 4), (i + 3, i, i + 4)))
        marks.extend((0, 0, 0, 0))


def spray_canopy(batch, marks, anchor, heading, span, breadth, roll):
    """A folded field of short needle joints behind each outer twig."""

    horizontal = unit((heading[0], heading[1], 0.))
    across = unit((-horizontal[1], horizontal[0], roll))
    first = len(batch.points)
    for p, width, elevation in ((0., .40, -.03), (.34, .94, -.09),
                                (.65, .72, .10), (.94, .15, .27)):
        center = plus(plus(anchor, heading, p * span), (0., 0., 1.), elevation * breadth)
        asymmetry = .86 + .18 * math.sin(5.3 * p + roll)
        batch.points.extend((plus(center, across, width * breadth * asymmetry),
                             plus(center, (0., 0., 1.), breadth * .38 * width),
                             plus(center, across, -width * breadth)))
    for j in range(3):
        for lane in range(2):
            a = first + j * 3 + lane
            batch.faces.append((a, a + 1, a + 4, a + 3))
            marks.append(0)


def crown_mesh(index, far):
    rng = random.Random(5273 + index * 23)
    lower, reach, lean, asymmetry = PROFILES[index]
    batch, marks = Batch(), []
    sway = rng.uniform(-.053, .039)

    def stem(z):
        return (lean * z * z, sway * z * z + .018 * math.sin(z * 4.9) * z, z)

    ring_positions = (-.028, .11, .29, .51, .73, .96, 1.02)
    add_wood(batch, marks, [stem(z) for z in ring_positions],
             [.002 + .022 * (1. - min(z, 1.)) ** 1.4 for z in ring_positions], 4 if far else 6)
    layers = 10 if far else 15
    for i in range(layers):
        f = max(.001, (i + rng.uniform(-.14, .53)) / layers)
        z = lower + f * (1. - lower)
        basis = stem(z)
        azimuth = i * 2.39996 + rng.uniform(-.47, .47)
        forward = (math.cos(azimuth), math.sin(azimuth), 0.)
        side = (-forward[1], forward[0], 0.)
        length = reach * rng.uniform(.71, 1.26) * (1. - .79 * f ** 1.48)
        length *= 1. - asymmetry * math.cos(azimuth + .95)
        sag = rng.uniform(.095, .29) * length
        upturn = rng.uniform(.24, .62) * length
        swivel = rng.uniform(-.23, .22) * length
        elbow = plus(plus(basis, forward, length * .54), (0., 0., -sag * .54))
        end = plus(plus(plus(basis, forward, length), side, swivel), (0., 0., upturn - sag))
        add_wood(batch, marks, (basis, elbow, end), (length * .042, length * .019, length * .004),
                 3 if far else 4)
        if f < .72:
            spray_canopy(batch, marks, basis, forward, length * .98, length * .29, swivel * 5.)
        for j, t in enumerate((.52, .79, 1.) if not far else (.61, .97)):
            root = lerp_point(basis, elbow, t / .54) if t <= .54 else lerp_point(elbow, end, (t - .54) / .46)
            sign = (-1.) ** (i + j)
            direction = unit(plus(plus(forward, side, sign * rng.uniform(.41, .94)), (0., 0., rng.uniform(.08, .78))))
            tip = plus(root, direction, length * rng.uniform(.20, .40))
            add_wood(batch, marks, (root, tip), (length * .011, max(.001, length * .002)), 3)
            if f < .83:
                spray_canopy(batch, marks, root, direction, length * .68, length * .24, sign * .37)
            buds = (.30, .73, 1.) if not far else (.43, .96)
            for t in buds:
                anchor = lerp_point(root, tip, t)
                twig = unit(plus(direction, (0., 0., .21), rng.uniform(.02, .9)))
                leaf = rng.uniform(.066, .121) * (1. - .31 * f)
                fascicle(batch, marks, anchor, twig, leaf, rng.uniform(0., math.tau), rng, far)

    for level in (.89, .934, .969, .991):
        heading = level * 81.
        axis = unit((.41 * math.cos(heading), .41 * math.sin(heading), .89))
        fascicle(batch, marks, stem(level), axis, .059, heading, rng, far)
    return batch, marks
