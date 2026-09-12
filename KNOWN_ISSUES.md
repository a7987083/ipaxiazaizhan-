# KNOWN_ISSUES

## Resolved — 真实宝塔 Native 运行链路

- 状态：Resolved / Real Runtime Verified
- 实际验证：首页、真实 JS Asset、API、systemd、本机 PostgreSQL、HTTPS、登录页均已通过。
- `2026091206` CI Run：`34710236163` success。
- 说明：这是“当前真实站点运行验证通过”，不等于“最新 ZIP 在空服务器完全零人工安装通过”。

## P0 — 宝塔 PostgreSQL HBA 兼容尚未自动化

- 状态：Open / Real Host Workaround Verified
- 真实主机的 `pg_hba.conf` 对 127.0.0.1 TCP 连接使用 `ident`，导致 Node 以 `DATABASE_URL` 密码连接时报：`Ident authentication failed for user "zonoe"`。
- 真实主机已通过针对 `zonoe` 数据库/用户的本机密码认证规则解决，并成功完成 migration/seed 与 API 启动。
- 当前 installer 仍未自动写入/验证该兼容规则。
- 安全要求：只增加应用专用的 127.0.0.1/32 与 ::1/128 规则，不应把 PostgreSQL 整体改成宽松认证。
- 关闭条件：installer 自动处理该场景，并用最新 Native ZIP 在全新宝塔主机零人工走通。

## P0 — 旧 Docker -> Native PostgreSQL 自动迁移需要真实数据验证

- 状态：Open / Implemented
- `install.sh` 已实现旧 Docker PostgreSQL 导出、停止旧栈、本机建库和空库导入逻辑。
- 仍未使用真实旧站点数据核对应用、版本、管理员、下载统计与上传文件。
- 安全原则：迁移确认前不要删除旧 Docker volume。
- 关闭条件：真实旧站点完成迁移并核对数据一致性。

## P0 — Stable Release 仍落后

- 状态：Open
- 当前开发/CI 已到 `2026091206`，公开 Stable 尚未指向这套 Native 代码。
- 当前可验证来源：`zonoe-ipa-download-2026091206-baota-native-build`。
- 不建议在 HBA 自动兼容、全新安装和 Docker 数据迁移测试完成前发布为新的 Stable。
- 关闭条件：完成上述部署测试、发布 Stable，并跑一次在线更新 E2E。

## P1 — Online update / rollback 真实 E2E 尚未完成

- 状态：Open
- Native backup/update/rollback 路径已实现并通过静态/CI 校验。
- 尚未在真实生产数据上完成“备份 -> 更新 -> 健康检查 -> 失败回滚”全流程。
- 关闭条件：Stable 发布后，从旧版本执行真实 update E2E，并至少验证一次可恢复备份。

## P1 — HTTPS Secure Cookie 配置未独立核对

- 状态：Open / Runtime HTTPS Works
- HTTPS 站点与登录页已经工作。
- `scripts/enable-https.sh` 会设置 `COOKIE_SECURE=true`、HTTPS Base URL/Origin 并重启 API。
- 本轮没有单独记录 `.env` 中 `COOKIE_SECURE=true` 的核对结果，因此不要在状态文件里声称该配置已独立验证。
- 关闭条件：不泄露 `.env` 的前提下，通过响应 Cookie 属性或安全的配置检查确认 Secure Cookie。

## P2 — `/healthz` 版本字段仍硬编码

- 状态：Open / Cosmetic
- API 当前 `/healthz` 返回 `version: "2026091201"`，即使实际代码/前端已到 2026091206。
- 这不代表服务器运行旧版本，只是 `apps/api/src/app.js` 的硬编码字符串。
- 建议：启动时读取根目录 `VERSION`，或在 build/install 时注入版本。
- 关闭条件：healthz 与项目 VERSION 保持一致并加入测试。

## Resolved — 宝塔 `public/.user.ini` immutable

- 状态：Resolved in repository
- 原 installer 删除整个 `public/` 时会被宝塔 immutable `.user.ini` 阻塞。
- 已改为 rsync 构建产物，保留 `.user.ini` / `.well-known`。

## Resolved — pgcrypto 缺失

- 状态：Resolved in repository
- `001_init.sql` 曾无实际用途地要求 `pgcrypto`。
- 宝塔 PostgreSQL 缺少扩展控制文件时 migration 失败。
- 已移除未使用的 pgcrypto 硬依赖。

## Resolved — `/login` 前端运行时错误

- 状态：Resolved / Real Browser Verified
- 症状：FatalBoundary 显示 `l is not a function`。
- `2026091206` 移除 Login/Admin 的 `useNavigate()` 路径，改用原生跳转并加入 route smoke。
- 用户已确认当前页面无问题。

## P2 — Docker 兼容文件仍保留

- 状态：Accepted
- Docker Compose、Dockerfile 和 `.env.docker.example` 暂时保留用于迁移/兼容。
- Native BaoTa ZIP 会排除 Docker 运行文件。
- 在 Native 安装、迁移、更新长期稳定前不急于删除。

## P2 — `insatll.sh` 拼写保留

- 状态：Accepted / Compatibility
- 仅用于历史宝塔入口兼容。
- 正式文档统一使用 `install.sh`。

## 风险原则

- 当前真实站点已可用，不要为了验证新 installer 在生产站上反复重装。
- 全新安装测试应优先使用空站/测试主机。
- 迁移前先备份数据库和 uploads，且不自动删除旧 Docker volume。
- 新 Stable Release 需要 clean install + migration + admin/API/assets + update E2E 的证据链。
