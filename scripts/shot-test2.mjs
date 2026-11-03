import { chromium } from '@playwright/test';
const tries = [
  { name: 'chrome-channel', opts: { headless: true, channel: 'chrome', args: ['--no-sandbox'] } },
  { name: 'chrome-single-process', opts: { headless: true, channel: 'chrome', args: ['--no-sandbox', '--single-process'] } },
];
for (const t of tries) {
  let browser;
  try {
    browser = await chromium.launch(t.opts);
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<html><body style="background:#eee"><h1>Hello</h1></body></html>');
    await page.screenshot({ path: `/tmp/test-${t.name}.png`, timeout: 6000 });
    console.log(t.name, 'ok');
  } catch (error) {
    console.log(t.name, 'failed:', error.message.split('\n')[0]);
  } finally {
    await browser?.close().catch(() => {});
  }
}
