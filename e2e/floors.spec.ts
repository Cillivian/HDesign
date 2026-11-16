import { test, expect } from '@playwright/test';

async function openFirstProject(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('article button[aria-label^="打开 "]').first().click();
  await expect(page.getByRole('toolbar', { name: '绘图工具' })).toBeVisible();
}

test.describe('multi-storey floors', () => {
  test('adds a floor, isolates entities, chains elevations and scopes sheet sets', async ({ page }) => {
    await openFirstProject(page);

    const floorSelect = page.locator('select[aria-label="当前楼层"]');
    await expect(floorSelect).toBeVisible();
    await expect(floorSelect.locator('option')).toHaveCount(1);
    await expect(page.locator('footer')).toContainText('1F');

    // Open the floors panel and add a second storey.
    await page.getByRole('button', { name: '管理楼层' }).click();
    await expect(page.getByRole('button', { name: '新增楼层' })).toBeVisible();
    await page.getByRole('button', { name: '新增楼层' }).click();

    await expect(floorSelect.locator('option')).toHaveCount(2);
    await expect(floorSelect.locator('option').nth(1)).toHaveText(/2F · \+2\.8m/);
    await expect(page.locator('footer')).toContainText('共 2 层');
    await expect(page.getByRole('button', { name: /^切换到 / })).toHaveCount(2);
    // Each floor owns its own six-sheet set.
    await expect(page.getByText('6 张', { exact: true })).toHaveCount(2);

    // Changing a storey height re-stacks the floors above it.
    await page.getByLabel('1F 层高').fill('3200');
    await expect(floorSelect.locator('option').nth(1)).toHaveText(/2F · \+3\.2m/);

    // Switching floors swaps the projected (active) entities: the seeded 1F has
    // rooms/area, the freshly added 2F is empty.
    await floorSelect.selectOption({ index: 0 });
    await expect(page.locator('footer').getByText('1F', { exact: true })).toBeVisible();
    await expect(page.locator('footer').getByText('— ㎡')).toHaveCount(0);

    await floorSelect.selectOption({ index: 1 });
    await expect(page.locator('footer').getByText('2F', { exact: true })).toBeVisible();
    await expect(page.locator('footer').getByText('— ㎡')).toBeVisible();

    // Each storey contributes its own sheet set.
    await page.getByRole('button', { name: /出图/ }).click();
    await expect(page.getByText('出图与图纸')).toBeVisible();
    await expect(page.getByRole('button', { name: /^平面布置图/ })).toHaveCount(2);
  });
});
