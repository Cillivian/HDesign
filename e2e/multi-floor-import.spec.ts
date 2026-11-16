import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const SAMPLE_A = fileURLToPath(
  new URL('../apps/web/public/samples/demo-plan-a.png', import.meta.url),
);
const SAMPLE_B = fileURLToPath(
  new URL('../apps/web/public/samples/demo-plan-b.png', import.meta.url),
);

test.describe('multi-storey plan import', () => {
  test('selects two plan images at once and generates one floor per image', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/');
    await page.getByRole('button', { name: '导入图纸' }).click();
    await expect(page).toHaveURL(/\/project\//);

    await page.locator('input[type=file][multiple]').setInputFiles([SAMPLE_A, SAMPLE_B]);

    // The batch queue lists both drawings as storeys.
    await expect(page.getByText('复式楼层批量导入')).toBeVisible();
    await expect(page.getByText('2 层图纸')).toBeVisible();

    // Review floor 1, then confirm and continue to floor 2.
    await expect(page.getByText('第 1 / 2 层 · 1F')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /确认本层并继续/ }).click();

    await expect(page.getByText('第 2 / 2 层 · 2F')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /确认并生成 2 个楼层/ }).click();

    // Both floors are written in a single, undoable commit.
    await expect(page.getByText(/共生成 2 个楼层/)).toBeVisible({ timeout: 60_000 });
    const floorSelect = page.locator('select[aria-label="当前楼层"]');
    await expect(floorSelect.locator('option')).toHaveCount(2);
    await expect(page.locator('footer')).toContainText('共 2 层');

    // Every floor keeps its own underlay image.
    await page.getByRole('button', { name: '管理楼层' }).click();
    await expect(page.getByText(/有底图/)).toHaveCount(2);
  });
});
