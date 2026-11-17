"""Strict CPU-only preparation/replay of Snow15's smaller UV2 atlas.

This never renders, bakes, reuses GI pixels, encodes maps or installs assets.
It keeps the original certified evaluated mesh, all literal guards and the
preserved failed fresh Bevel replay. Only packed Lightmap UV/chart data changes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'art/build/snow-roof-round1'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--blender', default=shutil.which('blender'))
args = parser.parse_args()
args.out = args.out.resolve()
if args.out.exists() or not args.out.is_relative_to(ROOT / 'art/build') or not args.blender:
    raise RuntimeError('New ignored output and installed Blender required')
args.out.mkdir(parents=True)
source = BASE / 'source-v15.blend'
hidden = BASE / 'source-v15-hidden-faces-refined-20mm.json'
canonical = BASE / 'contact-replay-v15-allocation-final/snow-roof-prepared.blend'
normal = BASE / 'prepared-v15/corner-normal-transfer-audit.json'
original = BASE / 'contact-replay-v15'
prepared = args.out / 'prepared'
blend, raw = prepared / 'snow-roof-prepared.blend', prepared / 'snow-roof.raw.glb'
cameras = BASE / 'current-cameras-v15-runtime-z2.json'
steps = []
digest = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()


def run(name, command):
    steps.append({'name': name, 'command': list(map(str, command))})
    with (args.out / (name + '.log')).open('w') as log:
        subprocess.run(list(map(str, command)), cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    print('COMPACT_CPU_STAGE_PASS', name, flush=True)


def blender(name, script, arguments, file=None):
    command = [args.blender, '--background']
    if file:
        command.append(file)
    run(name, command + ['--python-exit-code', '1', '--python', ROOT / script, '--'] + arguments)


blender('uv-transfer', 'art/blender/apply_packed_lightmap_layout.py', [
    '--prepared', canonical,
    '--layout', 'hall=' + str(BASE / 'priority15-underside-continuous-columns/hall-input.json') + '=' + str(BASE / 'priority15-underside-continuous-columns/hall1408.json'),
    '--layout', 'court=' + str(BASE / 'prepared-v15-allocation-final-layout/court-unwrap-input.json') + '=' + str(BASE / 'priority15-underside-uv/court1328.json'),
    '--out', args.out / 'layout'])
blender('export-and-coverage', 'art/blender/bake_export.py', [
    '--out', prepared, '--export-only', '--resume', '--skip-bake', '--samples', '8', '--device', 'METAL', '--oidn-device', 'METAL',
    '--region-resolutions', 'altar=1024,hall=1408,court=1328,gate=1024', '--hidden-faces', hidden], args.out / 'layout/input.blend')
run('exact-nonuv-fields', ['node', ROOT / 'scripts/audit-lightmap-reallocation.mjs',
                         '--before', BASE / 'postbatch-preview15/snow-roof.raw.glb', '--after', raw,
                         '--out', prepared / 'nonlightmap-equality.json'])
blender('transitive-mapping', 'art/blender/derive_certified_prepared_mapping.py', [
    '--source', source, '--reference', original / 'snow-roof-prepared.blend', '--original-mapping', original / 'mapping-proof.json',
    '--normal-audit', normal, '--prepared', blend, '--manifest', prepared / 'manifest.json',
    '--raw-equality', prepared / 'nonlightmap-equality.json', '--fresh-failure', BASE / 'contact-replay-v15-allocation-final/mapping-proof.json',
    '--out', prepared / 'mapping-transitive.json'])
run('compact-mapping', [sys.executable, ROOT / 'art/blender/compact_mapping_binding.py', '--proof', prepared / 'mapping-transitive.json', '--out', prepared / 'mapping-bake-binding.json'])
blender('contacts', 'art/blender/audit_prepared_resting_contacts.py', [
    '--source-audit', BASE / 'source-v15.audit.json', '--prepared', blend, '--raw', raw, '--out', prepared / 'contact-audit.json'])
blender('raw-normals', 'art/blender/audit_raw_normals.py', ['--prepared', blend, '--raw', raw, '--out', prepared / 'independent-raw-normal-proof.json'])
blender('current-camera-coverage', 'art/blender/audit_current_camera_coverage.py', [
    '--prepared', blend, '--charts', prepared, '--cameras', cameras, '--out', prepared / 'current-camera-coverage.json'])
blender('current-pitch', 'art/blender/audit_atlas_density.py', [
    '--prepared', blend, '--manifest', prepared / 'manifest.json', '--normal-audit', normal,
    '--cameras', cameras, '--out', prepared / 'current-pitch.json'])
pitch = json.loads((prepared / 'current-pitch.json').read_text())
pitch_rows = []
for camera, groups in pitch['cameras'].items():
    for group, values in groups.items():
        limit = .07 if group in ['hall/floor-and-steps', 'hall/columns', 'hall/beams-and-brackets'] else .11 if group == 'court/footprint-track' else None
        if limit is None:
            continue
        actual = values['worstAxisMetresPerTexelPixelWeighted']['p50']
        pitch_rows.append({'camera': camera, 'group': group, 'medianWorstAxisMetresPerTexel': actual, 'limit': limit})
        if actual > limit:
            raise RuntimeError('Actual current-camera median pitch exceeds target: ' + camera + '/' + group)
blender('normal-guard', 'art/blender/challenge_normal_guard.py', ['--prepared', blend, '--mapping', prepared / 'mapping-bake-binding.json', '--out', prepared / 'normal-guard.json'])
blender('contact-guard', 'art/blender/proofs/resting-contact-guard.py', ['--prepared', blend, '--audit', prepared / 'contact-audit.json', '--out', prepared / 'contact-guard'])
files = [source, hidden, canonical, normal, cameras, blend, raw] + sorted(prepared.glob('*.json'))
receipt = {'scope': __doc__, 'steps': steps, 'files': [{'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in files],
           'actualCurrentCameraMedianPitch': pitch_rows, 'renderBakeEncoderGpuJobs': 0,
           'passed': True, 'driverSha256': digest(Path(__file__))}
(args.out / 'cpu-preflight.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('COMPACT_CPU_PREFLIGHT_PASS', digest(args.out / 'cpu-preflight.json'), flush=True)
