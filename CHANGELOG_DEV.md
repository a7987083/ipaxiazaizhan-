# Development Changelog

## 2026-09-14 — 2026091220 IPA parse results explorer

- 以 2026091219 实机验证通过的宝塔 Native/在线更新链路作为可靠基线；本版不改 updater 核心机制。
- OpenList IPA 缓存升级为 v3，增加安全 `appRefs` 索引，仅保存软件源/原 ID/App 名称与版本/DB 大小/API 内部路径，不保存 `bt1a`、Token 或 `raw_url`。
- 后台新增完整解析结果分页、搜索和状态筛选：全部、已解析、待解析、失败、版本/大小异常。
- 解析结果同时展示软件源版本/大小与 IPA 包内版本/Build/Bundle ID/最低 iOS/实际大小。
- 版本不一致采用非空精确比较；大小差异超过 max(1 MiB, IPA 实际大小 1%) 才提示异常，降低格式/舍入造成的误报。
- 旧 v2 缓存兼容读取；首次 1220 MD5 扫描后自动补齐安全 App 引用索引。
- 新增 contract tests 覆盖 appRefs 不泄漏下载地址、缓存 schema 持久化及版本/大小异常判断。

### 验证状态

- 本地 Node 语法检查通过（API service/routes/tests）。
- GitHub Actions、部署包和 1219 → 1220 在线更新仍需以本提交后的 CI/真实服务器结果为准。

## 2026-09-13 — 2026091217 Online update canary

- 仅用于验证 2026091216 → 2026091217 的真实在线更新链路。
- 不改业务功能；通过版本号变化触发完整的 Preview 下载、备份、安装、配置恢复、API 重启、健康检查与动态进度流程。
- 成功标准：更新后 VERSION=2026091217，后台/MySQL 软件源/OpenList/站点设置等持久配置保持不变，更新状态最终为 success。
- 若更新失败，应由 1216 更新器回滚，并在后台状态与 data/update-runtime/admin-update.log 中留下可诊断信息。

## 2026-09-13 — 2026091208 Multi-MySQL software sources + admin operations

- 后台保留并完善 GitHub「在线更新」：检查版本、一键更新、状态轮询，root systemd worker 继续与 Web API 隔离。
- 应用数据改为直接聚合一个或多个现有 MySQL 软件源，不再在 ZONOE 内复制一套 App/版本/IPA 数据。
- 原 FastAdmin `fa_category` 结构原生适配：`name`、`nickname`、`image`、`keywords/description`、`weigh`、`bt1a`、`bt2a`、`cs`。
- 多库允许相同原始 ID，ZONOE 使用 `source_slug:legacy_id` 作为全局身份。
- 后台新增 MySQL 软件源：新增、编辑、启停、优先级、测试连接；凭据使用既有 `SOURCE_CONFIG_KEY` 加密落盘。
- IPA 下载继续 302 到原 `bt1a` 地址；不上传第二份文件。旧 `/admin/upload` 明确禁用。
- ZONOE 运行时去除 PostgreSQL 依赖；管理员、站点设置、加密源配置放在 `data/control`，更新时一起备份。
- 后台新增「修改密码」：验证当前密码、bcrypt 保存、session version 增量、修改成功强制重新登录；`.env` 密码仅首次初始化使用。
- 登录/API/下载限流统一返回项目 JSON 错误，前端不再把 429 显示成“响应解析失败”。
- CI 增加双 MySQL 软件源模拟测试，覆盖重复 ID、跨源搜索、源筛选、原地址下载、密码修改与 429 JSON。

### 验证状态

- 本地 Shell 语法、Node 语法、Workflow YAML 解析已通过。
- 当前改动提交后的 GitHub Actions CI / Artifact 仍需以最新 HEAD 结果为准。
- 真实宝塔多 MySQL 源和后台一键更新 E2E 在部署候选包后验证；在此之前不标记 Production Verified。
