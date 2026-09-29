import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const base = `http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}`;
await mkdir('tmp/demo-video', {recursive: true});
await mkdir('docs/images', {recursive: true});
const startup = await readFile('tmp/demo-startup.log', 'utf8');
const connection = await mysql.createConnection({host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME});
const marker = `demo-${randomUUID().slice(0, 8)}`;
const cve = `CVE-2099-${Date.now()}`;
let cveId = 0;
const browser = await chromium.launch({slowMo: 160});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, recordVideo: {dir: 'tmp/demo-video', size: {width: 1440, height: 1000}}});
const page = await context.newPage();
const requests = [];
let lastPatch;
page.on('response', async response => {
  if (!response.url().includes('/api/')) return;
  const entry = {method: response.request().method(), path: new URL(response.url()).pathname, status: response.status(), requestBody: response.request().postData()};
  try { entry.response = response.status() === 204 ? null : await response.json(); } catch { entry.response = null; }
  requests.push(entry);
  if (entry.method === 'PATCH' && entry.path.includes('/components/')) lastPatch = entry;
});

async function caption(title, description) {
  await page.evaluate(({title, description}) => {
    let box = document.getElementById('demo-caption');
    if (!box) { box = document.createElement('div'); box.id = 'demo-caption'; document.body.append(box); }
    box.style.cssText = 'position:fixed;bottom:14px;left:250px;right:25px;z-index:99999;background:rgba(15,30,52,.95);color:white;padding:15px 22px;border-radius:10px;font-family:Arial,Microsoft YaHei,sans-serif;pointer-events:none;box-shadow:0 4px 30px #0003';
    box.replaceChildren();
    const h = document.createElement('strong'); h.textContent = title; h.style.cssText = 'display:block;font-size:17px;margin-bottom:7px';
    const p = document.createElement('div'); p.textContent = description; p.style.cssText = 'font-size:13px;line-height:1.7;color:#d7e3f5';
    box.append(h, p);
  }, {title, description});
}
async function chapter(title, description, seconds, work) {
  const started = Date.now(); console.log(`开始：${title}`);
  await work(); await caption(title, description);
  while (Date.now() - started < seconds * 1000) {
    await page.waitForTimeout(Math.min(15000, seconds * 1000 - (Date.now() - started)));
    console.log(`${title}：已录制 ${Math.round((Date.now() - started) / 1000)} 秒`);
  }
}
const pause = () => page.waitForTimeout(1800);
const rows = () => page.locator('.el-table__body tbody tr');
async function search(keyword) { await page.getByRole('textbox', {name: '搜索关键词'}).fill(keyword); await page.getByRole('button', {name: '搜索', exact: true}).click(); }

