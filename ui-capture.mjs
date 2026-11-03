import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const PDF = '/Users/cillivian/Downloads/123.pdf';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN' });
let aiDraft = null;
let requestBody = null;
page.on('request', (req) => { if (req.url().includes('/api/ai/parse-plan')) requestBody = req.postData(); });
page.on('response', async (res) => {
  if (!res.url().includes('/api/ai/parse-plan')) return;
  try { aiDraft = await res.json(); } catch (e) { aiDraft = { error: String(e) }; }
});
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '导入图纸' }).first().click();
await page.waitForURL(/\/project\//, { timeout: 20000 });
await page.locator('input[type=file]').waitFor({ state: 'attached', timeout: 30000 });
await page.waitForTimeout(800);
await page.locator('input[type=file]').setInputFiles(PDF);
const recognize = page.getByRole('button', { name: /识别第 \d+ 页/ });
try { await recognize.waitFor({ timeout: 12000 }); } catch { await page.locator('input[type=file]').setInputFiles(PDF); await recognize.waitFor({ timeout: 30000 }); }
await recognize.click();
const apply = page.getByRole('button', { name: '生成可编辑草图' });
await apply.waitFor({ timeout: 240000 });
await page.waitForTimeout(1500);
const bodyText = await page.locator('body').innerText();
const summarize = aiDraft?.draft ? {
  scale: aiDraft.draft.scale,
  walls: aiDraft.draft.walls.length,
  dims: aiDraft.draft.dimensions.map(d => ({ text: d.text, valueMm: d.valueMm, span: d.span, kind: d.kind })),
  rooms: aiDraft.draft.rooms.map(r => ({ label: r.label, n: r.polygon.length })),
  diagnostics: aiDraft.draft.diagnostics,
} : aiDraft;
writeFileSync('/tmp/ui-ai-draft.json', JSON.stringify(summarize, null, 2));
writeFileSync('/tmp/ui-request-body.json', requestBody ?? 'null');
const scaleLine = bodyText.split('\n').filter(l => /mm\/px|墙 ·|识别诊断/.test(l)).slice(0, 12);
console.log(JSON.stringify({ scaleLine, aiScale: summarize?.scale, aiWalls: summarize?.walls, dims: summarize?.dims?.length }, null, 2));
await browser.close();
