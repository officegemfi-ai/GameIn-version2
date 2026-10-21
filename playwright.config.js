// End-to-end tests for the GameIn prototype: the creator and brand views must agree on every offer, deal and cent.
// Runs the page from this repository (index.html + styles.css) on a local web server, in a desktop and a phone browser.
// To test another build, set GAMEIN_URL, e.g. GAMEIN_URL=http://127.0.0.1:8820/v62.html npx playwright test
const { defineConfig, devices } = require('@playwright/test');

const external = !!process.env.GAMEIN_URL;
const exe = process.env.PW_CHROMIUM || undefined; // optional: a preinstalled Chromium

module.exports = defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: process.env.CI ? 4 : 3,
  retries: 0, // a test that only passes on a second try is a failure, not a pass
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['./tests/support/rules-reporter.js'],
  ],
  use: {
    baseURL: external ? undefined : 'http://127.0.0.1:4173',
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
    launchOptions: exe ? { executablePath: exe } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, testIgnore: /random\.spec/ },
  ],
  webServer: external ? undefined : {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
