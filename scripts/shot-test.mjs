import { chromium } from '@playwright/test';
for (const options of [
  { name: 'shell', opts: { headless: true, args: ['--no-sandbox'] } },
  { name: 'full-chromium', opts: { headless: true, channel: 'chromium', args: ['--no-sandbox'] } },
]) {
  try {
    const browser = await chromium.launch(options.opts);
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<html><body style="background:#eee"><h1>Hello screenshot</h1></body></html>');
    await page.screenshot({ path: `/tmp/test-${options.name}.png`, timeout: 8000 });
    console.log(options.name, 'ok');
    await browser.close();
  } catch (error) {
    console.log(options.name, 'failed:', error.message.split('\n')[0]);
  }
}
