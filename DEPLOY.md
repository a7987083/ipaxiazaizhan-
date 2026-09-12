# Deployment

## 1. 在线安装 / 更新

发布流程生成 GitHub Release 的两个资产：

- `zonoe-ipa-download.tar.gz`
- `zonoe-ipa-download.tar.gz.sha256`

服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/a7987083/ipaxiazaizhan-/main/install-online.sh | sudo bash
```

流程：读取 Release -> 下载 -> SHA256 -> 安全解压 -> 程序/数据库备份 -> 覆盖程序（保留 `.env`、`data`、`backups`）-> Docker build/up -> Migration -> health check -> seed。失败自动恢复程序和数据库备份。

## 2. 本地部署包

```bash
sudo bash install-local.sh ./zonoe-ipa-download.tar.gz ./zonoe-ipa-download.tar.gz.sha256
```

逻辑与在线安装共用 `scripts/lib-deploy.sh`，避免两套安装行为漂移。

## HTTPS

生产推荐宿主机使用 Certbot/Caddy，或把证书挂载至 `deploy/certs/fullchain.pem`、`privkey.pem` 并使用 `nginx.https.conf.template`。主配置默认 HTTP，便于首次安装和反向代理/CDN 场景。

## Backup

```bash
./scripts/backup.sh
```

输出 PostgreSQL dump、上传文件和 `.env` 到 `backups/<timestamp>`。建议 cron 每日执行并异地保存。

## Smoke

```bash
./scripts/smoke.sh https://domain.example
```
