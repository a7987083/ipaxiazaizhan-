# ROADMAP

## 当前阶段

- 阶段：Phase 1.2 — 宝塔原生部署与 Docker 退出
- 当前开发版本：`2026091206`
- Branch：`feature/baota-native-deploy-v1`
- Head Commit：`3affd73f34b8c362db843bd3a2ce88f0263ad777`
- CI：GitHub Actions Run `34710236163`，结果 `success`
- Artifact：`zonoe-ipa-download-2026091206-baota-native-build`
- Native ZIP：`zonoe-ipa-download-2026091206-baota-native.zip`
- ZIP SHA256：`8ce7508929695647327e4672d151c3ddbd3b5214c769264091d274e880e908d5`
- 真实站点运行验证：已通过。
- 当前状态：生产运行链路已验证；全新“零人工干预”安装与旧 Docker 数据迁移仍需最后收口。

## 已验证的生产链路

真实宝塔主机已经跑通：

```text
Browser
  ↓ HTTPS
BaoTa Nginx
  ├─ /, /assets/*, /files/* -> <site>/public
  ├─ /api/*                 -> 127.0.0.1:3000
  ├─ /download/*            -> 127.0.0.1:3000
  └─ /healthz               -> 127.0.0.1:3000

systemd: zonoe-api
  ↓
Node.js 22 + Express
  ↓
Local PostgreSQL
```

真实环境已确认：首页 200、JS Asset 200、`/healthz` 正常、`/api/v1/home` 正常、`zonoe-api.service` active、数据库 migration/seed 正常、HTTPS 正常、登录页在 `2026091206` 热修复后正常。

## 本轮真实环境发现并已收敛的问题

| 问题 | 结果 |
| --- | --- |
| PostgreSQL `ALTER ROLE ... :'dbpass'` 在原脚本中报语法错 | 已修复 |
| 宝塔 `public/.user.ini` immutable，导致 `rm -rf public` 失败 | 已修复，改为 rsync 并保留宝塔文件 |
| 宝塔 PostgreSQL 缺少 `pgcrypto.control` | 已修复，移除未使用的 pgcrypto 硬依赖 |
| `/login` 显示 `l is not a function` | 已修复，2026091206 去除 Login/Admin 的 `useNavigate()` 路径并加入 route smoke |
| 宝塔 PostgreSQL 本地 TCP 使用 `ident` | 真实主机已人工加应用专用 HBA 规则；自动化仍待加入 installer |
| `/healthz` 仍显示旧硬编码版本 `2026091201` | 不影响运行，待改为读取 VERSION |

## 计划与状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 宝塔原生架构 | Done | 无 Docker 默认路径 |
| React 静态直出 | Done / Real Verified | 首页与实际 JS Asset 已验证 |
| API systemd | Done / Real Verified | `zonoe-api` active |
| API 127.0.0.1:3000 | Done / Real Verified | 本机与公网反代均通过 |
| 本机 PostgreSQL | Done / Real Verified | migration/seed 与 API 查询通过 |
| Redis 非强依赖 | Done | Native 默认不需要 |
| HTTPS | Real Verified | 域名 HTTPS 正常 |
| 后台登录页 | Real Verified | 1206 热修复后用户确认无问题 |
| Native CI | Done | Run `34710236163` success |
| Native ZIP package validation | Done | CI + 本地 SHA256/ZIP 完整性通过 |
| 宝塔 PostgreSQL HBA 自动兼容 | Next | 当前生产主机需要过人工规则 |
| 全新 Native ZIP 零人工安装 | Pending | HBA 自动兼容后重测 |
| 旧 Docker -> Native 数据迁移 | Pending | 需要真实旧数据验证 |
| Stable Release | Pending | 清洁安装 + 迁移验证后发布 |
| online update E2E | Pending | Stable 后验证 |

## 阶段完成标准

已经满足：

- 宝塔 Nginx 直接提供 `public/`。
- 首页、Assets、API、HTTPS 可用。
- `zonoe-api` 由 systemd 管理并只监听本机。
- 本机 PostgreSQL 可运行 migration/seed 和业务查询。
- 后台登录页可正常启动。

尚需满足：

- 安装器自动处理真实宝塔 PostgreSQL 的 HBA/认证差异，不再需要手工改 `pg_hba.conf`。
- 使用最新 Native ZIP 做一次全新空站安装，完整走通且不手工修补。
- 使用真实旧 Docker 数据做一次 Docker -> Native 迁移验证。
- 完成 Stable Release 与 online update E2E。

## Next Task

**P0：把真实主机上人工做过的 PostgreSQL HBA 兼容步骤正式写进 `install.sh`，然后用下一版 Native ZIP 做一次全新安装回归。**

通过后再做真实 Docker 数据迁移验证，并发布新的 Stable Release。当前运行中的站点无需因整理文档而重新部署。
