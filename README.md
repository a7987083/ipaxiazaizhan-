# ZONOE IPA Download

ZONOE 是一个面向 iOS 软件源的聚合下载前台/后台。2026091208 起，应用和 IPA 不再复制到第二套数据库或存储：系统直接读取一个或多个现有 MySQL 软件源，并把下载 302 到原地址。

## 1208 架构

```text
Browser
  ↓ HTTPS
BaoTa Nginx -> public/
  ↓ /api /download /healthz
zonoe-api (Node.js 22, systemd, 127.0.0.1:3000)
  ├─ data/control/            # 管理员、站点设置、加密的软件源配置
  └─ MySQL Source Aggregator
       ├─ source A / fa_category -> 原 IPA URL
       ├─ source B / fa_category -> 原 IPA URL
       └─ source N / fa_category -> 原 IPA URL
```

- 不要求 PostgreSQL 运行时。
- 不重新上传 IPA。
- 多个数据库表结构相同即可，内容可以完全不同。
- 原 ID 可以重复；全局 ID 使用 `source_slug:legacy_id`。
- 软件源密码使用 `SOURCE_CONFIG_KEY` AES-256-GCM 加密后写入 `data/control/mysql-sources.json`。

## 宝塔安装/升级

站点运行目录必须设为 `/public`：

```bash
cd /www/wwwroot/ios_zonoeios_xyz
bash install.sh ios.zonoeios.xyz
```

安装完成后进入 `/admin` →「软件源」，逐个填写现有 MySQL 的 Host、Port、Database、Username、Password。应用表默认 `fa_category`，可直接点「测试」验证。

## 兼容的 FastAdmin 字段

| fa_category | ZONOE |
| --- | --- |
| id | 源内 App ID |
| name | 名称 |
| nickname | 版本 |
| image | 图标 |
| keywords / description | 说明 |
| weigh | 权重 |
| bt1a | 原 IPA / 安装地址 |
| bt2a | 文件大小 |
| cs | 原软件下载数 |

## GitHub 在线更新

后台左侧「在线更新」可以检查 Stable Release 并一键向更高版本升级。CLI 仍可使用：

```bash
bash update.sh --check
bash update.sh
```

更新由 root systemd worker 执行；Web API 本身不拥有 root 权限。更新前备份程序、前端、`.env` 和 `data/control`，外部 MySQL 软件源不会被升级脚本修改。

## 管理员密码

后台「密码」可以修改管理员密码。新密码写入 `data/control/admin.json` 的 bcrypt hash，修改后当前会话失效。`.env` 的 `ADMIN_PASSWORD` 仅用于首次初始化，升级不会覆盖后台新密码。
