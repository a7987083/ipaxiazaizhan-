# Roadmap

## Current — 2026091223 Write-back preview visibility hotfix

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文公开站点设置表单，一次读取/保存站点名称、公告、首页主标题
- [x] 本地缓存管理：目录缓存、解析失败重置、IPA 解析缓存、全部缓存
- [x] 每个 MySQL 软件源独立 IPA → 数据库字段映射
- [x] 每个 IPA 字段独立“参与同步 / 数据库列 / 写回策略”
- [x] 软件源级写回总开关，默认关闭
- [x] 自动写回开关，默认关闭
- [x] 数据库真实列枚举与映射冲突校验
- [x] 当前 MD5/parsedMd5 强一致保护
- [x] 写回预览、手动确认同步、写回历史
- [x] 后台自动写回调度器（仅已有 App，不 INSERT）
- [x] Contract tests：默认关闭、重复列、字段禁用、empty/preview/unchanged 策略
- [x] 1223 修复预览列表：无差异 App 也显示，并支持“全部 / 有差异 / 可写变化”筛选
- [x] 2026091223 GitHub Actions #74 / run `34782998703` 验证及部署包构建通过
- [ ] Deploy 2026091223 to real BaoTa and confirm 50 scanned Apps are visible in Preview
- [ ] Real MySQL dry-run preview on production-like source
- [ ] Explicitly enable one safe field (recommended: version or size) and verify real write-back
- [ ] After real verification: design auto-INSERT workflow for brand-new IPA/App

## Verification note

Actions #74 / run `34782998703`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验/Artifact 上传均成功。`release-e2e` 按现有 workflow 条件 skipped。

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
- `2026091222`: controlled IPA write-back + admin tools; CI passed; real deployment exposed the Preview visibility issue.
- `2026091223` hotfix code / `34d22fd1d5ae13a3f4c061e9b1d59c0d843179dc`: Preview visibility fix; CI #74 passed; real 1223 runtime validation pending.
