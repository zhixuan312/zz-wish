// Deliver a baked Blender place as Meshopt glTF plus Basis UASTC/KTX2 textures.
// node scripts/pack-blender-assets.mjs --source art/build/snow-roof --out web/public/places/snow-roof
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = resolve(option('--source', 'art/build/snow-roof'));
const out = resolve(option('--out', 'web/public/places/snow-roof'));
const toolsPrefix = resolve(option('--tools', join(tmpdir(), 'one-light-gltf-tools')));
const ktxPrefix = resolve(option('--ktx', join(tmpdir(), 'one-light-ktx-tools')));
const cli = join(toolsPrefix, 'node_modules/.bin/gltf-transform');
const run = (command, parameters, extra = {}) => new Promise((accept, reject) => {
  console.log(command, ...parameters);
  const process = spawn(command, parameters, { stdio: 'inherit', ...extra });
  process.on('error', reject); process.on('exit', code => code === 0 ? accept() : reject(new Error(`${command} exited ${code}`)));
});
const exists = async path => access(path).then(() => true, () => false);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(source, { recursive: true }); await mkdir(out, { recursive: true });
if (!(await exists(cli))) await run('npm', ['install', '--prefix', toolsPrefix, '@gltf-transform/cli@4.5.1']);
const toktx = process.env.TOKTX || join(ktxPrefix, 'KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload/usr/local/bin/toktx');
if (!(await exists(toktx))) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Install KTX-Software 4.4.2 and set TOKTX to its toktx binary.');
  const url = 'https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Darwin-arm64.pkg';
  const pkg = join(tmpdir(), 'one-light-ktx.pkg');
  await run('curl', ['--fail', '--location', '--silent', '--show-error', url, '-o', pkg]);
  await run('pkgutil', ['--expand-full', pkg, ktxPrefix]);
  // Keep the released executable's relative rpath intact without a system-wide install.
  const lib = join(dirname(dirname(toktx)), 'lib'); await mkdir(lib, { recursive: true });
  const extracted = join(ktxPrefix, 'KTX-Software-4.4.2-Darwin-arm64-library.pkg/Payload/usr/local/lib');
  for (const name of await readdir(extracted)) if (name.startsWith('libktx') && name.endsWith('.dylib')) await copyFile(join(extracted, name), join(lib, name));
}
const env = { ...process.env, PATH: `${dirname(toktx)}:${process.env.PATH}` };
const gltf = async (...parameters) => run(cli, parameters, { env });
const raw = join(source, 'snow-roof.raw.glb');
function glbJSON(data) { if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('Not glTF binary'); const length = data.readUInt32LE(12); return JSON.parse(data.subarray(20, 20 + length).toString()); }
function verifyUV(data) {
  const json = glbJSON(data); const missing = [];
  for (const [index, mesh] of (json.meshes || []).entries()) for (const primitive of mesh.primitives) if (primitive.attributes.TEXCOORD_1 === undefined) missing.push(index);
  if (missing.length) throw new Error(`Lightmap UV set missing from primitives: ${missing.join(', ')}`);
  return { meshes: json.meshes.length, primitives: json.meshes.reduce((n, mesh) => n + mesh.primitives.length, 0), regions: [...new Set((json.nodes || []).map(node => node.extras?.lightmap_region).filter(Boolean))], extensions: json.extensionsUsed || [] };
}
const rawInfo = verifyUV(await readFile(raw)); console.log('RAW_UV_INFO', rawInfo);
const textured = join(source, 'snow-roof.textures.glb');
// Meshopt must run last: a later texture transform decodes geometry while reading.
await gltf('uastc', raw, textured, '--level', '2', '--rdo', '2', '--zstd', '18', '--jobs', '2');
await gltf('meshopt', textured, join(out, 'snow-roof.glb'), '--level', 'high', '--quantize-position', '16', '--quantize-texcoord', '16', '--quantize-normal', '12');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
manifest.scene = 'snow-roof.glb'; manifest.files = [];
for (const maps of Object.values(manifest.lightmaps)) for (const entry of Object.values(maps)) {
  const png = join(source, entry.png); const output = join(out, entry.uri);
  await run(toktx, ['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1', '--uastc_rdo_m', '--zcmp', '18', '--threads', '2', '--assign_oetf', 'linear', '--assign_primaries', 'bt709', '--genmipmap', output, png]);
  const data = await readFile(output); const identifier = data.subarray(0, 12).toString('hex');
  if (identifier !== 'ab4b5458203230bb0d0a1a0a') throw new Error('Invalid KTX2: ' + output);
  manifest.files.push({ uri: entry.uri, bytes: data.length, sha256: digest(data) });
}
const packed = await readFile(join(out, 'snow-roof.glb')); const packedInfo = verifyUV(packed);
if (!packedInfo.extensions.includes('EXT_meshopt_compression')) throw new Error('Meshopt extension missing');
if (!packedInfo.extensions.includes('KHR_texture_basisu')) throw new Error('KTX2 material textures missing');
manifest.files.unshift({ uri: 'snow-roof.glb', bytes: packed.length, sha256: digest(packed) });
manifest.totalBytes = manifest.files.reduce((n, file) => n + file.bytes, 0);
manifest.compression = { gltfTransform: '4.5.1', ktxSoftware: '4.4.2', mesh: 'EXT_meshopt_compression', textures: 'KHR_texture_basisu', lightmaps: 'Basis UASTC + Zstandard, linear normalized', uvVerification: packedInfo };
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(source, 'delivery-report.json'), JSON.stringify({ ...manifest.compression, files: manifest.files, totalBytes: manifest.totalBytes, targetBytes: 8 * 1024 * 1024, withinTarget: manifest.totalBytes <= 8 * 1024 * 1024 }, null, 2) + '\n');
console.log('DELIVERY', manifest.totalBytes, 'bytes; target', 8 * 1024 * 1024);
if (manifest.totalBytes > 8 * 1024 * 1024) console.warn('Place exceeds the reference budget; review atlas and material resolution before accepting.');
