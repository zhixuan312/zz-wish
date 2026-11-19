"""Seat the wet soil against the curved treads with a measured crown clearance."""

from resting_contacts import engine

JOINT_CLEARANCE = .006


def signed_area(a, b, p):
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def surface_triangle(points):
    plan = [(x, z) for x, _, z in points]
    a, b, c = plan
    determinant = signed_area(a, b, c)
    if abs(determinant) < 1e-10:
        return None
    rise_b, rise_c = points[1][1] - points[0][1], points[2][1] - points[0][1]
    dx = (rise_b * (c[1] - a[1]) - rise_c * (b[1] - a[1])) / determinant
    dz = (rise_c * (b[0] - a[0]) - rise_b * (c[0] - a[0])) / determinant
    intercept = points[0][1] - dx * a[0] - dz * a[1]
    x, z = zip(*plan)
    return plan, (min(x), max(x), min(z), max(z)), (dx, dz, intercept)


def clipped_plan(plan, aperture):
    # Clip one projected triangle against the three inward half-planes.
    sign = 1 if signed_area(*aperture) > 0. else -1
    for a, b in zip(aperture, aperture[1:] + aperture[:1]):
        if not plan:
            break
        output = []
        last = plan[-1]
        old = sign * signed_area(a, b, last)
        for point in plan:
            new = sign * signed_area(a, b, point)
            if (new >= 0.) != (old >= 0.):
                t = old / (old - new)
                output.append(tuple(u + t * (v - u) for u, v in zip(last, point)))
            if new >= 0.:
                output.append(point)
            last, old = point, new
        plan = output
    return plan


def evaluate(plane, x, z):
    return plane[0] * x + plane[1] * z + plane[2]


def triangle_weights(plan, point):
    a, b, c = plan
    area = signed_area(a, b, c)
    # Clipping can round a point just beyond the face boundary. Keep the
    # weights nonnegative so lowering a vertex cannot raise any overlap.
    weights = [max(0., signed_area(b, c, point) / area),
               max(0., signed_area(c, a, point) / area),
               max(0., signed_area(a, b, point) / area)]
    total = sum(weights)
    return tuple(weight / total for weight in weights)


def crown_triangles(stones):
    crowns = []
    for stone in stones:
        mesh = stone.data
        mesh.calc_loop_triangles()
        first_crown = 1 + 2 * stone['bearing_vertices']
        points = [engine(stone.matrix_world @ vertex.co) for vertex in mesh.vertices]
        for face in mesh.loop_triangles:
            if face.polygon_index >= first_crown:
                crown = surface_triangle([points[i] for i in face.vertices])
                if crown:
                    crowns.append(crown)
    return crowns


def fit_joint_soil(points, sections, tread_rows):
    """Enforce vertical clearance at the vertices of every projected overlap."""
    heights = [point[1] for point in points]
    tops = [crown_triangles(stones) for stones in tread_rows]
    overlaps = []
    for row, faces in enumerate(sections):
        neighbors = [t for group in tops[max(0, row - 1):row + 2] for t in group]
        for face in faces:
            surface = surface_triangle([points[i] for i in face])
            if surface is None:
                raise RuntimeError('Degenerate soil panel on the mountain stair.')
            plan, (left, right, low, high), _ = surface
            for crown, (l, r, a, b), plane in neighbors:
                if r < left or l > right or b < low or a > high:
                    continue
                overlap = clipped_plan(plan, crown)
                if not overlap:
                    continue
                for x, z in overlap:
                    weights = triangle_weights(plan, (x, z))
                    excess = sum(heights[i] * weight for i, weight in zip(face, weights))
                    excess -= evaluate(plane, x, z) - JOINT_CLEARANCE
                    if excess <= 0.:
                        continue
                    # Settle the part of the panel bearing under the edge
                    # without sinking the open joint beside that stone.
                    influence = sum(weight ** 3 for weight in weights)
                    for i, weight in zip(face, weights):
                        heights[i] -= excess * weight ** 2 / influence
                overlaps.append((face, overlap, plane))
    fitted = [(x, y, z) for (x, _, z), y in zip(points, heights)]
    planes = {}
    clearance = float('inf')
    for face, overlap, crown in overlaps:
        if face not in planes:
            planes[face] = surface_triangle([fitted[i] for i in face])[2]
        for x, z in overlap:
            distance = evaluate(crown, x, z) - evaluate(planes[face], x, z)
            clearance = min(clearance, distance)
    if not overlaps or clearance < JOINT_CLEARANCE - .000001:
        raise RuntimeError(f'Wet soil enters a tread crown: {clearance:.6f} m minimum clearance.')
    print(f'PINE_JOINT_SOIL_CLEARANCE {len(overlaps)} projected intersections; minimum {clearance:.6f} m.')
    return fitted
