# CHANGELOG_DEV

> 仅记录开发过程中实际发生的变更。面向开发/接手，不替代正式 Release Changelog。

## 2026-09-12 — 2026091202 白屏加固

### 前端生产构建可复现

- `apps/web/Dockerfile` 改为读取仓库根 `package-lock.json`，使用 `npm ci --workspace=apps/web`，不再在部署服务器对 `latest` 依赖执行无锁 `npm install`。
- `apps/api/Dockerfile` 同步改为根 lockfile + `npm ci --workspace=apps/api`。
- 解决“CI 根目录构建通过，但服务器 Docker 构建可能安装不同依赖”的生产不可复现风险。

### 白屏可诊断与健康检查

- `apps/web/index.html` 增加可见启动占位；静态资源失败或前端长时间未启动时显示错误，不再只呈现纯白页。
- `apps/web/src/main.jsx` 增加顶层 Fatal Error Boundary，React 渲染异常会直接显示错误信息。
- `scripts/smoke.sh` 增加首页 HTML 和实际 `/assets/*.js` 可达性检查。
- `install.sh` 健康检查从仅验证 `/healthz` 升级为同时验证首页和构建后的 JS Asset。
- `.github/workflows/ci-release.yml` 增加真实 Web Docker 镜像 Smoke：启动 Nginx Web 镜像，访问首页并请求实际 JS Asset。

### Version / CI

- `VERSION`：`2026091201` -> `2026091202`。
- 主要实现 Commit：`8b099bda1bd0cf95e2570dffa7e664767753e346` — `fix: harden frontend boot and reproducible Docker builds`。
- CI Harness 后续修复 Commit：`7f699cb50a1291afa7cf920818405abdc1d39049`、`a6c440cf829e74d5bf61a7207bf437ef47075f10`。
- 最终 GitHub Actions Run：`34703730896`，结果：`success`。
- `Frontend image smoke`：`success`。
- `package-and-release`：`success`。
- Artifact：`zonoe-ipa-download-2026091202-baota-build`。
- 宝塔 ZIP SHA256：`333c9f70818f2606e000f9c4665cdf4c2ffda10a999be4507134f79e56f35963`。

### 当前结论

- 代码/镜像层面已经验证：Production Build、Docker Build、Web Nginx 首页、构建 JS Asset 均可访问。
- 原真实环境“部署后纯白页”仍需使用 `2026091202` 在宝塔服务器重新部署确认后才能关闭。
- 当前公开 Stable Release 仍是旧版本，`2026091202` 当前来源是成功 CI Artifact。

## 2026-09-12 — 项目状态文档体系

- 新增 `ROADMAP.md`、`CHANGELOG_DEV.md`、`KNOWN_ISSUES.md`。
- 更新 `HANDOFF.md`、`PROJECT_STATE.json`。

## 2026-09-12 — BaoTa 部署修复

- `e9bb144a045bc51efbe74fa19f85f412878f09b0`：`deploy: align BaoTa metadata with external PostgreSQL installer`。
- Run `34689591609` success，Artifact：`zonoe-ipa-download-2026091201-baota-build`。
- `d248f8d215b4f7123ec0e77806a185a10ab2f906`：修复宝塔 Artifact 文件名。
- `cde23581e7e7152383b084a251bb205a9a65192b`：加入宝塔一键部署、`auto_install.json`、`install.sh`、`nginx.rewrite` 和稳定更新链路。
- `6b7ff7e6aa2c626428c1a835e07eed2aedfe05e3`：修复 Release 包校验。
