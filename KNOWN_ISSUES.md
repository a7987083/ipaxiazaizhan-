# KNOWN_ISSUES

## P0 — 1207 仍需真实全新安装验证

- 状态：Open / CI Green
- 版本：`2026091207`
- Run：`34716750221` success。
- 1207 已把真实服务器遇到的 PostgreSQL `ident` / HBA 兼容、`.user.ini` immutable、无用 `pgcrypto` 等问题收敛到代码。
- 仍需在全新宝塔环境证明“不手工改配置也能完成安装”。
- 关闭条件：全新站点从部署包到首页/API/Admin 全链路零人工修补通过。

## P0 — GitHub 在线更新需要真实服务器 E2E

- 状态：Open / Implemented
- `bash update.sh` 已支持 Latest Stable、指定 Tag、指定 Branch/Ref。
- Stable/Tag 强制 SHA256 校验。
- 已实现备份、互斥锁、日志、更新历史与程序回滚。
- CI 已通过 updater contract，但尚未在真实生产目录完成 1206 -> 1207 更新。
- 关闭条件：真实服务器更新成功，并至少验证一次可控失败后的程序回滚。

## P0 — 旧 Docker -> Native PostgreSQL 自动迁移需要真实数据验证

- 状态：Open / Implemented
- 迁移前会 `pg_dump`，停止旧栈但不删除 volume。
- 关闭条件：真实旧站点的 App、版本、管理员、统计、uploads 全部核对通过。

## P0 — Stable Release 仍落后

- 状态：Open
- 1207 当前仅 feature branch CI Artifact，不是公开 Stable。
- 关闭条件：1207 clean install + online update E2E + Docker migration 验证通过后发布新 Stable。

## P1 — PostgreSQL HBA 自动修改需要真实矩阵验证

- 状态：Open / Narrowly Scoped
- 自动规则仅针对配置的 ZONOE 数据库、用户和 localhost。
- 修改前备份 HBA，修改后 reload + 实际密码连接复测。
- 仍需在不同宝塔/PostgreSQL 版本确认路径与规则行为。

## P1 — 回滚目前以程序/静态文件恢复为主

- 状态：Open
- 更新前会保存 PostgreSQL dump，但自动回滚不会自动 drop/recreate 数据库。
- 原因：对生产数据库做自动破坏性还原风险更高。
- 如果未来 migration 引入不可逆 schema 变更，需要升级为显式数据库 rollback 策略。

## P2 — Docker 兼容文件仍保留

- 状态：Accepted
- Native ZIP 排除 Docker runtime。
- 等真实迁移验证完成后再决定是否删除兼容代码。

## 已关闭 / 已代码修复

- `ALTER ROLE ... :'dbpass'` psql 变量调用兼容：Fixed。
- `pgcrypto.control` 缺失：Fixed（删除未使用硬依赖）。
- `public/.user.ini` immutable 阻止 `rm -rf public`：Fixed in 1207。
- 登录页 `l is not a function`：Fixed in 1206。
- `/healthz` 硬编码旧版本：Fixed in 1207。
