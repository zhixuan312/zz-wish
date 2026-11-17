#!/usr/bin/env python3
"""Verify official Poly Haven originals and resize/encode the visitor cloth maps."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import md5, sha256
from pathlib import Path
import json
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'art/build/full-review/round-1/linen-source'
OUT = ROOT / 'web/public/places/snow-roof'
files = json.loads((STAGE / 'files.json').read_text())
info = json.loads((STAGE / 'info.json').read_text())
originals = STAGE / 'originals'
originals.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
specifications = [
    ('weave', 'Diffuse', {'lossless': False, 'quality': 92, 'method': 6}, 'sRGB'),
    ('normal', 'nor_gl', {'lossless': True, 'method': 6}, 'linear data, OpenGL +Y'),
    ('roughness', 'Rough', {'lossless': True, 'method': 6}, 'linear data'),
]

def fetch(specification):
    role, channel, encoding, colour = specification
    official = files[channel]['1k']['png']
    path = originals / official['url'].rsplit('/', 1)[-1]
    if path.exists():
        data = path.read_bytes()
    else:
        request = urllib.request.Request(official['url'], headers={'User-Agent': 'OneLight-AssetPreparation/1.0'})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
        if len(data) != official['size'] or md5(data).hexdigest() != official['md5']:
            raise RuntimeError(f'Official size/MD5 failed: {role}')
        path.write_bytes(data)
    if len(data) != official['size'] or md5(data).hexdigest() != official['md5']:
        raise RuntimeError(f'Preserved original changed: {role}')
    with Image.open(path) as source:
        original_size = list(source.size)
        image = source.convert('RGB')
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        target = OUT / f'gauze-{role}.webp'
        image.save(target, 'WEBP', **encoding)
        with Image.open(target) as decoded:
            decoded = decoded.convert('RGB')
            histogram = decoded.histogram()
            count = decoded.width * decoded.height
            linear = [(x / 255 / 12.92 if x / 255 <= .04045 else ((x / 255 + .055) / 1.055) ** 2.4) for x in range(256)]
            means = [sum(histogram[channel * 256 + x] * linear[x] for x in range(256)) / count for channel in range(3)]
            luminance = sum(a * b for a, b in zip(means, [.2126, .7152, .0722])) if role == 'weave' else None
            pixels_exact = decoded.tobytes() == image.tobytes()
        derivative = target.read_bytes()
        return {'role': role, 'channel': channel, 'source': {'url': official['url'], 'md5': official['md5'], 'md5Verified': True, 'sha256': sha256(data).hexdigest(), 'bytes': len(data), 'dimensions': original_size, 'preservedOriginal': str(path.relative_to(ROOT))},
                'derived': {'path': str(target.relative_to(ROOT)), 'url': f'/places/snow-roof/{target.name}', 'sha256': sha256(derivative).hexdigest(), 'bytes': len(derivative), 'dimensions': list(image.size), 'colourSpace': colour, 'encoding': {'format': 'WebP', **encoding}, 'decodedPixelsEqualResizedRGB': pixels_exact, 'meanLinearLuminance': luminance}}

with ThreadPoolExecutor(max_workers=3) as executor:
    receipts = list(executor.map(fetch, specifications))
receipt = {'asset': 'rough_linen', 'title': info['name'], 'authors': info['authors'], 'assetPage': 'https://polyhaven.com/a/rough_linen', 'infoAPI': 'https://api.polyhaven.com/info/rough_linen', 'filesAPI': 'https://api.polyhaven.com/files/rough_linen',
           'license': 'CC0-1.0', 'licenseURL': 'https://polyhaven.com/license', 'licenseLegalCode': 'https://creativecommons.org/publicdomain/zero/1.0/',
           'sourceMetadata': {'infoSha256': sha256((STAGE / 'info.json').read_bytes()).hexdigest(), 'filesSha256': sha256((STAGE / 'files.json').read_bytes()).hexdigest()},
           'process': 'Official 1k PNGs verified against official MD5 and byte size; preserve originals in ignored art/build; convert decoded channels to RGB and resize proportionally with Pillow Lanczos to a maximum dimension of 512 pixels; WebP encoding only. No painting, synthesis, relighting, tinting, grayscale conversion or creative pixel edits.',
           'meanLinearLuminanceMethod': 'Decode the delivered WebP RGB, normalize 8-bit channels, apply the exact sRGB EOTF per channel, weight linear RGB by 0.2126/0.7152/0.0722, and average all pixels. Normal/roughness remain data maps and are not EOTF-converted for use.',
           'maps': receipts, 'script': 'scripts/stage-visitor-fabric.py', 'totalDeliveredBytes': sum(entry['derived']['bytes'] for entry in receipts)}
(ROOT / 'docs/licenses/lantern-fabric.json').write_text(json.dumps(receipt, indent=2) + '\n')
runtime = {'version': 1, 'sourceAsset': receipt['assetPage'], 'license': 'CC0-1.0', 'maps': {entry['role']: {'path': entry['derived']['url'], 'sha256': entry['derived']['sha256'], 'bytes': entry['derived']['bytes'], 'width': entry['derived']['dimensions'][0], 'height': entry['derived']['dimensions'][1], 'colourSpace': 'sRGB' if entry['role'] == 'weave' else 'none'} for entry in receipts},
           'meanLinearLuminance': next(entry['derived']['meanLinearLuminance'] for entry in receipts if entry['role'] == 'weave'), 'normalConvention': 'OpenGL +Y', 'sourceDimensionsMillimetres': info['dimensions'],
           'totalBytes': receipt['totalDeliveredBytes'], 'provenance': 'docs/licenses/lantern-fabric.json'}
(ROOT / 'web/src/engine/baked/visitor-fabric.json').write_text(json.dumps(runtime, indent=2) + '\n')
print(json.dumps({'totalBytes': receipt['totalDeliveredBytes'], 'meanLinearLuminance': runtime['meanLinearLuminance'], 'maps': runtime['maps']}, indent=2))
