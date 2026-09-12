# ROADMAP

## 当前阶段

- 阶段：Phase 1.1 — 宝塔部署加固与生产验证
- 版本：`2026091202`
- Branch：`feature/baota-oneclick-deploy-v1`
- 产品修复 Commit：`8b099bda1bd0cf95e2570dffa7e664767753e346`
- 当前 CI HEAD：`a6c440cf829e74d5bf61a7207bf437ef47075f10`
- CI：GitHub Actions Run `34703730896`，结果 `success`
- Artifact：`zonoe-ipa-download-2026091202-baota-build`
- 当前状态：代码、Docker Web 镜像、首页与实际 JS Asset 均已通过 CI；等待真实宝塔服务器用新包复测原白屏问题。

## 阶段目标

把 Phase 1 从“代码/CI 可构建”推进到“宝塔真实环境可稳定安装、打开、登录、访问 API、更新与回滚”的生产可部署状态。

## 本阶段范围

### In Scope

1. 宝塔一键部署、反向代理与内部端口边界。
2. 可复现 Docker 构建与依赖锁定。
3. React 启动失败可见诊断，避免纯白页。
4. 首页静态资源 `/assets/*`、API、后台真实域名 Smoke。
5. GitHub Actions Artifact 与 Stable Release 链路。
6. 首次安装、HTTPS、在线升级、备份与回滚。

### Out of Scope

1. 自动热门 IPA 镜像策略。
2. 推荐/大规模搜索。
3. 多机扩展。
4. 新 UI 大改版。
5. 在生产验证完成前增加新业务功能。

## 计划与状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| Phase 1 前后端/数据库/下载调度 | Done | 核心功能已实现 |
| 宝塔一键部署脚本 | Done | `install.sh`、`auto_install.json`、`nginx.rewrite` |
| Docker 内部端口隔离 | Done | `127.0.0.1:18081` |
| Docker 依赖锁定 | Done | Web/API 使用根 lockfile + `npm ci` |
| 前端白屏诊断 | Done | Boot fallback + Fatal Error Boundary |
| 安装期前端 Asset 健康检查 | Done | 首页 + 实际 JS Asset |
| CI Web 镜像 Smoke | Done | Run `34703730896` success |
| 2026091202 部署 Artifact | Done | 已生成并完成 SHA256/ZIP 校验 |
| 宝塔真实环境 2026091202 重部署 | Next | 等待目标服务器验证 |
| 新 Stable Release | Pending | 真实复测后发布 |
| 在线更新 E2E | Pending | 新 Stable Release 后验证 |
| HTTPS / Cookie Secure | Pending | HTTP 首装稳定后验证 |

## 阶段完成标准

- 宝塔全新环境使用 `2026091202` ZIP 后无需手改源码即可打开首页。
- 首页 JS/CSS 200，无致命运行时错误。
- `/healthz`、`/api/v1/home` 正常。
- `/admin` 可登录。
- Docker 重启后恢复正常。
- 新 Stable Release 指向已验证代码。
- `update.sh` 从旧安装升级成功并保留 `.env`、`data`、`backups`。
- 失败能回滚或显示明确错误。

## Next Task

**P0：在真实宝塔服务器部署 `zonoe-ipa-download-2026091202-baota.zip` 并验证原白屏问题。**

验证顺序：

1. 上传/部署新 ZIP。
2. `docker compose ps` 确认容器状态。
3. `bash scripts/smoke.sh http://127.0.0.1:18081`。
4. 检查宝塔 Nginx 是否反代 `127.0.0.1:18081`。
5. 浏览器验证首页、JS/CSS、`/api/v1/home`、`/admin`。
6. 若通过，发布 `2026091202` Stable Release。
7. 从旧版本执行 `update.sh` 完成在线升级 E2E。
