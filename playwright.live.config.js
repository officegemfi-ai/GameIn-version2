// End-to-end tests for GameIn's live mode: the app signed in to a real Supabase stack (sign-in, row-level security,
// every move through a database function), a brand and a creator in two separate browsers, desktop and phone.
//
// Needs a Supabase stack with the migrations and the demo seed loaded:
//   npx supabase start        (Docker; loads supabase/migrations and supabase/seed.sql)
// then:
//   GAMEIN_LIVE_API=http://127.0.0.1:54321 GAMEIN_LIVE_ANON=<ANON_KEY from `npx supabase status -o env`> npm run test:live
// GAMEIN_LIVE_STORAGE=1 adds proof files (the CLI's stack has Storage). .github/workflows/live.yml runs them on GitHub.
// The app is served from this folder on port 4174, unless GAMEIN_LIVE_APP points at a running copy.
const { defineConfig, devices } = require('@playwright/test');

const external = !!process.env.GAMEIN_LIVE_APP;
const exe = process.env.PW_CHROMIUM || undefined;

module.exports = defineConfig({
  testDir: './tests-live',
  timeout: 240000,
  expect: { timeout: 15000 },
  fullyParallel: false, // the tests share one database: one at a time
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live' }]],
  use: {
    baseURL: external ? process.env.GAMEIN_LIVE_APP : 'http://127.0.0.1:4174',
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: exe ? { executablePath: exe } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
  ],
  webServer: external ? undefined : {
    command: 'python3 -m http.server 4174 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4174/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    stderr: 'ignore', // the server's log of every file it serves
  },
});
