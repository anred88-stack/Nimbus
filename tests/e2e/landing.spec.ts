import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('renders hero content and primary CTA', async ({ page }) => {
    await page.goto('/?lng=en');

    // Skip-link present and focusable.
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeAttached();

    // Hero H1 (the project name) is the single H1 on the page.
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toBeVisible();

    // Primary CTA points at the repo and opens in a new tab safely.
    const ghCta = page.getByRole('link', { name: 'Star on GitHub' });
    await expect(ghCta).toBeVisible();
    await expect(ghCta).toHaveAttribute('target', '_blank');
    await expect(ghCta).toHaveAttribute('rel', /noopener/);
    await expect(ghCta).toHaveAttribute('rel', /noreferrer/);
  });

  test('language switch flips EN ↔ IT and updates <html lang>', async ({ page }) => {
    await page.goto('/?lng=en');

    // Start in English.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('Coming soon')).toBeVisible();

    // Button is labelled for screen readers regardless of language.
    const button = page.getByRole('button', { name: /Switch language|Cambia lingua/ });
    await button.click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.getByText('In arrivo')).toBeVisible();

    // Flip back.
    await button.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('has a single H1 and a features section heading', async ({ page }) => {
    await page.goto('/?lng=en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: "What's coming" })).toBeVisible();
  });
});
