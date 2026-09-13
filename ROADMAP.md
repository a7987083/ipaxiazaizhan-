# Roadmap

## Current — 2026091225 OpenList multi-drive replica management

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] 管理员 IPA 解析库 / 缺失条目显示当前数据库下载地址
- [x] 从 OpenList 管理接口发现挂载存储
- [x] 区分实体网盘与 Alias 分流盘，禁止 Alias 被当成实体副本目标
- [x] 每个实体网盘独立设置副本根目录、是否参与管理、是否允许写操作
- [x] 以 MySQL `bt1a` 为权威清单，对多个网盘统计已有 / 缺失 / 多余 IPA
- [x] App × 网盘副本矩阵
- [x] 通过 OpenList `/api/fs/copy` 补齐缺失副本，不由 ZONOE 中转 IPA
- [x] 同目录唯一 MD5 匹配时提供安全名称修复建议
- [x] 通过 OpenList `/api/fs/rename` 执行人工确认的名称修复
- [x] 多余 IPA 通过 OpenList `/api/fs/move` 移入日期隔离区
- [x] 1225 不提供永久删除 API
- [x] Alias 路径覆盖检查；最终下载分流继续交给 OpenList 原生 Alias
- [x] OpenList Token 文案区分元数据读取权限与副本写权限
- [x] Contract tests：路径映射、缺失/多余、MD5 改名保护
- [x] 2026091225 functional code Actions #91 / run `34786345775` 验证通过
- [ ] Deploy 2026091225 to real BaoTa and verify OpenList storage discovery
- [ ] Real reconciliation against actual Tianyi/Aliyun/etc. replica roots
- [ ] Test one cross-storage copy to a non-critical writable target
- [ ] Test one MD5-backed rename on real OpenList
- [ ] Test one extra IPA quarantine move and verify recovery path
- [ ] Verify actual Alias path coverage and OpenList native file-level load balancing
- [ ] Next: detect same-name but wrong-content replicas using MD5/size and design safe repair
- [ ] Next: background/scheduled replica reconciliation and bounded auto-fill after real manual verification
- [ ] Later: quarantine retention/cleanup policy; permanent delete remains deferred until enough audit history exists

## Verification note

Actions #89 initially failed only because the new contract file used Node `node:test` while the repository runner is Vitest. The three new algorithm checks themselves passed in TAP output. After converting the test to Vitest, Actions #91 / run `34786345775` passed Integration tests, Production build, Native API smoke, Native frontend static smoke, Shell validation, BaoTa native contract, MySQL multi-source contract, GitHub updater contract and package validation/upload. `release-e2e` remains skipped by workflow condition.

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
- `2026091222`: controlled IPA write-back + admin tools; CI passed.
- `2026091223`: Preview visibility hotfix; CI passed.
- `2026091224`: admin download URLs + dynamic DB sync rules; CI passed; real runtime/write-back pending.
- `2026091225` functional code `5cba24b3b32307ea892596329205f973126498fe`: OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage check; CI #91 passed; real multi-drive E2E pending.
