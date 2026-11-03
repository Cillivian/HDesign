import { test, expect } from '@playwright/test';

async function openAi(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('article button[aria-label^="打开 "]').first().click();
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(page.getByText(/演示数据|deepseek/i).first()).toBeVisible();
}

test('generates a brief, applies it in one click, and undoes', async ({ page }) => {
  await openAi(page);
  await page.getByRole('textbox', { name: 'AI 需求描述' }).fill(
    '89平米两居，奶油风，预算15万，家里有猫，客厅要投影，主卧要大衣柜',
  );
  await page.getByRole('button', { name: '生成设计方案' }).click();
  const radios = page.getByRole('radio', { name: /选择方案/ });
  await expect(radios.first()).toBeVisible({ timeout: 60_000 });
  await radios.first().click();
  await page.getByRole('button', { name: '一键上图' }).click();
  await page.getByRole('button', { name: '确认应用' }).click();
  await expect(page.getByText('已应用到方案')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/新增家具|移除家具/).first()).toBeVisible();
  await page.getByRole('button', { name: '撤销本次' }).click();
  await expect(page.getByText('已应用到方案')).toHaveCount(0);
});

test('shows the local BOM and exports CSV', async ({ page }) => {
  await openAi(page);
  await page.getByRole('tab', { name: '清单' }).click();
  await expect(page.getByText('项目物料清单')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('streams a chat answer from the mocked model', async ({ page }) => {
  await openAi(page);
  await page.getByRole('tab', { name: '对话' }).click();
  await page.getByRole('textbox', { name: '对话输入' }).fill('客厅怎么布置更通透？');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText(/客厅进深|沙发|采光/).first()).toBeVisible({ timeout: 30_000 });
});
