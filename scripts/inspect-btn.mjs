import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const first = page.locator('button[aria-label^="打开 "]').first();
await first.click();
await page.waitForTimeout(1200);
const buttons = page.getByRole('button', { name: '出图' });
console.log('count', await buttons.count());
if (await buttons.count()) {
  const info = await buttons.first().evaluate((el) => ({
    cls: el.className,
    text: el.textContent,
    color: getComputedStyle(el).color,
    bg: getComputedStyle(el).backgroundColor,
    html: el.innerHTML.slice(0, 200),
  }));
  console.log(JSON.stringify(info, null, 2));
}
await browser.close();
