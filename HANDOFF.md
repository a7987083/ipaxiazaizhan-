# HANDOFF

## Current Project Pointer

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-oneclick-deploy-v1`
- Version: `2026091201`
- Implementation Commit: `e9bb144a045bc51efbe74fa19f85f412878f09b0`
- Commit message: `deploy: align BaoTa metadata with external PostgreSQL installer`
- Workflow: `.github/workflows/ci-release.yml`
- Actions Run: `34689591609`
- CI Result: `success`
- CI Artifact: `zonoe-ipa-download-2026091201-baota-build`
- Current Phase: `Phase 1.1 — BaoTa Deployment Hardening & Production Verification`

## Current Context

Phase 1 的前端、API、PostgreSQL、下载调度、后台、Docker、Nginx、安装/更新、备份回滚和 CI 已基本完成。

最近一轮工作重点不是新增业务功能，而是让项目在宝塔环境稳定一键部署。当前功能分支已包含宝塔专用 `auto_install.json`、`install.sh`、`nginx.rewrite`，Docker 内部 Nginx 使用 `127.0.0.1:18081`，宝塔公网 Nginx 负责 80/443 并反代进入 Docker。

用户已在真实环境部署过一次，并反馈“页面空白”。因此当前状态不能标记为 production verified。需要优先完成真实环境定位与 Smoke Test。

另一个关键上下文：当前公开 Stable Release `download-v2026091201` 仍指向旧 Commit `6b7ff7e6aa2c626428c1a835e07eed2aedfe05e3`，没有包含后续 3 个宝塔部署修复 Commit。最新成功 CI Artifact 来自当前功能分支，而不是公开 Stable Release。

## Key Implementation

### Frontend

- React + Vite。
- Mobile First，同时适配 PC。
- 路由：`/`、`/apps`、`/app/:id`、`/login`、`/admin`。
- API 使用同源 `/api/v1/*`，不写死 API Host。

### Backend

- Node.js 22 + Express 5。
- PostgreSQL 16。
- Redis 7 可选/辅助。
- `/download/{appId}` 记录统计后跳转，不让 Node.js 中转 IPA 大文件。
- Download Source 采用 adapter 模式，支持 Local / HTTP / OpenList / Cloud / CDN / S3 / OSS / R2 / Other。

### Deployment

- Docker Compose 服务：PostgreSQL / Redis / API / Web / internal Nginx。
- 宝塔模式：公网流量 -> 宝塔 Nginx -> `127.0.0.1:18081` -> Docker internal Nginx。
- `install.sh` 自动生成 `.env`、随机 Secret、数据库密码、管理员密码，并执行 migration + seed。
- 管理员凭据写入 `data/install-info.txt`。
- 更新流程保留 `.env`、`data`、`backups`，更新前备份，失败尝试回滚。

## Critical Behavior Not To Break

1. IPA 大文件不要通过 Node.js 代理传输。
2. `/download/{appId}` 必须先记录统计，再返回跳转。
3. Download Source 必须保持 adapter-based，不把 OpenList/Tianyi 特有逻辑硬编码进 App 主表。
4. 手机端管理后台必须可独立使用。
5. `.env`、`data/uploads`、`backups` 在线更新后必须保留。
6. 更新失败必须尽量回滚。
7. 宝塔部署不能抢占面板 Nginx 的公网 80/443。
8. CI green 不等于 production verified；必须有真实域名 Smoke Test。

## Current Risks

详见 `KNOWN_ISSUES.md`。当前最高优先级：

- P0：真实部署页面空白。
- P0：Stable Release 落后于当前宝塔修复分支。
- P1：`VERSION` 未随修复递增，存在同版本不同代码歧义。
- P1：README/默认分支/在线安装入口尚未完全对齐。

## Verification Commands

在宝塔目标服务器优先执行：

```bash
docker compose ps
curl -I http://127.0.0.1:18081/
curl http://127.0.0.1:18081/healthz
curl http://127.0.0.1:18081/api/v1/home
grep -R "127.0.0.1:18081" /www/server/panel/vhost/nginx/ 2>/dev/null
```

浏览器同时检查：

- HTML 是否正常返回。
- `/assets/*.js`、`/assets/*.css` 是否 200。
- Console 是否有 JS/MIME/CORS/404 错误。
- `/api/v1/home` 是否正常。

## Next Task

**先解决宝塔真实部署空白页，不新增业务功能。**

完成白屏定位后：

1. 修复并重新跑 `.github/workflows/ci-release.yml`。
2. 提升 `VERSION`。
3. 发布新的 Stable Release。
4. 用新 Release 做一次全新宝塔安装。
5. 验证首页、静态资源、API、后台登录。
6. 再从旧版本执行一次 `update.sh` 在线升级 E2E。
7. 验证 `.env`、数据、备份和回滚行为。

## Files To Read First When Taking Over

1. `PROJECT_STATE.json`
2. `ROADMAP.md`
3. `KNOWN_ISSUES.md`
4. `CHANGELOG_DEV.md`
5. `DEPLOY.md`
6. `ARCHITECTURE.md`
7. `.github/workflows/ci-release.yml`
8. `install.sh`
9. `nginx.rewrite`
10. `docker-compose.yml`
