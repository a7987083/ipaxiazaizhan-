# CHANGELOG_DEV

> 仅记录开发过程中实际发生的变更。面向开发/接手，不替代正式 Release Changelog。

## 2026-09-13 — 2026091208 后台 GitHub 在线更新

- 参考旧项目 `a7987083/app-` 的后台在线更新交互：后台检查版本、确认更新、显示更新中并在完成后刷新状态。
- 当前 ZONOE 后台新增“在线更新”入口。
- 新增 `GET /api/v1/admin/system/update`：返回当前版本、GitHub 最新 Stable、Release 说明和任务状态。
- 新增 `POST /api/v1/admin/system/update`：管理员提交更新任务；继续使用既有 Admin JWT + CSRF 保护。
- 新增 `apps/api/src/services/updateService.js`，负责 GitHub Release 检查和固定格式任务队列，不执行任意 shell。
- 新增 `scripts/admin-update-worker.sh`。
- 新增 `scripts/install-admin-updater.sh`，安装 `zonoe-updater.path` + `zonoe-updater.service`。
- API 仍以 `zonoe` 用户运行；真正需要 root 的更新由独立 systemd oneshot worker 完成。
- worker 复用 1207 的 `update.sh` / `install-online.sh` / `scripts/lib-deploy.sh`，因此继续拥有 SHA256 校验、数据库/程序/前端备份和失败回滚。
- 后台更新被限制为 forward-only：本地开发/预览版高于公开 Stable 时只显示状态，不允许通过 Web 强制降级。
- `VERSION`：`2026091207` -> `2026091208`。
- Implementation Commit：`09d47d6d1c21ca2adc4b9ea90c089d089a131d8d`。
- Forward-only hardening commits：`07bfe8dd0a1b129c2177018a5707ad9b573a85ed`、`d5c2bfe4f1d9ccf92b7f24a97e52cc312da3c9c9`。
- GitHub Actions Run：`34717796655`，结果 `success`。
- Artifact ID：`10305745680`。
- Native ZIP SHA256：`16b35ea0c67519382a471603044f7f62777690e127f3d41fb605ed92fbe83cf9`。
- Generic TAR SHA256：`ee1d122b48a14dd77a0d59377d613a4d2c64c82fc164a1af61f298bde08c9ef4`。
- 下载 CI Artifact 后再次执行 `sha256sum -c`、`unzip -t`，均通过；Native ZIP 已确认包含 updater worker、systemd installer、Admin UI 和 update service。
- 尚未标记 1208 Production Verified：真实服务器当前最后完整运行验证基线仍是 1206；1208 后台按钮 E2E 待做。

## 2026-09-13 — 2026091207 安装器加固与 GitHub 命令行在线更新

- 自动兼容宝塔 PostgreSQL localhost `ident`：备份并写入仅针对 ZONOE DB/user 的认证规则后 reload。
- 前端部署改为 rsync 增量覆盖，保留 `.user.ini`、`.well-known`、`files`。
- 删除无用 `pgcrypto` 硬依赖。
- `/healthz` 改为读取根 `VERSION`。
- `update.sh`/`install-online.sh` 支持 GitHub Stable、Tag、Branch/Ref 更新。
- 更新前自动备份程序、前端和数据库；失败尝试回滚。
- CI Run `34716750221` success。

## 2026-09-13 — 2026091206 真实宝塔运行验证

- 真实站点 `https://ios.zonoeios.xyz` 的 systemd API、本机 PostgreSQL、首页、Assets、公开 API、HTTPS 均验证通过。
- 修复登录/Admin 的前端运行时崩溃，移除该路径上的 `useNavigate()`，改用浏览器原生跳转。
- CI Run `34710236163` success。

## 历史

更早阶段包含 1203 宝塔 Native 初版、1202 白屏加固和 Docker 时代兼容链路。详细上下文以 Git 历史、`HANDOFF.md` 和 `PROJECT_STATE.json` 为准。
