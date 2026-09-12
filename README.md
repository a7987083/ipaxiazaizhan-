# ZONOE IPA 下载站

生产可用的 Mobile First IPA 下载站。前台适配 iPhone / iPad / PC，后台可直接在手机浏览器完成 App、版本、分类、下载源和站点配置管理。

## 核心特性

- React 响应式前台，采用已确认的蓝白 App Store 风格。
- PostgreSQL 保存 App、多版本、分类、标签、截图、下载源和下载统计。
- Download Service 与存储解耦：Local / HTTP / OpenList / Cloud / CDN / S3 / OSS / R2 / Other。
- `GET /download/{appId}` 记录统计后 302；IPA 不经 Node.js 进程中转。
- 日本 VPS 可保存热门 IPA，本地源优先；全量 IPA 可继续使用 OpenList + 天翼云盘。
- 管理后台 Mobile First，可无电脑维护。
- Docker Compose + Nginx + PostgreSQL + Redis。
- 两种发布方式：GitHub Release 在线安装/升级、本地部署包安装。
- 更新前程序/数据库备份，失败自动回滚。

## 快速部署

### 网络在线安装

```bash
curl -fsSL https://raw.githubusercontent.com/a7987083/ipaxiazaizhan-/main/install-online.sh | sudo bash
```

首次安装会生成 `/opt/zonoe-ipa-download/.env`。修改 Secret、数据库密码和管理员密码后再次执行在线安装命令。

### 本地部署包

```bash
tar -xzf zonoe-ipa-download.tar.gz -C /tmp/zonoe-installer
cd /tmp/zonoe-installer
sudo bash install-local.sh /path/zonoe-ipa-download.tar.gz /path/zonoe-ipa-download.tar.gz.sha256
```

开发环境也可直接：

```bash
cp .env.example .env
# 修改 .env
docker compose up -d --build
docker compose exec -T api npm run seed
```

详细文档见 `DEPLOY.md`、`ARCHITECTURE.md`、`API.md`、`DATABASE.md`。
