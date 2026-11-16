import { test, expect } from '@playwright/test';

const DUPLEX = '复式跃层 · 样板 D';

test('ships a duplex sample with two storeys, linked markers and per-floor sheets', async ({ page }) => {
  await page.goto('/');
  const card = page.locator(`article button[aria-label="打开 ${DUPLEX}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(page).toHaveURL(/\/project\//);
  await expect(page.getByRole('toolbar', { name: '绘图工具' })).toBeVisible({ timeout: 20_000 });

  const floorSelect = page.locator('select[aria-label="当前楼层"]');
  await expect(floorSelect.locator('option')).toHaveCount(2);
  await expect(floorSelect.locator('option').nth(1)).toContainText('2F · +3m');
  await expect(page.locator('footer').getByText('1F', { exact: true })).toBeVisible();
  await expect(page.locator('footer').getByText('共 2 层')).toBeVisible();

  // Each storey gets its own six-sheet set.
  await page.getByRole('button', { name: /出图/ }).click();
  await expect(page.getByText('出图与图纸')).toBeVisible();
  await expect(page.getByRole('button', { name: /^平面布置图/ })).toHaveCount(2, { timeout: 20_000 });
  // The dialog has both an icon close button and a footer "关闭" button;
  // scope to the dialog and pick the icon button by its title attribute.
  await page.locator('[role="dialog"] button[title="关闭"]').click();

  // The floors panel exposes both storeys, their sheet counts and the
  // editable stair / void markers that link the two levels.
  await page.getByRole('button', { name: '管理楼层' }).click();
  await expect(page.getByRole('button', { name: /^切换到 / })).toHaveCount(2);
  await expect(page.getByText('6 张', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/1 楼梯\/挑空/)).toBeVisible();
  await expect(page.getByText(/2 楼梯\/挑空/)).toBeVisible();

  // Switching storeys keeps the active-floor projection isolated.
  await floorSelect.selectOption({ index: 1 });
  await expect(page.locator('footer').getByText('2F', { exact: true })).toBeVisible();
  await floorSelect.selectOption({ index: 0 });
  await expect(page.locator('footer').getByText('1F', { exact: true })).toBeVisible();
});
