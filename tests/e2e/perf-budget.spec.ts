import { expect, test } from '@playwright/test';

/**
 * Performance budget guard. Measures the wall-clock frame rate of the
 * Cesium globe immediately after a simulation has been launched and
 * fails the build if it drops below a sustainable floor.
 *
 * Why this lives at the E2E layer. The frame rate is a property of
 * the *integrated* system (physics worker + Cesium render loop +
 * React commit phase + browser GPU/SwiftShader), not of any single
 * function. A unit test cannot catch a regression that only surfaces
 * when the worker thread saturates the main thread or when a new
 * entity material kills the GPU.
 *
 * The threshold (~24 FPS) is deliberately permissive on CI: GitHub
 * Actions ubuntu-latest has no GPU, Chromium falls back to
 * SwiftShader software rendering, and the 1-worker throttle compounds
 * the slowdown. Desktop hardware should comfortably hold 60 FPS;
 * 24 is the floor below which the user perceives jank rather than
 * smooth motion. If we ever blow this, something is genuinely wrong.
 *
 * Restricted to chromium because requestAnimationFrame timing is
 * browser-specific and Firefox/WebKit on Linux CI have inconsistent
 * vsync alignment that produces noisy numbers. The guard's purpose
 * is to catch *gross* regressions (a new shader that drops to 5 FPS,
 * a runaway rAF loop) — one engine is enough for that.
 */
test.describe('performance budget', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'FPS budget runs on chromium only');

  test('Cesium globe sustains ≥ 24 FPS after a Chicxulub-class simulation', async ({ page }) => {
    // Reduce-motion so the lazy crossfade between landing and globe
    // collapses; we want to measure render-loop FPS, not transition.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Seed the URL straight into globe mode with the heaviest preset
    // we ship — Chicxulub draws every entity flavour (rings, marker,
    // ejecta, firestorm, MC fuzzy bands when present). If FPS holds
    // here, every smaller scenario holds too.
    await page.goto('/?lng=en&t=impact&p=CHICXULUB&m=globe');

    // Wait for the simulator panel to mount — that's the visual
    // anchor for "the globe + UI is alive".
    await expect(page.getByRole('complementary', { name: 'Simulator controls' })).toBeVisible();
    // Also wait for the canvas itself to be in the DOM (Cesium mounts
    // it lazily after the GlobeView Suspense boundary resolves).
    await page.waitForSelector('canvas', { state: 'attached' });

    // Give Cesium a beat to finish its initial tile fetch + first
    // render — measuring during the warm-up would catch the worst
    // case rather than steady state.
    await page.waitForTimeout(1500);

    // Sample 60 frames via requestAnimationFrame. Returns the average
    // FPS plus the worst single-frame interval, so we can tell apart
    // a steady 30 FPS from a chunky 50 FPS with one 200 ms hitch.
    const sample = await page.evaluate(async () => {
      return await new Promise<{ avgFps: number; worstFrameMs: number }>((resolve) => {
        const FRAMES = 60;
        const intervals: number[] = [];
        let last = performance.now();
        let count = 0;
        const tick = (): void => {
          const now = performance.now();
          intervals.push(now - last);
          last = now;
          count += 1;
          if (count < FRAMES) {
            requestAnimationFrame(tick);
          } else {
            const totalMs = intervals.reduce((s, v) => s + v, 0);
            const avgFps = (FRAMES * 1000) / Math.max(totalMs, 1);
            const worstFrameMs = Math.max(...intervals);
            resolve({ avgFps, worstFrameMs });
          }
        };
        requestAnimationFrame(tick);
      });
    });

    // Permissive floor — see module header for rationale. Hardware
    // CI should comfortably exceed this; the test catches gross
    // regressions like a runaway rAF loop or a shader-compile stall.
    const FLOOR_FPS = 24;
    expect(
      sample.avgFps,
      `avg FPS ${sample.avgFps.toFixed(1)} below floor ${FLOOR_FPS.toString()} ` +
        `(worst single frame ${sample.worstFrameMs.toFixed(0)} ms)`
    ).toBeGreaterThanOrEqual(FLOOR_FPS);

    // Worst-frame budget — anything over 250 ms is a visible hitch
    // (4 FPS), and almost certainly a synchronous bottleneck on the
    // main thread. The CI runner can spike higher than desktop, so
    // 500 ms is the absolute ceiling.
    expect(
      sample.worstFrameMs,
      `worst single frame ${sample.worstFrameMs.toFixed(0)} ms — likely a main-thread stall`
    ).toBeLessThan(500);
  });
});
