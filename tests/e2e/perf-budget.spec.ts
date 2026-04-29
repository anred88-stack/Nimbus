import { expect, test } from '@playwright/test';

/**
 * Performance freeze guard. Sampled-rAF check that catches a
 * regressed render loop on the Cesium globe — specifically, the
 * "main thread froze for seconds" pattern that surfaces as a
 * runaway loop, a synchronous physics call, or a shader-compile
 * dead-lock. Does NOT pin a sustained FPS number because Cesium on
 * software rendering (no-GPU CI) inherently runs at 4-5 FPS, and a
 * pin in that range either fails today or doesn't catch tomorrow's
 * regression.
 *
 * Calibration story (worth reading before tightening anything).
 *  - Local desktop with a real GPU: Cesium happily holds 60 FPS.
 *    Single-frame intervals stay well under 50 ms.
 *  - Local headless Chromium with `CI=true` env: ~4 FPS sustained
 *    even after a long settling window because Vite-dev recompiles
 *    on first hit and SwiftShader is doing the WebGL work in
 *    software. Worst single frame ~250 ms.
 *  - GitHub Actions ubuntu-latest, no GPU, 2-CPU throttle: similar
 *    to local CI mode but spikier. Worst single frame can hit
 *    1-2 s during a tile-load batch on cold cache.
 *
 * The actionable signal in CI is "did a single frame take 5 seconds
 * because the render loop wedged?" — that is the cliff this test
 * catches. For sustained-FPS regressions developers should watch
 * the Storybook FPS meter or Lighthouse on a machine with a real
 * GPU; CI cannot tell those apart from "platform is slow today".
 *
 * Why chromium-only. Firefox/WebKit on Linux CI dispatch rAF on a
 * different vsync alignment that produces noisier samples, and the
 * goal is "catch the freeze" not "characterise the platform". One
 * engine is enough for freeze detection.
 */
test.describe('performance budget', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'FPS budget runs on chromium only');

  test('Cesium globe never freezes for ≥5 s after a Chicxulub-class simulation', async ({
    page,
  }) => {
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

    // Long settling window — Cesium's first-render pipeline (tile
    // fetch, shader compile, terrain provider handshake) regularly
    // takes 5-10 s on SwiftShader. Measuring earlier catches the
    // warm-up cliff rather than the steady state we care about.
    await page.waitForTimeout(8_000);

    // Sample 30 frames via requestAnimationFrame. Returns the average
    // FPS plus the worst single-frame interval, so we can tell apart
    // a steady 8 FPS from a chunky 12 FPS with one 1-second hitch.
    const sample = await page.evaluate(async () => {
      return await new Promise<{ avgFps: number; worstFrameMs: number }>((resolve) => {
        const FRAMES = 30;
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

    // Sanity floor — > 0 FPS means the render loop is alive at all.
    // Pinning higher than this conflates "platform is slow" with
    // "code regressed" on a no-GPU runner, which is the lesson from
    // the v1 of this guard.
    expect(
      sample.avgFps,
      `avg FPS ${sample.avgFps.toFixed(2)} — render loop appears stalled ` +
        `(worst single frame ${sample.worstFrameMs.toFixed(0)} ms)`
    ).toBeGreaterThan(0);

    // Freeze ceiling. SwiftShader plus a tile-load batch can take
    // 1-2 s on a 2-CPU runner; 5 s is the "actually broken" line —
    // anything beyond that is a genuine main-thread freeze (sync
    // physics call, runaway loop, shader compile dead-lock).
    expect(
      sample.worstFrameMs,
      `worst single frame ${sample.worstFrameMs.toFixed(0)} ms — likely a main-thread freeze`
    ).toBeLessThan(5_000);
  });
});
