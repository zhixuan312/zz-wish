"""Measured boulder shoulders for the five-course Pine set-stone study."""

import math

# Poly Haven rock_moss_set_01_rock03, Kless Gyzen, CC0-1.0. The registered
# geometry stream has SHA-256 de8360e6175879aaf02c171911069cf5f1852547f9ca7f10e440085dbcc3315e.
# Normalize local positions to this rock's bounds. For each of the +z and
# -z directions, take the first surface at heights .40 and .64, across
# x=.18 to .82 inclusive in steps of .04. Save inward-facing depths in
# thousandths of the scan span. The original scan stays outside Pine's package.
ROCK_SECTIONS = (
    (
        (894, 882, 871, 868, 855, 840, 828, 820, 813, 808, 814, 824, 831, 832, 831, 828, 825),
        (808, 787, 764, 748, 722, 714, 712, 704, 695, 687, 687, 693, 703, 709, 706, 704, 704),
    ),
    (
        (887, 904, 925, 921, 925, 920, 925, 926, 922, 925, 936, 928, 921, 917, 912, 900, 885),
        (782, 779, 780, 770, 789, 793, 794, 791, 783, 780, 764, 753, 742, 717, 708, 697, 697),
    ),
)

SCAN_TREAD_COURSES = range(23, 28)


def clamp(value, low, high):
    return min(high, max(low, value))


def blend(low, high, value):
    t = clamp((value - low) / (high - low), 0., 1.)
    return t * t * (3. - 2. * t)


def scan_depth(section, u):
    sample = clamp(u, 0., 1.) * (len(section) - 1)
    i = min(len(section) - 2, int(sample))
    return .001 * (section[i] + (section[i + 1] - section[i]) * (sample - i))


def bounds(points):
    return tuple((min(axis), max(axis)) for axis in zip(*points))


def scanned_tread_shoulder(points, count, width, depth, centre, variant):
    """Fit the measured face between the existing footing and crown rings."""
    limits = bounds(points)
    toe, shoulder = ROCK_SECTIONS[variant % len(ROCK_SECTIONS)]
    cx, _, cz = centre
    fitted = list(points)
    for i in range(count, 2 * count):
        x, y, z = points[i]
        # Keep every span-defining extreme and the bridge-facing uphill seam.
        if any(coord in limit for coord, limit in zip(points[i], limits)):
            continue
        inside = (x - cx) / width
        nose = blend(.015, .42, (z - cz) / depth)
        if nose == 0.:
            continue
        u = .5 + inside * (-1 if variant & 2 else 1)
        lower, upper = scan_depth(toe, u), scan_depth(shoulder, u)
        ledge = lower - upper
        advance = nose * clamp(depth * (.24 * ledge + .18 * (lower - .865)), .005, .038)
        # At the ends of the nose the same seated stone closes part of the
        # deep joint below the crown. No face may leave its fitting envelope.
        flank = blend(.25, .49, abs(inside))
        reach = nose * flank * depth * clamp(ledge * .16, .01, .03)
        x = clamp(x + math.copysign(reach, inside), *limits[0])
        lo = points[i - count][1] + .028
        hi = points[i + count][1] - .023
        if lo > hi:
            raise RuntimeError('Scanned tread shoulder has no space between its original rings.')
        y = clamp(y + nose * clamp(depth * .2 * (upper - .745), -.013, .013), lo, hi)
        fitted[i] = (x, clamp(y, *limits[1]), clamp(z + advance, *limits[2]))
    if bounds(fitted) != limits:
        raise RuntimeError('Scanned tread shoulder changed its surveyed bounds.')
    return fitted
