"""Small terrain-seated hamlet at the foot of the western field trail."""

import math

from pine_valley_terrain import Batch, stations
from pine_valley_terrace_routes import contour_run, downslope_metrics, horizontal_normal, maximum_toe_gap


def append_faces(batch, points, faces):
    offset = len(batch.points)
    batch.points.extend(points)
    batch.faces.extend(tuple(offset + j for j in face) for face in faces)


def build_house(land, batches, lane, spec):
    lane_x, lane_d, lane_y = lane
    width, depth, setback, eave, pitch, tile = spec
    dx = land.height(lane_x - .37, lane_d) - land.height(lane_x + .37, lane_d)
    dd = land.height(lane_x, lane_d - .37) - land.height(lane_x, lane_d + .37)
    slope = math.hypot(dx, dd)
    out_x, out_d = dx / slope, dd / slope
    x, d = lane_x + out_x * (depth / 2 + setback), lane_d + out_d * (depth / 2 + setback)

    def point(a, b, y):
        return x + a * out_d + b * out_x, d - a * out_x + b * out_d, y

    def ground(a, b):
        px, pd, _ = point(a, b, 0.)
        return land.height(px, pd)

    w, r = width / 2, depth / 2
    hw, hr = w + .12, r + .13
    rim = ([(a, -hr) for a in stations(-hw, hw, math.ceil(2 * hw / .14))[:-1]]
           + [(hw, b) for b in stations(-hr, hr, math.ceil(2 * hr / .14))[:-1]]
           + [(a, hr) for a in stations(hw, -hw, math.ceil(2 * hw / .14))[:-1]]
           + [(-hw, b) for b in stations(hr, -hr, math.ceil(2 * hr / .14))[:-1]])
    high = max(ground(a, b) for a in stations(-hw, hw, 16) for b in stations(-hr, hr, 12))
    floor = max(high + .071, lane_y - .52)
    toes = [point(a, b, min(floor - .045, ground(a, b) - .045)) for a, b in rim]
    caps = [point(a, b, floor) for a, b in rim]
    n = len(rim)
    append_faces(batches['foundations'], toes + caps,
                 [tuple(reversed(range(n))), tuple(range(n, n * 2))]
                 + [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)])

    roof_x, roof_d = w + .14, r + .15
    roof_base = floor + eave
    wall_top = roof_base + pitch * (1 - r / roof_d) - .020
    ring = [(-w, -r), (w, -r), (w, r), (-w, r)]
    body = [point(a, b, h) for h in (floor, wall_top) for a, b in ring]
    body.extend((point(-w, 0., roof_base + pitch - .020), point(w, 0., roof_base + pitch - .020)))
    append_faces(batches['earth_walls'], body, [(3, 2, 1, 0), (0, 1, 5, 4), (1, 2, 6, 9, 5),
                                               (2, 3, 7, 6), (3, 0, 4, 8, 7), (4, 5, 9, 8), (8, 9, 6, 7)])

    rows = []
    for b in (-roof_d, -.74 * roof_d, -.44 * roof_d, -.16 * roof_d, 0.,
              .16 * roof_d, .44 * roof_d, .74 * roof_d, roof_d):
        rise = pitch * (1 - abs(b) / roof_d)
        rows.append([point(a, b, roof_base + rise + .023 * (a / roof_x) ** 2
                           + .007 * math.cos(i * 1.7 + b * 14.))
                     for i, a in enumerate(stations(-roof_x, roof_x, 8))])
    batches['tile_roofs' if tile else 'slate_roofs'].loft(rows)

    # Let the shaded opening read without lamps or separate interior detail.
    door_b = -r - .002
    append_faces(batches['wood'], [point(a, door_b, floor + h) for a, h in
                                  ((-.16, 0.), (.16, 0.), (.16, .73), (-.16, .73))], [(0, 1, 2, 3)])
    sill = point(0., -hr, floor)
    porch, aprons = [], []

    def apron_row(t, h):
        px, pd = (a + (b - a) * t for a, b in zip(lane[:2], sill[:2]))
        half = .24 + .015 * t
        porch.append([(px - out_d * half, pd + out_x * half, h),
                      (px + out_d * half, pd - out_x * half, h)])
        aprons.append([(a, b, min(y - .035, land.height(a, b) - .035)) for a, b, y in porch[-1]])

    steps = max(1, math.ceil(abs(floor - lane_y) / .175))
    for i in range(steps):
        begin, end = i / steps, (i + 1) / steps
        height = lane_y + (floor - lane_y) * begin
        apron_row(begin, height)
        apron_row((begin + end) * .5, height)
        apron_row(end, height)
    apron_row(1., floor)
    batches['path'].loft(porch)
    for side in (0, 1):
        rows = [[base[side], deck[side]] for base, deck in zip(aprons, porch)]
        batches['foundations'].loft(rows, reverse=side == 1)
    return {'centre': (x, d, floor), 'apronEnd': sill, 'doorThreshold': point(0., -r, floor), 'apronSteps': steps,
            'routeStart': lane, 'maximumFoundationGapMetres': maximum_toe_gap(land, toes + toes[:1]),
            'maximumApronGapMetres': max(maximum_toe_gap(land, [row[s] for row in aprons]) for s in (0, 1)),
            'minimumPadAboveGroundMetres': floor - high, 'depthExtent': (min(p[1] for p in toes), max(p[1] for p in toes))}


