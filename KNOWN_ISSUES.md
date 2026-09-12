# KNOWN_ISSUES

## P0 — 部署后页面空白

- 状态：Open
- 影响：用户完成部署后无法正常看到前台页面。
- 已知事实：当前功能分支源码与 CI 构建通过，但真实宝塔环境曾出现空白页。
- 高概率检查方向：
  1. 宝塔公网 Nginx 是否实际加载 `nginx.rewrite`。
  2. `127.0.0.1:18081` 内部 Nginx 是否可访问。
  3. 首页 `/assets/*.js`、`/assets/*.css` 是否 200。
  4. `/api/v1/home` 是否返回正常 JSON。
  5. 浏览器 Console 是否存在 JS 运行时错误或 MIME/404 问题。
- 关闭条件：全新宝塔环境部署后首页、静态资源、API、后台均通过 Smoke Test。

## P0 — Stable Release 落后于当前宝塔修复分支

- 状态：Open
- 当前公开 Release：`download-v2026091201`。
- Release 目标 Commit：`6b7ff7e6aa2c626428c1a835e07eed2aedfe05e3`。
- 当前实现基线 Commit：`e9bb144a045bc51efbe74fa19f85f412878f09b0`。
- 风险：使用 `releases/latest` 或旧在线安装链路时会拿到未包含宝塔一键部署修复的旧包。
- 关闭条件：提升版本号并发布包含当前修复的新 Stable Release，完成首次安装与在线升级 E2E。

## P1 — VERSION 未随宝塔修复递增

- 状态：Open
- 当前 `VERSION` 仍为 `2026091201`，但同一版本字符串下代码已继续发生部署修复。
- 风险：Artifact、Release、部署机器上的版本判断可能出现“版本号相同但代码不同”的歧义。
- 建议：下一次生产发布前递增 `VERSION`，不要覆盖同版本语义。

## P1 — README 的在线安装入口与默认分支现状不一致

- 状态：Open
- 当前完整代码主要位于功能分支，`main` 尚未包含同等完整部署内容。
- 风险：文档若继续引用 `main/install-online.sh`，用户可能拿不到预期安装脚本或部署错误版本。
- 建议：发布流程确定后统一 README、DEPLOY.md、Stable Release 与默认分支策略。

## P1 — 生产 Smoke Test 尚未自动化覆盖真实反代边界

- 状态：Open
- CI 当前可验证构建、测试、包结构和部分部署契约，但不能证明宝塔站点配置已在真实服务器正确加载。
- 建议：增加一套可重复的 VPS/容器化反代 E2E，至少验证：
  - `/`
  - `/assets/*`
  - `/healthz`
  - `/api/v1/home`
  - `/admin`

## P2 — `insatll.sh` 拼写容易造成维护误解

- 状态：Accepted / Compatibility
- 原因：为兼容宝塔历史文档/入口保留错误拼写脚本。
- 风险：新接手人员可能误以为是遗漏修复。
- 处理：保留兼容入口，但所有正式文档优先使用 `install.sh`，并明确说明兼容原因。

## 风险原则

在 P0 问题关闭前：

- 不优先增加新业务功能。
- 不把当前功能分支直接视作“生产已验证”。
- 不仅以 CI green 判断宝塔部署已完成。
- 所有新 Stable Release 都必须经过真实安装 + 页面/API Smoke + 更新 E2E。
