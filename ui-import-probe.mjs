#!/usr/bin/env node
/**
 * End-to-end import probe (temporary Lead tool, not committed).
 * Drives the running Vite dev app (http://localhost:5173) through the import
 * wizard with the reference PDF and captures the recognition review state.
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const PDF = process.argv[2] ?? '/Users/cillivian/Downloads/123.pdf';
const OUT = process.argv[3] ?? '/tmp/ui-import-probe';
const BASE = process.env.HDESIGN_URL ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN' });

const consoleLines = [];
page.on('console', (message) => consoleLines.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`));

const started = Date.now();
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '导入图纸' }).click();
  await page.waitForURL(/\/project\//, { timeout: 20_000 });
  await page.locator('input[type=file]').waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.locator('input[type=file]').setInputFiles(PDF);

  const recognize = page.getByRole('button', { name: /识别第 \d+ 页/ });
  const isPdf = /\.pdf$/i.test(PDF);
  if (isPdf) {
    try {
      await recognize.waitFor({ timeout: 12_000 });
    } catch {
      // The panel can remount right after navigation and drop the first file.
      await page.locator('input[type=file]').setInputFiles(PDF);
      await recognize.waitFor({ timeout: 30_000 });
    }
  }
  await page.screenshot({ path: `${OUT}/01-pdf-picker.png` });
  await recognize.click();

  // Wait for the review step: the apply button appears once recognition settles.
  const apply = page.getByRole('button', { name: '生成可编辑草图' });
  await apply.waitFor({ timeout: 240_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${OUT}/02-review.png`, fullPage: true });

  const summary = await page.locator('text=/\\d+ 墙 · \\d+ 房 · \\d+ 洞口/').first().textContent().catch(() => null);
  const scale = await page.locator('text=/\\d+\\.\\d+ mm\\/px/').first().textContent().catch(() => null);
  const badge = await page
    .locator('text=/视觉估计|尺寸文字|两点校准|假定比例/')
    .first()
    .textContent()
    .catch(() => null);
  const diagnostics = await page
    .locator('summary:has-text("识别诊断")')
    .first()
    .textContent()
    .catch(() => null);
  // Wall list: lengths in metres, one row per wall.
  const wallRows = await page.locator('li:has-text("厚")').count().catch(() => 0);

  const report = { summary, scale, badge, diagnostics, wallRows, elapsedMs: Date.now() - started };
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, consoleLines }, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await apply.click();
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: `${OUT}/03-applied.png`, fullPage: true });
  const appliedToast = await page
    .locator('text=/已生成可编辑草图/')
    .first()
    .textContent()
    .catch(() => null);
  console.log('applied:', appliedToast);
} catch (error) {
  console.error('probe failed:', error.message);
  await page.screenshot({ path: `${OUT}/99-failure.png`, fullPage: true }).catch(() => undefined);
  writeFileSync(`${OUT}/console.log`, consoleLines.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