def lower_village(land, trail_end):
    x, d, y = trail_end
    lift = y - land.height(x, d)
    walk = contour_run(land, d, d + 7.83, y, y - .91, lift)
    walk[0] = trail_end
    batches = {name: Batch() for name in ('path', 'foundations', 'earth_walls', 'slate_roofs', 'tile_roofs', 'wood')}
    tread, left, right = [], [], []
    for i, (px, pd, h) in enumerate(walk):
        nx, nd = horizontal_normal(walk, i)
        width = .24 + .019 * math.sin(i * .38)
        edges = []
        for side, fall in ((-1, .018), (1, .023)):
            run = width
            ex, ed = px + side * nx * run, pd + side * nd * run
            while run > .14 and h - fall < land.height(ex, ed) + .008:
                run *= .90
                ex, ed = px + side * nx * run, pd + side * nd * run
            edges.append((ex, ed, h - fall))
        edge0, edge1 = edges
        tread.append([edge0, (px, pd, h), edge1])
        for side, edge, bank in ((-1, edge0, left), (1, edge1, right)):
            tx, td = px + side * nx * (width + .13), pd + side * nd * (width + .13)
            toe = (tx, td, land.height(tx, td) - .038)
            bank.append([toe, edge] if side < 0 else [edge, toe])
    batches['path'].loft(tread)
    batches['foundations'].loft(left)
    batches['foundations'].loft(right)
    houses = []
    for at, spec in ((2.04, (2.28, 1.31, .54, 1.04, .38, False)),
                     (4.51, (1.88, 1.16, .87, .92, .33, True)),
                     (7.21, (2.09, 1.26, .63, .99, .35, False))):
        lane = min(walk, key=lambda p: abs(p[1] - d - at))
        houses.append(build_house(land, batches, lane, spec))
    toe_gap = max(maximum_toe_gap(land, [row[0] for row in left]),
                  maximum_toe_gap(land, [row[-1] for row in right]))
    gap = max([toe_gap] + [h[key] for h in houses for key in ('maximumFoundationGapMetres', 'maximumApronGapMetres')])
    roofs = batches['slate_roofs'].points + batches['tile_roofs'].points
    max_depth = max(pd for _, pd, _ in roofs)
    drainage_clearance = min(land.east_water(pd) - px for px, pd, _ in roofs)
    if gap > .005 or max_depth >= 87. or drainage_clearance < 15.:
        raise ValueError(f'West village placement failed: footing {gap:.4f} m, depth {max_depth:.3f} m, '
                         f'east creek clearance {drainage_clearance:.3f} m.')
    batches['receipt'] = {'pathStart': walk[0], 'pathEnd': walk[-1], 'joinGapMetres': math.dist(walk[0], trail_end),
                          'maximumToeGapMetres': gap, 'maximumRoofDepthMetres': max_depth,
                          'minimumPlanDistanceWestOfEastCreekMetres': drainage_clearance,
                          'lane': downslope_metrics(walk), 'houses': houses}
    return batches
