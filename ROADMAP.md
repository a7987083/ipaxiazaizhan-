# ROADMAP

## 当前阶段

- 阶段：Phase 1.4 — 宝塔 Native 后台在线更新
- 版本：`2026091208`
- Branch：`feature/baota-native-deploy-v1`
- 最终实现 Commit：`d5c2bfe4f1d9ccf92b7f24a97e52cc312da3c9c9`
- CI：当前分支实现与部署包合同均为 Green；精确 Run/Artifact/SHA256 以当前 HEAD 对应的 GitHub Actions Artifact 为准，不在包内文档自引用哈希。
- 当前状态：后台在线更新 UI、API、root updater worker、备份/回滚链路均已完成；等待真实宝塔后台按钮 E2E。

## 1208 目标

将 1207 的命令行 GitHub 更新能力真正放进后台管理：管理员登录后进入“在线更新”，即可检查当前/最新版本、查看 Release 说明并点击更新。

安全边界保持不变：`zonoe-api` 仍以低权限 `zonoe` 用户运行，不允许 Web 进程直接以 root 执行任意命令。后台只写入固定格式更新请求；root `zonoe-updater.path/service` 只调用受控 `scripts/admin-update-worker.sh`，最终复用 `update.sh` 的 GitHub 下载、SHA256 校验、备份、安装和回滚。

## 已完成

| 项目 | 状态 |
| --- | --- |
| 后台“在线更新”入口 | Done |
| 当前版本 / 最新 Stable 显示 | Done |
| GitHub Release 说明显示 | Done |
| 管理员登录 + CSRF 保护 | Done |
| API 非 root | Done |
| root systemd updater worker | Done |
| 更新状态轮询 | Done |
| 更新日志 | Done |
| 更新前程序/前端/数据库备份 | Done |
| 失败回滚 | Done |
| Web 更新只允许向高版本前进 | Done |
| 本地版本高于 Stable 时禁止降级 | Done |
| Production Build / API / frontend smoke | Done |
| GitHub updater contract | Done |
| Native ZIP package validation | Done |

## 下一步

1. 在当前真实站点一次性 bootstrap 到 `2026091208`。
2. 确认 `zonoe-updater.path` 为 active，后台出现“在线更新”。
3. 发布一个高于当前版本的 Stable 候选版本。
4. 从后台点击一次更新，验证：检查更新 -> 提交任务 -> 自动备份 -> 下载/校验 -> 部署 -> API 重启 -> 状态变 success。
5. 再做全新空站安装和旧 Docker -> Native 真实数据迁移验证。
6. 以上完成后再将后台在线更新标记 Production Verified，并正式使用 Stable 自动更新流程。

## 当前不做

- 不让 Node API 获得 root 权限。
- 不提供后台任意 shell / 任意 Git Ref 执行入口。
- 不从后台强制降级到旧 Stable。
- 未完成真实按钮 E2E 前，不把 1208 擅自发布为 Stable。
