const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://example.com');
  console.log('页面标题:', await page.title());
  console.log('当前 URL:', page.url());

  // 保持浏览器打开 30 秒
  console.log('浏览器将在 30 秒后自动关闭...');
  await page.waitForTimeout(30000);
  await browser.close();
})();
