# BaoTa Native Deploy — 2026091208

## 1. 目标结构

```text
BaoTa Nginx
├─ /                -> <site>/public
├─ /api/*           -> 127.0.0.1:3000
├─ /download/*      -> 127.0.0.1:3000
└─ /healthz         -> 127.0.0.1:3000

zonoe-api.service
└─ Node.js 22
   ├─ data/control (small local control plane)
   └─ existing MySQL software-source DBs
```

PostgreSQL 不再是 ZONOE 1208 的运行时依赖。升级脚本不会自动停止或卸载系统 PostgreSQL，因为同机其他站点可能使用它。

## 2. 宝塔站点

- 网站根目录：`/www/wwwroot/ios_zonoeios_xyz`
- 运行目录：`/public`
- 伪静态：使用仓库 `nginx.rewrite`
- Node API：systemd `zonoe-api`，监听 `127.0.0.1:3000`

## 3. 安装

```bash
cd /www/wwwroot/ios_zonoeios_xyz
chmod +x install.sh update.sh scripts/*.sh
bash install.sh ios.zonoeios.xyz
```

安装器只要求 MySQL **客户端** 可用。宝塔 MySQL 常见路径 `/www/server/mysql/bin/mysql` 会自动检测；不会再安装第二套 PostgreSQL 数据库服务。

## 4. 添加软件源

登录 `/admin` →「软件源」→ 新增：

- 名称 / Slug
- Host / Port
- Database
- Username / Password
- Table（默认 `fa_category`）
- 优先级 / 启用状态
- 可选：回写下载次数

建议给 ZONOE 使用只读 MySQL 账号；只有确实希望把下载次数回写到原 `cs` 字段时才启用“回写下载次数”。

## 5. 数据与文件

ZONOE 不迁移应用表，也不复制 IPA。每次列表、搜索、详情都从已启用的软件源查询，下载时 302 到 `bt1a`。因此新增第 4、第 5 个源只需后台增加连接。

## 6. 备份

```bash
bash scripts/backup.sh
```

备份的是 `.env`、VERSION 和 `data/control`。外部软件源数据库和 IPA 不属于 ZONOE 更新的写入范围，不会被重复打包。

## 7. 在线更新

后台「在线更新」或 CLI：

```bash
bash update.sh --check
bash update.sh
```

Web 更新 forward-only；不会从开发版强制降级到较低 Stable。
