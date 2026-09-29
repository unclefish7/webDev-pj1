import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitSql } from '../backend/src/sql.ts';
import { validateBody, queryOptions, ApiError } from '../backend/src/validation.ts';

test('SQL 分割保留字符串内分号、换行、转义和成对引号', () => {
  const sql = "-- comment\nINSERT INTO t VALUES ('it\\'s;\nvalid', 'a''b'); /* block */ SELECT 1;";
  const statements = splitSql(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /it\\'s;\nvalid/);
  assert.equal(statements[1], 'SELECT 1');
  assert.throws(() => splitSql("SELECT 'unterminated"));
});

test('教师 SQL 不按行拆分，识别全部 INSERT', async () => {
  for (const [name, count] of [['vul', 1000], ['comp', 398]]) {
    const sql = await readFile(new URL(`../databases/${name}.sql`, import.meta.url), 'utf8');
    assert.equal(splitSql(sql).filter(x => /^INSERT/i.test(x)).length, count);
  }
});

test('校验范围、真实日期、字段白名单和分页', () => {
  for (const value of [-1, 10.1, '9', Infinity]) assert.throws(() => validateBody({cvss_score_v3: value, revision: 1}, 'vulnerabilities'), ApiError);
  assert.equal(validateBody({cvss_score_v3: 0, revision: 1}, 'vulnerabilities').cvss_score_v3, 0);
  assert.throws(() => validateBody({source_publish_date: '2026-02-30', revision: 1}, 'vulnerabilities'), ApiError);
  assert.equal(validateBody({source_publish_date: '2024-02-29', revision: 1}, 'vulnerabilities').source_publish_date, '2024-02-29 00:00:00');
  assert.throws(() => validateBody({id: 99, revision: 1}, 'components'), ApiError);
  assert.throws(() => queryOptions({pageSize: '101'}), ApiError);
  assert.throws(() => queryOptions({page: '-1'}), ApiError);
  assert.throws(() => validateBody({description: ' ', revision: 1}, 'vulnerabilities'), ApiError);
  assert.throws(() => validateBody({cwe_id: ['bad'], revision: 1}, 'vulnerabilities'), ApiError);
  assert.throws(() => validateBody({repository: 'javascript:alert(1)', revision: 1}, 'components'), ApiError);
});
