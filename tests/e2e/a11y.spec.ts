import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * About / Glossary triggers live OUTSIDE the SimulatorPanel at the
 * top-left of the viewport — see {@link AboutDialog.module.css}. The
 * mobile media-query that previously snapped them to the bottom-left
 * (where the panel itself lives on narrow viewports) was the cause of
 * the E2E failures on Pixel 7 / iPhone 14: the panel covered the
 * triggers and clicks timed out. Now both triggers are reachable on
 * every viewport without expanding the panel.
 */

/**
 * Accessibility audits run with axe-core against the WCAG 2.1 AA
 * ruleset (the project's stated target per CLAUDE.md). We fail the
 * test on any violation — not just criticals — because M5's exit
 * criterion is "Lighthouse a11y = 100", i.e. zero known issues.
 *
 * The Cesium and R3F <canvas> elements are excluded via selector:
 * axe flags every WebGL canvas as missing alt-text because it can't
 * introspect GPU contents, but our damage rings are decoratively
 * overlaid on labelled controls rendered next to the canvas. The UI
 * of record for screen readers is the SimulatorPanel + dialogs.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function auditPage(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude('canvas') // WebGL surfaces — see comment above
    .analyze();
  expect(
    results.violations,
    `axe found ${results.violations.length.toString()} violation(s):\n${results.violations
      .map((v) => `- [${v.id}] ${v.help} (${v.nodes.length.toString()} node(s))`)
      .join('\n')}`
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Disable the crossfade so the About/Glossary triggers mount
  // immediately after the landing CTA.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('accessibility', () => {
  test('landing page has no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/?lng=en');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await auditPage(page);
  });

  test('landing page (Italian) has no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/?lng=it');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await auditPage(page);
  });

  test('globe mode panel has no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto('/?lng=en&t=impact&p=CHICXULUB&m=globe');
    await expect(page.getByRole('complementary', { name: 'Simulator controls' })).toBeVisible();
    await auditPage(page);
  });

  test('About dialog has no WCAG 2.1 AA violations when open', async ({ page }) => {
    await page.goto('/?lng=en&t=impact&p=CHICXULUB&m=globe');
    // About / Glossary triggers live at top-left, OUTSIDE the
    // simulator panel — no panel expansion needed on mobile.
    await page.getByRole('button', { name: 'About' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await auditPage(page);
  });

  test('Glossary dialog has no WCAG 2.1 AA violations when open', async ({ page }) => {
    await page.goto('/?lng=en&t=impact&p=CHICXULUB&m=globe');
    await page.getByRole('button', { name: 'Glossary' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await auditPage(page);
  });
});
