import { expect, test, type Page } from '@playwright/test';

/**
 * Simulator-flow smoke tests. Every test runs with
 * `prefers-reduced-motion: reduce` so the ~1.5 s Globe↔Stage crossfade
 * collapses to an instant mode swap — without this the launch button /
 * panel assertions would race the animation.
 *
 * These tests deliberately avoid clicking on the Cesium globe itself:
 * headless Chromium's WebGL canvas is unreliable to hit at precise
 * coordinates, and the viewport size drift would make the pick-point
 * test flaky. Store-driven assertions cover the same state transitions.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/**
 * The simulator panel ships default-collapsed on narrow viewports
 * (Pixel 7, iPhone 14) so the globe stays reachable for the
 * pick-a-location gesture. Every assertion that touches the panel
 * body (Launch button, preset dropdown, Copy link, …) calls this
 * first so the same test suite runs unchanged against the desktop
 * and mobile projects.
 */
async function expandSimulatorPanelIfCollapsed(page: Page): Promise<void> {
  // Wait for the panel landmark first — the goto can resolve before
  // React mounts the simulator UI on slower CI runners, in which
  // case the toggle button doesn't exist yet and our isVisible check
  // returns false against thin air.
  await expect(page.getByRole('complementary', { name: 'Simulator controls' })).toBeVisible();
  const expandButton = page.getByRole('button', { name: 'Expand simulator panel' });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
    await expect(page.getByRole('button', { name: 'Collapse simulator panel' })).toBeVisible();
  }
}

