# Deployment

## 1. 宝塔一键部署（推荐）

正式 Release 会额外生成：

- `zonoe-ipa-download-<VERSION>-baota.zip`
- `zonoe-ipa-download-<VERSION>-baota.zip.sha256`

该 ZIP 根目录直接包含 `auto_install.json`、`nginx.rewrite`、`install.sh`（并保留宝塔历史文档拼写兼容入口 `insatll.sh`）。在宝塔面板的“一键部署 / 导入项目”中直接上传 ZIP，填写域名后执行即可。

宝塔负责站点和公网 Nginx；安装脚本负责 Docker / PostgreSQL / Redis / API / Web。Docker 内部 Nginx只绑定 `127.0.0.1:18081`，避免和宝塔占用的 80/443 冲突，`nginx.rewrite` 自动把站点流量反代到内部服务。

首次安装自动：

1. 检测 Docker Compose v2；缺失时使用 Docker 官方安装脚本安装。
2. 生成 `.env`、随机数据库密码和安全 Secret。
3. 启动 PostgreSQL / Redis / API / Web / 内部 Nginx。
4. 执行 Migration 和管理员 Seed。
5. 健康检查通过后完成部署。
6. 管理员随机密码写入 `data/install-info.txt`，该文件权限为 `600`。

### HTTPS

一键部署先使用 HTTP 保证首次访问和登录可用。宝塔给域名开启证书后，将 `.env` 中：

```text
PUBLIC_BASE_URL=https://你的域名
FRONTEND_ORIGIN=https://你的域名
COOKIE_SECURE=true
```

然后在站点目录执行：

```bash
docker compose up -d --build
```

## 2. 在线更新

宝塔一键部署和原有本地部署共用同一套 GitHub Release 更新引擎。进入站点根目录执行：

```bash
bash update.sh
```

流程：读取 Stable GitHub Release -> 比较 `VERSION` -> 下载完整发布包 -> SHA256 -> 安全解压 -> 程序/数据库备份 -> 覆盖程序（保留 `.env`、`data`、`backups`）-> Docker build/up -> Migration -> health check -> seed。失败自动恢复程序和数据库备份。

`update.sh` 只是把当前站点目录传给 `install-online.sh`，因此不会回退到 `/opt/zonoe-ipa-download`。

## 3. 通用在线安装 / 更新

非宝塔场景仍可使用：

```bash
curl -fsSL https://raw.githubusercontent.com/a7987083/ipaxiazaizhan-/work/zonoe-download-v1/install-online.sh | sudo bash
```

GitHub Release 提供：

- `zonoe-ipa-download.tar.gz`
- `zonoe-ipa-download.tar.gz.sha256`

## 4. 通用本地部署包

```bash
sudo bash install-local.sh ./zonoe-ipa-download.tar.gz ./zonoe-ipa-download.tar.gz.sha256
```

逻辑与在线安装共用 `scripts/lib-deploy.sh`。

## Backup

```bash
./scripts/backup.sh
```

输出 PostgreSQL dump、上传文件和 `.env` 到 `backups/<timestamp>`。

## Smoke

```bash
./scripts/smoke.sh https://domain.example
```
