"""Verified Poly Haven source images and glTF-ready PBR materials for Pine Gate."""
from functools import cache
from hashlib import sha256
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / 'docs/licenses/pine-gate-scans.json'
SCAN_CACHE = ROOT / 'art/build/pine-gate/scans'


@cache
def catalog():
    return {asset['id'].removeprefix('pine-gate-source-'): asset for asset in json.loads(CATALOG.read_text())}


def matches(data, spec):
    return (data.startswith(b'\xff\xd8\xff') and len(data) == spec['bytes']
            and sha256(data).hexdigest() == spec['sha256'])


@cache
def source_path(name, role):
    spec = next(spec for spec in catalog()[name]['sourceMaps'] if spec['map'] == role)
    path = SCAN_CACHE / spec['cachePath']
    if not path.is_file() or not matches(path.read_bytes(), spec):
        raise ValueError(f'Missing or changed Pine Gate scan {path}. Run python3 art/blender/pine_materials.py.')
    return path


def fetch_sources():
    for asset in catalog().values():
        for spec in asset['sourceMaps']:
            path = SCAN_CACHE / spec['cachePath']
            if path.is_file() and matches(path.read_bytes(), spec):
                continue
            request = Request(spec['sourceUrl'], headers={'User-Agent': 'One-Light-Pine-Gate/1.0'})
            with urlopen(request, timeout=30) as response:
                data = response.read(spec['bytes'] + 1)
            if not matches(data, spec):
                raise ValueError(f'Poly Haven source bytes differ from the catalog for {path.name}.')
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix('.download')
            temp.write_bytes(data)
            temp.replace(path)
    print(f'Verified {sum(len(asset["sourceMaps"]) for asset in catalog().values())} Pine Gate scan images.')


def apply_scan(material, name, normal_strength=.6):
    """Use one UV set for normal, roughness and AO alongside the sRGB albedo."""
    import bpy

    nodes, links = material.node_tree.nodes, material.node_tree.links
    principled = nodes.get('Principled BSDF')
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    for spec in catalog()[name]['sourceMaps']:
        role = spec['map']
        image = bpy.data.images.load(str(source_path(name, role)), check_existing=True)
        if role != 'albedo':
            image.colorspace_settings.name = 'Non-Color'
        image.pack()
        texture = nodes.new('ShaderNodeTexImage')
        texture.label = f'{name} {role}'
        texture.image = image
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
        if role == 'albedo':
            multiply = nodes.new('ShaderNodeMix')
            multiply.data_type = 'RGBA'
            multiply.blend_type = 'MULTIPLY'
            multiply.inputs[0].default_value = 1
            multiply.inputs[7].default_value = principled.inputs['Base Color'].default_value
            links.new(texture.outputs['Color'], multiply.inputs[6])
            links.new(multiply.outputs[2], principled.inputs['Base Color'])
        elif role == 'normal':
            normal = nodes.new('ShaderNodeNormalMap')
            normal.inputs['Strength'].default_value = normal_strength
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], principled.inputs['Normal'])
        elif role == 'roughness':
            links.new(texture.outputs['Color'], principled.inputs['Roughness'])
        else:
            group = bpy.data.node_groups.get('glTF Material Output')
            if group is None:
                group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
            if not group.interface.items_tree.get('Occlusion'):
                group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
            occlusion = nodes.new('ShaderNodeGroup')
            occlusion.node_tree = group
            links.new(texture.outputs['Color'], occlusion.inputs['Occlusion'])
    return material


if __name__ == '__main__':
    fetch_sources()
