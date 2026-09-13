# Known Issues

## 2026091224 candidate

- GitHub Actions #79 passed, but real BaoTa 2026091224 deployment and real MySQL write-back are not yet verified.
- Admin parse-result download URLs are read from the current source MySQL `bt1a` at request time. If a source DB is unreachable, that source's admin download URL may be blank even though cached IPA metadata remains visible.
- “IPA 下载链接”作为写入来源会优先根据当前 OpenList 配置 + 已解析 `apiPath` 生成规范下载 URL；必要时回退现有数据库 `bt1a`。上线后应先用真实目录映射验证该 URL 与实际公开下载路径一致，再允许自动写入 `bt1a`。
- Auto-writeback remains intentionally limited to existing App rows; brand-new IPA files without an existing `source_slug:legacy_id` mapping are not inserted automatically.
- Dynamic rules validate that a target column exists and block duplicate enabled target columns, but ZONOE cannot infer the business semantics of arbitrary custom source-schema columns. Preview remains required before enabling writes.
- For safety, write-back requires exact current `md5 === parsedMd5`, successful parse and no parseError. Stale/failed metadata cannot write the database.
- Old 2026091222/1223 fixed `mappings` are migrated to dynamic rules at read/save time; real control-data migration should still be checked once on the deployed BaoTa instance.
- Cache clearing remains blocked while an OpenList scan/parse task is running.
- Automatic creation of brand-new App rows remains deferred until existing-row dynamic write-back is verified against the real software-source schema and workflow.
