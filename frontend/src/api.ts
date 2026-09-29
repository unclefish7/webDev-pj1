export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}) { super(message); }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new HttpError(response.status, data.error?.code || 'HTTP_ERROR', data.error?.message || `HTTP ${response.status}`, data.error?.fields);
  return data;
}

export type Resource = 'vulnerabilities' | 'components';
// 同一管理组件消费两类资源。字段的提交类型和长度由 Field 配置与后端白名单校验。
export interface Entity {
  id: number;
  revision: number;
  [field: string]: any;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; }
export const severityNames: Record<string, string> = { CRITICAL: '严重', HIGH: '高危', MEDIUM: '中危', LOW: '低危', NONE: '无风险', UNKNOWN: '未知' };
export const severityColors: Record<string, string> = { CRITICAL: '#b42318', HIGH: '#e85832', MEDIUM: '#d79b21', LOW: '#168a74', NONE: '#587089', UNKNOWN: '#8795a6' };
export function labelSeverity(value: string | null) { return severityNames[value || 'UNKNOWN'] || value; }
export function score(row: Entity) { return row.cvss_score_v4 ?? row.cvss_score_v3 ?? row.cvss_score_v2 ?? '—'; }
export function text(value: unknown) { return value === null || value === undefined || value === '' ? '—' : Array.isArray(value) ? value.join('\n') : String(value); }

