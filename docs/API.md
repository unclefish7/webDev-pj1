# HTTP API 文档

基础路径 `/api`。浏览器统一通过 Vite 的同源代理调用；后端监听服务器回环地址，SSH 转发 3000 后也可直接访问。请求/响应使用 JSON，删除成功为 204 且无响应体。系统不提供身份认证。

## 资源接口

| 方法 | 路径 | 行为 | 成功状态 |
| --- | --- | --- | --- |
| GET | /health | 实际执行 SELECT 1 检查 MySQL | 200，异常 503 |
| GET | /vulnerabilities | 漏洞列表与搜索 | 200 |
| GET | /vulnerabilities/:id | 完整漏洞详情 | 200 |
| PATCH | /vulnerabilities/:id | 修改允许字段 | 200 |
| DELETE | /vulnerabilities/:id | 删除漏洞 | 204 |
| GET | /components | 组件列表与搜索 | 200 |
| POST | /components | 新增组件 | 201，Location 指向详情 |
| GET | /components/:id | 完整组件详情 | 200 |
| PATCH | /components/:id | 修改组件 | 200 |
| DELETE | /components/:id | 删除组件 | 204 |
| GET | /stats | 风险和生态统计 | 200 |
| GET | /operation-logs | 分页操作日志 | 200 |
| GET | /operation-logs/:id | 日志及 before/after 快照 | 200 |

CVE 没有 POST 接口，内部 id 不等于 CVE 编号。组件的内部 id 与 PURL 分开。

## 列表参数

- `page`：默认 1，正整数，最大 1000000。
- `pageSize`：默认 20，范围 1–100。
- `keyword`：最多 200 字，按内部 ID 或关键字段匹配。漏洞搜索 CVE 编号、标题、描述；组件搜索名称、PURL。`%` 和 `_` 按字面处理，不作为用户通配符。
- `severity`：仅漏洞列表支持，CRITICAL/HIGH/MEDIUM/LOW/NONE/UNKNOWN；HIGH_RISK 合并 HIGH 与 CRITICAL。
- `type`：仅组件列表支持，生态字符串；`unknown` 表示原值为空。

示例：`GET /api/vulnerabilities?keyword=CVE-2026&severity=HIGH&page=1&pageSize=20`

```json
{
  "items": [{"id": 1, "cve_id": "CVE-2026-9999", "severity": "HIGH", "revision": 1}],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

示例只列出部分字段；列表返回摘要，详情返回全部保存字段。列表按内部 ID 倒序，不按漏洞编号大小排序。日志列表仅使用分页参数。

## 新增组件

```http
POST /api/components
Content-Type: application/json
```

```json
{
  "purl": "pkg:maven/org.example/demo-library@1.0.0",
  "name": "demo-library",
  "version": "1.0.0",
  "type": "maven",
  "vendor": "org.example",
  "description": "用于课堂演示",
  "license": "Apache-2.0",
  "repository": "https://example.com/demo-library"
}
```

purl、name、version 在新增时必填。PURL 全表唯一，Maven 新增采用 `pkg:maven/groupId/artifactId@version`。其他可选字段未提交时存 null。后端不依赖前端的坐标生成器，仍自行验证输入。

## 修改与并发保护

PATCH 为部分更新，必须提供读取详情时获得的 `revision`；成功后版本增加 1。

```http
PATCH /api/vulnerabilities/1
Content-Type: application/json
```

```json
{
  "revision": 1,
  "title": "更新后的标题",
  "description": "修正后的漏洞描述",
  "severity": "HIGH",
  "cvss_score_v3": 7.5,
  "cwe_id": ["CWE-79"],
  "affected_version": ["cpe:2.3:a:example:product:*:*:*:*:*:*:*:*"]
}
```

revision 过期返回 409 REVISION_CONFLICT，不更新记录、不生成日志。CVE 编号、内部 ID、本系统时间和 revision 不可作为普通字段修改。空请求和未知字段返回 400。

DELETE 可带 `?revision=版本`；页面始终带版本。带版本但不匹配时返回 409。不带版本仍可删除当前记录。删除不存在记录返回 404。

## 字段格式

### 漏洞可修改字段

| 字段 | 类型/约束 |
| --- | --- |
| title | 文本或 null，最多 512 字；原始标题允许缺失 |
| description | 非空文本，最多 15000 字 |
| severity | CRITICAL/HIGH/MEDIUM/LOW/NONE/UNKNOWN 或 null |
| cvss_score_v2 / v3 / v4 | JSON 数字 0–10 或 null；0 与未评分区分 |
| affected_version | 字符串数组或 null，每项非空、最多 512 字，最多 500 项 |
| cwe_id | CWE-数字 的字符串数组或 null，最多 500 项 |
| type | 文本或 null，最多 255 字 |
| source_id / source_name | 文本或 null，分别最多 64 / 32 字 |
| source_link | HTTP(S) 链接或 null，最多 255 字 |
| source_publish_date / source_update_date | 真实日期时间或 null |

### 组件可修改字段

| 字段 | 类型/约束 |
| --- | --- |
| purl | 非空文本，最多 512 字，以 pkg:生态/路径 为基本结构，全表唯一 |
| name | 非空文本，最多 255 字 |
| version | 文本，最多 255 字；新增非空，编辑允许原始空字符串，但不允许 null |
| type / vendor / cpe / language | 文本或 null，最多 255 字 |
| license / description | 文本或 null，最多 15000 字 |
| repository | HTTP(S) 链接或 null，最多 255 字 |
| publish_date / record_time | 真实日期时间或 null |

日期接受 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`，按 UTC 解释；不接受不存在的日期。详情输出 `YYYY-MM-DD HH:mm:ss`。只允许 HTTP(S) 的链接，前端也再次检查后才创建可点击链接。

## 统计响应

```json
{
  "vulnerabilities": 1000,
  "components": 398,
  "highRisk": 0,
  "operations": 0,
  "severity": [{"label": "HIGH", "count": 0}],
  "ecosystems": [{"label": "maven", "count": 0}],
  "recent": []
}
```

以上为结构示例，数量以实际查询结果为准。highRisk 为 HIGH + CRITICAL 数量，recent 为按来源发布时间倒序的前五条漏洞。

## 错误响应

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请检查输入字段",
    "fields": {"cvss_score_v3": "评分必须为 0–10 的数字或 null"}
  }
}
```

| 状态 | code | 含义 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 参数、字段、日期或范围错误 |
| 400 | INVALID_JSON | 请求体不是合法 JSON |
| 404 | NOT_FOUND | 记录或接口不存在 |
| 409 | DUPLICATE_PURL | PURL 唯一约束冲突 |
| 409 | REVISION_CONFLICT | 记录已发生其他修改 |
| 413 | PAYLOAD_TOO_LARGE | 请求体超过 256KB |
| 500 | INTERNAL_ERROR | 内部错误，响应不包含数据库口令或 SQL 堆栈 |
| 503 | 健康检查结构 | 数据库不可用 |

健康检查错误响应为 `{ "status": "error", "database": "disconnected" }`。其他错误采用统一 error 结构。API 的修改、新增、删除在事务中处理，业务失败不会留下成功日志。

## 容器内检查示例

```sh
docker compose exec app node --input-type=module -e 'const r=await fetch("http://127.0.0.1:5173/api/health"); console.log(r.status,await r.json());'
```

真实 CRUD 请求建议用浏览器 Network 或 `npm test` 检查；不要为了测试删除教师原始记录。
