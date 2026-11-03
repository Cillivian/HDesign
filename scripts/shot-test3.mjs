import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.setContent('<html><body style="background:#eee"><h1>Full chromium works</h1></body></html>');
await page.screenshot({ path: '/tmp/test-full-only.png', timeout: 8000 });
console.log('ok');
await browser.close();
