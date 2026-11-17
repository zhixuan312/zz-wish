#!/usr/bin/env python3
"""Merge one genuinely higher-sample native map without relabeling other maps.

This copies immutable Cycles outputs into a new ignored native-input directory.
It never renders, denoises, encodes, edits a source, or installs public assets.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
LOOKS = {'night', 'dusk', 'day', 'lamp'}
REGIONS = {'hall', 'court', 'altar', 'gate'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_record(path):
    return {'path': str(path.relative_to(ROOT)), 'sha256': digest(path), 'bytes': path.stat().st_size}


def entries(manifest):
    return {(region, look): entry for region, looks in manifest['lightmaps'].items() for look, entry in looks.items()}


def actual_map_files(directory, entry, region, look):
    names = [entry['source'], f'{region}-{look}-raw.exr', *entry['pngMipmaps']]
    if len(names) != len(set(names)) or any(Path(name).name != name for name in names):
        raise RuntimeError('Native masters and exactly three local PNG mips must be distinct files')
    if len(entry['pngMipmaps']) != 3 or any(not (directory / name).is_file() for name in names):
        raise RuntimeError('Actual native master/raw master/three PNG mips missing')
    return names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--supplement', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--map', default='hall-night')
    parser.add_argument('--minimum-base-samples', type=int, default=64)
    parser.add_argument('--minimum-supplement-samples', type=int, default=256)
    args = parser.parse_args()
    base, supplement, out = (p.resolve() for p in [args.base, args.supplement, args.out])
    if out.exists() or not out.is_relative_to(ROOT / 'art/build') or out in [base, supplement]:
        raise RuntimeError('A separate NEW ignored native output is required')
    if args.minimum_base_samples < 64 or args.minimum_supplement_samples <= args.minimum_base_samples:
        raise RuntimeError('This final merge requires base64+ and a strictly higher supplemental minimum')
    region, look = args.map.split('-')
    base_path, supplement_path = base / 'manifest.json', supplement / 'manifest.json'
    baseline = json.loads(base_path.read_text())
    extra = json.loads(supplement_path.read_text())
    expected = {(r, name) for r in REGIONS for name in LOOKS}
    original, upgraded = entries(baseline), entries(extra)
    if set(original) != expected or set(upgraded) != {(region, look)}:
        raise RuntimeError('Expected all16 genuine base maps and only the selected supplemental map')
    for key in ['bakeFingerprint', 'geometryFingerprint', 'lampBasis', 'lampAnchor']:
        if baseline.get(key) != extra.get(key):
            raise RuntimeError('Actual native identity differs: ' + key)
    for key in ['sourceBlendSha256', 'receiverProfiles', 'cameraPreExposure', 'lampPassQuantity', 'passesByLook', 'resolutionByRegion', 'normalTransfer', 'normalExportRecipe', 'preparedPreviewAudit', 'preparedContactAudit']:
        if baseline['bake'].get(key) != extra['bake'].get(key):
            raise RuntimeError('Actual native bake contract differs: ' + key)
    frozen = {}
    base_maps = []
    for (r, name), entry in original.items():
        if entry.get('samples', 0) < args.minimum_base_samples:
            raise RuntimeError(f'Actual base map is below required samples: {r}/{name}')
        for filename in actual_map_files(base, entry, r, name):
            frozen[base / filename] = digest(base / filename)
        base_maps.append({'map': f'{r}/{name}', 'samples': entry['samples'], 'master': file_record(base / entry['source'])})
    changed = upgraded[(region, look)]
    if changed.get('samples', 0) < args.minimum_supplement_samples:
        raise RuntimeError('Actual supplemental sample count is below the declared minimum')
    for (r, name), entry in list(original.items()) + list(upgraded.items()):
        if entry.get('bakeDevice') != 'METAL' or entry.get('denoiseDevice') != 'METAL' or entry.get('mipLevels') != 3 or entry.get('gutterPixels') != 8 or entry.get('bakeFingerprint') != baseline['bakeFingerprint']:
            raise RuntimeError(f'Actual map lacks the source-bound Metal/OIDN/mip/gutter guard: {r}/{name}')
        if entry.get('quantity') != original[(r, name)].get('quantity') or entry.get('passFilter') != original[(r, name)].get('passFilter') or entry.get('cameraPreExposure') != baseline['bake']['cameraPreExposure']:
            raise RuntimeError('Actual map transport quantity/filter/normalization differs')
    replacements = actual_map_files(supplement, changed, region, look)
    for filename in replacements:
        frozen[supplement / filename] = digest(supplement / filename)
    for directory in [base, supplement]:
        for filename in ['manifest.json', 'snow-roof.raw.glb', 'snow-roof-prepared.blend', 'bake-fingerprint.json']:
            frozen[directory / filename] = digest(directory / filename)
    if digest(base / 'snow-roof.raw.glb') != digest(supplement / 'snow-roof.raw.glb'):
        raise RuntimeError('Actual full raw GLB bytes differ; independently resolve geometry/material/extras before merging')
    out.mkdir()
    for path in base.iterdir():
        if path.is_file():
            shutil.copyfile(path, out / path.name)
    for filename in replacements:
        shutil.copyfile(supplement / filename, out / filename)
    merged = json.loads(json.dumps(baseline))
    merged['lightmaps'][region][look] = changed
    schedule = {f'{r}/{name}': entry['samples'] for (r, name), entry in entries(merged).items()}
    merged['bake']['samples'] = min(schedule.values())
    merged['bake']['samplesByMap'] = schedule
    merged['partialPreview'] = True
    merged['previewAdoption'] = 'All native maps meet final sample minima, but decoded geometry/contact/precision/budget and final application gates must pass before final assembly clears this staging flag.'
    merged['bake']['nativeInvocations'] = [
        {'path': str(base.relative_to(ROOT)), 'manifestSha256': digest(base_path), 'samples': baseline['bake']['samples'], 'mapCount': 16, 'totalSeconds': baseline['bake']['totalSeconds']},
        {'path': str(supplement.relative_to(ROOT)), 'manifestSha256': digest(supplement_path), 'samples': extra['bake']['samples'], 'mapCount': 1, 'totalSeconds': extra['bake']['totalSeconds']},
    ]
    merged['bake']['totalSeconds'] = sum(row['totalSeconds'] for row in merged['bake']['nativeInvocations'])
    merged['bake']['totalSecondsMeaning'] = 'Sum of two actual sequential native invocation times; no uniform-sample or single-invocation claim.'
    (out / 'manifest.json').write_text(json.dumps(merged, indent=2) + '\n')
    for path, expected_hash in frozen.items():
        if digest(path) != expected_hash:
            raise RuntimeError('An immutable native input changed: ' + str(path))
    for (r, name), entry in original.items():
        source_dir = supplement if (r, name) == (region, look) else base
        selected = changed if source_dir == supplement else entry
        for filename in actual_map_files(source_dir, selected, r, name):
            if digest(out / filename) != digest(source_dir / filename):
                raise RuntimeError('Copied actual master/mip differs: ' + filename)
    receipt = {
        'scope': __doc__, 'sourceBlendSha256': merged['bake']['sourceBlendSha256'],
        'bakeFingerprint': merged['bakeFingerprint'], 'geometryFingerprint': merged['geometryFingerprint'],
        'baseManifest': file_record(base_path), 'supplementManifest': file_record(supplement_path),
        'baseMaps': base_maps, 'supplementMap': {'map': f'{region}/{look}', 'samples': changed['samples'], 'master': file_record(supplement / changed['source'])},
        'samplesByMap': schedule, 'retainedBaseMapsByteExact': 15,
        'rawGlbBytesExactAcrossInvocations': True, 'allCopiedMastersAndPngMipsByteExact': True,
        'immutableNativeInputs': [file_record(path) for path in frozen],
        'outputManifest': file_record(out / 'manifest.json'), 'script': file_record(Path(__file__).resolve()),
        'renderBakeEncodeJobs': 0, 'publicWrites': 0, 'finalApplicationApproved': False,
    }
    receipt_path = out.parent / (out.name + '.merge-receipt.json')
    if receipt_path.exists():
        raise RuntimeError('Never overwrite an existing merge receipt')
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    print('SNOW_NATIVE_SAMPLE_MERGE_READY', str(out.relative_to(ROOT)), digest(out / 'manifest.json'), digest(receipt_path), flush=True)


if __name__ == '__main__':
    main()
