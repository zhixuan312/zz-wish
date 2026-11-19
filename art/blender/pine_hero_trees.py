"""Reusable pine crowns built on surveyed trunk centerlines.

The base tier models needle fascicles as narrow solid sections. The offline
tier models individual needles among denser secondary and tertiary growth.
"""

from dataclasses import dataclass
from itertools import chain
import math
import random

from mathutils import Vector


@dataclass(frozen=True)
class PineCrown:
    levels: tuple[float, ...]
    reach: float
    branch_sag: float
    crown_lift: float
    lean: float


CROWNS = {
    'young': PineCrown((.35, .43, .48, .54, .60, .65, .71, .76, .82, .88, .93),
                       .172, .069, .124, .034),
    'ridge': PineCrown((.31, .43, .47, .52, .60, .64, .69, .76, .81, .87, .92),
                       .209, .102, .168, .105),
    'old': PineCrown((.44, .49, .53, .59, .63, .65, .69, .72, .75, .79, .84, .89, .94),
                     .254, .149, .216, .184),
}


def trunk_point(points, fraction):
    height = points[0].y + fraction * (points[-1].y - points[0].y)
    index = next(i for i, end in enumerate(points[1:]) if height <= end.y)
    a, b = points[index], points[index + 1]
    return a.lerp(b, (height - a.y) / (b.y - a.y))


def prototype_trunk(profile, height):
    """Eight bent trunk rings for the freestanding render prototype."""

    start = Vector((0., 0., 0.))
    points, radii = [], []
    for step in range(8):
        f = step / 7
        drift = height * profile.lean * f ** 2
        points.append(start + Vector((drift + .024 * height * math.sin(f * 4.5) * f,
                                      height * f, -.22 * drift + .017 * height * math.sin(f * 5.2) * f)))
        radii.append(height * (.0011 + (.018 + profile.lean * .136) * (1 - f) ** 1.15))
    return points, radii


def needle_fascicle(anchor, following, spread, reach, rng, dense):
    axis = following.normalized()
    side = axis.cross(Vector((0., 1., 0.)))
    if side.length < .01:
        side = axis.cross(Vector((1., 0., 0.)))
    side.normalize()
    up = axis.cross(side)
    for blade in range(7 if dense else 4):
        angle = spread + blade * 2.39 + rng.uniform(-.32, .32)
        radial = math.cos(angle) * side + math.sin(angle) * up
        length = reach * rng.uniform(.71, 1.24)
        flare = rng.uniform(.44, .91)
        tip = anchor + axis * (length * rng.uniform(.75, 1.04)) + radial * (length * flare)
        shoulder = anchor + (tip - anchor) * .53 + radial * (length * rng.uniform(-.14, .06))
        width = rng.uniform(.0016, .0042) if dense else rng.uniform(.0045, .0095)
        yield anchor, shoulder, tip, width


