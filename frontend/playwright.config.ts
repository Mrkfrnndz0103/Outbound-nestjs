import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const useLocalServer = !process.env.PLAYWRIGHT_BASE_URL;
const authCredentialsConfigured = Boolean(
  process.env.E2E_BACKROOM_OPS_ID && process.env.E2E_BACKROOM_PASSWORD,
);
const authFile = 'playwright/.auth/backroom.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
  },
  timeout: 30_000,
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/auth.setup.ts', '**/authenticated/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    ...(authCredentialsConfigured
      ? [
          {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
            use: { ...devices['Desktop Chrome'] },
          },
          {
            name: 'authenticated',
            dependencies: ['setup'],
            testMatch: /authenticated\/.*\.spec\.ts/,
            use: {
              ...devices['Desktop Chrome'],
              storageState: authFile,
            },
          },
        ]
      : []),
  ],
  webServer: useLocalServer
    ? {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '/api',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'playwright-test-key',
        },
      }
    : undefined,
});
