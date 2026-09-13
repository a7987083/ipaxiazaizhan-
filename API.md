# REST API v1 — 2026091222

统一格式：成功 `{ "ok": true, "data": ..., "meta": ... }`；失败 `{ "ok": false, "error": { "code": "...", "message": "..." } }`。所有非 GET 后台请求必须携带 `X-CSRF-Token`。

## Public

- `GET /api/v1/home`
- `GET /api/v1/apps?q=&category=<source_slug>&sort=updated|downloads|name|oldest&ipa=all|parsed|pending|failed&ios=<target>&page=1&pageSize=20`
- `GET /api/v1/search?q=...`
- `GET /api/v1/apps/{source_slug:legacy_id}`
- `GET /api/v1/apps/{source_slug:legacy_id}/versions`
- `GET /api/v1/categories`
- `GET /api/v1/settings`
- `GET /download/{source_slug:legacy_id}` -> 302 到原 `fa_category.bt1a`

## Admin — existing

- `POST /api/v1/admin/login`
- `POST /api/v1/admin/logout`
- `GET /api/v1/admin/me`
- `GET /api/v1/admin/apps`
- `GET|POST|PUT|DELETE /api/v1/admin/sources...`
- `GET|PUT /api/v1/admin/openlist...`
- `GET /api/v1/admin/openlist/results`
- `GET|POST /api/v1/admin/system/update`

## Admin — 2026091222

### 中文站点设置

- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings`

批量保存 `site_name`、`site_notice`、`hero_title`。旧的 `PUT /settings/{key}` 保持兼容。

### 本地缓存管理

- `GET /api/v1/admin/cache`
- `POST /api/v1/admin/cache/clear`

`target` 可为：

- `directory`：清空 OpenList 目录清单缓存。
- `failed`：清除解析失败/重试等待状态，使失败 IPA 重新进入待解析队列。
- `ipa`：清空本机 IPA 解析缓存。
- `all`：清空目录 + IPA 本地缓存。

缓存操作不会删除 OpenList IPA，也不会删除/修改 MySQL 业务数据。OpenList 扫描/解析任务运行中时拒绝清理。

### IPA → MySQL 字段映射 / 写回

- `GET /api/v1/admin/sources/{id}/writeback`
- `PUT /api/v1/admin/sources/{id}/writeback`
- `GET /api/v1/admin/sources/{id}/writeback/preview?limit=50`
- `POST /api/v1/admin/sources/{id}/writeback/apply`
- `GET /api/v1/admin/sources/{id}/writeback/history?limit=50`

支持的 IPA 字段：

`package_name`、`package_version`、`package_build`、`bundle_id`、`minimum_ios`、`file_size`、`executable`、`md5`。

每个字段独立配置：

- 是否参与同步；
- 目标 MySQL 真实字段；
- `preview`：只预览；
- `changed`：值变化时更新；
- `empty`：仅数据库为空时填充；
- `always`：以当前 IPA 值为准（相同值不会制造无意义 UPDATE）。

保护规则：

1. 软件源级写回默认关闭。
2. 自动写回默认关闭。
3. 不允许两个已启用 IPA 字段映射到同一个 MySQL 列。
4. 目标列必须真实存在于当前应用表。
5. 只 UPDATE 已存在的 App；2026091222 不自动 INSERT 新 App。
6. 只有 `md5` 与 `parsedMd5` 完全一致、解析成功且无 parseError 的当前 IPA 元数据才有资格写回。
7. 自动写回仍严格遵守每个字段的启用状态和策略。
8. 写回历史保存在 ZONOE control 数据目录，不包含 MySQL 密码或 OpenList Token。
