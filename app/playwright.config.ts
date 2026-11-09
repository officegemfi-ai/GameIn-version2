import { defineConfig } from '@playwright/test';

// End-to-end tests: the built app (npm run build, pointed at a Supabase stack through VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY) served by `vite preview`, used by real accounts in a desktop and a phone browser.
//
//   supabase start                      # from the repo root: migrations + demo seed, Realtime and Storage
//   npm run build                       # with the stack's URL and anon key in the environment (see README.md)
//   npm run e2e                         # GAMEIN_STORAGE=1 adds a proof file upload (the CLI stack has Storage)
//
// APP_URL points the tests at an app that's already running instead.
const PORT = 4173;
const baseURL = process.env.APP_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false, // the tests share one database and its sign-in rate limit: one at a time
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.APP_URL
    ? undefined
    : {
        command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
