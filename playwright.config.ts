import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Browsers are installed inside the workspace because the host cache is not writable.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(
  new URL('./.playwright-browsers', import.meta.url),
);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.HDESIGN_E2E_URL ?? 'http://localhost:8793',
    channel: 'chromium',
    viewport: { width: 1440, height: 960 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],
  webServer: {
    // Deterministic acceptance stack: production bundle + AI_MOCK fixtures.
    command: 'pnpm build && PORT=8793 AI_MOCK=1 pnpm --filter @hdesign/server start',
    url: 'http://localhost:8793/api/health',
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
