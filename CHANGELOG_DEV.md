# CHANGELOG_DEV

> 仅记录开发过程中实际发生的变更。面向开发/接手，不替代正式 Release Changelog。

## 2026-09-13 — 2026091203 宝塔原生部署

### 部署架构切换

- 新建分支 `feature/baota-native-deploy-v1`。
- `VERSION`：`2026091202` -> `2026091203`。
- 宝塔默认部署从 Docker Compose 改为原生模式：
  - 宝塔 Nginx 直接提供 React 静态文件。
  - Node API 改为 `zonoe-api` systemd 服务。
  - API 仅监听 `127.0.0.1:3000`。
  - PostgreSQL 改为本机服务。
  - Redis 原生部署默认不安装，保持可选。
- `auto_install.json` 的 `run_path` 改为 `/public`。
- `nginx.rewrite` 改为直接代理 `/api/*`、`/download/*`、`/healthz` 到 `127.0.0.1:3000`。

### 安装 / 迁移

- `install.sh` 重写为原生幂等安装器。
- 自动检测 Node.js 22，不足时通过 NodeSource 安装。
- 自动检测/安装 PostgreSQL，创建应用用户和数据库。
- 新增专用系统用户 `zonoe`。
- 写入 `/etc/systemd/system/zonoe-api.service`。
- 前端 `npm run build` 后直接部署到 `public/`。
- `public/files` 链接到 `data/uploads`，IPA 继续由 Nginx 直接发送。
- 若检测到旧 Docker PostgreSQL：
  - 先 `pg_dump` 到 `backups/native-migration-<timestamp>/database.sql`；
  - 保存旧 `.env`；
  - `docker compose down`，但不删除 volume；
  - 本机 PostgreSQL 数据库为空时自动导入旧 SQL。
- 新增 `scripts/enable-https.sh`。

### 更新 / 备份

- `scripts/backup.sh` 改为直接使用本机 `pg_dump`。
- `scripts/lib-deploy.sh` 改为 Native 更新引擎，并保留旧 Docker -> Native 切换与失败回滚入口。
- `.env`、`data`、`backups` 继续作为更新保留目录。
- Docker 文件继续保留为兼容方案；新增 `.env.docker.example`。
- Native 宝塔 ZIP 明确排除 Docker Compose、Dockerfile 与旧 Docker Nginx 配置。

### CI / Artifact

- Implementation Commit：`69509692bfe3f47acbaa438ca74ae0a533f1b078`
- Commit message：`deploy: add BaoTa native systemd deployment v2026091203`
- GitHub Actions Run：`34705642671`
- Run 结果：`success`
- 已通过：Integration Tests、Production Build、Native API Smoke、Native Frontend Static Smoke、Shell Validation、BaoTa Native Contract、Legacy Docker Compose Syntax、Package Build / Validation。
- Artifact：`zonoe-ipa-download-2026091203-baota-native-build`
- Artifact ID：`10301544130`
- Native ZIP：`zonoe-ipa-download-2026091203-baota-native.zip`
- Native ZIP SHA256：`86916a73a8e6c57487a82b3aeb3e35de19dfb84c5ecbe0e62dc2568965b0352c`
- 通用 TAR SHA256：`dbb7cef7031cb4dcc63c4b0ea9469d3bf899fd259c057897199cd6af978ec57d`
- 下载 CI Artifact 后再次执行 `sha256sum -c` 与 `unzip -t`，均通过。

### 当前结论

- Native 部署代码与打包链路已 CI Green。
- 仍未标记 Production Verified。
- 下一步必须在真实宝塔机器验证 `/public`、systemd、本机 PostgreSQL、旧 Docker 数据迁移、HTTPS 和后台登录。
- 当前公开 Stable Release 仍落后，不应拿旧 Stable 代表 `2026091203`。

## 2026-09-12 — 2026091202 白屏加固

- Web/API Docker 构建统一使用根 `package-lock.json` + `npm ci`。
- `apps/web/index.html` 增加启动 fallback，`main.jsx` 增加 Fatal Error Boundary。
- 安装与 CI 增加真实 JS Asset 健康检查。
- 主要实现 Commit：`8b099bda1bd0cf95e2570dffa7e664767753e346`。
- GitHub Actions Run：`34703730896`，结果 `success`。
- Artifact：`zonoe-ipa-download-2026091202-baota-build`。
- ZIP SHA256：`333c9f70818f2606e000f9c4665cdf4c2ffda10a999be4507134f79e56f35963`。

## 2026-09-12 — 项目状态文档体系

- 新增 `ROADMAP.md`、`CHANGELOG_DEV.md`、`KNOWN_ISSUES.md`。
- 更新 `HANDOFF.md`、`PROJECT_STATE.json`。

## 2026-09-12 — BaoTa Docker 一键部署修复

- `e9bb144a045bc51efbe74fa19f85f412878f09b0`：`deploy: align BaoTa metadata with external PostgreSQL installer`。
- Run `34689591609` success。
- `d248f8d215b4f7123ec0e77806a185a10ab2f906`：修复 Artifact 文件名。
- `cde23581e7e7152383b084a251bb205a9a65192b`：加入 Docker 宝塔一键部署和更新链路。
- `6b7ff7e6aa2c626428c1a835e07eed2aedfe05e3`：修复 Release 包校验。
