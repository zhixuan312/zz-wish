import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8790;
// WebGL needs a real GPU; headless software rendering is too slow for the scene.
const launchOptions = { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] };

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, launchOptions },
  projects: [
    { name: 'desktop-en', use: { viewport: { width: 1440, height: 900 }, locale: 'en-US' } },
    { name: 'phone-zh', use: { viewport: { width: 390, height: 844 }, locale: 'zh-CN', hasTouch: true, isMobile: true } },
  ],
  webServer: {
    // The suite reads a few read-only hooks that a normal build compiles out; build with them on.
    command: `VITE_E2E_HOOKS=1 npm run build && node server/main.ts`,
    cwd: join(import.meta.dirname, '../..'),
    env: { PORT: String(PORT), DB_FILE: join(tmpdir(), `one-light-e2e-${Date.now()}.db`) },
    url: `http://localhost:${PORT}/api/places/stats`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
