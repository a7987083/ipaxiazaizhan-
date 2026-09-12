# REST API v1 — 2026091208

统一格式：成功 `{ "ok": true, "data": ..., "meta": ... }`；失败 `{ "ok": false, "error": { "code": "...", "message": "..." } }`。限流 429 也使用同一 JSON 格式。

## Public

- `GET /api/v1/home`
- `GET /api/v1/apps?q=&category=<source_slug>&sort=updated|downloads|name|oldest&page=1&pageSize=20`
- `GET /api/v1/search?q=...`
- `GET /api/v1/apps/{source_slug:legacy_id}`
- `GET /api/v1/apps/{source_slug:legacy_id}/versions`
- `GET /api/v1/categories` — 返回已启用 MySQL 软件源，兼容前端筛选
- `GET /api/v1/tags` — 当前返回空数组
- `GET /api/v1/settings`
- `GET /download/{source_slug:legacy_id}` -> 302 到原 `fa_category.bt1a`

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
- `GET /api/v1/admin/system/update`
- `POST /api/v1/admin/system/update`

`POST /api/v1/admin/upload` 和 App/Version 写接口在 1208 返回 `405 SOURCE_MANAGED`：应用继续由原软件源后台维护，ZONOE 不复制 IPA。
