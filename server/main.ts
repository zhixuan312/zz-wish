import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app.ts';

const dbFile = resolve(process.env.DB_FILE ?? 'data/one-light.db');
mkdirSync(dirname(dbFile), { recursive: true });
const { app } = await buildApp({ dbFile, logger: true });

// In production the same process serves the built front end.
const dist = resolve('web/dist');
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist, wildcard: false });
  app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api') ? reply.code(404).send({ error: 'not_found' }) : reply.sendFile('index.html')));
}

await app.listen({ host: process.env.HOST ?? '0.0.0.0', port: Number(process.env.PORT ?? 8787) });
