import { defineConfig, devices } from '@playwright/test'

/**
 * E2E covers the critical paths named in PRD ENG-05.
 *
 * `executablePath` points at the pre-installed Chromium because the pinned
 * Playwright expects a browser build this image does not carry.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3200',
    trace: 'on-first-retry',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } },
  ],
  // Spread conditionally: exactOptionalPropertyTypes distinguishes an absent
  // property from one explicitly set to undefined.
  ...(process.env['E2E_BASE_URL']
    ? {}
    : {
        webServer: {
          command: 'pnpm start -p 3200',
          url: 'http://localhost:3200/dashboard',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
})
