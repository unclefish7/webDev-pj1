export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) { super(message); }
}

export const vulFields = ['title', 'description', 'severity', 'type', 'source_id', 'source_name', 'source_link', 'source_publish_date', 'source_update_date', 'affected_version', 'cwe_id', 'cvss_score_v2', 'cvss_score_v3', 'cvss_score_v4'] as const;
export const compFields = ['purl', 'cpe', 'type', 'vendor', 'name', 'version', 'license', 'description', 'repository', 'publish_date', 'language', 'record_time'] as const;

export function positiveInteger(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new ApiError(400, 'VALIDATION_ERROR', `${label} 必须为正整数`);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} 必须为 1–${max} 的整数`);
  }
  return Number(value);
}

export function queryOptions(query: Record<string, unknown>) {
  const page = query.page === undefined ? 1 : positiveInteger(query.page, 'page', 1000000);
  const pageSize = query.pageSize === undefined ? 20 : positiveInteger(query.pageSize, 'pageSize', 100);
  if (query.keyword !== undefined && (typeof query.keyword !== 'string' || query.keyword.length > 200)) throw new ApiError(400, 'VALIDATION_ERROR', 'keyword 必须为不超过 200 字的字符串');
  return { page, pageSize, keyword: String(query.keyword || '').trim() };
}

export function validateBody(body: unknown, resource: 'vulnerabilities' | 'components', create = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'VALIDATION_ERROR', '请求体必须为 JSON 对象');
  const data = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  const values: Record<string, string | number | null> = {};
  const allowed = resource === 'components' ? compFields : vulFields;
  for (const field of Object.keys(data)) if (!(allowed as readonly string[]).includes(field) && field !== 'revision') fields[field] = '不支持修改此字段';
  for (const field of allowed) {
    if (!(field in data)) continue;
    const value = data[field];
    if (field.startsWith('cvss_score')) {
      if (value === null) values[field] = null;
      else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) fields[field] = '评分必须为 0–10 的数字或 null';
      else values[field] = value;
    } else if (field === 'affected_version' || field === 'cwe_id') {
      if (value === null) values[field] = null;
      else if (!Array.isArray(value) || value.length > 500 || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 512)) fields[field] = '必须为非空字符串组成的数组（最多 500 项）';
      else if (field === 'cwe_id' && value.some(x => !/^CWE-\d+$/.test(x))) fields[field] = 'CWE 格式应为 CWE-数字';
      else values[field] = JSON.stringify(value);
    } else if (field.endsWith('_date') || field === 'record_time') {
      if (value === null || value === '') values[field] = null;
      else if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(value)) fields[field] = '日期格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss（UTC）';
      else {
        const normalized = value.length === 10 ? `${value} 00:00:00` : value;
        const date = new Date(`${normalized.replace(' ', 'T')}Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 19).replace('T', ' ') !== normalized || Number(value.slice(0, 4)) < 1000) fields[field] = '日期不存在或超出范围';
        else values[field] = normalized;
      }
    } else {
      const max = field === 'description' || field === 'license' ? 15000 : field === 'purl' || field === 'title' ? 512 : field === 'source_id' ? 64 : field === 'source_name' ? 32 : field === 'severity' ? 90 : 255;
      if (value === null) values[field] = null;
      else if (typeof value !== 'string' || [...value].length > max) fields[field] = `必须为不超过 ${max} 字的文本`;
      else values[field] = value.trim();
    }
  }
  if (resource === 'components') {
    for (const field of ['purl', 'name']) if ((create || field in values) && !values[field]) fields[field] = '此项为必填项';
    if (create && !values.version) fields.version = '新增组件必须填写版本';
    if ('version' in values && values.version === null) fields.version = '版本不能为 null';
    if (values.purl && !/^pkg:[a-z][a-z0-9.+-]*\/[^\s?#]+(?:\?[^\s#]+)?(?:#[^\s]+)?$/i.test(String(values.purl))) fields.purl = 'PURL 应为 pkg:生态/名称，可包含命名空间和 @版本';
    if (create && (values.type === 'maven' || String(values.purl).startsWith('pkg:maven/')) && !/^pkg:maven\/[^/@\s]+\/[^/@\s]+@[^\s/?#]+$/.test(String(values.purl))) fields.purl = 'Maven PURL 应为 pkg:maven/groupId/artifactId@version';
    if (create) for (const field of compFields) if (!(field in values)) values[field] = null;
  } else {
    if ('description' in values && !values.description) fields.description = '描述不能为空';
    if ('severity' in values && values.severity !== null && !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'].includes(String(values.severity))) fields.severity = '请选择有效严重程度';
  }
  for (const field of ['source_link', 'repository']) {
    if (values[field]) { try { const url = new URL(String(values[field])); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { fields[field] = '请输入 http:// 或 https:// 链接'; } }
  }
  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_ERROR', '请检查输入字段', fields);
  if (!Object.keys(values).length) throw new ApiError(400, 'VALIDATION_ERROR', '至少提供一个可修改字段');
  if (!create) positiveInteger(data.revision, 'revision');
  return values;
}
