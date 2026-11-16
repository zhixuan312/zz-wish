import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  cacheDir: process.env.ONE_LIGHT_VITE_CACHE,
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    proxy: { '/api': { target: process.env.ONE_LIGHT_API_TARGET ?? 'http://localhost:8787', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
