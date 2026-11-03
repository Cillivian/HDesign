import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('gallery and editor have no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });
  const gallery = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(gallery.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);

  await page.locator('article button[aria-label^="打开 "]').first().click();
  await expect(page.getByRole('toolbar', { name: '绘图工具' })).toBeVisible();
  const editor = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(editor.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});

test('keyboard can open the command palette and switch theme', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('命令面板');
  await dialog.getByRole('textbox', { name: '搜索命令' }).fill('蓝晒');
  await dialog.getByText('画布：蓝晒').click();
  await expect(page.locator('html')).toHaveAttribute('data-canvas', 'blueprint');
});
