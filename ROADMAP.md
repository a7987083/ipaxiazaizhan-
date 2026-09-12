# ROADMAP

## 当前阶段

- 阶段：Phase 1.2 — 宝塔原生部署与 Docker 退出
- 版本：`2026091203`
- Branch：`feature/baota-native-deploy-v1`
- Implementation Commit：`69509692bfe3f47acbaa438ca74ae0a533f1b078`
- CI：GitHub Actions Run `34705642671`，结果 `success`
- Artifact：`zonoe-ipa-download-2026091203-baota-native-build`
- BaoTa Native ZIP：`zonoe-ipa-download-2026091203-baota-native.zip`
- ZIP SHA256：`86916a73a8e6c57487a82b3aeb3e35de19dfb84c5ecbe0e62dc2568965b0352c`
- 当前状态：原生部署代码、API Smoke、前端静态 Smoke、Shell/包合同均已通过 CI；等待真实宝塔服务器迁移/安装验证。

## 阶段目标

将宝塔生产部署从“宝塔 Nginx -> Docker Nginx -> Web/API 容器”简化为：

```text
BaoTa Nginx
├─ 静态前端 /assets /files -> public/
└─ /api /download          -> 127.0.0.1:3000

systemd: zonoe-api
└─ Node.js 22 + Express
   └─ Local PostgreSQL
```

目标是降低宝塔单机环境的部署层级、白屏排错成本和容器依赖，同时保持现有业务代码、数据库结构、更新/备份和 302 下载机制不变。

## 本阶段范围

### In Scope

1. 宝塔原生一键部署，不依赖 Docker。
2. React Production Build 直接输出到站点 `public/`。
3. Node API 使用 systemd 管理并仅监听 `127.0.0.1:3000`。
4. PostgreSQL 使用本机服务。
5. Redis 改为可选，默认不安装。
6. 旧 Docker 宝塔安装自动导出 PostgreSQL、停止旧栈并迁移本机数据库。
7. 原生备份、在线更新、回滚路径。
8. HTTPS 配置辅助脚本。
9. CI 原生 API + 静态前端 Smoke。
10. Docker 文件保留为兼容方案，但不再进入 BaoTa Native ZIP。

### Out of Scope

1. 删除全部 Docker 兼容文件。
2. 多机/集群编排。
3. 新业务功能或 UI 大改。
4. 自动热门 IPA 镜像策略。
5. 在真实服务器验证前发布 Stable Release。

## 计划与状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 新原生部署分支 | Done | `feature/baota-native-deploy-v1` |
| VERSION 2026091203 | Done | 已递增 |
| 宝塔运行目录 `/public` | Done | `auto_install.json` |
| Nginx 静态直出 | Done | `/`, `/assets`, `/files` |
| API systemd 服务 | Done | `zonoe-api.service` |
| API 仅本机监听 | Done | `HOST=127.0.0.1`, `PORT=3000` |
| 本机 PostgreSQL | Done | 自动检测/安装/建库 |
| Redis 非强依赖 | Done | 原生默认不安装 |
| 旧 Docker DB 迁移 | Implemented | 等待真实环境验证 |
| 原生 backup/update | Done | 不依赖 Docker |
| HTTPS 辅助脚本 | Done | `scripts/enable-https.sh` |
| Native API Smoke | Done | Run `34705642671` success |
| Native frontend static Smoke | Done | Run `34705642671` success |
| Native ZIP package validation | Done | CI + 本地 SHA256/ZIP 校验 |
| 真实宝塔全新安装 | Next | 目标服务器验证 |
| 旧 Docker -> Native 迁移 | Next | 目标服务器验证 |
| HTTPS / Admin 登录 | Pending | 安装后验证 |
| Stable Release | Pending | 生产验证通过后发布 |
| online update E2E | Pending | Stable Release 后验证 |

## 阶段完成标准

- 宝塔导入 `2026091203` Native ZIP 后，不安装/启动 Docker。
- 网站运行目录为 `/public`。
- 首页和 `/assets/*.js` 正常。
- `systemctl status zonoe-api` 为 active。
- `curl http://127.0.0.1:3000/healthz` 正常。
- `/api/v1/home`、`/admin` 正常。
- 旧 Docker 数据可自动导出并迁移到本机 PostgreSQL。
- `data/uploads` 原文件保留。
- HTTPS 后 Cookie / 登录正常。
- `scripts/backup.sh`、`update.sh` 在真实机器验证。
- 新 Stable Release 指向真实环境验证过的代码。

## Next Task

**P0：在真实宝塔服务器部署 `zonoe-ipa-download-2026091203-baota-native.zip`。**

优先验证：

1. 宝塔运行目录确认为 `/public`。
2. `systemctl status zonoe-api`。
3. `curl http://127.0.0.1:3000/healthz`。
4. 域名首页与实际 `/assets/*.js`。
5. `/api/v1/home`。
6. `/admin` 登录。
7. 如果服务器仍是旧 Docker 版，确认 `backups/native-migration-*` 数据库导出存在、旧 Docker 已停止、本机 PostgreSQL 数据完整。
8. 宝塔启用证书后执行 `scripts/enable-https.sh` 并复测登录。
