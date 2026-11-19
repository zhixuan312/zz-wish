"""Surveyed west-slope irrigation and access for the nearer rice beds."""

import math

from pine_valley_terrain import Batch, lerp, smooth, stations


def contour_x(land, depth, elevation):
    """Intersect the falling cross-slope with a height on the west ridge."""
    west, east = -17., 10.5
    if not land.height(east, depth) <= elevation <= land.height(west, depth):
        raise ValueError(f'No west-slope contour at depth {depth:.3f}, height {elevation:.3f}.')
    for _ in range(30):
        x = (west + east) / 2
        if land.height(x, depth) > elevation:
            west = x
        else:
            east = x
    return (west + east) / 2


def contour_run(land, start_depth, end_depth, start_y, end_y, lift):
    count = max(2, math.ceil(abs(end_depth - start_depth) / .16))
    rows = []
    for t in stations(0., 1., count):
        depth, y = lerp(start_depth, end_depth, t), lerp(start_y, end_y, t)
        rows.append((contour_x(land, depth, y - lift), depth, y))
    return rows


def horizontal_normal(points, index):
    a = points[max(0, index - 1)]
    b = points[min(len(points) - 1, index + 1)]
    dx, dd = b[0] - a[0], b[1] - a[1]
    run = math.hypot(dx, dd)
    return dd / run, -dx / run


def downslope_metrics(points):
    runs, grades = [], []
    for a, b in zip(points, points[1:]):
        run = math.hypot(b[0] - a[0], b[1] - a[1])
        if run > 1e-8:
            runs.append(run)
            grades.append((a[2] - b[2]) / run)
    return {'lengthMetres': sum(runs), 'minimumGrade': min(grades), 'maximumGrade': max(grades)}


def maximum_toe_gap(land, toes):
    return max(y - land.height(x, d) for a, b in zip(toes, toes[1:]) for t in stations(0., 1., 5)
               for x, d, y in [tuple(lerp(u, v, t) for u, v in zip(a, b))])


def bed_toe_into_ground(land, rows, column):
    # A straight edge can bridge a small dip between two grounded vertices.
    # Sample along the whole edge and bury both ends by the required amount.
    toes = [row[column] for row in rows]
    settle = [0.] * len(toes)
    for i, (a, b) in enumerate(zip(toes, toes[1:])):
        correction = max(0., maximum_toe_gap(land, (a, b)) + .006)
        settle[i] = max(settle[i], correction)
        settle[i + 1] = max(settle[i + 1], correction)
    for row, drop in zip(rows, settle):
        x, depth, y = row[column]
        row[column] = (x, depth, y - drop)


def lined_water(land, points, half_width, water, lining, discharge=False):
    waters, beds = [], []
    exposures = []
    for i, (x, d, y) in enumerate(points):
        nx, nd = horizontal_normal(points, i)
        t = i / (len(points) - 1)
        width = half_width * (1. - .67 * t ** 5 if discharge else 1.)

        def at(offset, height=None):
            xx, dd = x + nx * offset, d + nd * offset
            ground = land.height(xx, dd)
            return (xx, dd, ground if height is None else height), ground

        edges = [at(side * width) for side in (-1, 1)]
        outside = [at(side * (width + .13)) for side in (-1, 1)]
        # The bed occupies the space from the stone wall to the outer foot.
        # Follow the surveyed ground at both toes, and tuck them 24 mm in.
        a, b = ((p[0], p[1], p[2] - .024) for p, _ in outside)
        left, right = (max(y + .046, g + .007) for _, g in edges)
        beds.append([a, at(-width - .025, left)[0], at(-width, y - .046)[0],
                     at(width, y - .046)[0], at(width + .025, right)[0], b])
        waters.append([at(-width * .91, y)[0], at(width * .91, y)[0]])
        exposures.append(y - land.height(x, d))
    for column in (0, -1):
        bed_toe_into_ground(land, beds, column)
    water.loft(waters)
    lining.loft(beds)
    gap = max(maximum_toe_gap(land, [row[i] for row in beds]) for i in (0, -1))
    return {'maximumToeGapMetres': gap, 'minimumWaterAboveGroundMetres': min(exposures),
            'maximumWaterAboveGroundMetres': max(exposures)}


