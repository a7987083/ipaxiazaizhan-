# HANDOFF

## Current Project Pointer

- Repository: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Version: `2026091208`
- Implementation: `09d47d6d1c21ca2adc4b9ea90c089d089a131d8d`
- Final hardening commit: `d5c2bfe4f1d9ccf92b7f24a97e52cc312da3c9c9`
- CI Run: `34717796655` success
- Artifact: `zonoe-ipa-download-2026091208-baota-native-build`
- Artifact ID: `10305745680`
- Native ZIP SHA256: `16b35ea0c67519382a471603044f7f62777690e127f3d41fb605ed92fbe83cf9`
- Current Phase: `Phase 1.4 — BaoTa Native Admin Online Update`

## Runtime Architecture

```text
Browser / Admin
  ↓ HTTPS
BaoTa Nginx
  ├─ /, /assets/*, /files/* -> public/
  ├─ /api/*                 -> 127.0.0.1:3000
  └─ /download/*            -> 127.0.0.1:3000

zonoe-api.service (User=zonoe, non-root)
  └─ Node/Express -> local PostgreSQL

Admin online update:
Admin UI -> POST /api/v1/admin/system/update
         -> data/update-runtime/admin-update-request.json
         -> zonoe-updater.path
         -> zonoe-updater.service (root oneshot)
         -> scripts/admin-update-worker.sh
         -> update.sh / install-online.sh / lib-deploy.sh
         -> backup + GitHub download + SHA256 + deploy + rollback
```

## Admin Online Update Behavior

后台侧栏新增“在线更新”：

- 打开页面自动查询 GitHub Stable Release。
- 显示当前版本、最新版本、更新通道、Release 说明和任务状态。
- 有更高 Stable 时按钮显示“更新到 <version>”。
- 点击后先二次确认，再提交固定更新任务。
- 更新期间每 2.5 秒轮询状态；API 重启短暂断开后会继续恢复查询。
- 成功显示 from -> to；失败提示 `data/update-runtime/admin-update.log`。
- Web 更新不允许强制降级。本地版本高于 Stable 时显示“预览/开发版”，按钮禁用。

### Security boundary

不要改成 `zonoe-api` 直接 root，也不要给 Web API 暴露任意 shell、任意路径或任意 Git ref 参数。当前设计的关键点是：API 只写一个固定 JSON 请求；root worker 只运行受控 updater。

后台 POST 继续受 `requireAdmin` + CSRF 校验保护。

## 1207 Installer/Updater Foundations Still Required

1208 依赖并复用 1207 已完成的：

- 宝塔 PostgreSQL HBA 自动兼容/备份。
- `.user.ini` / `.well-known` 保留。
- 无 `pgcrypto` 硬依赖。
- `/healthz` 读取 `VERSION`。
- GitHub Release/Tag/Branch CLI 更新。
- SHA256 校验。
- 程序、前端、数据库更新前备份。
- 失败自动尝试回滚。
- 更新锁和历史日志。

## Real Server Status

最后真实运行验证基线是 `2026091206`，站点 `https://ios.zonoeios.xyz` 已确认：首页、Assets、API、systemd、本机 PostgreSQL、HTTPS、登录页正常。

`2026091208` 当前是 CI Green，尚未在真实服务器完成后台按钮 E2E。因此不要把“CI Green”写成“1208 Production Verified”。

第一次启用后台在线更新，需要把服务器 bootstrap 到 1208。1208 安装过程中的 `npm ci` 会通过 root-only `postinstall` 安装并启用 `zonoe-updater.path`。之后未来 Stable 版本即可在后台按钮更新。

## Validation After 1208 Bootstrap

```bash
systemctl status zonoe-updater.path --no-pager
systemctl status zonoe-api --no-pager
curl -fsS http://127.0.0.1:3000/healthz
```

后台验证：登录 `/admin` -> “在线更新”，确认能读取当前版本和 GitHub Stable 状态。

下一次发布一个更高 Stable 后，从这里点击一次“更新到 ...”，验证完整 E2E。

## Critical Behavior Not To Break

1. IPA 大文件不由 Node 中转。
2. `/download/{appId}` 记录统计后跳转。
3. `data/uploads`、`.env`、`backups` 更新中保留。
4. API 只监听 `127.0.0.1:3000`。
5. Web API 不以 root 运行。
6. 后台在线更新只能触发受控 updater，不能变成通用远程 shell。
7. Web 在线更新只能向更高 Stable 前进，不能意外降级预览版。
8. 旧 Docker 数据卷在迁移确认前不要删除。

## Next Task

Bootstrap 真实站点到 1208，验证 updater path/UI。随后发布高于 1208 的 Stable 候选并完成一次后台按钮更新 E2E；通过后再正式把后台在线更新标记 Production Verified。
