"""Place a CC0 photogrammetric marble figure on the Snow Roof altar."""

from pathlib import Path

import numpy as np

SCAN_SOURCE = Path(__file__).resolve().parents[2] / 'art/assets/snow-court/seated-marble-scan.npz'
ACCESSION = 'F1917.243'
SCAN_CREATOR = 'Daniel Pett'
SCAN_LICENSE = 'CC0-1.0'
SCAN_RECORD = 'https://sketchfab.com/3d-models/seated-figure-of-buddha-a4d22eb6d3c44848bd49b89fb4c28759'
SCAN_MATERIAL_ROUGHNESS = .87024


def build(mesh, anchor, material):
    """Place the fitted scan and its independent lightmap charts in engine metres."""
    with np.load(SCAN_SOURCE, allow_pickle=False) as data:
        local = data['vertices']
        vertices = local + np.asarray(anchor)
        faces = data['faces']
        charts = data['charts']
        captured = data['colors'] / 255.

    figure = mesh.mesh_object('Seated weathered marble Buddha', vertices.tolist(), faces.tolist(), material)
    # The scan colour is vertex-bound. Planar UV0 avoids unused atlas seams.
    figure.data.uv_layers['UVMap'].data.foreach_set('uv', local[faces, :2].astype(np.float32).ravel())
    mesh.source_uv(figure, charts.tolist(), 'Separate xatlas charts of the fitted photogrammetric surface.')
    for polygon in figure.data.polygons:
        polygon.use_smooth = True
    figure['source_cc0_asset'] = SCAN_RECORD
    figure['source_scan_accession'] = ACCESSION
    figure['source_scan_creator'] = SCAN_CREATOR
    figure['source_scan_license'] = SCAN_LICENSE
    linear = np.where(captured <= .04045, captured / 12.92, ((captured + .055) / 1.055) ** 2.4)
    return figure, linear


def apply_scan_color(carving):
    """Restore the photographed colour after the standard tint pass."""
    figure, linear = carving
    layer = figure.data.color_attributes.get('SurfaceTint')
    if layer is None:
        raise RuntimeError('Marble scan requires the exported SurfaceTint layer')
    for loop in figure.data.loops:
        layer.data[loop.index].color = (*linear[loop.vertex_index], 1.)
    figure['surface_tint_export'] = 'Photogrammetric albedo, sRGB decoded once into glTF COLOR_0.'
