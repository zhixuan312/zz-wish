"""Place a CC0 scan of an anonymous seated figure on the Snow Roof altar."""

from pathlib import Path

import numpy as np

SCAN_SOURCE = Path(__file__).resolve().parents[2] / 'art/assets/snow-court/seated-stone-scan.npz'
SCAN_MODEL = '720673'
SCAN_CREATOR = 'dohnni'
SCAN_LICENSE = 'CC0-1.0'
SCAN_RECORD = 'https://www.printables.com/model/720673-sitting-buddha-statue'
STONE_ROUGHNESS = .94


def build(mesh, anchor, material):
    """Place the fitted scan and its independent lightmap charts in engine metres."""
    with np.load(SCAN_SOURCE, allow_pickle=False) as data:
        local = data['vertices']
        vertices = local + np.asarray(anchor)
        faces = data['faces']
        charts = data['charts']
        stone = data['colors'] / 255.

    figure = mesh.mesh_object('Seated weathered stone Buddha', vertices.tolist(), faces.tolist(), material)
    # The stone colour is vertex-bound. Planar UV0 avoids unused atlas seams.
    figure.data.uv_layers['UVMap'].data.foreach_set('uv', local[faces, :2].astype(np.float32).ravel())
    mesh.source_uv(figure, charts.tolist(), 'Nonoverlapping lightmap charts of the fitted scan, derived on a smoothed proxy.')
    for polygon in figure.data.polygons:
        polygon.use_smooth = True
    figure['source_cc0_asset'] = SCAN_RECORD
    figure['source_scan_model'] = SCAN_MODEL
    figure['source_scan_creator'] = SCAN_CREATOR
    figure['source_scan_license'] = SCAN_LICENSE
    linear = np.where(stone <= .04045, stone / 12.92, ((stone + .055) / 1.055) ** 2.4)
    return figure, linear


def apply_scan_color(carving):
    """Restore the scan-based stone colour after the standard tint pass."""
    figure, linear = carving
    layer = figure.data.color_attributes.get('SurfaceTint')
    if layer is None:
        raise RuntimeError('The stone scan requires the exported SurfaceTint layer')
    for loop in figure.data.loops:
        layer.data[loop.index].color = (*linear[loop.vertex_index], 1.)
    figure['surface_tint_export'] = 'Vertex albedo from CC0 stone grain, sRGB decoded once into glTF COLOR_0.'
