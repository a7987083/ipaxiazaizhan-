# ROADMAP

## 当前阶段

- 阶段：Phase 1.3 — 宝塔原生安装器加固 + GitHub 在线更新
- 版本：`2026091207`
- Branch：`feature/baota-native-deploy-v1`
- Implementation Commit：`7f20a61bb51e96c5f14ecad26dfa4677d9154478`
- CI：GitHub Actions Run `34716750221`，结果 `success`
- Artifact：`zonoe-ipa-download-2026091207-baota-native-build`
- Native ZIP：`zonoe-ipa-download-2026091207-baota-native.zip`
- ZIP SHA256：`29f04695938a91160e4168e30d2461d0fb72e7d5cd0f1ee94c674bc1be10c8dd`

## 1207 目标

1206 已在真实宝塔服务器跑通首页、API、PostgreSQL、systemd、HTTPS 与后台登录。1207 不做业务大改，重点把真实部署中暴露出的人工修复全部收进安装器，并补上后续长期使用需要的 GitHub 在线更新。

### 已完成

| 项目 | 状态 |
| --- | --- |
| PostgreSQL `ident` / `pg_hba.conf` 自动兼容 | Done |
| 修改 HBA 前自动备份 | Done |
| HBA 规则仅限 ZONOE DB/User + localhost | Done |
| 不再删除整个 `public/` | Done |
| 保留宝塔 `.user.ini` | Done |
| 保留 `.well-known/` | Done |
| 安装日志 `data/install.log` | Done |
| 备用安装入口 `scripts/native-install.sh` | Done |
| `/healthz` 自动读取 `VERSION` | Done |
| GitHub Latest Stable 在线更新 | Done |
| 指定 Release Tag 更新 | Done |
| 指定 Branch/Ref 预览更新 | Done |
| Release SHA256 校验 | Done |
| 更新前程序/数据库/静态文件备份 | Done |
| 更新失败程序回滚 | Done |
| 更新互斥锁与日志/历史 | Done |
| CI updater contract | Done |
| Native ZIP 打包校验 | Done |

## 在线更新入口

```bash
cd /www/wwwroot/your-site
bash update.sh
```

常用：

```bash
bash update.sh --check
bash update.sh --tag download-v2026091207
bash update.sh --branch feature/baota-native-deploy-v1
```

正式生产默认只走 GitHub Latest Stable；`--branch` 用于预览/开发验证。

## 当前还不能关闭的验证项

1. 在全新宝塔服务器使用 1207 做一次零人工安装，确认不再手工改 `pg_hba.conf`。
2. 在真实 1206 站点执行一次 1206 -> 1207 在线更新 E2E，并验证备份、日志、健康检查与失败回滚路径。
3. 旧 Docker -> Native 使用真实数据完成迁移核对。
4. 上述通过后再发布新的 Stable Release。

## 稳定版原则

`2026091207` 当前是 **CI Green 候选版本**，不是已发布 Stable。当前生产运行验证基线仍是 `2026091206`。1207 通过真实 clean install + online update E2E 后再进入 Stable。
