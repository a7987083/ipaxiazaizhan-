# CHANGELOG_DEV

> 仅记录开发过程中实际发生的变更。面向开发/接手，不替代正式 Release Changelog。

## 2026-09-13 — 2026091207 安装器加固与 GitHub 在线更新

### 宝塔 / PostgreSQL

- 将真实服务器遇到的 `Ident authentication failed for user "zonoe"` 处理正式写入安装器。
- 安装器先使用密码连接测试；失败时通过 `SHOW hba_file` 定位真实 `pg_hba.conf`。
- 修改前自动备份到 `backups/pg_hba.conf.<timestamp>.bak`。
- 只在配置顶部加入 ZONOE 专用规则：应用数据库 + 应用用户 + `127.0.0.1/32` / `::1/128`。
- 修改后执行 `pg_reload_conf()` 并再次验证密码连接，失败则终止而不是继续部署。

### 宝塔 public 目录兼容

- 不再 `rm -rf public`。
- React 构建使用 `rsync --delete` 增量替换应用静态文件。
- 永久排除并保留 `public/.user.ini`、`public/.well-known/` 和运行时 `public/files`。
- 更新/回滚路径同样不删除宝塔 `public` 根目录，解决 immutable `.user.ini` 阻塞更新的问题。

### GitHub 在线更新

新增/加强：

```bash
bash update.sh
bash update.sh --check
bash update.sh --tag <release-tag>
bash update.sh --branch <branch-or-ref>
```

- 默认查询 GitHub Latest Release。
- Stable/Tag 更新优先下载版本化 BaoTa Native ZIP。
- Release 模式强制下载 `.sha256` 并校验后才部署。
- `--branch` 可按 GitHub commit SHA 固定下载归档，供开发/预览验证。
- 更新前自动备份程序、`.env`、前端静态文件及 PostgreSQL dump。
- 更新失败自动回滚程序与前端，并尝试恢复 API 服务。
- 增加更新互斥锁 `data/update-runtime/update.lock`。
- 增加 `data/update.log` 与 `data/update-history.log`。
- ZIP/TAR 两种部署包均支持安全解包，拒绝路径穿越和归档 symlink。

### API / CI

- `/healthz` 不再硬编码 `2026091201`，改为读取仓库根 `VERSION`。
- CI 校验 healthz 返回版本与 `VERSION` 一致。
- 增加 GitHub updater contract。
- 增加宝塔 HBA、`.user.ini`/`.well-known` 保留合同。
- Native 包内 `install.sh` 与 `scripts/native-install.sh` 必须一致。

### CI / Artifact

- Implementation Commit：`7f20a61bb51e96c5f14ecad26dfa4677d9154478`
- GitHub Actions Run：`34716750221`
- 结果：`success`
- Artifact：`zonoe-ipa-download-2026091207-baota-native-build`
- Artifact ID：`10305265521`
- Artifact digest：`sha256:6fab8e0117614a278761aca1236ab372382e5f8d050315243092efc20a5ed09b`
- Native ZIP SHA256：`29f04695938a91160e4168e30d2461d0fb72e7d5cd0f1ee94c674bc1be10c8dd`
- Generic TAR SHA256：`185179c602c97f17bb06ab5b431a61399abd4b916488414cc9998fbbbdfd2396`
- 下载 Artifact 后再次执行 SHA256 与 ZIP 完整性检查：PASS。

### 当前结论

- 1207 代码与打包链路 CI Green。
- 1206 的真实服务器运行验证保持有效。
- 1207 尚需一次真实 clean install 和一次真实 GitHub online update E2E，之后再决定发布 Stable。

## 2026-09-13 — 2026091206 登录路由热修

- `/login` 与 `/admin` 移除 `useNavigate()` 依赖，改为浏览器原生导航。
- 真实服务器登录页面恢复正常。
- 1206 CI Run `34710236163` success。

## 2026-09-13 — 2026091203~1205 宝塔原生部署落地

- 默认部署从 Docker Compose 改为 BaoTa Nginx + systemd Node API + Local PostgreSQL。
- 真实服务器逐步暴露并修复 PostgreSQL 密码 SQL、`.user.ini` immutable、`ident` HBA、无用 `pgcrypto` 等兼容问题。
- 1206 最终完成真实运行链路验证。
