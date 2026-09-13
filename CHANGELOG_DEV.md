# Development Changelog

## 2026-09-14 — 2026091222 Admin usability + controlled IPA write-back

- 后台“站点设置”改为中文多字段表单：站点名称、站点公告、首页主标题一次加载、一次保存，不再要求管理员理解 `site_name/site_notice/hero_title`。
- 新增“本地缓存”管理页：查看 IPA/目录/任务缓存大小与状态；支持清空目录缓存、重置失败解析、清空 IPA 解析缓存和全部本地缓存。任何缓存操作都不会删除 OpenList IPA 或 MySQL 业务数据。
- 新增“数据同步”页，为每个 MySQL 软件源单独配置 IPA → 数据库字段映射。
- 每个 IPA 字段独立控制：是否参与同步、目标真实 MySQL 列、写回策略（只预览 / 值变化时 / 仅空值 / 以 IPA 为准）。
- 软件源级写回和自动写回默认全部关闭；不允许两个启用字段映射到同一数据库列；保存时校验目标列真实存在。
- 写回只 UPDATE 已存在 App；2026091222 不自动 INSERT 新 App。
- 写回资格采用严格保护：必须当前 IPA `md5 === parsedMd5`、解析成功、无 parseError；旧缓存和失败解析不能修改数据库。
- 新增写回预览、手动确认同步、写回历史；历史不保存 MySQL 密码或 OpenList Token。
- 新增后台自动写回调度器。只有管理员显式开启“允许写回 + 自动写回”的软件源才参与，且仍逐字段遵守映射策略；相同值不会制造无意义 UPDATE。
- 新增 contract tests 覆盖默认关闭、重复目标列、字段禁用、empty/preview 策略和 unchanged no-op。

### 验证状态

- 新增后端 service/router/test 与修改后的 `app.js` 本地 `node --check` 通过。
- 前端 Production build、Vitest、Native smoke、BaoTa contract、MySQL multi-source contract、GitHub updater contract：等待当前 HEAD GitHub Actions 验证。
- 真实 BaoTa / 真实 MySQL 写回尚未执行。首次实机验证必须先保持软件源写回关闭，只运行 Preview。

## 2026-09-14 — 2026091221 Public IPA metadata discovery

- 继续以 2026091220 / `7f48a23c50072fd8a15c50aef74631ca8007504f` 为功能基线，不修改已验证的 updater 和 IPA Range 解析机制。
- 公共 App 搜索接入 OpenList v3 安全缓存，可按当前 IPA 包内名称、包内版本、Build、Bundle ID、最低 iOS、文件名和 Executable 命中；最终 App 行仍从原 MySQL `fa_category` 读取。
- `/api/v1/apps` 新增 `ipa=parsed|pending|failed` 和 `ios=<target>`；`ios` 表示 `MinimumOSVersion <= target`，只对当前 MD5 已解析数据判定，未知/过期/待解析/失败不猜测兼容。
- 公共响应新增安全 `ipa_status`；详情保留 `source_file_size`，同时显示实际 OpenList IPA 大小。
- 前台 App 列表增加 IPA 状态与目标 iOS 筛选；卡片显示包内版本/Build/最低 iOS；详情页把“IPA 已解析”和“MD5 已校验”拆开。
- 修正 stale-cache 边界：文件 MD5 变化或解析失败后，旧 Bundle ID/包内版本/最低 iOS 不再作为当前公开元数据返回，也不会被元数据搜索命中；状态仍显示 pending/failed。
- 新增 contract test 覆盖版本号数值比较、stale MD5 -> pending、失败解析隔离、Bundle ID/包内字段搜索、目标 iOS 兼容筛选和解析状态筛选。
- 同步更新 API 与长期项目状态文档。

### 验证状态

- GitHub Actions #55/#56 通过；Integration tests、Production build、Native API/Frontend smoke、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验均成功。
- 真实 BaoTa 2026091221 E2E 尚未执行，因此状态为 **CI verified / runtime pending**。

## 2026-09-14 — 2026091220 IPA parse results explorer

- 以 2026091219 实机验证通过的宝塔 Native/在线更新链路作为可靠基线；本版不改 updater 核心机制。
- OpenList IPA 缓存升级为 v3，增加安全 `appRefs` 索引，仅保存软件源/原 ID/App 名称与版本/DB 大小/API 内部路径，不保存 `bt1a`、Token 或 `raw_url`。
- 后台新增完整解析结果分页、搜索和状态筛选：全部、已解析、待解析、失败、版本/大小异常。
- 解析结果同时展示软件源版本/大小与 IPA 包内版本/Build/Bundle ID/最低 iOS/实际大小。
- 新增 contract tests 覆盖 appRefs 不泄漏下载地址、缓存 schema 持久化及版本/大小异常判断。

## 2026-09-13 — 2026091217 Online update canary

- 仅用于验证 2026091216 → 2026091217 的真实在线更新链路。
- 不改业务功能；通过版本号变化触发完整的 Preview 下载、备份、安装、配置恢复、API 重启、健康检查与动态进度流程。

## 2026-09-13 — 2026091208 Multi-MySQL software sources + admin operations

- 应用数据改为直接聚合一个或多个现有 MySQL 软件源，不再在 ZONOE 内复制一套 App/版本/IPA 数据。
- 多库允许相同原始 ID，ZONOE 使用 `source_slug:legacy_id` 作为全局身份。
- 后台新增 MySQL 软件源：新增、编辑、启停、优先级、测试连接；凭据加密落盘。
- IPA 下载继续 302 到原 `bt1a` 地址；不上传第二份文件。
- ZONOE 运行时去除 PostgreSQL 依赖。
