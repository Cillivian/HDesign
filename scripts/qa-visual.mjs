import { chromium } from '@playwright/test';
const BASE = process.env.HDESIGN_BASE ?? 'http://localhost:8793';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });

async function newPage(width = 1440, height = 960) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  return context.newPage();
}
const errors = [];
async function shot(page, name) {
  await page.screenshot({ path: `/tmp/hd-qa/${name}.png`, timeout: 30000 });
  console.log('shot', name);
}

// desktop gallery
let page = await newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await shot(page, '01-gallery-light');

// editor light
await page.locator('article button[aria-label^="打开 "]').first().click();
await page.waitForTimeout(1500);
await shot(page, '02-editor-light');

// dark theme
await page.getByRole('button', { name: '切换主题' }).click();
await page.waitForTimeout(800);
await shot(page, '03-editor-dark');

// blueprint canvas via command palette
await page.keyboard.press('Meta+k');
await page.getByRole('textbox', { name: '搜索命令' }).fill('蓝晒');
await page.getByText('画布：蓝晒').click();
await page.waitForTimeout(800);
await shot(page, '04-editor-blueprint');

// back to light/paper
await page.keyboard.press('Meta+k');
await page.getByRole('textbox', { name: '搜索命令' }).fill('纸面');
await page.getByText('画布：纸面').click();
await page.getByRole('button', { name: '切换主题' }).click();
await page.waitForTimeout(500);

// 3D
await page.getByRole('tab', { name: '3D 场景' }).click();
await page.waitForTimeout(4000);
await shot(page, '05-editor-3d');
await page.getByRole('tab', { name: '2D 平面' }).click();
await page.waitForTimeout(800);

// AI candidates
await page.getByRole('tab', { name: 'AI', exact: true }).click();
await page.getByRole('textbox', { name: 'AI 需求描述' }).fill('89平米两居，奶油风，预算15万，家里有猫，客厅要投影，主卧要大衣柜');
await page.getByRole('button', { name: '生成设计方案' }).click();
await page.getByRole('radio', { name: /选择方案/ }).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(600);
await shot(page, '06-ai-candidates');

// sheets dialog
await page.getByRole('tab', { name: '属性' }).click();
await page.getByRole('button', { name: /出图/ }).click();
await page.waitForTimeout(1500);
await shot(page, '07-sheets');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// import review
let importPage = await newPage();
importPage.on('pageerror', (e) => errors.push(e.message));
await importPage.goto(BASE, { waitUntil: 'networkidle' });
await importPage.getByRole('button', { name: '导入图纸' }).click();
await importPage.waitForURL(/\/project\//);
await importPage.waitForTimeout(1200);
await importPage.locator('input[type=file]').setInputFiles('apps/web/public/samples/demo-plan-a.png');
await importPage.getByRole('button', { name: '生成可编辑草图' }).waitFor({ timeout: 120000 });
await importPage.waitForTimeout(800);
await shot(importPage, '08-import-review');
await importPage.close();

// tablet 1024
page = await newPage(1024, 800);
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
console.log('1024 gallery overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await shot(page, '09-gallery-1024');
await page.locator('article button[aria-label^="打开 "]').first().click();
await page.waitForTimeout(1500);
console.log('1024 editor overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await shot(page, '10-editor-1024');

// mobile-ish 768
page = await newPage(768, 900);
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
console.log('768 gallery overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await shot(page, '11-gallery-768');
await page.locator('article button[aria-label^="打开 "]').first().click();
await page.waitForTimeout(1500);
console.log('768 editor overflow', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await shot(page, '12-editor-768');

console.log('page errors', errors.slice(0, 8));
await browser.close();
