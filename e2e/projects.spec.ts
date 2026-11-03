import { test, expect } from '@playwright/test';

test('exports and re-imports a .hdz project package', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });
  const before = await page.locator('article').count();
  await page.locator('article').first().hover();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出项目包' }).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.locator('input[aria-label="选择 .hdz 项目包"]').setInputFiles(path!);
  await expect(page.locator('article')).toHaveCount(before + 1, { timeout: 20_000 });
  await expect(page.getByText(/（导入）/).first()).toBeVisible();
});
