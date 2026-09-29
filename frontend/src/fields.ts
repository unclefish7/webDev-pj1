import type { Resource } from './api';
export interface Field { key: string; label: string; kind?: 'textarea' | 'score' | 'severity' | 'date' | 'array'; max?: number; required?: boolean; }
export const componentFields: Field[] = [
  { key: 'purl', label: 'PURL', max: 512, required: true },
  { key: 'name', label: '组件名称', max: 255, required: true },
  { key: 'version', label: '版本', max: 255 },
  { key: 'type', label: '生态类型', max: 255 },
  { key: 'vendor', label: '厂商 / 命名空间', max: 255 },
  { key: 'license', label: '许可证', kind: 'textarea', max: 15000 },
  { key: 'description', label: '描述', kind: 'textarea', max: 15000 },
  { key: 'repository', label: '仓库链接', max: 255 },
  { key: 'language', label: '开发语言', max: 255 },
  { key: 'cpe', label: 'CPE 标识', max: 255 },
  { key: 'publish_date', label: '发布时间（UTC）', kind: 'date' },
  { key: 'record_time', label: '收录时间（UTC）', kind: 'date' }
];
export const vulnerabilityFields: Field[] = [
  { key: 'title', label: '漏洞标题', max: 512 },
  { key: 'description', label: '漏洞描述', kind: 'textarea', max: 15000, required: true },
  { key: 'severity', label: '严重程度', kind: 'severity' },
  { key: 'cvss_score_v4', label: 'CVSS v4 评分', kind: 'score' },
  { key: 'cvss_score_v3', label: 'CVSS v3 评分', kind: 'score' },
  { key: 'cvss_score_v2', label: 'CVSS v2 评分', kind: 'score' },
  { key: 'affected_version', label: '影响范围（每行一项）', kind: 'array' },
  { key: 'cwe_id', label: 'CWE（每行一项）', kind: 'array' },
  { key: 'type', label: '漏洞类型', max: 255 },
  { key: 'source_name', label: '来源名称', max: 32 },
  { key: 'source_id', label: '来源编号', max: 64 },
  { key: 'source_link', label: '来源链接', max: 255 },
  { key: 'source_publish_date', label: '来源发布时间（UTC）', kind: 'date' },
  { key: 'source_update_date', label: '来源更新时间（UTC）', kind: 'date' }
];
export function getFields(resource: Resource) { return resource === 'components' ? componentFields : vulnerabilityFields; }
