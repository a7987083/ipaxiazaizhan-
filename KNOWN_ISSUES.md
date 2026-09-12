# KNOWN_ISSUES

## P0 — 原“部署后页面空白”需要真实环境复测关闭

- 状态：Mitigated / Verification Pending
- 原现象：用户完成宝塔部署后前台显示纯白页面。
- 本轮已完成：
  1. Web/API Docker 构建统一使用根 `package-lock.json` + `npm ci`，消除服务器与 CI 依赖漂移。
  2. `index.html` 增加启动 fallback，JS/静态资源异常不再只显示纯白。
  3. React 增加 Fatal Error Boundary。
  4. `install.sh` 增加首页与实际 JS Asset 健康检查。
  5. CI `Frontend image smoke` 已真实启动 Web Nginx 镜像并验证首页与 `/assets/*.js` 成功。
- 已验证版本：`2026091202`。
- CI Run：`34703730896` success。
- 关闭条件：在真实宝塔机器使用 `zonoe-ipa-download-2026091202-baota.zip` 干净部署后，域名首页、JS/CSS、`/api/v1/home`、`/admin` 全部正常。

## P0 — Stable Release 落后于当前 2026091202 CI Artifact

- 状态：Open
- 当前公开 Release：`download-v2026091201`。
- 旧 Release 目标 Commit：`6b7ff7e6aa2c626428c1a835e07eed2aedfe05e3`。
- 当前产品修复 Commit：`8b099bda1bd0cf95e2570dffa7e664767753e346`。
- 当前成功 CI HEAD：`a6c440cf829e74d5bf61a7207bf437ef47075f10`。
- 风险：使用 `releases/latest`/旧在线安装会继续拿到旧包。
- 关闭条件：真实宝塔复测通过后，将 2026091202 发布为新的 Stable Release，并完成在线升级 E2E。

## P1 — README / 默认分支 / 安装入口尚未完全统一

- 状态：Open
- 当前完整代码与最新部署修复仍主要位于功能分支，`main` 不是当前生产基线。
- 风险：用户按默认分支 README 可能得到与验证 Artifact 不一致的安装入口。
- 建议：生产复测后统一正式发布分支、README、DEPLOY.md、Release 与默认分支策略。

## P1 — 真实宝塔公网反代边界仍需验证

- 状态：Open
- CI 已证明 Docker Web 镜像自身首页与 JS Asset 正常，但无法证明目标服务器宝塔 Nginx 已正确加载 `nginx.rewrite`。
- 真实服务器需验证：
  - `http://127.0.0.1:18081/`
  - `/assets/*`
  - `/healthz`
  - `/api/v1/home`
  - 域名 `/admin`
  - 宝塔 vhost 中存在 `proxy_pass http://127.0.0.1:18081;`

## P2 — `insatll.sh` 拼写容易造成维护误解

- 状态：Accepted / Compatibility
- 原因：保留历史宝塔入口兼容。
- 处理：正式文档优先使用 `install.sh`。

## 风险原则

在真实宝塔 `2026091202` 复测通过前：

- 不把项目标记为 production verified。
- 不用旧 Stable Release 替代新 CI Artifact。
- 不优先增加新业务功能。
- 新 Stable Release 必须经过真实安装 + 页面/API Smoke + 更新 E2E。