def grow_crown(name, profile, trunk, phase, bark, write_wood, *, dense=False):
    """Build irregular primary forks, secondary wood, younger shoots and needles."""

    rng = random.Random(name)
    height = trunk[-1].y - trunk[0].y
    needles = []
    world_up = Vector((0., 1., 0.))
    for order, layer in enumerate(profile.levels):
        # Stagger the main limbs around the swept stem and turn the growing
        # crown toward the open side of the ridge.
        f = layer + rng.uniform(-.019, .017)
        origin = trunk_point(trunk, f)
        angle = phase + order * 2.34 + .81 * math.sin(order * 1.41) + rng.uniform(-.42, .42)
        forward = Vector((math.cos(angle), 0., math.sin(angle)))
        side = forward.cross(world_up)
        upper_crown = (layer - profile.levels[0]) / (1 - profile.levels[0])
        reach = height * profile.reach * rng.uniform(.68, 1.24) * (1 - .76 * upper_crown ** 1.33)
        if profile == CROWNS['old']:
            reach *= .87 + .26 * math.cos(angle - phase - .48)
        swivel = rng.uniform(-.32, .29)
        liftoff = profile.crown_lift * rng.uniform(.71, 1.66)
        sag = profile.branch_sag * rng.uniform(.63, 1.34)
        branch = [
            origin + reach * (forward * t + side * (swivel * t ** 1.5) +
                              world_up * (-sag * t + liftoff * t ** 3))
            for t in (0., .24, .57, .81, 1.)
        ]
        label = f'{name} asymmetric bough {order + 1}'
        base_width = reach * rng.uniform(.029, .058)
        write_wood(label, branch, [base_width * f for f in (1., .75, .49, .27, .058)],
                   bark, 6 if dense else 5)

        divisions = (0., .24, .57, .81, 1.)
        for fork, t in enumerate((.18, .29, .43, .56, .68, .80, .93) if dense else (.19, .36, .53, .71, .9)):
            t += rng.uniform(-.039, .035)
            lower = next(i for i, end in enumerate(divisions[1:]) if t <= end)
            blend = (t - divisions[lower]) / (divisions[lower + 1] - divisions[lower])
            root = branch[lower].lerp(branch[lower + 1], blend)
            sign = -1 if (fork + order) % 2 else 1
            axis = (forward * rng.uniform(.47, .97) + side * sign * rng.uniform(.37, .89) +
                    world_up * rng.uniform(.04, .68)).normalized()
            length = reach * rng.uniform(.40, .66) * (1 - .48 * t)
            elbow = root + axis * (length * .48) - world_up * (length * .035)
            tip = root + axis * length + world_up * (length * rng.uniform(.07, .21))
            write_wood(f'{label} lateral twig {fork + 1}', [root, elbow, tip],
                       [length * factor for factor in (.040, .023, .004)], bark, 5 if dense else 3)

            buds = (.12, .21, .31, .42, .55, .65, .76, .87, .97) if dense else (.18, .36, .55, .72, .92)
            for bud, position in enumerate(buds):
                # Alternate live shoots along the twig instead of making an
                # umbrella with a separate flat bundle at the end.
                anchor = root.lerp(elbow, position * 2) if position < .5 else elbow.lerp(tip, (position - .5) * 2)
                younger = (tip - elbow).normalized()
                younger += side * (sign * math.cos(bud * 2.39) * rng.uniform(.24, .66))
                younger += world_up * rng.uniform(-.16, .43)
                spread = rng.uniform(-math.pi, math.pi)
                length_scale = min(1.26, max(.72, height / 8))
                leaf = rng.uniform(.102, .212) * length_scale * (1 - .29 * upper_crown)
                if dense and bud in (1, 3, 5):
                    stem = anchor + younger.normalized() * (leaf * rng.uniform(.45, .76))
                    write_wood(f'{label} new shoot {fork + 1}.{bud + 1}', [anchor, stem],
                               [leaf * .019, leaf * .006], bark, 3)
                    for f in (.47, .94):
                        needles.append(tuple(needle_fascicle(anchor.lerp(stem, f), younger, spread + f,
                                                        leaf * .78, rng, dense)))
                needles.append(tuple(needle_fascicle(anchor, younger, spread, leaf, rng, dense)))
                if not dense and bud == 3:
                    needles.append(tuple(needle_fascicle(anchor, younger + world_up * .24,
                                                    spread + 1.1, leaf * .87, rng, dense)))

    for level in (.88, .91, .941, .966, .982):
        root = trunk_point(trunk, level)
        heading = phase + level * 75
        axis = (trunk[-1] - root).normalized() + Vector((.56 * math.cos(heading), .21, .56 * math.sin(heading)))
        needles.append(tuple(needle_fascicle(root, axis, heading, height * .018, rng, dense)))
    return needles


