# ZONOE IPA 下载站

生产可用的 Mobile First IPA 下载站。前台适配 iPhone / iPad / PC，后台可直接在手机浏览器完成 App、版本、分类、下载源和站点配置管理。

## 核心特性

- React 响应式前台，蓝白 App Store 风格。
- Node.js + Express API。
- PostgreSQL 保存 App、多版本、分类、标签、截图、下载源和下载统计。
- Download Service 与存储解耦：Local / HTTP / OpenList / Cloud / CDN / S3 / OSS / R2 / Other。
- `GET /download/{appId}` 记录统计后 302；IPA 不经 Node.js 进程中转。
- 日本 VPS 可保存热门 IPA，本地源优先；全量 IPA 可继续使用 OpenList + 天翼云盘。
- 管理后台 Mobile First，可无电脑维护。
- 宝塔原生部署：前端静态文件由宝塔 Nginx 直接提供，API 由 systemd 管理，PostgreSQL 使用本机服务。
- GitHub Release 在线更新 / 本地部署包更新，更新前备份，失败尝试回滚。
- Docker Compose 文件保留为兼容方案，但不再是宝塔默认部署方式。

## 默认部署架构（2026091203+）

```text
Browser
  |
BaoTa Nginx
  |-- /, /assets/*, /files/*  -> public/
  |-- /api/*                  -> 127.0.0.1:3000
  `-- /download/*             -> 127.0.0.1:3000

systemd: zonoe-api
  |
Node.js 22 + Express
  |
PostgreSQL (localhost:5432)
```

## 宝塔一键部署

使用 CI / Release 生成的：

```text
zonoe-ipa-download-<VERSION>-baota-native.zip
```

导入宝塔后，运行目录必须为：

```text
/public
```

安装脚本会自动：

1. 检查并安装 Node.js 22、PostgreSQL 和必要系统工具。
2. 创建本机 PostgreSQL 用户和数据库。
3. 生成或复用 `.env`。
4. 执行 `npm ci`、API 检查和 React Production Build。
5. 将前端构建结果写入 `public/`。
6. 创建 `zonoe-api.service`，API 仅监听 `127.0.0.1:3000`。
7. 执行 Migration / Seed。
8. 检查 API 和前端静态资源。
9. 若检测到旧 Docker 安装，会先导出旧 PostgreSQL 数据，并停止旧 Docker 栈，再迁移到本机 PostgreSQL。

HTTPS 证书在宝塔启用后执行：

```bash
sudo bash scripts/enable-https.sh your.domain
```

详细部署、更新、备份与迁移说明见 `DEPLOY.md`。
