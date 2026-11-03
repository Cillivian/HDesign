import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.locator('button[aria-label^="打开 "]').first().click();
await page.waitForTimeout(1000);
const info = await page.getByRole('button', { name: '出图' }).first().evaluate((el) => {
  const matched = [];
  function walk(rules) {
    for (const rule of Array.from(rules)) {
      if (rule.cssRules) { walk(rule.cssRules); continue; }
      if (!rule.selectorText || !rule.style) continue;
      try { if (el.matches(rule.selectorText) && rule.style.color) matched.push(rule.selectorText + ' => ' + rule.style.color); } catch {}
    }
  }
  for (const sheet of Array.from(document.styleSheets)) { try { walk(sheet.cssRules); } catch {} }
  return { matched, inline: el.getAttribute('style'), color: getComputedStyle(el).color };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