def compact_fascicle(points, faces, charts, wind, blades):
    """Each twig attachment is one connected lightmap chart with tapered arms."""

    root = blades[0][0]
    axis = sum((tip - root for _, _, tip, _ in blades), Vector((0., 0., 0.))).normalized()
    if axis.length < .1:
        axis = (blades[0][2] - root).normalized()
    across = axis.cross(Vector((0., 1., 0.)))
    if across.length < .01:
        across = axis.cross(Vector((1., 0., 0.)))
    across.normalize()
    around = axis.cross(across)
    ordered = sorted(blades, key=lambda blade:
                     math.atan2((blade[2] - root).dot(around), (blade[2] - root).dot(across)))
    angles = [math.atan2((tip - root).dot(around), (tip - root).dot(across)) for _, _, tip, _ in ordered]
    bounds = [(angles[i] + (angles[i - 1] if i else angles[-1] - math.tau)) * .5
              for i in range(len(angles))]
    count = len(bounds)
    base_radius = .0034
    start = len(points)
    points.append(root)
    wind.append((.5, 0.))
    for angle in bounds:
        points.append(root + base_radius * (math.cos(angle) * across + math.sin(angle) * around))
        wind.append((.5, 0.))
    chart_step = math.tau / count
    ring = [(base_radius * math.cos(i * chart_step), base_radius * math.sin(i * chart_step))
            for i in range(count)]
    for i, (_, shoulder, tip, width) in enumerate(ordered):
        j = (i + 1) % count
        first, last = start + 1 + i, start + 1 + j
        front = len(points)
        flare = axis.cross(tip - root).normalized()
        if flare.length < .1:
            flare = across
        points.extend((shoulder - flare * width, shoulder + flare * width, tip))
        wind.extend(((0., .52), (1., .52), (.5, 1.)))
        faces.extend(((start, last, first), (first, last, front), (front, last, front + 1),
                      (front, front + 1, front + 2)))
        heading = (i + .5) * chart_step
        radial = Vector((math.cos(heading), math.sin(heading)))
        lateral = Vector((-radial.y, radial.x))
        at = (shoulder - root).length + base_radius
        tip_radius = at + (tip - shoulder).length
        narrow = min(width, at * math.tan(chart_step * .38))
        left, right = tuple(radial * at - lateral * narrow), tuple(radial * at + lateral * narrow)
        charts.extend((((0., 0.), ring[j], ring[i]), (ring[i], ring[j], left),
                       (left, ring[j], right), (left, right, tuple(radial * tip_radius))))


def needle_mesh(needles, *, compact=False):
    """Tapered needle sections, metric UV1, and rooted wind UV0."""

    points, faces, charts, wind = [], [], [], []
    if compact:
        for fascicle in needles:
            compact_fascicle(points, faces, charts, wind, fascicle)
        return points, faces, charts, wind

    for root, shoulder, tip, width in chain.from_iterable(needles):
        axis = (tip - root).normalized()
        across = axis.cross(Vector((0., 1., 0.)))
        if across.length < .01:
            across = axis.cross(Vector((1., 0., 0.)))
        across.normalize()
        around = axis.cross(across)
        start = len(points)
        terminal = (tip - shoulder).length
        stem = (shoulder - root).length
        for center, scale, extent in ((root, .45, 0.), (shoulder, 1., .52)):
            for index in range(3):
                angle = index * math.tau / 3
                cross = across * (math.cos(angle) * width) + around * (math.sin(angle) * width * .52)
                points.append(center + cross * scale)
                wind.append((index / 2, extent))
        points.append(tip)
        wind.append((.5, 1.))
        span = stem + terminal
        net = []
        # Unroll all three sides about one tip, with a seam on the back.
        # The two rings follow their actual taper and share each net edge.
        for radius, breadth in ((span, width * .64), (terminal, width * 1.43)):
            increment = math.atan2(breadth, radius)
            angles = [(i - 1.5) * increment for i in range(4)]
            net.append([(radius * math.sin(a), -radius * math.cos(a)) for a in angles])
        for index in range(3):
            a, b = index, (index + 1) % 3
            u, v = net[0][index:index + 2]
            s, t = net[1][index:index + 2]
            faces.append((start + a, start + b, start + 3 + b, start + 3 + a))
            charts.append((u, v, t, s))
            faces.append((start + 3 + a, start + 3 + b, start + 6))
            charts.append((s, t, (0., 0.)))
    return points, faces, charts, wind
