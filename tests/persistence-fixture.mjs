import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const file = new URL('../tmp/persistence-fixture.json', import.meta.url);
const mode = process.argv[2];
const base = `http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}/api`;
const connection = await mysql.createConnection({host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD});
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, {method, headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  return {status: response.status, data: response.status === 204 ? null : await response.json()};
}
try {
  if (mode === 'prepare') {
    try { await readFile(file); throw new Error('已有持久化测试夹具，请先 verify 或 cleanup'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const marker = `persist-${randomUUID()}`;
    const fixture = {marker, components: [], vulnerabilities: []};
    await mkdir(new URL('../tmp', import.meta.url), {recursive: true});
    const save = () => writeFile(file, JSON.stringify(fixture, null, 2));
    await save();
    for (let i = 0; i < 2; i++) {
      const response = await api('/components', 'POST', {purl: `pkg:maven/org.test/${marker}-${i}@1.0.0`, name: `${marker}-${i}`, version: '1.0.0', type: 'maven'});
      assert.equal(response.status, 201); fixture.components.push(response.data.id); await save();
    }
    const patched = await api(`/components/${fixture.components[0]}`, 'PATCH', {description: marker, revision: 1}); assert.equal(patched.status, 200);
    assert.equal((await api(`/components/${fixture.components[1]}`, 'DELETE')).status, 204);
    for (let i = 0; i < 2; i++) {
      const [result] = await connection.execute('INSERT INTO vulnerabilities (cve_id, description, title) VALUES (?, ?, ?)', [`CVE-2099-${Date.now()}${i}`, marker, '持久化测试']);
      fixture.vulnerabilities.push(result.insertId); await save();
    }
    assert.equal((await api(`/vulnerabilities/${fixture.vulnerabilities[0]}`, 'PATCH', {title: marker, revision: 1})).status, 200);
    assert.equal((await api(`/vulnerabilities/${fixture.vulnerabilities[1]}`, 'DELETE')).status, 204);
    console.log('持久化夹具已准备：组件/CVE 各有一条修改记录和一条已删除记录。');
  } else if (mode === 'verify' || mode === 'cleanup') {
    const fixture = JSON.parse(await readFile(file, 'utf8'));
    if (mode === 'verify') {
      const component = await api(`/components/${fixture.components[0]}`);
      assert.equal(component.status, 200); assert.equal(component.data.description, fixture.marker); assert.equal(component.data.revision, 2);
      const vulnerability = await api(`/vulnerabilities/${fixture.vulnerabilities[0]}`);
      assert.equal(vulnerability.status, 200); assert.equal(vulnerability.data.title, fixture.marker); assert.equal(vulnerability.data.revision, 2);
      assert.equal((await api(`/components/${fixture.components[1]}`)).status, 404);
      assert.equal((await api(`/vulnerabilities/${fixture.vulnerabilities[1]}`)).status, 404);
      const [logs] = await connection.execute('SELECT COUNT(*) AS count FROM operation_logs WHERE resource = ? AND resource_id = ?', ['components', fixture.components[0]]);
      assert.equal(logs[0].count, 2);
      console.log('容器重建后：修改、删除和日志均持久化，初始化没有恢复已删记录。');
    }
    for (const resource of ['components', 'vulnerabilities']) {
      for (const id of fixture[resource]) { await connection.execute('DELETE FROM operation_logs WHERE resource = ? AND resource_id = ?', [resource, id]); await connection.execute(`DELETE FROM ${resource} WHERE id = ?`, [id]); }
    }
    await unlink(file);
    console.log('独立测试夹具已清理，教师数据保持不变。');
  } else throw new Error('使用 prepare | verify | cleanup');
} finally { await connection.end(); }
