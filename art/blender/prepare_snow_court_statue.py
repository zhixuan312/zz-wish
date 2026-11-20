"""Fit the recorded Arkam STL and make the compact Snow Court figure source."""

import argparse
from hashlib import file_digest
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

import numpy as np
from scipy.sparse import coo_matrix
import trimesh
import xatlas

import snow_court_statue as statue


SOURCE_SHA256 = '158db055e9567f118d4aaa548766684a72906c4163155ae516ffd974516cf892'
SIMPLIFY = """
const {readFileSync, writeFileSync} = require('node:fs');
const {MeshoptSimplifier} = require('meshoptimizer');

async function main() {
  const [points, faces, output, budget] = process.argv.slice(1);
  const toView = (path, ArrayType) => {
    const buffer = readFileSync(path);
    return new ArrayType(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  };
  await MeshoptSimplifier.ready;
  const [indices, relativeError] = MeshoptSimplifier.simplify(
    toView(faces, Uint32Array), toView(points, Float32Array), 3,
    3 * Number(budget), .020, ['LockBorder']
  );
  console.log('ARKAM_SIMPLIFY', JSON.stringify({faces: indices.length / 3, relativeError}));
  writeFileSync(output, Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
}

main().catch(err => { console.error(err); process.exit(1); });
"""


def sha(path):
    with path.open('rb') as handle:
        return file_digest(handle, 'sha256').hexdigest()


def reduced(source, target_faces, reverse_front):
    raw = trimesh.load_mesh(source, process=True)
    # The print is Z-up. Keep handedness and face the unmarked stone altar view.
    points = raw.vertices[:, [0, 2, 1]] * [1., 1., -1.]
    if reverse_front:
        points *= [-1., 1., -1.]
    points -= points.min(axis=0)
    points /= points[:, 1].max()
    h = points[:, 1]
    depth = points[:, 2] / points[:, 2].max()
    # Prioritise the closed eyes, fingers and front drapery in the error metric.
    focus = np.clip((h - .60) / .18, 0., 1.) * 1.8
    focus += .65 * np.exp(-((h - .32) / .15) ** 2) * np.clip((depth - .50) / .35, 0., 1.)
    weighted = points.copy()
    weighted[:, [0, 2]] -= points[:, [0, 2]].mean(axis=0)
    weighted[:, [0, 2]] *= 1. + focus[:, None]
    with TemporaryDirectory(prefix='arkam-fit-') as folder:
        p, f, out = (Path(folder) / name for name in ('points.bin', 'faces.bin', 'reduced.bin'))
        weighted.astype('<f4').tofile(p)
        raw.faces.astype('<u4').tofile(f)
        subprocess.run(['node', '-e', SIMPLIFY, str(p), str(f), str(out), str(target_faces)], check=True)
        faces = np.fromfile(out, dtype='<u4').reshape(-1, 3)
    mesh = trimesh.Trimesh(points, faces, process=True, validate=True)
    mesh = max(mesh.split(only_watertight=False), key=lambda item: len(item.faces))
    if mesh.volume < 0:
        mesh.invert()
    if not (mesh.is_watertight and mesh.is_winding_consistent):
        trimesh.repair.fill_holes(mesh)
    if not (mesh.is_watertight and mesh.is_winding_consistent):
        raise RuntimeError('Reduced Arkam figure is not a closed, consistently wound shell.')
    return mesh


def fit_altar(body):
    seat = statue.SEAT_PROFILE[-1]
    rim = statue.seat_ring(seat[1], seat[2])
    bearing = None
    for cut in (.004, .009, .016, .023):
        clipped = body.slice_plane([0., cut, 0.], [0., 1., 0.], cap=True, engine='earcut')
        if clipped.is_watertight and clipped.is_winding_consistent:
            bearing = cut
            break
    if bearing is None:
        raise RuntimeError('No conservative planar trim produced a closed bearing.')
    points = clipped.vertices.copy()
    points[:, 1] -= bearing
    points[np.abs(points[:, 1]) < 1e-7, 1] = 0.
    if points[:, 1].min() < 0:
        raise RuntimeError('Fitted figure has vertices below its bearing.')
    contact = points[:, 1] == 0.
    feet = points[contact][:, [0, 2]]
    scale = (statue.ASSEMBLED_HEIGHT - statue.SEAT_HEIGHT) / points[:, 1].max()
    points[:, 1] *= scale
    # Normalise against the flat, rectangular seat while preserving the pose's
    # native ratios wherever the bearing fits at the uniform height scale.
    width_and_depth = np.array(seat[1:]) * 2 - [.075, .088]
    horizontal_scale = np.minimum(scale, width_and_depth / np.ptp(feet, axis=0))
    points[:, [0, 2]] -= (feet.min(0) + feet.max(0)) / 2
    points[:, [0, 2]] *= horizontal_scale
    points[:, [0, 2]] += statue.SEAT_CENTRE
    rim += statue.SEAT_CENTRE
    edges = np.roll(rim, -1, axis=0) - rim
    offset = points[contact][:, None, [0, 2]] - rim[None, :, :]
    margin = ((edges[:, 0] * offset[:, :, 1] - edges[:, 1] * offset[:, :, 0]) /
              np.linalg.norm(edges, axis=1)).min()
    face = clipped.faces.astype('<u2')
    if margin < .015 or len(points) >= 65535 or not 15000 <= len(face) <= 21000:
        raise RuntimeError(f'Figure fit missed the bearing/complexity bar: {margin:.6f} m, {len(face)} triangles.')
    planted = trimesh.Trimesh(points, face, process=False)
    cap = np.all(contact[face], axis=1)
    area = planted.area_faces[cap].sum()
    if area < .070 or np.min(planted.area_faces) < 1e-10:
        raise RuntimeError('Insufficient bearing area or degenerate triangles.')
    return planted, {'trimFraction': bearing, 'horizontalScaleRelativeToHeight': (horizontal_scale / scale).tolist(),
                     'bearingAreaSquareMetres': float(area), 'bearingVertices': int(contact.sum()),
                     'minimumSeatMarginMetres': float(margin), 'assemblyHeightMetres': float(points[:, 1].max() + statue.SEAT_HEIGHT),
                     'oilCupVerticalGapMetres': statue.SEAT_HEIGHT - .105}


