import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSql } from '../backend/src/sql.ts';
const connection = await mysql.createConnection({host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true});
try {
  for (const [file, source, target] of [['vul.sql', 'tmp_vul', 'vulnerabilities'], ['comp.sql', 'tmp_comp', 'components']]) {
    const sql = await readFile(new URL(`../databases/${file}`, import.meta.url), 'utf8');
    for (let statement of splitSql(sql)) await connection.query(statement.replace(/^create table\s+/i, 'CREATE TEMPORARY TABLE ').replace(/^INSERT INTO osscore\./i, 'INSERT INTO '));
    const [original] = await connection.query(`SELECT * FROM ${source}`);
    const columns = Object.keys(original[0]);
    const [imported] = await connection.query(`SELECT ${columns.join(', ')} FROM ${target} ORDER BY id`);
    assert.equal(imported.length, original.length, `${file}: 数据条数与教师 SQL 不一致`);
    for (let i = 0; i < original.length; i++) {
      for (const column of columns) {
        if (imported[i][column] !== original[i][column]) {
          const key = original[i].cve_id || original[i].purl || `row ${i + 1}`;
          throw new Error(`${file}: ${key} 的 ${column} 与初始数据不同；可能已被正常编辑。此命令只适用于未修改的初始库。`);
        }
      }
    }
    console.log(`${file}: ${imported.length} 条记录全部原始字段逐值一致。`);
  }
} finally { await connection.end(); }
