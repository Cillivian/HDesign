import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
async function scan(label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  console.log('---', label, '---');
  for (const v of result.violations) {
    console.log(v.id, v.impact, v.nodes.length, v.help);
    for (const node of v.nodes.slice(0, 30)) {
      console.log('  target:', node.target.join(' '));
      console.log('  ', node.failureSummary?.replace(/\n/g, ' | ').slice(0, 240));
    }
  }
}
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await scan('gallery');
await page.locator('button[aria-label^="打开 "]').first().click();
await page.waitForTimeout(1200);
await scan('editor');
await browser.close();
