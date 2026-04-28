import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const baseURL = `http://localhost:${String(PORT)}`;

const isCI = Boolean(process.env.CI);

// Mobile-chrome on Linux GitHub runners (no GPU, SwiftShader fallback)
// is consistently 3–5× slower than every other browser/device project:
// Pixel 7 emulation forces touch-event dispatch, deviceScaleFactor 2.625
// doubles the paint workload, and Cesium's mobile-UA code path adds
// extra synchronous WebGL setup. The 30 s default times out on the
// `landing → globe` flow even when the test is healthy. We bump the
// per-test budget on CI so the recurring "playwright (mobile-chrome)
// failed in 11 minutes" isn't a timeout artefact, while keeping local
// runs snappy.
const CI_TEST_TIMEOUT = 90_000;
const CI_EXPECT_TIMEOUT = 15_000;
const CI_ACTION_TIMEOUT = 20_000;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // 6 local workers is the sweet spot for the three-browser matrix:
  // more than that saturates the single Vite dev server and Chromium
  // starts failing on transient network errors. CI keeps its 1-worker
  // throttle to minimise Cesium asset-load flakiness.
  workers: isCI ? 1 : 6,
  reporter: [['html', { open: 'never' }], ['list']],
  // Per-test wall-clock budget. Default is 30 s — generous enough
  // locally, but Cesium init under Pixel 7 emulation on a 2-core
  // Ubuntu runner regularly exceeds it.
  timeout: isCI ? CI_TEST_TIMEOUT : 30_000,
  expect: {
    // `expect(locator).toBeVisible()` defaults to 5 s. The lazy
    // GlobeView chunk + Cesium viewer construction can take longer on
    // mobile-chrome CI, so we widen the visibility budget.
    timeout: isCI ? CI_EXPECT_TIMEOUT : 5_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: isCI ? CI_ACTION_TIMEOUT : 0,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Mobile viewports — portrait Android + iOS, shipped alongside
    // the desktop matrix so regressions in the narrow-viewport
    // layout fail fast.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      // Pixel 7 + Chromium on Linux CI is the slowest project of the
      // matrix by a wide margin (mobile UA flips Cesium into a slower
      // WebGL setup, SwiftShader has no GPU acceleration). Give it
      // even more headroom on top of the CI baseline.
      timeout: isCI ? 120_000 : 30_000,
    },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
