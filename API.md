# REST API v1 — 2026091225

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

公开 API 不暴露后台管理用下载地址、OpenList Token、网盘写权限或副本管理配置。

## Admin — common

- `POST /api/v1/admin/login`
- `POST /api/v1/admin/logout`
- `GET /api/v1/admin/me`
- `GET /api/v1/admin/apps`
- `GET|POST|PUT|DELETE /api/v1/admin/sources...`
- `GET|PUT /api/v1/admin/openlist...`
- `GET /api/v1/admin/openlist/results`
- `GET /api/v1/admin/openlist/results-rich`
- `GET /api/v1/admin/openlist/missing`
- `GET|POST /api/v1/admin/system/update`

## OpenList 多云盘副本管理 — 2026091225

- `GET /api/v1/admin/openlist/replicas`
  - 读取 ZONOE 副本配置、OpenList 挂载存储摘要和 Alias 覆盖检查。
  - OpenList `addition` 不直接返回前端，仅在服务端用于有限的 Alias 路径匹配/策略线索检查。
- `PUT /api/v1/admin/openlist/replicas`
  - 保存实体副本盘、每盘副本根目录、是否可写、写操作权限和 Alias 挂载路径。
  - Alias 不能被配置成实体副本盘。
- `POST /api/v1/admin/openlist/replicas/preview`
  - 以启用的 MySQL 软件源当前 `bt1a` 为期望清单，递归扫描选中的 OpenList 实体网盘目录。
  - 返回每盘 `present / missing / extra`、MD5 可确认的同目录改名建议，以及 App × 网盘副本矩阵。
- `POST /api/v1/admin/openlist/replicas/sync`
  - 请求体：`{ "limit": 20, "targetStorageIds": [] }`。
  - 只向标记为“可写”的缺失目标盘提交 OpenList `/api/fs/copy` 跨存储复制；单次最多 50 条。
  - 如果缺失条目已有可靠的 MD5 改名建议，不会先复制第二份，而是等待名称修复。
- `POST /api/v1/admin/openlist/replicas/rename`
  - 仅执行当前重新对账后仍然成立的 MD5 改名建议。
  - 当前版本要求错误文件名与期望文件位于同一相对目录，避免跨目录误移动。
- `POST /api/v1/admin/openlist/replicas/quarantine`
  - 仅处理当前重新对账仍属于 `extra` 的 IPA。
  - 通过 OpenList `/api/fs/move` 移入 `<副本根目录>/<隔离目录>/<YYYY-MM-DD>/...`。
  - 2026091225 没有永久删除 API。

### 权限与安全边界

1. `enabled`、`allowCopy`、`allowRename`、`allowQuarantine` 默认均不会因为升级自动打开。
2. 实体盘必须显式勾选；写操作还要求该盘单独标记 `writable=true`。
3. 永久删除未实现；多余文件只能人工确认后移动到隔离区。
4. 每次重命名和隔离前都会重新对账，防止使用过期页面结果直接修改云盘。
5. ZONOE 不下载再上传 IPA；复制/移动/改名全部调用 OpenList 文件 API。
6. OpenList 跨存储 copy 可能进入 OpenList 后台任务队列，提交成功不代表字节已完成复制；需稍后重新对账确认。
7. OpenList Token 必须具备调用所需 API 的权限。仅元数据扫描可使用较低权限；副本管理还需要存储列表和相应文件写权限。
8. Alias 在 1225 中只做发现/覆盖检查，不由 ZONOE 自动创建或改写驱动配置。最终读取冲突策略应在 OpenList 中配置为适合的原生负载均衡模式。

## 管理员 IPA 解析结果 + 当前下载地址

- `GET /api/v1/admin/openlist/results-rich?page=1&pageSize=50&status=all&q=`

为当前页解析结果增加管理员专用 `downloadUrl`；按 `sourceSlug + legacyId` 实时读取 MySQL `bt1a`，不写入安全 `appRefs` 缓存，不暴露到 Public API。

## 中文站点设置

- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings`

批量保存 `site_name`、`site_notice`、`hero_title`。

## 本地缓存管理

- `GET /api/v1/admin/cache`
- `POST /api/v1/admin/cache/clear`

`target` 可为 `directory`、`failed`、`ipa`、`all`。缓存操作不会删除 OpenList IPA，也不会删除/修改 MySQL 业务数据。

## IPA → MySQL 动态同步规则

- `GET /api/v1/admin/sources/{id}/writeback`
- `PUT /api/v1/admin/sources/{id}/writeback`
- `GET /api/v1/admin/sources/{id}/writeback/preview?limit=50`
- `POST /api/v1/admin/sources/{id}/writeback/apply`
- `GET /api/v1/admin/sources/{id}/writeback/history?limit=50`

写回配置使用动态 `rules[]`；可选来源包括 `package_name`、`package_version`、`package_build`、`bundle_id`、`minimum_ios`、`file_size`、`download_url`、`executable`、`md5`。策略为 `preview / changed / empty / always`。仍只 UPDATE 已有 App，不自动 INSERT 新 App；当前成功解析和 `md5 === parsedMd5` 保护继续生效。
