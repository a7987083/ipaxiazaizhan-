# HANDOFF

## Current Project Pointer

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-oneclick-deploy-v1`
- Version: `2026091202`
- Product Fix Commit: `8b099bda1bd0cf95e2570dffa7e664767753e346`
- Current Branch HEAD / CI Commit: `a6c440cf829e74d5bf61a7207bf437ef47075f10`
- Workflow: `.github/workflows/ci-release.yml`
- Actions Run: `34703730896`
- CI Result: `success`
- CI Artifact: `zonoe-ipa-download-2026091202-baota-build`
- BaoTa ZIP SHA256: `333c9f70818f2606e000f9c4665cdf4c2ffda10a999be4507134f79e56f35963`
- Current Phase: `Phase 1.1 — BaoTa Deployment Hardening & Production Verification`

## Current Context

Phase 1 的前端、API、PostgreSQL、下载调度、后台、Docker、Nginx、安装/更新、备份回滚已完成。用户曾在真实宝塔环境部署 `2026091201` 后反馈网页纯白，因此本轮优先加固前端生产构建和部署验证，不新增业务功能。

`2026091202` 已修复一个重要的生产可复现性问题：旧 Web/API Dockerfile 使用工作区自身 `package.json` 执行 `npm install`，Web 依赖又使用 `latest`，导致服务器构建可能与 CI 根 lockfile 验证的依赖不同。现在 Web/API Docker 构建均使用仓库根 `package-lock.json` + `npm ci`。

同时前端加入启动占位和 Fatal Error Boundary；安装健康检查与 CI Smoke 均会验证实际构建后的 `/assets/*.js`，避免“API 健康但前端坏掉”仍被判定部署成功。

GitHub Actions Run `34703730896` 已验证：Integration Tests、Production Build、Docker Build、BaoTa Contract、Frontend Image Smoke、Deployment Package Validation 全部成功。

## Key Implementation

### Frontend

- React + Vite，Mobile First + PC。
- 路由：`/`、`/apps`、`/app/:id`、`/login`、`/admin`。
- API 使用同源 `/api/v1/*`。
- `index.html` 有启动 fallback；静态资源失败/启动超时会显示错误。
- `main.jsx` 有顶层 Fatal Error Boundary。

### Backend

- Node.js 22 + Express 5 + PostgreSQL 16。
- Redis 7 可选/辅助。
- `/download/{appId}` 记录统计后跳转，不由 Node.js 中转 IPA。
- Download Source 保持 adapter-based。

### Deployment

- Docker Compose：PostgreSQL / Redis / API / Web / internal Nginx。
- 宝塔公网 Nginx -> `127.0.0.1:18081` -> Docker internal Nginx。
- `install.sh` 生成 `.env`、随机 Secret、数据库密码、管理员密码并执行 migration + seed。
- 健康检查要求 `/healthz`、首页 HTML、实际 JS Asset 全部可达。
- 更新保留 `.env`、`data`、`backups`，失败尝试回滚。

## Critical Behavior Not To Break

1. IPA 大文件不要通过 Node.js 代理传输。
2. `/download/{appId}` 必须先记录统计，再返回跳转。
3. Download Source 保持 adapter-based。
4. 手机端管理后台必须独立可用。
5. `.env`、`data/uploads`、`backups` 更新后必须保留。
6. 更新失败必须尽量回滚。
7. 宝塔部署不能抢占公网 80/443。
8. Docker 构建必须继续使用根 `package-lock.json` + `npm ci`。
9. CI 必须验证真实 Web 镜像首页及 JS Asset，而不只是 `vite build` 成功。

## Current Risks

详见 `KNOWN_ISSUES.md`：

- P0：原白屏问题已在构建/诊断层加固，但等待真实宝塔服务器用 `2026091202` 复测后关闭。
- P0：公开 Stable Release 仍落后；不要用旧 `releases/latest` 代替当前 CI Artifact。
- P1：README / 默认分支 / 正式发布路径仍需统一。

## Real Server Verification

在新包部署后执行：

```bash
docker compose ps
curl -fsS http://127.0.0.1:18081/ | head
curl -fsS http://127.0.0.1:18081/healthz
curl -fsS http://127.0.0.1:18081/api/v1/home
bash scripts/smoke.sh http://127.0.0.1:18081
grep -R "127.0.0.1:18081" /www/server/panel/vhost/nginx/ 2>/dev/null
```

浏览器检查域名首页、`/assets/*.js`、`/api/v1/home`、`/admin`。

## Next Task

**使用 `zonoe-ipa-download-2026091202-baota.zip` 在真实宝塔环境做一次干净重部署。**

若首页正常：

1. 关闭白屏 P0。
2. 将已验证代码进入正式发布分支。
3. 发布新的 Stable Release。
4. 验证从旧版执行 `update.sh` 的在线升级 E2E。
5. 验证 HTTPS、Cookie Secure、备份与回滚。

若仍异常：页面现在应显示“静态资源加载失败 / 页面脚本未完成启动 / 前端启动失败”等诊断信息；结合浏览器 Console 和服务器 Smoke 输出继续定位。

## Files To Read First When Taking Over

1. `PROJECT_STATE.json`
2. `ROADMAP.md`
3. `KNOWN_ISSUES.md`
4. `CHANGELOG_DEV.md`
5. `DEPLOY.md`
6. `.github/workflows/ci-release.yml`
7. `apps/web/Dockerfile`
8. `apps/web/index.html`
9. `apps/web/src/main.jsx`
10. `install.sh`
11. `nginx.rewrite`
12. `docker-compose.yml`
