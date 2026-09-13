# REST API v1 — 2026091224

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

公开 API 不新增后台 MySQL `bt1a` 管理字段；1224 的下载地址增强只存在于受保护的管理员接口。

## Admin — common

- `POST /api/v1/admin/login`
- `POST /api/v1/admin/logout`
- `GET /api/v1/admin/me`
- `GET /api/v1/admin/apps`
- `GET|POST|PUT|DELETE /api/v1/admin/sources...`
- `GET|PUT /api/v1/admin/openlist...`
- `GET /api/v1/admin/openlist/results`
- `GET /api/v1/admin/openlist/missing`
- `GET|POST /api/v1/admin/system/update`

### 1224 管理员 IPA 解析结果 + 当前下载地址

- `GET /api/v1/admin/openlist/results-rich?page=1&pageSize=50&status=all&q=`

返回与 `openlist/results` 相同的解析结果，并为当前页每个 App 增加管理员专用 `downloadUrl`。该值按 `sourceSlug + legacyId` 实时从对应 MySQL 表的 `bt1a` 读取，不写入 OpenList `appRefs` 安全缓存，不暴露到 Public API。

`GET /api/v1/admin/openlist/missing` 原本已经包含缺失条目的 `downloadUrl`；1224 管理界面开始实际显示该字段。

## 中文站点设置

- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings`

批量保存 `site_name`、`site_notice`、`hero_title`。旧的 `PUT /settings/{key}` 保持兼容。

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

### 1224 配置模型

写回配置从固定 `mappings` 升级为动态 `rules[]`。旧 `mappings` 会自动迁移。

每条规则：

```json
{
  "id": "custom-1",
  "enabled": true,
  "source": "download_url",
  "column": "bt1a",
  "strategy": "changed"
}
```

可选 `source`：

- `package_name`：IPA 包内名称
- `package_version`：IPA 版本号
- `package_build`：IPA Build
- `bundle_id`：Bundle ID
- `minimum_ios`：最低 iOS
- `file_size`：IPA 实际大小
- `download_url`：IPA 下载链接
- `executable`：Executable
- `md5`：IPA MD5

策略：

- `preview`：只预览，不写入
- `changed`：值变化时更新
- `empty`：仅数据库为空时填充
- `always`：以当前来源值为准；如果值本来相同仍不会执行无意义 UPDATE

保护规则：

1. “允许手动写入数据库”默认关闭；关闭时只能预览。
2. “IPA 解析成功后自动写入数据库”默认关闭，并依赖手动写入总开关。
3. 动态规则可以新增、删除、修改来源/目标列/策略。
4. 不允许两个已启用规则写入同一个 MySQL 列。
5. 目标列必须真实存在于当前应用表。
6. 只 UPDATE 已存在 App；2026091224 仍不自动 INSERT 新 App。
7. 只有 `md5 === parsedMd5`、解析成功且无 parseError 的当前 IPA 元数据才有资格写入。
8. `download_url` 可映射到 `bt1a`；自动模式启用前应先在真实环境预览并确认生成/回退后的地址正确。
9. 写入历史保存在 ZONOE control 数据目录，不包含 MySQL 密码或 OpenList Token。
