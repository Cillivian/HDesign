import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/hd-gallery2.png', timeout: 20000 });
const cards = page.locator('button[aria-label^="打开 "]');
console.log('cards', await cards.count());
if ((await cards.count()) > 0) {
  await cards.first().click();
  await page.waitForTimeout(1500);
  console.log('url', page.url());
  console.log('body', (await page.locator('body').innerText()).slice(0, 300));
  await page.screenshot({ path: '/tmp/hd-editor.png', timeout: 20000 });
}
await browser.close();
