# KNOWN_ISSUES

## P0 — 1208 后台在线更新尚未真实 E2E

- 状态：Open / CI Green
- 版本：`2026091208`
- CI 已验证：代码构建、API smoke、前端 smoke、Shell、BaoTa contract、GitHub updater contract、部署包完整性。
- 精确 Run/Artifact/SHA256 以当前分支 HEAD 的 GitHub Actions Artifact 为准，不在包内文档自引用。
- 尚未验证：真实宝塔上从后台点击“在线更新”后，systemd path/worker、备份、GitHub 下载、部署、API 重启、最终 success 状态完整走通。
- 关闭条件：真实站点从一个较低 Stable 通过后台按钮成功升级到较高 Stable。

## P0 — 1208 需要一次性 bootstrap 到真实站点

- 状态：Open
- 当前真实运行验证基线仍为 1206 assisted runtime。
- 后台按钮和 `zonoe-updater.path/service` 只有安装 1208 后才存在。
- 1208 的 root-only npm `postinstall` 会在真实 Native 安装/更新时创建并启用 updater path；CI 环境不会执行系统级安装。
- 关闭条件：生产站 1208 安装完成，`systemctl status zonoe-updater.path` active，后台出现“在线更新”。

## P0 — Stable Release 仍故意落后

- 状态：Open / Intentional
- 1208 当前只在 feature branch CI Artifact 中，不应把旧 `releases/latest` 当成 1208。
- 后台默认只查询 Stable，因此生产站如果先 bootstrap 到 1208，而公开 Stable 仍较低，会显示“当前为预览/开发版”，不会降级。
- 关闭条件：真实按钮 E2E 准备完成后发布新的 Stable，并验证下一版后台更新。

## P0 — 旧 Docker -> Native PostgreSQL 仍需真实数据迁移验证

- 状态：Open / Implemented
- 自动迁移已有数据库导出、停止旧 Docker、不删除 volume、本机 DB 导入逻辑。
- 仍需用真实旧站数据核对管理员、App、版本、下载源和统计。
- 安全原则：迁移确认前不要删除旧 Docker volume。

## P1 — 全新空站安装矩阵仍未完成

- 状态：Open
- 1207/1208 已自动处理本次真实机暴露的 HBA、`.user.ini`、`pgcrypto` 等问题，但尚未在第二台干净宝塔机器从零完成一次无人干预安装。
- 关闭条件：空站导入 Native ZIP 后无需手改 PostgreSQL/文件属性即可成功上线。

## P1 — 后台 updater worker 是 root，必须保持受控接口

- 状态：Security Invariant
- `zonoe-api` 仍是非 root；root 仅存在于 `zonoe-updater.service` oneshot。
- API 只能写固定 request JSON，不能接受任意 shell 命令、脚本路径、URL 或 Git ref。
- Web 更新为 forward-only，不允许强制降级。
- 任何后续功能都不得把 updater 变成通用远程执行接口。

## P2 — Docker 兼容文件仍保留

- 状态：Accepted
- 源码继续保留 Docker 兼容/迁移路径，但 BaoTa Native ZIP 排除 Docker 运行文件。

## P2 — `insatll.sh` 拼写入口保留

- 状态：Accepted / Compatibility
- 仅为历史宝塔兼容；正式入口仍是 `install.sh`。
