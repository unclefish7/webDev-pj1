import { test, expect } from '@playwright/test';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

async function database() { return mysql.createConnection({host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME}); }

test('风险概览、筛选跳转、空结果、失败反馈及手机布局', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: '风险概览', exact: true})).toBeVisible();
  await expect(page.getByText('服务正常', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'CVE 漏洞管理', exact: true}).click();
  await expect(page.locator('.el-table__body tbody tr').first()).toBeVisible();
  await page.getByRole('textbox', {name: '搜索关键词'}).fill('zz-no-record-zz');
  await page.getByRole('button', {name: '搜索', exact: true}).click();
  await expect(page.getByText('没有找到匹配记录，请调整搜索条件')).toBeVisible();
  await page.route('**/api/vulnerabilities?*', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: {message: '模拟服务暂不可用'}})}));
  await page.getByRole('button', {name: '重置', exact: true}).click();
  await expect(page.getByText('模拟服务暂不可用')).toBeVisible();
  await page.unroute('**/api/vulnerabilities?*');
  await page.getByRole('button', {name: '重试', exact: true}).click();
  await expect(page.locator('.el-table__body tbody tr').first()).toBeVisible();
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: '风险概览', exact: true}).click();
  await expect(page.getByRole('heading', {name: '风险概览', exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('浏览器完成 Maven 新增、校验、重复反馈、详情、修改及删除确认', async ({page}) => {
  const marker = `browser-${randomUUID().slice(0, 8)}`;
  const connection = await database();
  try {
    await page.goto('/#page=components');
    await page.getByRole('button', {name: '＋ 新增组件'}).click();
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('此项为必填项').first()).toBeVisible();
    await page.getByRole('textbox', {name: 'groupId', exact: true}).fill('org.example');
    await page.getByRole('textbox', {name: 'artifactId', exact: true}).fill(marker);
    await page.getByRole('textbox', {name: '版本', exact: true}).fill('1.0.0');
    await expect(page.getByRole('textbox', {name: '生成的 PURL'})).toHaveValue(`pkg:maven/org.example/${marker}@1.0.0`);
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('组件已创建', {exact: true})).toBeVisible();
    await page.getByRole('textbox', {name: '搜索关键词'}).fill(marker);
    await page.getByRole('button', {name: '搜索', exact: true}).click();
    const row = page.locator('.el-table__body tbody tr').filter({hasText: marker});
    await expect(row).toHaveCount(1);
    await row.getByRole('button', {name: '详情', exact: true}).click();
    await expect(page.getByRole('heading', {name: marker, exact: true})).toBeVisible();
    await page.locator('.el-drawer').getByRole('button', {name: 'Close this dialog'}).click();
    await row.getByRole('button', {name: '编辑', exact: true}).click();
    await page.getByRole('textbox', {name: '描述', exact: true}).fill('浏览器修改后的组件描述');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('修改已保存', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: '＋ 新增组件'}).click();
    await page.getByRole('textbox', {name: 'groupId', exact: true}).fill('org.example');
    await page.getByRole('textbox', {name: 'artifactId', exact: true}).fill(marker);
    await page.getByRole('textbox', {name: '版本', exact: true}).fill('1.0.0');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('此 PURL 已存在，请更换组件坐标或版本')).toBeVisible();
    await page.getByRole('button', {name: '取消', exact: true}).click();
    await row.getByRole('button', {name: '删除', exact: true}).click();
    await expect(page.getByText('删除确认', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: '取消', exact: true}).click();
    await expect(row).toHaveCount(1);
    await row.getByRole('button', {name: '删除', exact: true}).click();
    await page.getByRole('button', {name: '确认删除', exact: true}).click();
    await expect(page.getByText('没有找到匹配记录，请调整搜索条件')).toBeVisible();
  } finally {
    const [rows] = await connection.execute<mysql.RowDataPacket[]>('SELECT id FROM components WHERE name = ?', [marker]);
    // 清理由测试标记创建的记录和日志，不触碰教师数据。
    await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND summary LIKE ?', ['components', `%${marker}%`]);
    for (const row of rows) await connection.execute('DELETE FROM components WHERE id = ?', [row.id]);
    await connection.end();
  }
});

test('浏览器完成 CVE 搜索、复杂字段编辑和删除', async ({page}) => {
  const connection = await database();
  const marker = `CVE-2099-${Date.now()}`; let id = 0;
  try {
    const [result] = await connection.execute<mysql.ResultSetHeader>('INSERT INTO vulnerabilities (cve_id, description, severity, cwe_id, affected_version) VALUES (?, ?, ?, ?, ?)', [marker, '浏览器独立测试记录', 'MEDIUM', '["CWE-79"]', '["cpe:example"]']); id = result.insertId;
    await page.goto('/#page=vulnerabilities');
    await page.getByRole('textbox', {name: '搜索关键词'}).fill(marker);
    await page.getByRole('button', {name: '搜索', exact: true}).click();
    const row = page.locator('.el-table__body tbody tr').filter({hasText: marker});
    await expect(row).toHaveCount(1);
    await row.getByRole('button', {name: '编辑', exact: true}).click();
    await page.getByRole('textbox', {name: '漏洞标题', exact: true}).fill('浏览器已编辑标题');
    await page.getByRole('textbox', {name: 'CWE（每行一项）', exact: true}).fill('bad-format');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('CWE 格式应为 CWE-数字')).toBeVisible();
    await page.getByRole('textbox', {name: 'CWE（每行一项）', exact: true}).fill('CWE-79\nCWE-89');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(row).toContainText('浏览器已编辑标题');
    await row.getByRole('button', {name: '详情', exact: true}).click();
    await expect(page.locator('.el-drawer')).toContainText('CWE-89');
    await page.locator('.el-drawer').getByRole('button', {name: 'Close this dialog'}).click();
    await row.getByRole('button', {name: '删除', exact: true}).click();
    await page.getByRole('button', {name: '确认删除', exact: true}).click();
    await expect(page.getByText('没有找到匹配记录，请调整搜索条件')).toBeVisible();
  } finally {
    if (id) { await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND resource_id = ?', ['vulnerabilities', id]); await connection.execute('DELETE FROM vulnerabilities WHERE id = ?', [id]); }
    await connection.end();
  }
});

test('操作日志页面展示真实变更快照', async ({page, request}) => {
  const marker = `logs-${randomUUID()}`;
  const connection = await database(); let id = 0;
  try {
    const response = await request.post('/api/components', {data: {purl: `pkg:maven/org.test/${marker}@1.0.0`, name: marker, version: '1.0.0', type: 'maven'}});
    expect(response.status()).toBe(201); id = (await response.json()).id;
    await page.goto('/#page=logs');
    const row = page.locator('.el-table__body tbody tr').filter({hasText: marker});
    await expect(row).toHaveCount(1);
    await row.getByRole('button', {name: '查看变更', exact: true}).click();
    await expect(page.locator('.el-drawer')).toContainText(marker);
    await expect(page.locator('.snapshot').first()).toHaveText('null');
    await expect(page.locator('.snapshot').last()).toContainText('"revision": 1');
  } finally {
    if (id) { await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND resource_id = ?', ['components', id]); await connection.execute('DELETE FROM components WHERE id = ?', [id]); }
    await connection.end();
  }
});
