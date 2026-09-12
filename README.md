# ZONOE IPA Download

宝塔单机部署默认采用 Native 架构：

```text
BaoTa Nginx
├─ /, /assets/*, /files/* -> public/
├─ /api/*                 -> 127.0.0.1:3000
└─ /download/*            -> 127.0.0.1:3000

zonoe-api (systemd)
└─ Node.js 22 + Local PostgreSQL
```

## 安装

在站点根目录以 root 执行：

```bash
bash install.sh your.domain
```

宝塔网站运行目录必须指向：

```text
<site>/public
```

安装日志：

```text
data/install.log
```

如果宝塔移除了顶层安装入口，部署包还保留：

```bash
bash scripts/native-install.sh your.domain
```

## GitHub 在线更新

检查是否有新 Stable：

```bash
bash update.sh --check
```

更新到 GitHub Latest Stable：

```bash
bash update.sh
```

更新到指定 Release：

```bash
bash update.sh --tag download-v2026091207
```

开发/预览环境可直接更新到指定 branch/ref：

```bash
bash update.sh --branch feature/baota-native-deploy-v1
```

Release 更新会先校验 SHA256，再执行备份和部署。日志：

```text
data/update.log
data/update-history.log
backups/
```

## HTTPS

宝塔证书启用后：

```bash
bash scripts/enable-https.sh your.domain
```

## 服务检查

```bash
systemctl status zonoe-api --no-pager
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/v1/home
```

## 当前开发状态

- Candidate：`2026091207`
- 1206 已完成真实宝塔运行验证。
- 1207 已通过 CI 与部署包校验，新增 PostgreSQL HBA 自动兼容和 GitHub 在线更新。
- 1207 在发布 Stable 前仍需真实 clean install 与 online update E2E。
