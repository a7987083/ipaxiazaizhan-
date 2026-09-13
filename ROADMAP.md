# Roadmap

## Current — 2026091224 Admin IPA traceability + dynamic database sync rules

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文公开站点设置表单
- [x] 本地缓存管理
- [x] IPA 元数据解析结果库显示管理员下载地址
- [x] 缺失 IPA 条目显示原数据库下载地址和预期 OpenList 路径
- [x] 源版本 / IPA 版本 / Build 分开明确展示
- [x] 数据同步从固定映射升级为动态 `rules[]`
- [x] 默认同步规则可修改、删除
- [x] 支持新增同步规则
- [x] 每条规则独立选择数据来源 / 数据库真实列 / 写入策略 / 启用状态
- [x] 新增“IPA 下载链接”来源，可映射 `bt1a`
- [x] 选择常见 DB 列时自动建议对应数据来源，例如 `bt1a` → IPA 下载链接
- [x] 旧 1222/1223 `mappings` 自动迁移到动态规则
- [x] 清晰开关文案：允许手动写入数据库 / IPA 解析成功后自动写入数据库
- [x] 真实列校验、重复目标列拦截、当前 MD5 强一致保护继续保留
- [x] 预览显示全部已扫描 App，并支持全部 / 有差异 / 可写变化筛选
- [x] 仅更新已有 App，不自动 INSERT
- [x] 2026091224 Actions #79 / run `34784361324` 验证和部署包构建通过
- [ ] Deploy 2026091224 to real BaoTa and validate admin download-address display
- [ ] Verify dynamic mapping UI against the real source schema, including `bt1a`
- [ ] Manually write one low-risk rule to one or a few existing Apps and verify the source backend/database
- [ ] After real verification, consider enabling “IPA 解析成功后自动写入数据库”
- [ ] After existing-row automation is proven, design auto-INSERT workflow for brand-new IPA/App

## Verification note

Actions #79 / run `34784361324`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验/Artifact 上传均成功。`release-e2e` 按现有 workflow 条件 skipped。

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
- `2026091222`: controlled IPA write-back + admin tools; CI passed; real deployment exposed Preview visibility issue.
- `2026091223`: Preview visibility hotfix; CI passed.
- `2026091224` functional code `4b1270e838abd9bc726cf88b6f46a8702343d3a5` + contract follow-up `f28644175de5567343750f6a1260c1baa4707128`: admin download URLs + dynamic sync rules; CI #79 passed; real 1224 runtime/write-back pending.
