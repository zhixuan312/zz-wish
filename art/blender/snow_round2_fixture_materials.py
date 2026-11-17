"""The bounded, picture-reviewed follow-up to Source19; no save/render/bake."""
import hashlib
import json
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]


def apply(scene):
    if scene.get('one_light_round2_fixture_materials'):
        raise RuntimeError('Apply fixture/material correction once to Source19')
    wicks = json.loads(scene['static_lamp_wicks_engine'])
    changed = []
    for wick in wicks:
        if not (wick['name'].startswith('gate ') or wick['name'] == 'court lantern'):
            continue
        point = bpy.data.objects[wick['pointLightObject']]
        before = float(point.data.energy); point.data.energy *= .15
        wick['actualWatts'] = float(point.data.energy); wick['watts'] = float(point.data.energy)
        changed.append({'name': wick['name'], 'light': point.name, 'wattsBefore': before, 'wattsAfter': float(point.data.energy)})
    if len(changed) != 3:
        raise RuntimeError('Expected the two gate fixtures and one court fixture only')
    scene['static_lamp_wicks_engine'] = json.dumps(wicks)
    spec = json.loads((ROOT / 'web/src/engine/baked/visitor-fabric.json').read_text())
    normal_spec = spec['maps']['normal']; source = ROOT / 'web/public' / normal_spec['path'].lstrip('/')
    if hashlib.sha256(source.read_bytes()).hexdigest() != normal_spec['sha256']:
        raise RuntimeError('Actual licensed linen normal source changed')
    folder = ROOT / 'art/build/snow-roof-round2/materials'; folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'cushion-rough-linen-normal-128.png'
    if not path.exists():
        image = bpy.data.images.load(str(source), check_existing=False)
        image.name = 'Round2 licensed cushion linen normal128'
        image.colorspace_settings.name = 'Non-Color'; image.scale(128, 128)
        values = list(image.pixels)
        for i in range(0, len(values), 4):
            n = [values[i + j] * 2 - 1 for j in range(3)]; length = sum(v * v for v in n) ** .5
            if length:
                for j in range(3): values[i + j] = .5 + .5 * n[j] / length
        image.pixels[:] = values; image.file_format = 'PNG'; image.filepath_raw = str(path); image.save()
        bpy.data.images.remove(image)
    image = bpy.data.images.load(str(path), check_existing=True); image.colorspace_settings.name = 'Non-Color'
    material = bpy.data.materials['Round2 compressed photo linen cushion']
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    if shader.inputs['Normal'].is_linked:
        raise RuntimeError('Do not double-apply cushion detail')
    uv = nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    texture = nodes.new('ShaderNodeTexImage'); texture.image = image
    texture.label = 'Licensed rough_linen normal: modest cloth relief'
    normal = nodes.new('ShaderNodeNormalMap'); normal.uv_map = 'UVMap'; normal.inputs['Strength'].default_value = .15
    links.new(uv.outputs['UV'], texture.inputs['Vector']); links.new(texture.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    material['normal_derivative_provenance'] = json.dumps({'sourceAsset': spec['sourceAsset'], 'license': spec['license'],
        'sourceSha256': normal_spec['sha256'], 'size': [128, 128], 'strength': .15,
        'derivation': 'Linear resample of licensed OpenGL normal, per-texel renormalized; UVs/geometry unchanged.'})
    report = {'fixtureScale': .15, 'fixtures': changed, 'cushionNormal': {'file': str(path), 'source': spec['sourceAsset'],
        'license': spec['license'], 'strength': .15, 'size': [128, 128]},
        'geometryUVsAndAllOtherLightingUnchanged': True, 'renderBakeSaveJobs': 0}
    scene['one_light_round2_fixture_materials'] = json.dumps(report)
    return report