def unwrap(collected):
    points, face = collected.vertices, collected.faces
    links = collected.edges_unique
    a, b = links.T
    mean = coo_matrix((np.ones(len(a) * 2), (np.r_[a, b], np.r_[b, a])),
                      shape=(len(points), len(points))).tocsr()
    mean = mean.multiply(1. / mean.sum(axis=1).A).tocsr()
    chosen = None
    for steps in (12, 18, 24):
        # Smooth only the auxiliary parameterisation mesh to connect narrow
        # patches. The authored silhouette and sculpted features stay exact.
        proxy = points.copy()
        for _ in range(steps):
            proxy += .40 * (mean @ proxy - proxy)
        atlas = xatlas.Atlas()
        atlas.add_mesh(np.ascontiguousarray(proxy, dtype=np.float32), face.astype('<u4'))
        options = xatlas.ChartOptions()
        options.max_iterations = 2
        options.normal_deviation_weight = .55
        options.straightness_weight = 2.
        options.normal_seam_weight = 0.
        options.texture_seam_weight = 0.
        options.max_cost = 3.
        packing = xatlas.PackOptions()
        packing.padding = 4
        atlas.generate(options, packing)
        ids, triangles, uv = atlas[0]
        if not np.array_equal(ids[triangles], face):
            raise RuntimeError('Atlas reindexed the authored shape unexpectedly.')
        # Correct for a rectangular atlas so scale is equal in both directions.
        uv *= np.asarray([atlas.width, atlas.height]) / max(atlas.width, atlas.height)
        coords = uv[triangles]
        u, v = (coords[:, 1:] - coords[:, :1]).transpose(2, 0, 1)
        areas = np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0]) * .5
        if areas.min() > 1e-13 and (chosen is None or atlas.chart_count < chosen[0]):
            chosen = (atlas.chart_count, coords.copy(), areas.sum())
        if chosen is not None and chosen[0] < 75:
            break
    if chosen is None:
        raise RuntimeError('The figure has no nondegenerate auxiliary unwrap.')
    chart_count, coords, uv_area = chosen
    centre = np.asarray([.172, .794])
    material_uv = (centre + coords * .180).astype('<f4')
    # The scale matches nominal scene metres for the independent 512² atlas.
    charts = (coords * np.sqrt(collected.area / uv_area)).astype('<f4')
    delta = mean @ points - points
    rough = np.sum(delta * collected.vertex_normals, axis=1)
    rubbed = np.clip(-rough / .026, 0., 1.)
    cavity = np.clip(rough / .020, 0., 1.)
    x, y, z = points.T
    soot = np.exp(-((x - .44) / .25) ** 2 - ((y - .095) / .21) ** 2 - ((z - .28) / .19) ** 2)
    grain = .012 * np.sin(29 * x + 31 * y) * np.cos(23 * z - 28 * y)
    tone = .932 + .045 * rubbed - .073 * cavity - .10 * soot + grain
    pigment = np.exp(-((x - .26) / .105) ** 2 - ((y - .68) / .30) ** 2 - ((z - .26) / .16) ** 2)
    pigment *= .40 + .60 * np.cos(77 * x + 54 * y) ** 2
    rgb = tone[:, None] * [.83, .92, 1.] + pigment[:, None] * [.029, -.009, -.023]
    return charts, material_uv, np.rint(np.clip(rgb, 0., 1.) * 255).astype('u1'), int(chart_count)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--triangles', type=int, default=18600)
    parser.add_argument('--reverse-front', action='store_true', help='Flip the aligned figure by 180 degrees.')
    args = parser.parse_args()
    if sha(args.source) != SOURCE_SHA256:
        raise RuntimeError('Wrong STL. Use the credited exact Printables file 7192004.')
    figure, report = fit_altar(reduced(args.source, args.triangles, args.reverse_front))
    charts, uv0, colours, chart_count = unwrap(figure)
    np.savez_compressed(args.output, vertices=figure.vertices.astype('<f4'),
                        faces=figure.faces.astype('<u2'), charts=charts,
                        material_uv=uv0, colors=colours)
    report.update(sourceSha256=SOURCE_SHA256, fittedSha256=sha(args.output),
                  bytes=args.output.stat().st_size, vertices=len(figure.vertices),
                  triangles=len(figure.faces), sourceChartCount=chart_count,
                  stoneScan='https://polyhaven.com/a/stone_pavers')
    args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print('ARKAM_FIT', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
