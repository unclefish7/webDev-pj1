import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const frontend = `http://127.0.0.1:${process.env.FRONTEND_PORT || 5173}`;
const backend = `http://127.0.0.1:${process.env.API_PORT || 3000}`;

test('前端返回页面且 /api 代理能通过后端查询真实 MySQL', async () => {
  const page = await fetch(frontend);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src\/main.ts/);
  const direct = await fetch(`${backend}/api/health`);
  assert.equal(direct.status, 200);
  const proxied = await fetch(`${frontend}/api/health`);
  assert.equal(proxied.status, 200);
  assert.deepEqual(await proxied.json(), { status: 'ok', database: 'connected' });
});

test('未知 API 通过前端代理返回 JSON 404', async () => {
  const response = await fetch(`${frontend}/api/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});

test('数据库存在已初始化的框架版本记录', async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  try {
    const [rows] = await connection.query('SHOW TABLES LIKE ?', ['schema_migrations']);
    assert.equal(rows.length, 1);
    const [versions] = await connection.execute('SELECT version FROM schema_migrations WHERE version = ?', ['001-framework']);
    assert.equal(versions.length, 1);
  } finally { await connection.end(); }
});
