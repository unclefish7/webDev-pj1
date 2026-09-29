import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const base = `http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}/api`;
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, {method, headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  return {status: response.status, location: response.headers.get('location'), data: response.status === 204 ? null : await response.json()};
}
async function db() { return mysql.createConnection({host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true}); }

test('组件完整 CRUD、唯一约束、搜索转义、并发保护和日志事务', async () => {
  const marker = `test-${randomUUID()}`;
  const body = {purl: `pkg:maven/org.test/${marker}@1.0.0`, name: marker, version: '1.0.0', type: 'maven', description: '测试描述'};
  const ids = [];
  const connection = await db();
  try {
    const created = await api('/components', 'POST', body);
    assert.equal(created.status, 201); ids.push(created.data.id);
    assert.equal(created.location, `/api/components/${created.data.id}`);
    assert.equal((await api('/components', 'POST', body)).status, 409);
    const beforeLogs = (await api('/operation-logs')).data.total;
    assert.equal((await api('/components', 'POST', {...body, purl: `pkg:test/${marker}`, name: ' '})).status, 400);
    assert.equal((await api('/operation-logs')).data.total, beforeLogs);
    const found = await api(`/components?keyword=${marker}&pageSize=10`);
    assert.equal(found.data.total, 1); assert.equal(found.data.items[0].id, created.data.id);
    assert.equal((await api('/components?keyword=%25')).data.items.length, 0);
    const update = await api(`/components/${created.data.id}`, 'PATCH', {name: `${marker}-edited`, revision: 1});
    assert.equal(update.status, 200); assert.equal(update.data.revision, 2);
    assert.equal((await api(`/components/${created.data.id}`, 'PATCH', {name: 'stale', revision: 1})).status, 409);
    const [stored] = await connection.execute('SELECT name FROM components WHERE id = ?', [created.data.id]);
    assert.equal(stored[0].name, `${marker}-edited`);
    assert.equal((await api(`/components/${created.data.id}?revision=1`, 'DELETE')).status, 409);
    assert.equal((await api(`/components/${created.data.id}?revision=2`, 'DELETE')).status, 204);
    assert.equal((await api(`/components/${created.data.id}`)).status, 404);
    assert.equal((await api(`/components/${created.data.id}`, 'DELETE')).status, 404);
    const [logs] = await connection.execute('SELECT action, before_data, after_data FROM operation_logs WHERE resource = ? AND resource_id = ? ORDER BY id', ['components', created.data.id]);
    assert.deepEqual(logs.map(x => x.action), ['create', 'update', 'delete']);
    assert.equal(logs[1].before_data.name, marker); assert.equal(logs[1].after_data.name, `${marker}-edited`);
    assert.equal(logs[2].after_data, null);
  } finally {
    for (const id of ids) { await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND resource_id = ?', ['components', id]); await connection.execute('DELETE FROM components WHERE id = ?', [id]); }
    await connection.end();
  }
});

test('CVE 查询、复杂字段修改、校验和删除，测试记录独立于教师数据', async () => {
  const connection = await db(); let id;
  const marker = `CVE-2099-${Date.now()}`;
  try {
    const [result] = await connection.execute('INSERT INTO vulnerabilities (cve_id, description, severity, affected_version, cwe_id) VALUES (?, ?, ?, ?, ?)', [marker, '测试漏洞', 'HIGH', '["cpe:example"]', '["CWE-79"]']); id = result.insertId;
    assert.equal((await api(`/vulnerabilities?keyword=${marker}`)).data.total, 1);
    assert.equal((await api(`/vulnerabilities?keyword=${id}`)).data.items.some(x => x.id === id), true);
    const detail = (await api(`/vulnerabilities/${id}`)).data;
    assert.deepEqual(detail.cwe_id, ['CWE-79']);
    assert.equal((await api('/vulnerabilities', 'POST', {})).status, 404);
    assert.equal((await api(`/vulnerabilities/${id}`, 'PATCH', {revision: 1, cvss_score_v3: 20})).status, 400);
    const changed = await api(`/vulnerabilities/${id}`, 'PATCH', {revision: 1, title: '已修改标题', description: "中文与 apostrophe's\n第二行", cvss_score_v3: 7.5, affected_version: ['cpe:one', 'cpe:two'], cwe_id: ['CWE-79', 'CWE-89']});
    assert.equal(changed.status, 200); assert.equal(changed.data.title, '已修改标题');
    assert.deepEqual((await api(`/vulnerabilities/${id}`)).data.affected_version, ['cpe:one', 'cpe:two']);
    assert.equal((await api(`/vulnerabilities/${id}`, 'DELETE')).status, 204);
    assert.equal((await api(`/vulnerabilities/${id}`)).status, 404);
  } finally {
    if (id) { await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND resource_id = ?', ['vulnerabilities', id]); await connection.execute('DELETE FROM vulnerabilities WHERE id = ?', [id]); }
    await connection.end();
  }
});

test('错误请求返回适当状态和 JSON；搜索字符串不会成为 SQL', async () => {
  for (const path of ['/components/abc', '/components/0', '/components?page=0', '/components?pageSize=999', '/vulnerabilities?severity=INVALID']) assert.equal((await api(path)).status, 400);
  assert.equal((await api('/components/999999999')).status, 404);
  const injected = await api(`/components?keyword=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(injected.status, 200); assert.equal(injected.data.total, 0);
  const malformed = await fetch(base + '/components', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{invalid'});
  assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  const stats = (await api('/stats')).data;
  assert.equal(stats.severity.reduce((sum, x) => sum + x.count, 0), stats.vulnerabilities);
  assert.equal(stats.ecosystems.reduce((sum, x) => sum + x.count, 0), stats.components);
  assert.equal((await api('/vulnerabilities?severity=HIGH_RISK')).data.total, stats.highRisk);
});
