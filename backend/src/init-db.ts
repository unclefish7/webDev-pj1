import { readFile } from 'node:fs/promises';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';
import { splitSql } from './sql.js';

export async function initializeDatabase() {
  const connection = await pool.getConnection();
  const lock = `pj1-init-${process.env.DB_NAME || 'webdev'}`;
  let locked = false;
  try {
    const [locks] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?, 60) AS acquired', [lock]);
    if (locks[0].acquired !== 1) throw new Error('数据库初始化锁获取失败');
    locked = true;
    for (const file of ['001-framework.sql', '002-business.sql']) {
      const sql = await readFile(new URL(`../sql/${file}`, import.meta.url), 'utf8');
      for (const statement of splitSql(sql)) await connection.query(statement);
      await connection.execute('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [file.slice(0, -4)]);
    }
    const [versions] = await connection.execute<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version = ?', ['teacher-data-v1']);
    if (versions.length) { console.log('教师数据已导入，保留现有修改和删除。'); return; }
    for (const file of ['vul.sql', 'comp.sql']) {
      const sql = await readFile(new URL(`../../databases/${file}`, import.meta.url), 'utf8');
      for (let statement of splitSql(sql)) {
        statement = statement.replace(/^create table\s+/i, 'CREATE TEMPORARY TABLE ')
          .replace(/^INSERT INTO osscore\./i, 'INSERT INTO ');
        await connection.query(statement);
      }
    }
    await connection.beginTransaction();
    const vulColumns = 'source_id, source_name, source_publish_date, source_update_date, source_link, affected_version, cvss_score_v4, cvss_score_v3, cvss_score_v2, severity, type, cwe_id, description, cve_id, title';
    const compColumns = 'purl, cpe, type, vendor, name, version, license, description, repository, publish_date, language, record_time';
    await connection.query(`INSERT INTO vulnerabilities (${vulColumns}) SELECT ${vulColumns} FROM tmp_vul`);
    await connection.query(`INSERT INTO components (${compColumns}) SELECT ${compColumns} FROM tmp_comp`);
    await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', ['teacher-data-v1']);
    await connection.commit();
    console.log('教师数据导入完成：1000 条漏洞、398 条组件。');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.query('DROP TEMPORARY TABLE IF EXISTS tmp_vul, tmp_comp');
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]);
    connection.release();
  }
}

try { await initializeDatabase(); } finally { await pool.end(); }
