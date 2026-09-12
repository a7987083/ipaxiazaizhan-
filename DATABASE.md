# Database

完整 DDL：`apps/api/db/migrations/001_init.sql`。

| 表 | 关键字段 / 约束 |
|---|---|
| users | email UNIQUE, username UNIQUE |
| admins | username UNIQUE, Argon/bcrypt hash（当前 bcrypt 12 rounds） |
| categories | name UNIQUE, slug UNIQUE, enabled/sort_order |
| apps | bundle_id UNIQUE, slug UNIQUE, category_id FK, current_version_id FK |
| app_versions | UNIQUE(app_id, version, build), status/release_date/download_count |
| tags | name/slug UNIQUE |
| app_tags | PK(app_id, tag_id) |
| screenshots | app_id/version_id, sort_order |
| download_sources | type/base_url/encrypted config/priority/health |
| version_download_sources | version_id/source_id/target/priority, UNIQUE(version_id,source_id,target) |
| downloads | app/version/source FK, ip_hash, user_agent, referer, created_at |
| settings | key PK, JSONB value, is_public |

重点索引覆盖 published App 列表、分类、更新时间、热门下载、版本历史、source resolution 和下载统计时间范围。