try {
  const [result] = await connection.execute('INSERT INTO vulnerabilities (cve_id, description, title, severity, cwe_id, affected_version) VALUES (?, ?, ?, ?, ?, ?)', [cve, '演示专用漏洞记录，展示真实数据库更新；教师原始记录不被修改。', '用于录屏的独立 CVE 记录', 'MEDIUM', '["CWE-79"]', '["cpe:example"]']); cveId = result.insertId;
  await chapter('01 / 项目启动与系统组成', '启动日志来自本次真实 Docker 环境。前后端共用 app 容器，MySQL 独立持久化；源码挂载，host 网络通信。', 40, async () => {
    await page.setContent('<html lang="zh-CN"><body style="margin:0;padding:65px;background:#132139;color:#e1eaf8;font-family:Arial,Microsoft YaHei,sans-serif"><p style="color:#789aca;letter-spacing:3px">SECUREBASE / STARTUP</p><h1>漏洞与组件信息管理系统</h1><p>Vue 3 · Express · MySQL · Docker Compose</p><h3>启动命令</h3><pre id="command" style="background:#20334f;padding:20px;font-size:18px"></pre><h3>启动日志实录</h3><pre id="log" style="background:#20334f;padding:20px;font-size:13px;line-height:1.8;white-space:pre-wrap"></pre></body></html>');
    await page.locator('#command').evaluate(el => el.textContent = 'docker compose up -d --build --wait --wait-timeout 300\nssh -N -L 5173:127.0.0.1:5173 jerryFduServer');
    await page.locator('#log').evaluate((el, text) => el.textContent = text, startup.slice(-2400));
  });
  await chapter('02 / 风险概览与教师数据', '初始导入 1000 条漏洞与 398 条组件；录屏使用独立 CVE 夹具，因此当前漏洞总数多一条。统计与筛选来自真实 MySQL 查询。', 40, async () => {
    await page.goto(base); await expect(page.getByText('服务正常', {exact: true})).toBeVisible();
    await pause(); await page.screenshot({path: 'docs/images/overview.png', fullPage: true});
    await page.locator('.bar-row').first().click(); await expect(rows().first()).toBeVisible(); await pause();
    await page.getByRole('button', {name: '风险概览', exact: true}).click();
  });
  await chapter('03 / CVE 查询、详情、修改与删除', '先查询教师记录，再编辑演示专用 CVE。影响范围与 CWE 按行录入；保存调用 PATCH，删除须确认并调用 DELETE。', 70, async () => {
    await page.getByRole('button', {name: 'CVE 漏洞管理', exact: true}).click();
    await search('CVE-2026-9999'); await expect(rows()).toHaveCount(1);
    await rows().first().getByRole('button', {name: '详情', exact: true}).click(); await pause();
    await page.locator('.el-drawer').getByRole('button', {name: 'Close this dialog'}).click();
    await search(cve); await expect(rows()).toHaveCount(1);
    await rows().first().getByRole('button', {name: '编辑', exact: true}).click();
    await page.getByRole('textbox', {name: '漏洞标题', exact: true}).fill('录屏验证：漏洞标题已持久化更新');
    await page.getByRole('textbox', {name: 'CWE（每行一项）', exact: true}).fill('CWE-79\nCWE-89');
    await pause(); await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(rows().first()).toContainText('漏洞标题已持久化更新'); await pause();
    await rows().first().getByRole('button', {name: '删除', exact: true}).click(); await pause();
    await page.getByRole('button', {name: '确认删除', exact: true}).click();
    await expect(page.getByText('没有找到匹配记录，请调整搜索条件')).toBeVisible();
  });
  await chapter('04 / Maven 组件完整 CRUD 与校验', 'Maven 坐标生成 PURL。必填校验、详情查看、编辑和删除均通过页面操作完成，记录持久化到数据库。', 95, async () => {
    await page.getByRole('button', {name: 'Maven 组件管理', exact: true}).click();
    await page.getByRole('button', {name: '＋ 新增组件'}).click();
    await page.getByRole('button', {name: '保存', exact: true}).click(); await pause();
    await page.getByRole('textbox', {name: 'groupId', exact: true}).fill('org.example');
    await page.getByRole('textbox', {name: 'artifactId', exact: true}).fill(marker);
    await page.getByRole('textbox', {name: '版本', exact: true}).fill('1.0.0');
    await page.getByRole('textbox', {name: '描述', exact: true}).fill('录屏创建的 Maven 组件'); await pause();
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('组件已创建', {exact: true})).toBeVisible();
    await search(marker); await expect(rows()).toHaveCount(1);
    await rows().first().getByRole('button', {name: '详情', exact: true}).click(); await pause();
    await page.locator('.el-drawer').getByRole('button', {name: 'Close this dialog'}).click();
    await rows().first().getByRole('button', {name: '编辑', exact: true}).click();
    await page.getByRole('textbox', {name: '描述', exact: true}).fill('录屏修改：这条描述通过 HTTP PATCH 写入 MySQL');
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await expect(page.getByText('修改已保存', {exact: true})).toBeVisible();
    await page.reload(); await search(marker); await expect(rows()).toHaveCount(1); await pause();
  });
  await chapter('05 / 一次真实 HTTP 通信', '下方显示刚才组件编辑实际发出的 PATCH 请求、请求体、状态码与返回 JSON。前端 → Vite 代理 → Express 校验/事务 → MySQL → 页面反馈。', 50, async () => {
    await expect.poll(() => lastPatch?.status).toBe(200);
    await page.evaluate(entry => {
      const panel = document.createElement('div'); panel.id = 'demo-network';
      panel.style.cssText = 'position:fixed;top:110px;left:290px;right:65px;bottom:150px;z-index:9000;background:#fff;border:1px solid #dce5f2;border-radius:12px;padding:25px;box-shadow:0 8px 40px #122a4b30;overflow:auto';
      const h = document.createElement('h2'); h.textContent = `HTTP 实际请求：${entry.method} ${entry.path} → ${entry.status}`;
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify(entry, null, 2); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6;color:#23415e';
      panel.append(h, pre); document.body.append(panel);
    }, lastPatch);
    await page.screenshot({path: 'docs/images/http-request.png'});
  });
  await chapter('06 / 删除确认、操作日志与持久化说明', '取消删除不会写入数据库；确认后返回 204，日志保留前后快照。重建容器的独立测试已验证修改、删除与日志持久化，复现命令见 README。', 50, async () => {
    await page.locator('#demo-network').evaluate(el => el.remove());
    await rows().first().getByRole('button', {name: '删除', exact: true}).click(); await pause();
    await page.getByRole('button', {name: '取消', exact: true}).click(); await expect(rows()).toHaveCount(1); await pause();
    await rows().first().getByRole('button', {name: '删除', exact: true}).click(); await page.getByRole('button', {name: '确认删除', exact: true}).click();
    await expect(page.getByText('没有找到匹配记录，请调整搜索条件')).toBeVisible();
    await page.getByRole('button', {name: '操作日志', exact: true}).click();
    await expect(rows().first()).toBeVisible(); await pause();
    await rows().first().getByRole('button', {name: '查看变更', exact: true}).click();
    await expect(page.locator('.snapshot').first()).toContainText(marker); await pause();
    await page.screenshot({path: 'docs/images/operation-log.png'});
  });
  await writeFile('docs/demo-http.json', JSON.stringify(requests, null, 2));
  await context.close();
  await page.video().saveAs('docs/项目演示.webm');
  console.log('演示已保存至 docs/项目演示.webm（约 5 分 45 秒，无音轨，含字幕）。');
} finally {
  await context.close().catch(() => {}); await browser.close();
  await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND resource_id = ?', ['vulnerabilities', cveId]);
  await connection.execute('DELETE FROM vulnerabilities WHERE id = ?', [cveId]);
  const [components] = await connection.execute('SELECT id FROM components WHERE name = ?', [marker]);
  await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND summary LIKE ?', ['components', `%${marker}%`]);
  for (const row of components) await connection.execute('DELETE FROM components WHERE id = ?', [row.id]);
  await connection.end();
}
