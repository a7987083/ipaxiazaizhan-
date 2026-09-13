# Roadmap

## Current — 2026091222 Admin usability + controlled IPA write-back

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
- [ ] Current-head GitHub Actions green for 2026091222
- [ ] Real BaoTa deploy / updater validation
- [ ] Real MySQL dry-run preview on production-like source
- [ ] Explicitly enable one safe field (recommended: version or size) and verify real write-back
- [ ] After real verification: design auto-INSERT workflow for brand-new IPA/App

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
