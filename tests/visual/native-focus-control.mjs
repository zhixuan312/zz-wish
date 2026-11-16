// Capture-only control for installed local Playwright. Emulation state is owned
// by its original CDP agent; a separately attached CDP session cannot clear it.
import { chromium } from '@playwright/test';
export async function setFocusEmulation(page, enabled) {
  const implementation = chromium._connection?.toImpl?.(page);
  const primary = implementation?.delegate?._mainFrameSession?._client;
  if (!primary) throw new Error('The local Playwright primary CDP session is unavailable; do not claim native visibility coverage.');
  await primary.send('Emulation.setFocusEmulationEnabled', { enabled });
}
