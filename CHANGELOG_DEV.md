# CHANGELOG_DEV

> 仅记录开发过程中实际发生的变更。面向开发/接手，不替代正式 Release Changelog。

## 2026-09-13 — 2026091206 真实宝塔运行验证与登录热修复

### 真实服务器验证

- 真实宝塔站点已验证 Native 架构可运行。
- `zonoe-api.service`：`active (running)`。
- API 监听：`127.0.0.1:3000`。
- 本机 `/healthz`：通过。
- 本机 `/api/v1/home`：通过。
- 公网 HTTPS 首页：HTTP 200。
- 公网 `/healthz`：通过。
- 公网 `/api/v1/home`：通过。
- 公网实际 JS Asset：HTTP 200。
- PostgreSQL migration / seed：通过。
- `/login` 在 1206 热修复后用户确认正常。

### 实机暴露的问题与修复

1. PostgreSQL 角色密码 SQL：
   - 原 `psql -c` 方式没有展开 `:'dbpass'`，报 `syntax error at or near ':'`。
   - 已改成通过 psql 标准输入执行变量替换。

2. 宝塔 `public/.user.ini`：
   - 文件带 immutable 属性，导致 `rm -rf public` 即使 root 也失败。
   - installer 已改为 `rsync` 静态产物并保留 `.user.ini` / `.well-known`。

3. `pgcrypto`：
   - 宝塔 PostgreSQL 缺少 `/usr/share/pgsql/extension/pgcrypto.control`。
   - 检查 migration 后确认业务没有使用 pgcrypto 函数。
   - 已从 `001_init.sql` 移除该无效硬依赖。

4. PostgreSQL 本地认证：
   - 生产机 `pg_hba.conf` 对本机 TCP 使用 `ident`，应用密码连接被拒绝。
   - 真实主机已通过针对 `zonoe` 用户/数据库的 127.0.0.1 / ::1 密码认证规则解决。
   - installer 尚未自动化这一兼容步骤，保留为下一项 P0。

5. 登录页运行时错误：
   - `/login` 曾触发 FatalBoundary，错误 `l is not a function`。
   - Login/Admin 是页面中使用 `useNavigate()` 的特殊路径。
   - `2026091206` 改为原生 `window.location.assign()` 导航，并加入登录/后台 route smoke，真实浏览器复测通过。

### 2026091206 CI / Artifact

- Head Commit：`3affd73f34b8c362db843bd3a2ce88f0263ad777`
- Commit message：`fix: harden login navigation and add route smoke v2026091206`
- GitHub Actions Run：`34710236163`
- Run 结果：`success`
- Artifact：`zonoe-ipa-download-2026091206-baota-native-build`
- Artifact ID：`10303390781`
- Artifact digest：`sha256:4a62e128000e4bb91f64fc71730d3f050141fa197e3e73ea3c95c35c41b0e6f0`
- Native ZIP SHA256：`8ce7508929695647327e4672d151c3ddbd3b5214c769264091d274e880e908d5`
- Generic TAR SHA256：`60e1cb6ff34299c7e012ecdb9b4afcec11d648dba70cf0122ee5f44c4a2dd861`
- 下载 Artifact 后执行 `unzip -t`：PASS。

### 当前结论

- **真实生产运行链路已经验证可用。**
- 当前站点无需重装。
- 但不能把“当前站点可用”与“最新 ZIP 已经零人工全新安装通过”混为一谈：生产机在安装过程中人工处理过 PostgreSQL HBA。
- 下一步先把 HBA 兼容写入 installer，再做一次空站全新安装；之后验证 Docker -> Native 真实数据迁移，再发布 Stable Release。
- `/healthz` 的版本字段仍硬编码为 `2026091201`，仅是显示问题，待改为读取 `VERSION`。

## 2026-09-13 — 2026091203 ~ 2026091205 宝塔原生部署收敛

- 新建分支 `feature/baota-native-deploy-v1`，默认部署从 Docker Compose 改为宝塔 Native。
- 宝塔 Nginx 直接提供 React 静态文件。
- Node API 改为 `zonoe-api` systemd 服务，仅监听 `127.0.0.1:3000`。
- PostgreSQL 改为本机服务，Redis 原生默认不安装。
- `auto_install.json` 运行目录改为 `/public`。
- `nginx.rewrite` 直接代理 `/api/*`、`/download/*`、`/healthz` 到 3000。
- `install.sh` 重写为幂等原生安装器并新增持久化安装日志。
- 新增 `scripts/native-install.sh` 恢复入口与 `scripts/enable-https.sh`。
- `scripts/backup.sh` / `scripts/lib-deploy.sh` 改为 Native 备份、更新和回滚路径。
- Native ZIP 排除 Docker Compose、Dockerfile 与旧 Docker Nginx 配置，但仓库仍保留 Docker 兼容/迁移代码。
- 1205 移除未使用的 pgcrypto migration 依赖，并保留宝塔受保护的 Web Root 文件。

## 2026-09-12 — 2026091202 白屏加固

- Web/API Docker 构建统一使用根 `package-lock.json` + `npm ci`。
- `apps/web/index.html` 增加启动 fallback，`main.jsx` 增加 Fatal Error Boundary。
- 安装与 CI 增加真实 JS Asset 健康检查。
- 主要实现 Commit：`8b099bda1bd0cf95e2570dffa7e664767753e346`。
- GitHub Actions Run：`34703730896`，结果 `success`。

## 2026-09-12 — 项目状态文档体系

- 新增 `ROADMAP.md`、`CHANGELOG_DEV.md`、`KNOWN_ISSUES.md`。
- 更新 `HANDOFF.md`、`PROJECT_STATE.json`。
