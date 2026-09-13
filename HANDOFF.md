# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091225`
- Functional code commit: `5cba24b3b32307ea892596329205f973126498fe`
- Baseline: `2026091224` / `271c5aca4c83237c28fdfe5fcf4a3c6accf95515`
- Functional-code GitHub Actions: #91 / run `34786345775` passed for all executed validation/package steps.
- Real BaoTa/OpenList multi-drive verification for 2026091225: pending.

## What 1225 adds

1. 新增后台“云盘副本”模块，直接读取当前 OpenList 的挂载存储列表。
2. 管理员从实体挂载中选择参与副本管理的网盘，并为每个盘设置副本根目录和独立“可写”权限。
3. 以启用 MySQL 软件源当前 `bt1a` 作为权威期望清单，对多个实体网盘递归对账：已有、缺失、多余。
4. 对账结果提供 App × 网盘副本矩阵；可看到例如天翼 400/400、阿里 80/400 缺 320。
5. 缺失副本可通过 OpenList `/api/fs/copy` 从已有副本的盘复制到可写目标盘；ZONOE 不下载/上传 IPA 数据。
6. 如果数据库期望文件缺失，但同目录发现唯一一个 MD5 相同的多余 IPA，则给出“名称修复”建议；人工确认后调用 `/api/fs/rename`。
7. 数据库不存在的多余 IPA 不提供永久删除；人工确认后只能移动到 `<副本根目录>/.zonoe-quarantine/<日期>/...` 隔离区。
8. Alias 存储不会被误选为实体副本盘。后台会发现 Alias，并检查其配置中是否覆盖所选副本根目录；Alias 的真正负载均衡策略仍由 OpenList 原生驱动负责。
9. OpenList Token 文案不再叫“只读 Token”：元数据功能可只给读取权限，但副本管理的存储发现/复制/改名/隔离需要对应权限。

## Safety model

- 副本管理默认关闭。
- 允许复制、允许名称修复、允许隔离三个权限独立，默认关闭。
- 每个实体盘还要单独标记“可写”。
- Alias 不能作为 copy/rename/quarantine 实体盘。
- 改名和隔离执行前重新跑对账确认目标仍然有效。
- 永久删除 API 在 1225 不存在。
- 单次同步最多提交 50 个复制任务；后台默认按钮提交 20 个。
- 单盘扫描最多 20,000 个 IPA / 1,000 个目录，避免配置错误导致无限递归。

## CI verification

Actions #89 首次失败只因为新 contract 文件误用了 Node `node:test`，三条副本算法子测试本身均通过；修正为 Vitest 后不改业务逻辑。

Actions #91 / run `34786345775` passed:
- Integration tests
- OpenList replica contract tests
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- deployment package build / validation / artifact upload

`release-e2e` 按现有 workflow 条件 skipped。因此 2026091225 是 **CI/package verified，尚未真实 BaoTa/OpenList copy/rename/quarantine/Alias verified**。

## Recommended real deployment validation

在线更新到 2026091225 后，先不要开启任何写权限。进入“云盘副本”，确认能读取天翼/阿里等实体挂载和 Alias。只勾选实体盘，填写实际存放 IPA 的根目录，运行“开始多网盘对账”，核对数据库期望总数和每盘已有/缺失/多余数量。确认无误后，只给一个非关键目标盘勾选“可写 + 允许副本复制”，先提交一个小批次。复制完成后重新对账确认。改名必须先看到 MD5 建议；多余文件先隔离，不永久删除。Alias 最终下载分流继续在 OpenList 中使用原生读取负载均衡配置。
