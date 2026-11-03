import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('previews sheets and exports PNG, PDF and CSV', async ({ page }) => {
  await page.goto('/');
  await page.locator('article button[aria-label^="打开 "]').first().click();
  await page.getByRole('button', { name: /出图/ }).click();
  await expect(page.getByText('出图与图纸')).toBeVisible();
  await expect(page.getByRole('button', { name: /^平面布置图/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^物料清单/ }).first()).toBeVisible();

  for (const label of ['PNG', 'PDF', 'CSV']) {
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: label, exact: true }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    if (label === 'PDF') {
      const bytes = readFileSync(path!);
      expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    }
  }

  await page.getByRole('button', { name: /^水位图/ }).first().click();
  await expect(page.getByText(/· 水位图/).first()).toBeVisible();
});
