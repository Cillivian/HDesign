import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const SAMPLE = fileURLToPath(new URL('../apps/web/public/samples/demo-plan-a.png', import.meta.url));

test('imports a plan image, recognises the sketch, and applies it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导入图纸' }).click();
  await expect(page).toHaveURL(/\/project\//);
  await page.locator('input[type=file]').setInputFiles(SAMPLE);

  const apply = page.getByRole('button', { name: '生成可编辑草图' });
  await expect(apply).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/9 墙 · 6 房 · 12 洞口/)).toBeVisible();
  await expect(page.getByText('10.00 mm/px').first()).toBeVisible();

  await apply.click();
  await expect(page.getByText(/结构层新增 9 段墙、12 处门窗、6 个房间/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('tab', { name: '图层' }).click();
  await expect(page.getByRole('button', { name: '底图', description: '双击重命名' })).toBeVisible();
});