def stone_chamber(land, upstream, inlet, water):
    """The short head difference is taken in a covered stone inlet."""
    chamber = Batch()
    x0, depth, head = upstream
    x1, depth1, sill = inlet
    rows, conduit = [], []
    for i, t in enumerate(stations(0., 1., 6)):
        x, d = lerp(x0, x1, t), lerp(depth, depth1, t)
        crown = min(land.height(x, d) + .039, lerp(head + .061, sill + .235, t))
        floor = lerp(head - .048, sill - .065, t)
        span = .136 + .021 * math.sin(i * .88)
        rows.append([(x, d - span - .05, min(floor, land.height(x, d - span - .05) - .035)),
                     (x, d - span, crown - .025), (x, d - span * .79, crown),
                     (x, d + span * .83, crown - .006), (x, d + span, crown - .029),
                     (x, d + span + .05, min(floor, land.height(x, d + span + .05) - .035))])
        height = lerp(head, sill, t)
        conduit.append([(x, d - .076, height), (x, d + .076, height)])
    chamber.loft(rows, reverse=True)
    water.loft(conduit, reverse=True)
    return chamber


def spring_stones(land, feeder, stones):
    x, d, _ = feeder[0]
    nx, nd = horizontal_normal(feeder, 0)
    for side, along, size in ((-.17, -.02, .13), (.17, -.025, .11), (.025, -.14, .12)):
        cx, cd = x + nx * side - nd * along, d + nd * side + nx * along
        rim, cap = [], []
        for i in range(7):
            angle = math.tau * i / 7
            dx, dd = size * math.cos(angle), size * math.sin(angle) * .71
            rim.append((cx + dx, cd + dd, land.height(cx + dx, cd + dd) - .021))
            xx, depth = cx + dx * .81, cd + dd * .79
            cap.append((xx, depth, max(rim[-1][2] + .048, land.height(xx, depth) + .069)))
        start = len(stones.points)
        stones.points.extend(rim + cap)
        stones.faces.append(tuple(start + i for i in reversed(range(7))))
        stones.faces.append(tuple(start + 7 + i for i in range(7)))
        for i in range(7):
            j = (i + 1) % 7
            stones.faces.append((start + i, start + j, start + j + 7, start + i + 7))


def access_path(land, outlet):
    x, d, water_y = outlet
    depth, end = d + 5.6, d + 16.1
    lift = .36
    # Start east of the outlet headland, including where the bank flares.
    first = min(land.height(x + .44, depth), water_y - .92) + lift
    # A narrow contour traverse leads to the descending fold. The toe is
    # an unbuilt approach to the lower valley, beyond both sets of paddies.
    trail = contour_run(land, depth, end, first, first - (end - depth) * .112, lift)

    tread, shoulders = Batch(), Batch()
    surfaces, banks_left, banks_right = [], [], []
    tread_clearances = []
    for i, (x, d, y) in enumerate(trail):
        nx, nd = horizontal_normal(trail, i)
        width = .244 + .025 * math.sin(i * .27) + .016 * math.sin(i * .113 + 1.7)

        def place(offset, h):
            return x + nx * offset, d + nd * offset, h

        row = [place(-width, y - .018), (x, d, y), place(width, y - .023)]
        highest = max(land.height(px, pd) - h + .009 for px, pd, h in row)
        row = [(px, pd, h + max(0., highest)) for px, pd, h in row]
        surfaces.append(row)
        tread_clearances.extend(h - land.height(px, pd) for px, pd, h in row)
        for side, edge, bank in ((-1, row[0], banks_left), (1, row[-1], banks_right)):
            px, pd, _ = place(side * (width + .17), y)
            rock_toe = (px, pd, land.height(px, pd) - .03)
            bank.append([rock_toe, edge] if side < 0 else [edge, rock_toe])
    bed_toe_into_ground(land, banks_left, 0)
    bed_toe_into_ground(land, banks_right, 1)
    tread.loft(surfaces)
    shoulders.loft(banks_left)
    shoulders.loft(banks_right)
    centres = [row[1] for row in surfaces]
    metrics = downslope_metrics(centres)
    metrics.update({'start': centres[0], 'villageTrailEnd': centres[-1],
                    'minimumTreadAboveGroundMetres': min(tread_clearances),
                    'maximumTreadAboveGroundMetres': max(tread_clearances),
                    'maximumToeGapMetres': max(maximum_toe_gap(land, [row[0] for row in banks_left]),
                                               maximum_toe_gap(land, [row[1] for row in banks_right]))})
    return tread, shoulders, metrics


