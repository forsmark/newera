import { test, expect } from '@playwright/test';

test.describe('Settings view', () => {
  test('loads the settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('shows resume and preferences sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/resume/i).first()).toBeVisible();
    await expect(page.getByText(/preferences/i).first()).toBeVisible();
  });

  test('can type into a textarea', async ({ page }) => {
    await page.goto('/settings');
    const textarea = page.locator('textarea').first();
    await textarea.fill('Test resume content');
    await expect(textarea).toHaveValue('Test resume content');
  });

  test('navigating back to jobs works', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTitle('Jobs').click();
    await expect(page).toHaveURL(/\/jobs/);
  });
});
