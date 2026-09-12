# Data Model — 2026091208

## 原则

应用数据只有一份：继续留在原 MySQL 软件源。ZONOE 不创建第二套 apps/app_versions 数据，也不复制 IPA。

## 软件源

后台可配置多个 MySQL 数据库。默认读取 `fa_category`，每个源结构相同、内容不同即可。全局键：

```text
<source_slug>:<fa_category.id>
```

因此两个数据库同时存在 `id=1` 不会冲突。

## 本地控制数据

`data/control/` 仅保存：

- `admin.json`：bcrypt 管理员密码 hash、session version
- `settings.json`：公开站点设置
- `mysql-sources.json`：软件源元数据与 AES-256-GCM 加密连接配置
- `downloads/*.jsonl`：本地下载审计（不包含明文 IP）

`SOURCE_CONFIG_KEY` 必须稳定保留，否则无法解密已有的软件源密码。

## 外部源写入策略

默认只读。启用某个源的 `writeStats` 后，下载时仅执行 `cs=cs+1` 与 `cstime=UNIX_TIMESTAMP()`；应用名称、版本、URL、IPA 文件都不会被 ZONOE 修改。
