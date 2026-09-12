# CHANGELOG_DEV

> 仅记录开发过程中实际发生的变更。面向开发/接手，不替代正式 Release Changelog。

## 2026-09-12

### 项目状态文档体系

- 新增 `ROADMAP.md`：记录当前阶段目标、范围、计划、状态与 Next Task。
- 新增 `CHANGELOG_DEV.md`：记录实际开发变更。
- 更新 `HANDOFF.md`：同步当前分支、CI、Artifact、部署上下文与接手注意事项。
- 更新 `PROJECT_STATE.json`：同步机器可读的版本、Branch、实现 Commit、CI、阶段状态。
- 新增 `KNOWN_ISSUES.md`：集中记录未解决问题与风险。
- 本次仅调整项目治理/状态文档，不修改前端、API、数据库或部署运行逻辑。

### BaoTa 部署修复 — Commit `e9bb144a045bc51efbe74fa19f85f412878f09b0`

- 调整 `auto_install.json` 的 PHP 版本声明。
- 清空宝塔元数据中的固定管理员用户名/密码字段，避免与实际安装脚本随机生成凭据的逻辑冲突。
- Commit message：`deploy: align BaoTa metadata with external PostgreSQL installer`。
- GitHub Actions Run：`34689591609`，结果：`success`。
- CI Artifact：`zonoe-ipa-download-2026091201-baota-build`。

### BaoTa Artifact 命名修复 — Commit `d248f8d215b4f7123ec0e77806a185a10ab2f906`

- 调整宝塔部署 Artifact 名称，使文件系统使用更稳定。
- Commit message：`ci: use filesystem-safe BaoTa artifact name`。

### BaoTa 一键部署与稳定更新链路 — Commit `cde23581e7e7152383b084a251bb205a9a65192b`

- 新增宝塔一键部署包结构。
- 新增 `auto_install.json`。
- 新增 `install.sh`，保留 `insatll.sh` 兼容入口。
- 新增 `nginx.rewrite`，把宝塔公网流量反代到 Docker 内部 Nginx。
- Docker 内部 HTTP 设计为绑定 `127.0.0.1:18081`，避免与宝塔 80/443 冲突。
- 增强在线更新、部署包构建与回滚相关逻辑。
- Commit message：`deploy: add BaoTa one-click package and stable updater flow`。

### Release 校验修复 — Commit `6b7ff7e6aa2c626428c1a835e07eed2aedfe05e3`

- 修复 bootstrap 移除后的发布包校验逻辑。
- Commit message：`ci: fix release package validation after bootstrap removal`。

## 当前开发结论

- 当前功能分支的 CI 已绿。
- 当前公开 Stable Release `download-v2026091201` 仍指向较旧实现基线 `6b7ff7e...`，未包含后续 3 个宝塔部署修复提交。
- 已收到一次“部署后页面空白”真实环境反馈，生产验证尚未闭环。
