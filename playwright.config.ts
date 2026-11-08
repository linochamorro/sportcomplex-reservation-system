import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Las pruebas leen y escriben la MISMA base real (sede E2E_QA, canchas y
  // solicitudes compartidas). En paralelo se pisan entre specs: por eso 1 worker.
  workers: 1,
  retries: 0,
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
  },
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    env: { ...process.env, PLAYWRIGHT_E2E_INSECURE_COOKIES: '1' },
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 300000,
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
