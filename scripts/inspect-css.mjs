import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
const rules = await page.evaluate(() => {
  const out = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let list = [];
    try { list = Array.from(sheet.cssRules); } catch { continue; }
    for (const rule of list) {
      const text = rule.cssText;
      if (text.includes('text-surface') || text.includes('color: var(--bg-surface)') || text.includes('.text-ink')) out[text.slice(0, 200)] = true;
    }
  }
  return Object.keys(out).slice(0, 30);
});
console.log(rules.join('\n'));
await browser.close();
