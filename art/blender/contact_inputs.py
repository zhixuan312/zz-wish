"""Actual-file input bindings shared by the read-only contact classifiers.

Profiles record paths and measured hashes; they never waive geometry checks.
Older accepted profiles and outputs remain reproducible and immutable.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def resolve_binding(item):
    path = (ROOT / item['path']).resolve()
    if not path.is_file() or sha(path) != item['sha256']:
        raise RuntimeError('Actual contact-profile input differs: ' + str(path))
    return path


def load_profile(path):
    profile = json.loads(Path(path).read_text())
    required = {'source', 'prepared', 'raw', 'f32Diagnostic', 'independentExactF32PositionProof'}
    if not required.issubset(profile.get('inputs', {})):
        raise RuntimeError('Source, prepared, raw, genuine F32 and independent correspondence bindings are required.')
    paths = {key: resolve_binding(value) for key, value in profile['inputs'].items()}
    correspondence = json.loads(paths['independentExactF32PositionProof'].read_text())
    legacy_inputs = correspondence.get('inputs', {})
    legacy = (isinstance(legacy_inputs, dict)
              and correspondence.get('worldPositionsExactlyAuthored') is True
              and correspondence.get('positionComponentType') == 5126
              and correspondence.get('positionNormalized') is False
              and legacy_inputs.get('raw') == profile['inputs']['raw']['sha256']
              and legacy_inputs.get('candidate') == profile['inputs']['f32Diagnostic']['sha256'])
    measured_inputs = correspondence.get('inputs', [])
    measured = {(ROOT / item['path']).resolve(): item['sha256'] for item in measured_inputs} if isinstance(measured_inputs, list) else {}
    contact_chain = (correspondence.get('contactTestedRawToActualRawToFloat32WorldPositionsAndWindingExact') is True
                     and correspondence.get('allFloat32PositionsComponent5126NonNormalized') is True
                     and correspondence.get('sourceAnchorStringsByteExact') is True
                     and correspondence.get('allCompleteActualRawSceneExtrasByteExact') is True
                     and correspondence.get('sourceBlendSha256') == profile['inputs']['source']['sha256']
                     and measured.get(paths['raw']) == profile['inputs']['raw']['sha256']
                     and measured.get(paths['f32Diagnostic']) == profile['inputs']['f32Diagnostic']['sha256'])
    if not (legacy or contact_chain):
        raise RuntimeError('Independent F32 proof does not certify these actual raw/candidate inputs.')
    coverage = profile.get('coverage', {})
    if set(coverage) != {'hall', 'court'}:
        raise RuntimeError('Both actual hall/court chart-coverage file bindings are required.')
    coverage_paths = {key: resolve_binding(value) for key, value in coverage.items()}
    bake_dir = Path(profile['bakeDirectory'])
    bake_dir = (ROOT / bake_dir).resolve()
    if any(value.parent != bake_dir for value in coverage_paths.values()) or paths['prepared'].parent != bake_dir:
        raise RuntimeError('Coverage and prepared geometry must come from the same actual bake preparation.')
    return profile, paths, coverage_paths


def validate_prepared_source(scene, expected_source_sha):
    binding = json.loads(scene.get('one_light_source_binding', '{}'))
    if binding.get('sha256') != expected_source_sha:
        raise RuntimeError('Prepared geometry does not bind the actual authored source.')
    resolve_binding(binding)


def opaque_snow_proof(raw_path, material_name):
    data = raw_path.read_bytes()
    if data[:4] != b'glTF':
        raise RuntimeError('Actual raw GLB required.')
    header = json.loads(data[20:20 + int.from_bytes(data[12:16], 'little')])
    materials = [m for m in header['materials'] if m.get('name') == material_name]
    if len(materials) != 1:
        raise RuntimeError('Unique actual snow material was not found in raw GLB.')
    material = materials[0]
    alpha = material.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])[3]
    if material.get('alphaMode', 'OPAQUE') != 'OPAQUE' or alpha != 1:
        raise RuntimeError('Contact occluder must use the actual opaque snow material.')
    return {'rawMaterial': material_name, 'alphaMode': 'OPAQUE', 'baseColorAlpha': alpha,
            'basis': 'Verified from the actual source-bound raw GLB material JSON.'}
