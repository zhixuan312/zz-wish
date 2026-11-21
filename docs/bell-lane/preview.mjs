// Loopback-only fixture. The game uses its regular UI and API with a disposable database.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import config from '../../web/vite.config.ts';
import { buildApp } from '../../server/app.ts';

export async function startPreview() {
  const temp = await mkdtemp(join(tmpdir(), 'bell-lane-review-'));
  const { app } = await buildApp({ dbFile: join(temp, 'review.db'), logger: false });
  let vite;
  try {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const api = 'http://127.0.0.1:' + app.server.address().port;
    vite = await createServer({
      ...config,
      configFile: false,
      cacheDir: join(temp, 'vite'),
      plugins: [...config.plugins, {
        name: 'bell-lane-review-catalog',
        enforce: 'pre',
        transform(source, id) {
          if (!id.endsWith('/web/src/visiblePlaces.ts')) return;
          const original = "['snow-roof', 'pine-gate']";
          if (!source.includes(original)) throw new Error('Update the review fixture to match the current catalog.');
          return source.replace(original, "['bell-lane', 'snow-roof', 'pine-gate']");
        },
      }],
      server: {
        ...config.server, host: '127.0.0.1', port: 0, strictPort: true,
        proxy: { '/api': { target: api, ws: true } },
      },
    });
    await vite.listen(0);
    const address = vite.httpServer.address();
    return {
      url: 'http://127.0.0.1:' + address.port,
      async close() {
        await vite.close();
        await app.close();
        await rm(temp, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await vite?.close();
    await app.close();
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  const preview = await startPreview();
  console.log(preview.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); });
}
