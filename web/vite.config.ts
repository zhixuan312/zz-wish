import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

function reuseSnowDustProgram(): Plugin {
  return {
    name: 'one-light-snow-dust-program-key',
    apply: 'build',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/three/build/three.module.js') || !source.includes("const REVISION = '160';")) return;
      const start = 'function getProgramCacheKey( parameters ) {';
      const params = 'getProgramCacheKeyParameters( array, parameters );';
      const color = 'array.push( renderer.outputColorSpace );';
      if ([start, params, color].some(anchor => source.split(anchor).length !== 2)) return;

      // Only the authored, stock dust shader shares the preview and hall-probe key.
      return source.replace(start, `${start}
        const dustTarget = parameters.shaderID === 'points' && parameters.customProgramCacheKey === 'snow-roof-source-dust-v1'
          ? renderer.getRenderTarget() : null;
        const reuseDust = dustTarget && !dustTarget.isXRRenderTarget
          && parameters.outputColorSpace === LinearSRGBColorSpace && !parameters.shadowMapEnabled
          && parameters.numPointLights === 6 && (parameters.numDirLights === 1 || parameters.numDirLights === 2);
      `).replace(params, 'getProgramCacheKeyParameters( array, reuseDust ? { ...parameters, numDirLights: 1 } : parameters );')
        .replace(color, 'array.push( reuseDust ? parameters.outputColorSpace : renderer.outputColorSpace );');
    },
  };
}

export default defineConfig({
  root,
  cacheDir: process.env.ONE_LIGHT_VITE_CACHE,
  plugins: [reuseSnowDustProgram(), react()],
  server: {
    port: 5173,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    proxy: { '/api': { target: process.env.ONE_LIGHT_API_TARGET ?? 'http://localhost:8787', ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
