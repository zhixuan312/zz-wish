"""Package actual Snow maps and prove every delivery derivative.

Default mode requires all16 LOW8 maps. Explicit --final requires all16 genuine
64+ Metal/OIDN-Metal maps and the same measured geometry/contact/precision chain.
All paths remain ignored: no source/native edit, GI reuse, render, bake, public
write or visual adoption. Delivery retains F32 positions, declares SHORT16
normals/UV16/U8 tint and protected scan images, then wraps the model in Zstd.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'art/build/snow-roof-round1'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--source-blend', type=Path, default=BASE / 'source-v15.blend')
parser.add_argument('--hidden-proof', type=Path, default=BASE / 'source-v15-hidden-faces-refined-20mm.json')
parser.add_argument('--source-audit', type=Path, default=BASE / 'source-v15.audit.json')
parser.add_argument('--blender', default=shutil.which('blender'))
parser.add_argument('--final', action='store_true', help='Require all16 actual64+ Metal maps; omit shared packer --preview and enforce the final15MB gate')
args = parser.parse_args()
args.source, args.out = args.source.resolve(), args.out.resolve()
if args.out.exists() or not args.out.is_relative_to(ROOT / 'art/build') or args.source == args.out:
    raise RuntimeError('Separate new ignored output required')
manifest = json.loads((args.source / 'manifest.json').read_text())
entries = [v for looks in manifest['lightmaps'].values() for v in looks.values()]
looks = {'night', 'dusk', 'day', 'lamp'}
complete = len(entries) == 16 and set(manifest['lightmaps']) == {'altar', 'hall', 'court', 'gate'} and all(set(maps) == looks for maps in manifest['lightmaps'].values())
if not complete or any(e['bakeDevice'] != 'METAL' or e['denoiseDevice'] != 'METAL' or e['bakeFingerprint'] != manifest['bakeFingerprint'] for e in entries):
    raise RuntimeError('Actual completed ALL16 source-bound Metal/OIDN-Metal maps required')
if args.final:
    if manifest['bake'].get('integrator', {}).get('use_adaptive_sampling') is not False or manifest['bake'].get('integrator', {}).get('use_animated_seed') is not False:
        raise RuntimeError('Final mode requires fingerprinted fixed sampling; adaptive maxima are not fixed sample budgets')
    if not isinstance(manifest['bake'].get('samples'), int) or manifest['bake']['samples'] < 64 or any(not isinstance(e.get('samples'), int) or e['samples'] < 64 or e['samples'] < manifest['bake']['samples'] or e.get('mipLevels') != 3 or e.get('gutterPixels') != 8 for e in entries):
        raise RuntimeError('Final mode requires all16 genuine64+ Metal maps with three mips and8px gutters; LOW8 cannot be relabeled final')
elif any(e['samples'] != 8 for e in entries):
    raise RuntimeError('Default preview mode requires actual ALL16 LOW8 maps; use --final explicitly for64+')
digest = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
source, hidden = args.source_blend.resolve(), args.hidden_proof.resolve()
source_audit = args.source_audit.resolve()
audit = json.loads(source_audit.read_text())
if audit.get('source', {}).get('sha256') != digest(source) or manifest['bake']['sourceBlendSha256'] != digest(source) or not audit.get('contactAudit', {}).get('passed'):
    raise RuntimeError('Actual source, native maps and passing contact audit must share the selected source')
args.out.mkdir(parents=True)
native_inputs = {str(p): digest(p) for p in [args.source / 'manifest.json', args.source / 'snow-roof.raw.glb', args.source / 'snow-roof-prepared.blend'] + sorted(args.source.glob('*.exr'))}
steps = []


def run(name, command):
    steps.append({'name': name, 'command': list(map(str, command))})
    with (args.out / (name + '.log')).open('w') as log:
        subprocess.run(list(map(str, command)), cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    print('SNOW_PREVIEW_PACKAGE_STAGE_PASS', name, flush=True)


def node(name, script, arguments):
    run(name, ['node', ROOT / script] + arguments)


def blender(name, script, arguments):
    run(name, [args.blender, '--background', '--python-exit-code', '1', '--python', ROOT / script, '--'] + arguments)


base = args.out / 'base'
node('encode-real-maps-and-materials', 'scripts/pack-blender-assets.mjs', [
    '--source', args.source, '--out', base, *([] if args.final else ['--preview']), '--material-profile', 'mobile',
    '--position-format', 'float32', '--normal-format', 'float32', '--max-bytes', '100000000'])
prepared, raw = args.source / 'snow-roof-prepared.blend', args.source / 'snow-roof.raw.glb'
face = args.out / 'face-reference'
blender('source-face-reference', 'art/blender/export_face_reference.py', [
    '--source-blend', source, '--prepared-blend', prepared, '--proof', hidden, '--out', face])
node('actual-raw-face-correspondence', 'scripts/audit-hidden-export.mjs', [
    '--raw', raw, '--reference', face / 'reference.json', '--out', face / 'raw-correspondence.json'])
textured = args.source / 'snow-roof.mobile.vertex-normal-f32.textures.glb'
pruned = args.out / 'pruned'
pruned.mkdir()
bindings = {'source': source, 'prepared': prepared, 'raw': raw, 'proof': hidden, 'reference': face / 'reference.json', 'input': textured}
(pruned / 'inputs.json').write_text(json.dumps({'inputs': {k: {'path': str(p.relative_to(ROOT)), 'sha256': digest(p)} for k, p in bindings.items()}}, indent=2) + '\n')
node('prune-face-proven-hidden-only', 'scripts/prune-float32-baked.mjs', [
    '--input', textured, '--output', pruned / 'snow-roof.unstripped.glb', '--profile-out', pruned / 'export-profile.json', '--inputs', pruned / 'inputs.json'])
node('independent-retained-geometry', 'scripts/audit-float32-prune.mjs', [
    '--input', textured, '--output', pruned / 'snow-roof.unstripped.glb', '--profile', pruned / 'export-profile.json', '--report', pruned / 'independent-geometry-proof.json'])
node('strip-three-audit-only-keys', 'scripts/strip-delivery-audit-metadata.mjs', [
    '--input', pruned / 'snow-roof.unstripped.glb', '--output', pruned / 'snow-roof.glb', '--receipt', pruned / 'metadata-receipt.json'])
uv = args.out / 'uv16/snow-roof.glb'
node('measured-uv-storage', 'scripts/probe-uv16-budget.mjs', [
    '--input', pruned / 'snow-roof.glb', '--original', textured, '--manifest', base / 'manifest.json', '--output', uv,
    '--mode', 'f32', '--max-material-texel-error', '.125', '--source-raw', raw, '--max-source-material-texel-error', '.25'])
normal = args.out / 'normal16/snow-roof.glb'
node('measured-normal-tint-storage', 'scripts/probe-normal16-budget.mjs', [
    '--input', uv, '--output', normal, '--colour-policy', 'reviewed-u8', '--critical-f32', 'none'])
images = args.out / 'normal256'
node('architectural-normal-images', 'scripts/probe-material-normal-budget.mjs', [
    '--input', normal, '--raw', raw, '--out', images, '--size', '256'])
model = images / 'snow-roof.glb'
node('independent-decoded-precision', 'scripts/audit-snow-preview-precision.mjs', [
    '--source', pruned / 'snow-roof.glb', '--model', model, '--uv-receipt', Path(str(uv) + '.receipt.json'),
    '--normal-receipt', Path(str(normal) + '.receipt.json'), '--image-receipt', Path(str(model) + '.receipt.json'), '--out', images / 'independent-precision-proof.json'])
node('decoder-only-contact-copy', 'scripts/decode-baked-for-contact-audit.mjs', [
    '--input', model, '--output', images / 'decoded.glb', '--receipt', images / 'decoder.json'])
blender('actual-final-decoded-contacts', 'art/blender/audit_prepared_resting_contacts.py', [
    '--source-audit', source_audit, '--prepared', prepared, '--raw', images / 'decoded.glb', '--out', images / 'contact-audit.json'])
node('assemble-isolated-preview', 'scripts/assemble-snow-preview.mjs', [
    '--base', base, '--model', model, '--geometry-proof', pruned / 'independent-geometry-proof.json',
    '--metadata-receipt', pruned / 'metadata-receipt.json', '--contact-proof', images / 'contact-audit.json',
    '--out', args.out / 'assembled', '--fabric-dir', ROOT / 'web/public/places/snow-roof',
    '--precision-proof', images / 'independent-precision-proof.json', '--decoder-proof', images / 'decoder.json',
    *(['--final'] if args.final else [])])
node('lossless-model-zstd', 'scripts/gzip-place-models.mjs', ['--input', args.out / 'assembled', '--out', args.out / 'zstd', '--codec', 'zstd'])
node('compact-runtime-manifest', 'scripts/compact-place-manifest.mjs', [
    '--input', args.out / 'zstd', '--out', args.out / 'runtime', '--report', args.out / 'manifest-projection.json'])
final = json.loads((args.out / 'runtime/manifest.json').read_text())
for p, h in native_inputs.items():
    if digest(p) != h:
        raise RuntimeError('Immutable native master changed: ' + p)
receipt = {'scope': __doc__, 'steps': steps, 'immutableNativeInputs': native_inputs,
           'mode': 'final64' if args.final else 'preview8', 'finalMode': args.final,
           'runtimeManifest': {'path': str((args.out / 'runtime/manifest.json').relative_to(ROOT)), 'sha256': digest(args.out / 'runtime/manifest.json')},
           'completePackageBytes': final['completePackageBytes'], 'within15000000Bytes': final['completePackageBytes'] <= 15000000,
           'actualDecodedContactsPassed': True, 'actualPrecisionChainPassed': True,
           'renderBakeGpuJobs': 0, 'publicFilesWritten': 0, 'driverSha256': digest(Path(__file__))}
(args.out / 'package-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
if args.final and not receipt['within15000000Bytes']:
    raise RuntimeError('Final package exceeds15000000 bytes; staged receipt preserved, no adoption permitted')
print('SNOW_COMPACT_FINAL_PACKAGED' if args.final else 'SNOW_COMPACT_PREVIEW_PACKAGED', receipt['completePackageBytes'], 'withinBudget', receipt['within15000000Bytes'], flush=True)
