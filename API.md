# REST API v1

统一格式：成功 `{ "ok": true, "data": ..., "meta": ... }`；失败 `{ "ok": false, "error": { "code": "...", "message": "..." } }`。

## Public

- `GET /api/v1/home`
- `GET /api/v1/apps?q=&category=&tag=&sort=updated|downloads|name|oldest&page=1&pageSize=20`
- `GET /api/v1/search?q=...`
- `GET /api/v1/apps/{id|slug}`
- `GET /api/v1/apps/{id|slug}/versions`
- `GET /api/v1/categories`
- `GET /api/v1/tags`
- `GET /api/v1/settings`
- `GET /download/{appId}?versionId={versionId}` -> 302

## Admin

认证：`POST /api/v1/admin/login`，服务端写 HttpOnly JWT cookie 和 CSRF cookie。所有非 GET 后台请求必须携带 `X-CSRF-Token`。

- `POST /api/v1/admin/login`
- `POST /api/v1/admin/logout`
- `GET /api/v1/admin/me`
- `GET/POST/PUT/DELETE /api/v1/admin/apps[...]`
- `POST /api/v1/admin/apps/{id}/versions`
- `PUT/DELETE /api/v1/admin/versions/{id}`
- `GET/PUT /api/v1/admin/versions/{id}/sources`
- Category / Tag / Download Source CRUD
- `POST /api/v1/admin/upload` multipart field `file`
- `GET /api/v1/admin/statistics`
- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings/{key}`

常见状态：400 参数错误；401 未登录；403 CSRF；404 不存在；409 UNIQUE 冲突；429 限流；503 下载源不可用。
