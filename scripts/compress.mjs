import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
const br = promisify(brotliCompress), gz = promisify(gzip);
async function compress(dir) {
  for (const file of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir,file.name);
    if (file.isDirectory()) { await compress(path); continue; }
    if (!/\.(js|css|html|svg)$/.test(file.name)) continue;
    const source = await readFile(path);
    await writeFile(path+'.br', await br(source,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}));
    await writeFile(path+'.gz', await gz(source,{level:9}));
  }
}
await compress('web/dist');
