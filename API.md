# REST API v1 — 2026091221

统一格式：成功 `{ "ok": true, "data": ..., "meta": ... }`；失败 `{ "ok": false, "error": { "code": "...", "message": "..." } }`。限流 429 也使用同一 JSON 格式。

## Public

- `GET /api/v1/home`
- `GET /api/v1/apps?q=&category=<source_slug>&sort=updated|downloads|name|oldest&ipa=all|parsed|pending|failed&ios=<target>&page=1&pageSize=20`
- `GET /api/v1/search?q=...`
- `GET /api/v1/apps/{source_slug:legacy_id}`
- `GET /api/v1/apps/{source_slug:legacy_id}/versions`
- `GET /api/v1/categories` — 返回已启用 MySQL 软件源，兼容前端筛选
- `GET /api/v1/tags` — 当前返回空数组
- `GET /api/v1/settings`
- `GET /download/{source_slug:legacy_id}` -> 302 到原 `fa_category.bt1a`

`q` 除原 MySQL 的名称/源版本/说明外，在 OpenList v3 缓存可用时还会匹配 IPA 包内名称、包内版本、Build、Bundle ID、最低 iOS、IPA 文件名和 Executable。`ipa` 只公开解析状态，不公开解析错误详情、`bt1a`、OpenList Token、`raw_url` 或内部 API 路径。`ios=<target>` 的语义是“最低系统要求 <= target”，只返回当前 MD5 对应且已完成解析、能够确认 `MinimumOSVersion` 的 IPA；未知/待解析/失败项不会被误判为兼容。

App 列表/详情在有当前解析结果时会返回 `ipa_status`、`package_name`、`package_version`、`package_build`、`bundle_id`、`min_ios` 和安全的 `ipa_metadata`。详情还保留 `source_file_size` 用于和 OpenList 实际大小区分。

## Admin

认证：`POST /api/v1/admin/login`，服务端写 HttpOnly JWT cookie 和 CSRF cookie。所有非 GET 后台请求必须携带 `X-CSRF-Token`。

- `POST /api/v1/admin/login`
- `POST /api/v1/admin/logout`
- `GET /api/v1/admin/me`
- `POST /api/v1/admin/account/password`
- `GET /api/v1/admin/apps` — 多 MySQL 源只读聚合
- `GET /api/v1/admin/apps/{id}`
- `GET /api/v1/admin/sources`
- `POST /api/v1/admin/sources`
- `PUT /api/v1/admin/sources/{id}`
- `DELETE /api/v1/admin/sources/{id}`
- `POST /api/v1/admin/sources/{id}/test`
- `GET /api/v1/admin/statistics`
- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings/{key}`
- `GET /api/v1/admin/openlist/results`
- `GET /api/v1/admin/system/update`
- `POST /api/v1/admin/system/update`

App/Version 写接口继续返回 `405 SOURCE_MANAGED`：应用由原 MySQL 软件源维护，ZONOE 不复制 IPA。
