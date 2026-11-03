import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
const result = await page.evaluate(() => {
  const found = [];
  function walk(rules) {
    for (const rule of Array.from(rules)) {
      if (rule.cssRules) walk(rule.cssRules);
      const sel = rule.selectorText || '';
      if (sel.includes('text-surface') || sel.includes('text-ink')) found.push(rule.cssText.slice(0, 160));
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules); } catch {}
  }
  const el = document.createElement('div');
  el.className = 'text-surface';
  el.textContent = 'x';
  document.body.appendChild(el);
  const color = getComputedStyle(el).color;
  el.remove();
  return { found, color };
});
console.log('computed test color', result.color);
console.log(result.found.join('\n'));
await browser.close();
