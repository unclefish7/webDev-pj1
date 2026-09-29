import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { pool } from './db.js';
import { ApiError, positiveInteger, queryOptions, validateBody } from './validation.js';

export const api = Router();
type Resource = 'vulnerabilities' | 'components';

function present(row: RowDataPacket, resource: Resource) {
  if (resource === 'vulnerabilities') {
    for (const key of ['affected_version', 'cwe_id']) {
      if (row[key] !== null) { try { row[key] = JSON.parse(row[key]); } catch { row[key] = [row[key]]; } }
    }
  }
  return row;
}

async function getRow(connection: PoolConnection, resource: Resource, id: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT * FROM ${resource} WHERE id = ? FOR UPDATE`, [id]);
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', '记录不存在或已被删除');
  return rows[0];
}

async function transaction<T>(work: (connection: PoolConnection) => Promise<T>) {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function log(connection: PoolConnection, resource: Resource, id: number, action: string, before: RowDataPacket | null, after: RowDataPacket | null) {
  const row = after || before!;
  const label = resource === 'components' ? row.purl : row.cve_id;
  await connection.execute('INSERT INTO operation_logs (resource, resource_id, action, summary, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?)',
    [resource, id, action, String(label || `#${id}`).slice(0, 600), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
}

for (const resource of ['vulnerabilities', 'components'] as const) {
  api.get(`/${resource}`, async (request, response) => {
    const { page, pageSize, keyword } = queryOptions(request.query);
    const conditions: string[] = [];
    const args: (string | number)[] = [];
    if (keyword) {
      const term = `%${keyword.replace(/[!%_]/g, '!$&')}%`;
      if (resource === 'components') conditions.push("(id = ? OR name LIKE ? ESCAPE '!' OR purl LIKE ? ESCAPE '!')");
      else conditions.push("(id = ? OR cve_id LIKE ? ESCAPE '!' OR title LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')");
      args.push(/^\d+$/.test(keyword) && Number.isSafeInteger(Number(keyword)) ? Number(keyword) : 0, term, term);
      if (resource === 'vulnerabilities') args.push(term);
    }
    if (request.query.severity !== undefined) {
      if (resource !== 'vulnerabilities' || typeof request.query.severity !== 'string' || !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN', 'HIGH_RISK'].includes(request.query.severity)) throw new ApiError(400, 'VALIDATION_ERROR', '严重程度筛选无效');
      if (request.query.severity === 'HIGH_RISK') conditions.push("severity IN ('HIGH', 'CRITICAL')");
      else { conditions.push("COALESCE(NULLIF(severity, ''), 'UNKNOWN') = ?"); args.push(request.query.severity); }
    }
    if (request.query.type !== undefined) {
      if (resource !== 'components' || typeof request.query.type !== 'string' || request.query.type.length > 255) throw new ApiError(400, 'VALIDATION_ERROR', '生态类型筛选无效');
      conditions.push("COALESCE(NULLIF(type, ''), 'unknown') = ?"); args.push(request.query.type);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [count] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${resource}${where}`, args);
    const columns = resource === 'components' ? 'id, purl, name, version, type, vendor, license, revision, updated_at' : 'id, cve_id, title, LEFT(description, 200) AS description, severity, cvss_score_v2, cvss_score_v3, cvss_score_v4, source_name, source_publish_date, revision, updated_at';
    const [items] = await pool.execute<RowDataPacket[]>(`SELECT ${columns} FROM ${resource}${where} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, args);
    response.json({ items, total: Number(count[0].total), page, pageSize });
  });

  api.get(`/${resource}/:id`, async (request, response) => {
    const id = positiveInteger(request.params.id, 'id');
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT * FROM ${resource} WHERE id = ?`, [id]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', '记录不存在或已被删除');
    response.json(present(rows[0], resource));
  });

  api.patch(`/${resource}/:id`, async (request, response) => {
    const id = positiveInteger(request.params.id, 'id');
    const values = validateBody(request.body, resource);
    const row = await transaction(async connection => {
      const before = await getRow(connection, resource, id);
      if (Number(before.revision) !== Number(request.body.revision)) throw new ApiError(409, 'REVISION_CONFLICT', '记录已被其他操作修改，请关闭编辑窗口并重新打开');
      await connection.execute(`UPDATE ${resource} SET ${Object.keys(values).map(key => `${key} = ?`).join(', ')}, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...Object.values(values), id]);
      const after = await getRow(connection, resource, id);
      await log(connection, resource, id, 'update', before, after);
      return after;
    });
    response.json(present(row, resource));
  });

  api.delete(`/${resource}/:id`, async (request, response) => {
    const id = positiveInteger(request.params.id, 'id');
    await transaction(async connection => {
      const before = await getRow(connection, resource, id);
      if (request.query.revision !== undefined && positiveInteger(request.query.revision, 'revision') !== Number(before.revision)) throw new ApiError(409, 'REVISION_CONFLICT', '记录已被修改，请刷新列表后重试');
      await connection.execute(`DELETE FROM ${resource} WHERE id = ?`, [id]);
      await log(connection, resource, id, 'delete', before, null);
    });
    response.status(204).end();
  });
}

api.post('/components', async (request, response) => {
  const values = validateBody(request.body, 'components', true);
  const row = await transaction(async connection => {
    const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO components (${Object.keys(values).join(', ')}) VALUES (${Object.keys(values).map(() => '?').join(', ')})`, Object.values(values));
    const after = await getRow(connection, 'components', result.insertId);
    await log(connection, 'components', result.insertId, 'create', null, after);
    return after;
  });
  response.location(`/api/components/${row.id}`).status(201).json(row);
});

api.get('/stats', async (_request, response) => {
  const [counts] = await pool.query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM vulnerabilities) AS vulnerabilities, (SELECT COUNT(*) FROM components) AS components, (SELECT COUNT(*) FROM vulnerabilities WHERE severity IN (\'HIGH\', \'CRITICAL\')) AS highRisk, (SELECT COUNT(*) FROM operation_logs) AS operations');
  const [severity] = await pool.query<RowDataPacket[]>("SELECT COALESCE(NULLIF(severity, ''), 'UNKNOWN') AS label, COUNT(*) AS count FROM vulnerabilities GROUP BY label ORDER BY count DESC");
  const [ecosystems] = await pool.query<RowDataPacket[]>("SELECT COALESCE(NULLIF(type, ''), 'unknown') AS label, COUNT(*) AS count FROM components GROUP BY label ORDER BY count DESC");
  const [recent] = await pool.query<RowDataPacket[]>('SELECT id, cve_id, title, LEFT(description, 130) AS description, severity, source_publish_date FROM vulnerabilities ORDER BY source_publish_date DESC, id DESC LIMIT 5');
  response.json({ ...counts[0], severity, ecosystems, recent });
});

api.get('/operation-logs', async (request, response) => {
  const { page, pageSize } = queryOptions(request.query);
  const [counts] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM operation_logs');
  const [items] = await pool.query<RowDataPacket[]>(`SELECT id, resource, resource_id, action, summary, created_at FROM operation_logs ORDER BY id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  response.json({ items, total: Number(counts[0].total), page, pageSize });
});

api.get('/operation-logs/:id', async (request, response) => {
  const [items] = await pool.execute<RowDataPacket[]>('SELECT * FROM operation_logs WHERE id = ?', [positiveInteger(request.params.id, 'id')]);
  if (!items.length) throw new ApiError(404, 'NOT_FOUND', '日志不存在');
  response.json(items[0]);
});
