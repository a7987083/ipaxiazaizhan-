# KNOWN_ISSUES

## P0 — 宝塔 Native 部署尚未在真实服务器验证

- 状态：Open / CI Verified
- 版本：`2026091203`
- CI Run：`34705642671` success。
- CI 已验证 Native API、前端静态构建、部署包合同与 ZIP 完整性。
- 尚未验证：真实宝塔站点运行目录、Nginx rewrite、systemd、系统 PostgreSQL、HTTPS、后台登录。
- 关闭条件：真实服务器首页、Assets、API、后台登录全部通过。

## P0 — 旧 Docker -> Native PostgreSQL 自动迁移需要真实数据验证

- 状态：Open / Implemented
- `install.sh` 已实现：
  1. 检测旧 Docker PostgreSQL；
  2. `pg_dump` 到 `backups/native-migration-*`；
  3. 停止 Docker 栈但不删除 volume；
  4. 创建本机 PostgreSQL；
  5. 本机数据库为空时导入旧 SQL。
- 风险：不同发行版、宝塔自带 PostgreSQL、既有本机 PostgreSQL 配置可能存在差异。
- 安全原则：迁移确认前不要删除旧 Docker volume。
- 关闭条件：真实旧站点完成迁移，应用/版本/管理员/统计数据核对通过。

## P0 — Stable Release 仍落后

- 状态：Open
- 当前公开 Stable 仍不是 `2026091203` Native 版本。
- 当前可验证来源是 CI Artifact：`zonoe-ipa-download-2026091203-baota-native-build`
- 风险：`releases/latest` / 旧在线更新仍可能获取 Docker 时代旧版本。
- 关闭条件：Native 真实生产验证通过后发布新的 Stable Release，并完成在线更新 E2E。

## P1 — 宝塔运行目录必须为 `/public`

- 状态：Open / Configuration Requirement
- `auto_install.json` 已声明 `run_path=/public`。
- 如果旧站点继续把仓库根目录当 Web Root，可能出现静态文件错误或暴露源码的风险。
- 关闭条件：真实部署确认宝塔站点 Root 指向 `<site>/public`。

## P1 — Nginx rewrite 必须切换到 127.0.0.1:3000

- 状态：Open / Configuration Requirement
- Native 不再使用 `127.0.0.1:18081`。
- `/api/*`、`/download/*`、`/healthz` 应代理到 `127.0.0.1:3000`。
- 关闭条件：真实域名 API 和下载路由通过。

## P1 — HTTPS 需要安装后切换应用配置

- 状态：Open / Expected Step
- 首装可能使用 HTTP。
- 宝塔证书启用后应运行：`sudo bash scripts/enable-https.sh your.domain`
- 该步骤设置 `COOKIE_SECURE=true` 并重启 API。
- 关闭条件：HTTPS 下后台登录 Cookie 正常。

## P1 — 非 Debian/Ubuntu PostgreSQL 安装路径尚未做真实矩阵验证

- 状态：Open
- 脚本包含 apt / dnf / yum 路径及 `/www/server/pgsql/bin` PATH。
- CI 不等于真实系统包管理/服务初始化测试。
- 关闭条件：至少 Ubuntu/Debian 和实际生产发行版各完成一次真实安装。

## P2 — Docker 兼容文件仍保留

- 状态：Accepted
- Docker Compose、Dockerfile 和 `.env.docker.example` 暂时保留。
- Native BaoTa ZIP 会排除 Docker 运行文件。
- 真实 Native 稳定后再决定是否删除 Docker 兼容路径。

## P2 — `insatll.sh` 拼写保留

- 状态：Accepted / Compatibility
- 仅用于历史宝塔入口兼容。
- 正式文档统一使用 `install.sh`。

## 风险原则

在 `2026091203` 真实宝塔部署/迁移验证完成前：

- 不标记 production verified。
- 不删除旧 Docker 数据卷。
- 不将旧 Stable Release 当成 Native 版本。
- 不优先增加新业务功能。
- 新 Stable Release 必须经过真实安装 + 页面/API/Admin Smoke + update E2E。