def headland_steps(land, outlet, trail_head):
    """Join the dry outside bund to the traverse by short fitted stone treads."""
    x, depth, _ = outlet
    end_x, end_depth, end_height = trail_head
    start = depth + .52
    stones = Batch()
    run = end_depth - start
    count = max(2, math.ceil(run / .13))
    edges = stations(start, end_depth, count)
    treads = []
    for a, b in zip(edges, edges[1:]):
        center = lerp(x + .49, end_x, (.5 * (a + b) - start) / run)
        width = .172 + .017 * math.sin(a * 5.)
        corners = [(center + across * width, d) for d in (a, b) for across in (-1, 1)]
        incident = max(land.height(cx, d) for d in stations(a, b, 4)
                       for cx in stations(center - width, center + width, 3))
        surface = max(incident + .03, end_height + .11 * (end_depth - b))
        treads.append((corners, surface))
    authored_heights = [height for _, height in treads]
    heights = [max(height - .197 * abs(index - other) for other, height in enumerate(authored_heights))
               for index in range(count)]
    if abs(heights[-1] - end_height) > .20:
        raise ValueError('The headland steps cannot meet the lower footpath.')
    for (corners, _surface), surface in zip(treads, heights):
        start_vertex = len(stones.points)
        stones.points.extend((cx, d, land.height(cx, d) - .071) for cx, d in corners)
        stones.points.extend((cx, d, surface) for cx, d in corners)
        for face in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
                     (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)):
            stones.faces.append(tuple(start_vertex + i for i in face))
    return stones, {'treads': count, 'maximumRiseMetres': max(abs(a - b) for a, b in zip(heights, heights[1:]))}


def near_terrace_routes(land, inlet, outlet):
    """Return independent solid route batches in (x, depth, elevation) metres."""
    feeder_lift = .074
    x, d, _ = inlet
    mouth_x = x - .38
    mouth = (mouth_x, d, land.height(mouth_x, d) + feeder_lift)
    # The spring is fictional. Select a natural trough in the surveyed ridge
    # at the required head, west of the rice beds and below the uphill divide.
    head_y = mouth[2] + .126
    heads = []
    for delta in (-5.8, -4.8, -3.8, 3.8, 4.8, 5.8):
        depth = mouth[1] + delta
        px = contour_x(land, depth, head_y - feeder_lift)
        run = contour_run(land, depth, mouth[1], head_y, mouth[2], feeder_lift)
        if max(p[0] for p in run) > x - .23:
            continue
        h = land.height(px, depth)
        convergence = land.height(px, depth - .72) + land.height(px, depth + .72) - h * 2
        heads.append((convergence, run))
    if not heads or mouth[2] <= inlet[2]:
        raise ValueError('The west spring has no off-field gravity route to this inlet.')
    convergence, feeder = max(heads, key=lambda row: row[0])
    feeder[-1] = mouth

    out_x, out_d, out_y = outlet
    foot_d = out_d + .70
    foot_y = min(out_y - .53, land.height(out_x + .58, foot_d) + .082)
    # The short spill chute takes the head immediately outside the bund.
    chute = contour_run(land, out_d, foot_d, out_y, foot_y, .082)[:-1]
    chute[0] = outlet
    tail = contour_run(land, foot_d, out_d + 5.6, foot_y, foot_y - .52, .082)
    tail = [(px, pd, h - .074 * smooth(out_d + 4.7, out_d + 5.6, pd)) for px, pd, h in tail]
    drain = chute + tail

    channel, lining = Batch(), Batch()
    feeder_support = lined_water(land, feeder, .101, channel, lining)
    drain_support = lined_water(land, drain, .114, channel, lining, discharge=True)
    intake = stone_chamber(land, mouth, inlet, channel)
    spring_stones(land, feeder, intake)
    path, path_banks, path_receipt = access_path(land, outlet)
    stairs, stairs_receipt = headland_steps(land, outlet, path_receipt['start'])
    feeder_receipt = downslope_metrics(feeder)
    drain_receipt = downslope_metrics(drain)
    if min(feeder_receipt['minimumGrade'], drain_receipt['minimumGrade']) <= 0:
        raise ValueError('The west irrigation route contains a non-downhill segment.')
    if not 0. <= path_receipt['minimumGrade'] <= path_receipt['maximumGrade'] <= .16:
        raise ValueError('The surveyed village traverse is too steep to follow.')
    if min(feeder_support['minimumWaterAboveGroundMetres'], drain_support['minimumWaterAboveGroundMetres']) < .003:
        raise ValueError('An exposed irrigation run crosses below the western earth.')
    if max(row['maximumToeGapMetres'] for row in (feeder_support, drain_support, path_receipt)) > .005:
        raise ValueError('A west-slope route has an exposed gap beneath its stone or earth toe.')
    feeder_receipt.update(feeder_support)
    drain_receipt.update(drain_support)
    return {'channel': channel, 'lining': lining, 'intake': intake,
            'path': path, 'path_banks': path_banks, 'stairs': stairs,
            'receipt': {'intake': inlet, 'outlet': outlet, 'seep': feeder[0], 'coveredMouth': mouth,
                        'seepDepthConvergenceMetres': convergence, 'openFeeder': feeder_receipt,
                        'coveredHeadDropMetres': mouth[2] - inlet[2], 'drain': drain_receipt,
                        'discharge': drain[-1], 'path': path_receipt, 'headlandSteps': stairs_receipt}}