test.describe('simulator flow', () => {
  test('landing → globe mode: Try-the-simulator CTA mounts the panel', async ({ page }) => {
    await page.goto('/?lng=en');

    await page.getByRole('button', { name: 'Try the simulator →' }).click();

    const panel = page.getByRole('complementary', { name: 'Simulator controls' });
    await expect(panel).toBeVisible();

    await expandSimulatorPanelIfCollapsed(page);

    // Launch is disabled until the user picks a location on the globe.
    const launchButton = page.getByRole('button', { name: 'Launch simulation' });
    await expect(launchButton).toBeVisible();
    await expect(launchButton).toBeDisabled();

    // The waiting-state status message tells the user what to do next.
    await expect(page.getByRole('status')).toContainText('Click anywhere on the globe');
  });

  test('About dialog opens via Radix, closes with Escape', async ({ page }) => {
    await page.goto('/?lng=en');
    await page.getByRole('button', { name: 'Try the simulator →' }).click();
    // The About / Glossary triggers are floating buttons OUTSIDE the
    // simulator panel (top-left on every viewport — see
    // AboutDialog.module.css). We deliberately do NOT expand the
    // panel here: on narrow viewports the expanded panel covers the
    // bottom-left quadrant, but the triggers live at the TOP, so
    // they're reachable whether the panel is collapsed or expanded.

    // Radix renders the trigger with role="button".
    await page.getByRole('button', { name: 'About' }).click();

    // Radix announces the dialog with role="dialog" and aria-labelledby.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Collins, Melosh & Marcus');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Glossary dialog surfaces term definitions', async ({ page }) => {
    await page.goto('/?lng=en');
    await page.getByRole('button', { name: 'Try the simulator →' }).click();
    // Same as About: trigger lives outside the panel at top-left,
    // so no panel expansion is required.

    await page.getByRole('button', { name: 'Glossary' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Glossary of terms');
    await expect(dialog).toContainText('Overpressure');
    await expect(dialog).toContainText('Modified Mercalli Intensity');
    await expect(dialog).toContainText('Volcanic Explosivity Index');
    await expect(dialog).toContainText('Ward–Asphaug water cavity');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Preset note caption shows the historical context for the active preset', async ({
    page,
  }) => {
    await page.goto('/?lng=en');
    await page.getByRole('button', { name: 'Try the simulator →' }).click();
    await expandSimulatorPanelIfCollapsed(page);

    // Default Chicxulub preset has the K-Pg impactor note.
    await expect(page.getByText(/Hildebrand et al\. 1991/)).toBeVisible();

    // Switching to volcano: the store keeps `KRAKATAU_1883` as the
    // active volcano preset (not the dropdown's first option), so the
    // caption updates to Krakatau's note about the Sunda Strait
    // paroxysmal eruption.
    await page.getByLabel('Event type').selectOption('volcano');
    await expect(page.getByText(/Sunda Strait paroxysmal eruption/)).toBeVisible();
  });

  test('preset dropdown offers every impact scenario by default', async ({ page }) => {
    await page.goto('/?lng=en');
    await page.getByRole('button', { name: 'Try the simulator →' }).click();
    await expandSimulatorPanelIfCollapsed(page);

    const select = page.getByLabel('Preset');
    await expect(select).toBeVisible();
    await expect(select.locator('option')).toHaveText([
      'Chicxulub',
      'Chicxulub (ocean variant)',
      'Popigai 35.7 Ma',
      'Boltysh 65.4 Ma',
      'Tunguska',
      'Meteor Crater (Barringer)',
      'Sikhote-Alin 1947',
      'Chelyabinsk 2013',
    ]);
  });

  test('event-type selector swaps the preset list across all five categories', async ({ page }) => {
    await page.goto('/?lng=en');
    await page.getByRole('button', { name: 'Try the simulator →' }).click();
    await expandSimulatorPanelIfCollapsed(page);

    const eventTypeSelect = page.getByLabel('Event type');
    await expect(eventTypeSelect).toBeVisible();

    await eventTypeSelect.selectOption('explosion');
    await expect(page.getByLabel('Preset').locator('option')).toHaveText([
      'Hiroshima 1945',
      'Nagasaki 1945',
      'Halifax 1917',
      'Texas City 1947',
      'Beirut port 2020',
      'Ivy Mike 1952',
      'Castle Bravo 1954',
      'Tsar Bomba 1961',
      'Starfish Prime 1962',
      '1 Mt reference',
    ]);

    await eventTypeSelect.selectOption('earthquake');
    await expect(page.getByLabel('Preset').locator('option')).toHaveText([
      'Valdivia 1960',
      'Great Alaska 1964',
      'Tōhoku 2011',
      'Sumatra–Andaman 2004',
      'Lisbon 1755',
      'Nepal Gorkha 2015',
      'Northridge 1994',
      'Kokoxili (Kunlun) 2001',
      "L'Aquila 2009",
      'Amatrice 2016',
    ]);

    await eventTypeSelect.selectOption('volcano');
    await expect(page.getByLabel('Preset').locator('option')).toHaveText([
      'Vesuvius 79 CE',
      'Krakatau 1883',
      'Tambora 1815',
      'Mount St. Helens 1980',
      'Mount Pelée 1902',
      'Etna 1669',
      'Pinatubo 1991',
      'Eyjafjallajökull 2010',
      'Hunga Tonga 2022',
      'Anak Krakatau 2018',
    ]);

    await eventTypeSelect.selectOption('landslide');
    await expect(page.getByLabel('Preset').locator('option')).toHaveText([
      'Storegga ≈ 8 200 BP',
      'Vaiont 1963',
      'Anak Krakatau 2018 (slide framing)',
      'Lituya Bay 1958',
      'Elm 1881',
    ]);
  });

  test('URL updates as the user selects preset and mode', async ({ page }) => {
    await page.goto('/?lng=en');
    await page.getByRole('button', { name: 'Try the simulator →' }).click();
    await expandSimulatorPanelIfCollapsed(page);

    // After entering globe mode, the URL should carry t=impact + m=globe.
    await expect.poll(() => new URL(page.url()).searchParams.get('m')).toBe('globe');
    await expect.poll(() => new URL(page.url()).searchParams.get('t')).toBe('impact');
    await expect.poll(() => new URL(page.url()).searchParams.get('p')).toBe('CHICXULUB');

    await page.getByLabel('Preset').selectOption('TUNGUSKA');
    await expect.poll(() => new URL(page.url()).searchParams.get('p')).toBe('TUNGUSKA');

    await page.getByLabel('Event type').selectOption('volcano');
    await expect.poll(() => new URL(page.url()).searchParams.get('t')).toBe('volcano');
    await expect.poll(() => new URL(page.url()).searchParams.get('p')).toBe('KRAKATAU_1883');

    // The existing `lng=en` query param must survive every write.
    await expect.poll(() => new URL(page.url()).searchParams.get('lng')).toBe('en');
  });

  test('shared URL hydrates the event type + preset + mode on load', async ({ page }) => {
    await page.goto('/?lng=en&t=earthquake&p=NORTHRIDGE_1994&m=globe');
    await expandSimulatorPanelIfCollapsed(page);

    // The landing CTA is bypassed because mode=globe, so the panel is
    // already mounted with the earthquake preset pre-selected.
    await expect(page.getByLabel('Event type')).toHaveValue('earthquake');
    await expect(page.getByLabel('Preset')).toHaveValue('NORTHRIDGE_1994');
  });

  test('ring legend mounts in globe mode with the empty-state copy', async ({ page }) => {
    await page.goto('/?lng=en&t=impact&p=CHICXULUB&m=globe');

    const legend = page.getByRole('complementary', { name: 'Ring legend' });
    await expect(legend).toBeVisible();

    // Until the user runs a simulation the legend invites them to do
    // so. The copy is in `globe.legend.empty`.
    await expect(legend).toContainText('Click a point on the globe and press Simulate');
  });

  test('ring legend collapses and re-expands via its toggle button', async ({ page }) => {
    await page.goto('/?lng=en&t=impact&p=CHICXULUB&m=globe');

    const legend = page.getByRole('complementary', { name: 'Ring legend' });
    const toggle = legend.getByRole('button', { name: 'Hide legend' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    // After collapse, the empty-state paragraph is gone but the
    // landmark itself stays mounted so the toggle remains reachable.
    await expect(legend).not.toContainText('Click a point on the globe');
    await expect(legend.getByRole('button', { name: 'Show legend' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    await legend.getByRole('button', { name: 'Show legend' }).click();
    await expect(legend).toContainText('Click a point on the globe');
  });

  test('ring legend renders Italian copy when lng=it', async ({ page }) => {
    await page.goto('/?lng=it&t=impact&p=CHICXULUB&m=globe');

    const legend = page.getByRole('complementary', { name: 'Legenda anelli' });
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Clicca un punto sul globo');
  });

  test('Copy link button writes the current URL to the clipboard', async ({
    browserName,
    page,
    context,
  }) => {
    // `clipboard-write` is a Chromium-only permission name; Firefox
    // and WebKit reject it outright. Skip the real-clipboard
    // assertion on those engines — we still verify the confirmation
    // label flips, which is the observable user-facing behaviour.
    const canReadClipboard = browserName === 'chromium';
    if (canReadClipboard) {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await page.goto('/?lng=en&t=volcano&p=KRAKATAU_1883&m=globe');
    await expandSimulatorPanelIfCollapsed(page);

    const copyButton = page.getByRole('button', { name: 'Copy shareable link' });
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    await expect(page.getByRole('button', { name: 'Link copied ✓' })).toBeVisible();

    if (canReadClipboard) {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toContain('t=volcano');
      expect(clipboard).toContain('p=KRAKATAU_1883');
    }
  });
});
