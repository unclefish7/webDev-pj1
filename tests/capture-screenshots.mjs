import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/images', {recursive: true});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const base = `http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}`;
  for (const [route, file] of [['overview', 'overview'], ['vulnerabilities', 'vulnerabilities'], ['components', 'components']]) {
    await page.goto(`${base}/#page=${route}`);
    await expect(page.getByText('服务正常', {exact: true})).toBeVisible();
    if (route === 'overview') await expect(page.locator('.metric').first()).toContainText('1,000');
    else await expect(page.locator('.el-table__body tbody tr').first()).toBeVisible();
    await page.screenshot({path: `docs/images/${file}.png`, fullPage: true});
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${base}/#page=overview`);
  await expect(page.locator('.metric').first()).toContainText('1,000');
  await page.screenshot({path: 'docs/images/mobile.png', fullPage: true});
  console.log('桌面与手机截图已保存到 docs/images/');
} finally { await browser.close(); }
