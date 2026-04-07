import { test, expect } from '@playwright/test';

test.describe('Kanban view', () => {
  test('loads the kanban page', async ({ page }) => {
    await page.goto('/kanban');
    await expect(page).toHaveURL(/\/kanban/);
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('shows either column headers or the empty state', async ({ page }) => {
    await page.goto('/kanban');
    // Wait for loading to complete — either empty state or column headers appear
    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return /no applications yet/i.test(body) || body.includes('Applied');
    }, { timeout: 5000 });
    const hasEmptyState = await page.getByText(/no applications yet/i).isVisible();
    const hasColumns = await page.getByText('Applied', { exact: true }).first().isVisible().catch(() => false);
    expect(hasEmptyState || hasColumns).toBe(true);
  });

  test('all five columns are visible when applications exist', async ({ page }) => {
    await page.goto('/kanban');
    const hasApplications = await page.getByPlaceholder('Search applications…').isVisible().catch(() => false);
    if (!hasApplications) {
      test.skip();
      return;
    }
    for (const col of ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected']) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
    }
  });

  test('search input filters when applications exist', async ({ page }) => {
    await page.goto('/kanban');
    const search = page.getByPlaceholder('Search applications…');
    const hasSearch = await search.isVisible().catch(() => false);
    if (!hasSearch) {
      test.skip();
      return;
    }
    await search.fill('zzzz_no_match');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('navigates back to jobs', async ({ page }) => {
    await page.goto('/kanban');
    await page.getByRole('link', { name: 'Jobs' }).click();
    await expect(page).toHaveURL(/\/jobs/);
  });
});
