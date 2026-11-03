import { test, expect } from '@playwright/test';

async function openFirstProject(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('article button[aria-label^="打开 "]').first().click();
  await expect(page.getByRole('toolbar', { name: '绘图工具' })).toBeVisible();
}

test.describe('2D editor', () => {
  test('draws a wall, undoes it, and toggles layer visibility', async ({ page }) => {
    await openFirstProject(page);
    const undo = page.getByRole('button', { name: '撤销', exact: true });
    await expect(undo).toBeDisabled();

    await page.getByRole('button', { name: '墙体', exact: true }).click();
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not found');
    const y = box.y + box.height - 150;
    await page.mouse.click(box.x + box.width * 0.25, y);
    await page.mouse.click(box.x + box.width * 0.4, y);
    await page.keyboard.press('Enter');

    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(undo).toBeDisabled();

    await page.getByRole('tab', { name: '图层' }).click();
    await page.getByRole('button', { name: '隐藏图层 家具' }).click();
    await expect(page.getByRole('button', { name: '显示图层 家具' })).toBeVisible();
    await page.getByRole('button', { name: '显示图层 家具' }).click();
    await expect(page.getByRole('button', { name: '隐藏图层 家具' })).toBeVisible();

    await page.getByRole('button', { name: '锁定图层 结构' }).click();
    await expect(page.getByRole('button', { name: '解锁图层 结构' })).toBeVisible();
  });

  test('selects a room and edits a property', async ({ page }) => {
    await openFirstProject(page);
    await page.getByRole('tab', { name: '属性' }).click();
    const roomRow = page.getByRole('button', { name: /客厅 \/ 餐厅/ }).first();
    if (!(await roomRow.count())) return;
    await roomRow.click();
    await expect(page.getByText('房间', { exact: false }).first()).toBeVisible();
  });

  test('opens the 3D scene and switches camera presets', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openFirstProject(page);
    await page.getByRole('tab', { name: '3D 场景' }).click();
    await expect(page.getByText(/鸟瞰|剖切|漫游/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: '场景', exact: true }).click();
    await expect(page.getByText('视角')).toBeVisible();
    await page.getByRole('button', { name: /顶视/ }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('tab', { name: '2D 平面' }).click();
    await expect(page.getByRole('toolbar', { name: '绘图工具' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
