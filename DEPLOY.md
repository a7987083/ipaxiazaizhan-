# Deployment

## 1. 默认方案：宝塔原生部署（无 Docker）

从 `2026091203` 开始，宝塔部署默认不再运行 Docker。

运行结构：

```text
BaoTa Nginx
├─ /, /assets/*, /files/* -> <site>/public
├─ /api/*                 -> 127.0.0.1:3000
└─ /download/*            -> 127.0.0.1:3000

systemd: zonoe-api
└─ Node.js 22 / Express
   └─ PostgreSQL localhost:5432
```

Redis 当前不是 API 启动的必需组件，原生部署默认不安装 Redis。

## 2. 宝塔一键部署包

CI / Release 会生成：

```text
zonoe-ipa-download-<VERSION>-baota-native.zip
zonoe-ipa-download-<VERSION>-baota-native.zip.sha256
```

宝塔导入 ZIP 后：

- 网站运行目录：`/public`
- 重写规则：`nginx.rewrite`
- API：`127.0.0.1:3000`
- 本地 IPA：`public/files -> data/uploads` 符号链接，由 Nginx 直接发送

`auto_install.json` 已声明 `run_path=/public`。

### install.sh 会做什么

`install.sh` 是幂等的原生部署入口：

1. 检查基础工具。
2. 检查 Node.js 22；版本不足时通过 NodeSource 安装。
3. 检查本机 PostgreSQL；缺失时安装并启动。
4. 创建 `zonoe` 数据库用户和数据库。
5. 生成/修正 `.env`，将数据库地址切换为 `127.0.0.1:5432`。
6. `npm ci`。
7. `npm run build`。
8. 将 `apps/web/dist` 同步为网站 `public/`。
9. 创建 `zonoe-api` systemd 服务。
10. Migration + Seed。
11. 检查 `127.0.0.1:3000/healthz`。
12. 检查 `public/index.html` 引用的实际 JS Asset 是否存在。

管理员凭据保存在 `data/install-info.txt`。

## 3. 从旧 Docker 宝塔版迁移

如果站点目录中存在旧 `docker-compose.yml`，并且 PostgreSQL 容器仍在运行，新的 `install.sh` 会：

1. 在 `backups/native-migration-<timestamp>/database.sql` 导出旧 PostgreSQL。
2. 保存旧 `.env`。
3. 执行 `docker compose down`；不会删除 Docker volume。
4. 安装/启动本机 PostgreSQL。
5. 创建本机 `zonoe` 数据库。
6. 在本机数据库为空时自动导入旧 SQL。
7. 保留 `data/uploads`。
8. 启动新的 systemd API。

迁移完成后先不要手动删除旧 Docker volume。确认新站点、后台和数据全部正常后再清理。

## 4. HTTPS

首次安装可先使用 HTTP。宝塔签发并启用证书后执行：

```bash
sudo bash scripts/enable-https.sh your.domain
```

该脚本会更新 `PUBLIC_BASE_URL`、`FRONTEND_ORIGIN`、`COOKIE_SECURE=true`，然后重启 `zonoe-api`。

## 5. 日常运维

```bash
systemctl status zonoe-api
journalctl -u zonoe-api -f
curl http://127.0.0.1:3000/healthz
./scripts/smoke.sh https://your.domain
```

## 6. 备份

```bash
./scripts/backup.sh
```

备份包含 `database.sql`、`uploads.tar.gz`、`.env`、`VERSION`，数据库使用本机 `pg_dump`，不依赖 Docker。

## 7. 在线更新

进入站点根目录：

```bash
sudo bash update.sh
```

流程：最新 Release -> SHA256 -> 备份 -> 停止当前服务 -> 覆盖程序（保留 data/backups/.env）-> `install.sh` 原生重建 -> Migration/Seed -> systemd restart -> health check。

## 8. 本地部署包更新

```bash
sudo bash install-local.sh ./zonoe-ipa-download.tar.gz ./zonoe-ipa-download.tar.gz.sha256
```

## 9. Docker 兼容方案

仓库仍保留 `docker-compose.yml`、Dockerfile、`deploy/` 和 `.env.docker.example`。需要 Docker 时可：

```bash
cp .env.docker.example .env
# 修改密码与 Secret
docker compose up -d --build
```

Docker 不再是宝塔默认安装方式，也不会包含在 `baota-native.zip` 中。
