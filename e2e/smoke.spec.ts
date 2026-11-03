import { test, expect } from '@playwright/test';

test.describe('HDesign shell', () => {
  test('gallery loads with projects and a start action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('把一张图纸');
    await expect(page.getByPlaceholder(/说说你的房子/)).toBeVisible();
    await expect(page.getByRole('button', { name: /生成方案/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开示例户型' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '项目' })).toBeVisible();
    await expect(page.locator('article').first()).toBeVisible({ timeout: 15_000 });
  });

  test('opens the editor and toggles the 3D view', async ({ page }) => {
    await page.goto('/');
    await page.locator('article button[aria-label^="打开 "]').first().click();
    await expect(page).toHaveURL(/\/project\//);
    await expect(page.getByRole('complementary', { name: '素材库' })).toBeVisible();
    await expect(page.getByRole('button', { name: /出图/ })).toBeVisible();
    await page.getByRole('tab', { name: '3D 场景' }).click();
    await expect(page.getByText(/3D 场景/).first()).toBeVisible();
    await page.getByRole('tab', { name: '2D 平面' }).click();
    await expect(page.getByRole('img', { name: '户型平面预览' })).toBeVisible();
  });

  test('theme and settings persist without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: /切换(浅色|深色)主题/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.getByRole('dialog')).toContainText('外观');
    await expect(page.getByRole('dialog')).toContainText('AI 连接');
    await page.getByRole('button', { name: '完成' }).click();
    expect(errors).toEqual([]);
  });

  test('command palette opens and filters', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('命令面板');
    await dialog.getByRole('textbox', { name: '搜索命令' }).fill('深色');
    await expect(dialog.getByText('主题：深色')).toBeVisible();
    await dialog.getByText('主题：深色').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
