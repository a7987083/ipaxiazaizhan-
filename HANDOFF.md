# HANDOFF

## Current Project Pointer

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Version: `2026091203`
- Implementation Commit: `69509692bfe3f47acbaa438ca74ae0a533f1b078`
- Commit message: `deploy: add BaoTa native systemd deployment v2026091203`
- Workflow: `.github/workflows/ci-release.yml`
- Actions Run: `34705642671`
- CI Result: `success`
- CI Artifact: `zonoe-ipa-download-2026091203-baota-native-build`
- Artifact ID: `10301544130`
- BaoTa ZIP: `zonoe-ipa-download-2026091203-baota-native.zip`
- BaoTa ZIP SHA256: `86916a73a8e6c57487a82b3aeb3e35de19dfb84c5ecbe0e62dc2568965b0352c`
- Current Phase: `Phase 1.2 — BaoTa Native Deployment & Docker Exit`

## Current Context

用户明确选择宝塔单机环境优先使用“非 Docker”部署。`2026091203` 因此将宝塔默认部署架构从 Docker Compose 改为原生模式。

业务代码没有重写：React 前台、Node/Express API、PostgreSQL schema、下载源 adapter、下载统计与 `/download/{appId}` 302 行为继续保留。改变的是部署层。

新的默认链路：

```text
Browser
  ↓
BaoTa Nginx
  ├─ /, /assets/*, /files/* -> <site>/public
  ├─ /api/*                 -> 127.0.0.1:3000
  └─ /download/*            -> 127.0.0.1:3000

systemd: zonoe-api
  ↓
Node.js 22 + Express
  ↓
Local PostgreSQL
```

不再需要 Docker Nginx、Web 容器、API 容器、PostgreSQL 容器或 Redis 容器。Redis 当前不是 API 运行硬依赖，Native 默认不安装。

## What Changed in 2026091203

### BaoTa / Nginx

- `auto_install.json` 的 `run_path` 改为 `/public`。
- `nginx.rewrite` 不再反代到 `127.0.0.1:18081`。
- `/api/*`、`/download/*`、`/healthz` 直接代理 `127.0.0.1:3000`。
- React 静态文件由宝塔 Nginx 直接提供。
- `public/files` 是指向 `data/uploads` 的 symlink，IPA 仍由 Nginx 直接发送。

### API Process

- API 增加 `HOST` 配置。
- Native `.env` 使用 `HOST=127.0.0.1`。
- `install.sh` 写入 `/etc/systemd/system/zonoe-api.service`。
- 运行用户为专用系统用户 `zonoe`。
- 日志使用 `journalctl -u zonoe-api`。

### PostgreSQL

- Native 默认连接 `127.0.0.1:5432`。
- `install.sh` 可安装/启动本机 PostgreSQL，并创建用户/数据库。
- 若检测到旧 Docker PostgreSQL 容器：
  1. 导出 SQL 到 `backups/native-migration-<timestamp>/database.sql`；
  2. 保存旧 `.env`；
  3. `docker compose down`，不删除 volume；
  4. 建立本机数据库；
  5. 本机数据库为空时恢复旧 SQL。

### Build / Static Frontend

- `npm ci` 使用根 `package-lock.json`。
- `npm run build`。
- `apps/web/dist` 复制到 `public/`。
- 安装完成前检查 `public/index.html` 引用的实际 JS Asset 文件存在。

### Update / Backup

- `scripts/backup.sh` 使用本机 `pg_dump`。
- `scripts/lib-deploy.sh` 支持 Native 更新与旧 Docker -> Native 切换。
- 更新仍保留 `.env`、`data`、`backups`。
- Docker 项目文件保留为兼容方案，但 Native ZIP 明确排除 Docker Compose、Dockerfile 和旧 deploy Nginx。

### HTTPS

宝塔启用证书后：

```bash
sudo bash scripts/enable-https.sh your.domain
```

会设置 HTTPS Base URL、Origin、Secure Cookie 并重启 API。

## CI Verification

Run `34705642671` 已通过：

- dependency install
- migrations
- integration tests
- production build
- Native API smoke
- Native frontend static smoke
- shell validation
- BaoTa native contract
- legacy Docker compose syntax
- package build
- package validation
- artifact upload

本地进一步验证 Artifact：

- Native ZIP SHA256：`86916a73a8e6c57487a82b3aeb3e35de19dfb84c5ecbe0e62dc2568965b0352c`
- `sha256sum -c`：PASS
- `unzip -t`：PASS

## Critical Behavior Not To Break

1. IPA 大文件不能由 Node.js 中转。
2. `/download/{appId}` 必须记录统计后跳转。
3. Download Source 保持 adapter-based。
4. 手机端管理后台保持可用。
5. `.env`、`data/uploads`、`backups` 更新/迁移后必须保留。
6. 旧 Docker 数据迁移前必须先导出数据库，且不要自动删除旧 Docker volume。
7. Native API 只监听本机，不暴露公网 3000。
8. 宝塔网站运行目录必须是 `/public`。
9. CI green 不等于 production verified；真实服务器仍必须验证。

## Real Server Verification

```bash
systemctl status zonoe-api --no-pager
journalctl -u zonoe-api -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/v1/home
bash scripts/smoke.sh https://your.domain
```

并确认：

```bash
readlink -f public/files
```

指向站点的 `data/uploads`。

如果从旧 Docker 迁移：

```bash
ls -lah backups/native-migration-*
docker compose ps
```

Docker 服务应停止，但旧 volume 暂时不要删除。

## Current Risks

详见 `KNOWN_ISSUES.md`。最高优先级：

- Native 部署尚未在真实宝塔机器完成生产验证。
- 旧 Docker -> 本机 PostgreSQL 自动迁移尚未经过真实数据验证。
- 公开 Stable Release 仍是旧版。
- 宝塔必须正确应用 `/public` 运行目录和 `nginx.rewrite`。

## Next Task

**在真实宝塔服务器安装/迁移 `2026091203` Native ZIP，验证首页、API、后台、数据与 HTTPS。**

验证通过后：

1. 更新 Production Verified 状态。
2. 发布新的 Stable Release。
3. 从旧 Stable 执行一次 `update.sh` E2E。
4. 验证备份和失败回滚。
5. 再决定是否逐步删除 Docker 兼容方案。

## Files To Read First When Taking Over

1. `PROJECT_STATE.json`
2. `ROADMAP.md`
3. `KNOWN_ISSUES.md`
4. `CHANGELOG_DEV.md`
5. `DEPLOY.md`
6. `install.sh`
7. `nginx.rewrite`
8. `scripts/lib-deploy.sh`
9. `scripts/backup.sh`
10. `.github/workflows/ci-release.yml`
