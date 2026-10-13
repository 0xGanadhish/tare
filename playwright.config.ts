import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Prefer the preinstalled Chromium when present (never `playwright install` in CI sandboxes).
const PREINSTALLED = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {},
  },
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { DATA_SOURCE: 'fixtures', OFFLINE: '1', BACKEND_URL: '' },
  },
});
