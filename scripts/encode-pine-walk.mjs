import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import projection from '../shared/pine-gate-backdrop.json' with { type: 'json' };

const { values } = parseArgs({ options: Object.fromEntries(
  ['native', 'out', 'toktx'].map(name => [name, { type: 'string' }]),
) });
if (!values.native || !values.out || !values.toktx) {
  throw new Error('Specify --native NATIVE_WEBP_DIR --out NEW_WALK_DIR --toktx TOKTX_EXECUTABLE.');
}
const [native, out, toktx] = [values.native, values.out, values.toktx].map(value => resolve(value));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = JSON.parse(await readFile(join(native, 'encode.json'), 'utf8'));
if (receipt.width !== projection.width || receipt.height !== projection.height || receipt.encoding !== 'log2-8-8'
  || receipt.preExposure !== projection.preExposure || receipt.colorSpace !== 'linear' || receipt.alpha !== 'straight') {
  throw new Error('Expected an authored native Pine Gate backdrop receipt.');
}

await mkdir(out);
const scratch = await mkdtemp(join(tmpdir(), 'pine-walk-encode-'));
const layers = {};
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, TOKTX_OPTIONS: '' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit status ${result.status}`);
}
try {
  for (const name of Object.keys(projection.distances)) {
    const source = receipt.layers[name];
    if (source?.uri !== `pine-vista-${name}.webp`) throw new Error(`Invalid native plate ${name}`);
    const input = join(native, source.uri);
    const bytes = await readFile(input);
    if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) throw new Error(`Changed source plate ${name}`);
    const png = join(scratch, `${name}.png`);
    const uri = `pine-vista-${name}.ktx2`;
    const output = join(out, uri);
    // The middle distance contains the photographically important terrace
    // detail. The cloud and far radiance tolerate a smaller shared codebook.
    const basis = name === 'mid' ? 'uastc' : 'etc1s';
    const quality = basis === 'uastc'
      ? ['--uastc_quality', '2', '--uastc_rdo_l', '3', '--uastc_rdo_m', '--zcmp', '18']
      : ['--clevel', '3', '--qlevel', '255'];
    run('dwebp', [input, '-o', png]);
    run(toktx, ['--t2', '--encode', basis, ...quality, '--threads', '2', '--lower_left_maps_to_s0t0',
      '--assign_oetf', 'linear', '--assign_primaries', 'bt709', output, png]);
    const body = await readFile(output);
    layers[name] = { ...source, sourceWebpSha256: source.sha256, uri, bytes: body.length, sha256: sha256(body), basis };
    await rm(png);
    console.log('PINE_WALK_PLATE', name, basis, body.length);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
await writeFile(join(out, 'encode.json'), `${JSON.stringify({ ...receipt, layers }, null, 2)}\n`, { flag: 'wx' });
