# Development Changelog

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
