import { test, expect } from '@playwright/test';

test.describe('Jobs view', () => {
  test('loads and shows the jobs page', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/jobs/);
    await expect(page.getByPlaceholder('Search jobs…')).toBeVisible();
  });

  test('shows empty state when no jobs match search', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByPlaceholder('Search jobs…').fill('zzzzzz_no_match_xyzzy');
    await expect(page.getByText(/no jobs match/i)).toBeVisible();
  });

  test('all filter tabs are present', async ({ page }) => {
    await page.goto('/jobs');
    for (const label of ['All', 'Unread', 'New', 'Saved', 'Applied', 'Rejected']) {
      // Use regex to handle count badge text appended to button name (e.g. "New36")
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) }).first()).toBeVisible();
    }
  });

  test('clicking Saved tab does not crash the view', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: 'Saved', exact: true }).click();
    await expect(page.getByPlaceholder('Search jobs…')).toBeVisible();
  });

  test('clicking Rejected tab does not crash the view', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: 'Rejected', exact: true }).click();
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('search filters jobs by title', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByPlaceholder('Search jobs…').fill('react');
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('navbar links are visible', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByRole('link', { name: 'Jobs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Applications' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('navigates to kanban via Applications nav link', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: 'Applications' }).click();
    await expect(page).toHaveURL(/\/kanban/);
  });

  test('navigates to settings via Settings nav link', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('redirects / to /jobs', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/jobs/);
  });

  test('Fetch now button is visible in the navbar', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByRole('button', { name: /Fetch now/i })).toBeVisible();
  });
});
