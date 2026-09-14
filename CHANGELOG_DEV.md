# Development Changelog

## 2026-09-15 — 2026091232 Replica copy lifecycle + verification + audit

- OpenList `/api/fs/copy` 返回成功不再直接等同于“副本复制完成”。新增 `CONTROL_DIR/openlist-replica-operations.json`，持久保存复制批次、每个 IPA 的复制状态和操作审计；文件采用临时文件 + rename 原子写入并保持 `0600` 权限。
- 复制任务状态升级为 `submitted / waiting / verifying / success / failed / timeout`。API 服务启动时自动启动核验器，每 15 秒串行检查待完成任务；Node 服务重启后可从持久状态继续核验。
- 复制完成验证优先比较 MD5；目标驱动不返回 Hash 时明确降级为“大小一致”，缺少可比较的期望 Hash/大小时仅标记“文件存在”，不再把弱验证伪装成 MD5 已验证。
- 目标文件 10 分钟仍未出现会进入 `timeout`；MD5/大小异常进入失败状态并写入审计，不会被当成复制成功。
- 新增独立的异常一致性窗口：`mismatchSince` 在第一次观察到 MD5/大小异常时持久化，30 秒确认期从“第一次看到异常”开始计算，而不是从 `/api/fs/copy` 提交时间开始。这样即使目标文件较晚才出现，也不会因为复制请求早已超过 30 秒而被立即判失败；后续验证恢复正常会清空该标记。实现 commit `9aacafbcc98c5dac3f326516021c8a3cc3165a63`。
- Sync Plan 的 SHA-256 `planHash` 现在同时绑定来源/目标目录、期望 MD5 和期望大小，避免期望内容或副本根目录变化后继续执行旧计划。
- 执行补齐计划后返回 `trackingBatchId`；后台新增“副本任务”页面，可查看复制批次、每个 IPA 的来源→目标、状态、验证方式、实际 MD5/大小、检查次数，以及最近操作审计，并提供“立即核验复制任务”。
- 批次进入终态后仅让真正接收过复制任务的目标盘快照失效并定向刷新，不做所有网盘全量重扫。
- 修复 failed-only 边界：如果一个批次的所有 `/api/fs/copy` 提交都失败，批次不会保留目标刷新列表，也不会之后无意义强刷目标盘；批次审计状态直接记为失败。对应 hardening commit `839cc5ebfb1d2b9cc0431481b93240d3ac4a48cd`，contract commit `84501078d2238080bc7ca32e97599f21e5992c66`。
- 名称修复和隔离操作也进入统一审计；审计不保存 OpenList Token、`raw_url` 或 IPA 直链。
- 1229 的完整性/来源优先级/过期计划保护、1230 的对账持久化和 30 分钟单盘快照、1231 的 Range telemetry-only/可配置调度/桌面 sticky 菜单全部保持。
- 1232 contract coverage 现已覆盖：MD5 成功、第一次异常观察起算的 30 秒确认期、异常恢复后清除标记、缺失超时、无 Hash 大小降级、生命周期计数、重启恢复接线、任务/审计 UI、计划 Hash 内容绑定、failed-only 批次不刷新目标盘。
- 早期 1232 push 曾被 GitHub 路由到 synthetic `BuildFailed` 并在创建 job 前 `startup_failure`；该现象在最新 functional run 中已不再复现。
- Actions run `34878831197` / run #162 在真实 `.github/workflows/ci-release.yml`（workflow `356290327`）上成功：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、Legacy Docker compose syntax、部署包构建/校验和 Artifact 上传全部通过；GitHub Release publish 与 `release-e2e` 按 workflow 条件 skipped。
- 1232 部署 Artifact：`zonoe-ipa-download-2026091232-baota-native-build`，artifact id `10362077299`，大小 `628946` bytes，sha256 `4003f223c5ffc5d4971bec63374ee831efab2587c95fc8b386b53e76914bd69c`，有效期至 `2026-10-14T18:07:38Z`。
- 真实 BaoTa/OpenList 小批量复制生命周期、第一次异常观察起算、重启续跑、目标盘定向刷新与审计 E2E 仍待验证。

## 2026-09-14 — 2026091231 Range quota removal + sticky admin navigation

- 根据真实运行观察，移除 Range Parser 固定的“每小时 10 个 / 每日 150 个解析尝试”硬预算。元数据同步不再读取小时/每日剩余额度来缩小本轮 `parseLimit`，管理员保存的每轮数量现在直接作为本轮上限。
- `openlist-range-usage.json` 继续保留解析尝试、成功/失败、真实 Range 请求次数和读取字节，但这些数据从“预算门禁”改为纯观测指标；后端不再返回 `limits` / `remaining` 配额字段。
- 定时解析仍保持 5–1440 分钟、每轮 1–20 个的现有输入校验，Parser 仍为单并发串行。1231 取消的是额外的小时/每日全局尝试上限，不是单轮输入保护。
- 后台 Range Parser 用量改成纯总数展示：`本小时`、`今日`、`今日 Range 请求`、`今日真实读取`。移除 `/10`、`/150`、`剩余额度` 和任务进度中的 `预算拦截`。
- 定时设置保存提示和手动解析确认文案同步去掉 10/150 预算说明，避免后台文案继续暗示不存在的限制。
- 桌面后台左侧菜单改为 sticky：`position: sticky; top: 0; height: 100vh; overflow-y: auto`，长页面滚动时菜单始终可见；菜单项目超过一屏时左栏自身可滚动。
- 移动端保持原有底部 fixed 导航，并显式重置 `top/height/overflow/align-self`，避免桌面 sticky 样式影响手机布局。
- 1230 的 Replica Preview schema 持久化修复和独立 30 分钟实体网盘目录快照策略保持不变。
- Contract tests 新增：Range 用量必须为纯 telemetry、小时/每日不再包含 remaining/limits、核心同步不存在 budget gating、后台不得出现 `/10`/`/150`/剩余额度/预算拦截、桌面 sidebar sticky 与移动端 fixed 导航样式同时存在。
- Functional Actions #156 / run `34852734004`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、Legacy Docker compose syntax、部署包构建/校验和 Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 真实 BaoTa 1231 仍待回归：保存非默认定时设置、在历史计数超过旧阈值时确认仍可继续解析、Range 卡片显示纯总数、桌面长页面滚动时左侧菜单持续可见，并复测 1230 的副本对账持久化/快照命中。

## 2026-09-14 — 2026091230 Production hotfix: Range UI + configurable scheduler + replica cache restore

- 修复 Range Parser 用量卡片显示 `NaN`。根因不是后端计数错误，而是通用 `Card` 组件把 `4/10`、`14/150`、`0.5 MB` 这类已经格式化的字符串再次 `Number(...)`，结果变成 `NaN`。1230 对格式化指标改用文本型统计卡，真实请求数/读取量继续来自原有后端计量。
- 真实 1229 运行样本确认 Range Parser 本身工作正常：一次成功解析使用 3 次 Range 请求、约 0.5 MB；同时后台读取到 7260 个数据库引用、7087 个唯一 IPA、114 个缺失条目，任务结束后待解析 6851 个。该样本说明此次 `NaN` 是显示层缺陷，不是预算或解析器失效。
- 修复“定时解析看起来可配置、实际却固定为 15 分钟 / 1 个”的问题。根因是 `effectiveSchedule()` 在运行时硬编码 `intervalMinutes >= 15` 且 `parseLimit = 1`，覆盖了已经保存的配置。
- 1230 运行时真正采用后台保存值：间隔支持 5–1440 分钟、每轮支持 1–20 个 IPA。推荐默认仍是 15 分钟 / 1 个，但不再强制固定。
- 调度可配置不等于取消保护：Range Parser 仍为串行单并发，滚动 1 小时最多 10 个解析尝试、UTC 当天最多 150 个；如果当前剩余额度低于“每轮数量”，本轮自动按剩余额度收缩。
- 修复“云盘副本管理对账结果/页面切换后像是没有缓存”的问题。根因是 1229 的 `replicaPreviewStore.normalize()` 在落盘/读回时丢掉 `replicaSchemaVersion`，而 `previewCompatible()` 又要求 schema >= 2，因此所有已经持久化的 1229 对账结果读回来都会被判为不兼容。
- `openlist-replica-preview.json` 现在会保留 `replicaSchemaVersion`，新生成的 schema-v2 对账结果可再次在页面切换、浏览器刷新和 Node 服务重启后恢复。
- 1229 已经生成、但缺少 `replicaSchemaVersion` 的旧 preview 文件仍会被 1230 安全拒绝；升级后需要重新对账一次。独立的 30 分钟实体网盘目录快照 `openlist-replica-snapshots.json` 不受此字段问题影响，仍可复用，因此 fresh snapshot 场景不需要重新全量扫云盘。
- 新增/调整 contract tests，覆盖可配置 scheduler、Range 格式化统计卡、Replica Preview schema 持久化和既有 30 分钟快照策略。
- Actions #150 / run `34847017796`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、Legacy Docker compose syntax、部署包构建/校验和 Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 真实 BaoTa 1230 仍需做三个短回归：Range 卡片不再 NaN；保存一个非默认定时配置并刷新页面确认保持；云盘副本完成一次对账后切换页面再回来确认结果立即恢复，并在 30 分钟内再次对账确认快照命中。

## 2026-09-14 — 2026091229 Replica integrity + sync plan + source priority

- 多网盘对账新增副本完整性状态：`verified`、`missing`、`md5_mismatch`、`size_mismatch`、`unverified`。同路径存在不再自动视为健康副本。
- 当元数据缓存已有期望 MD5 时，只有 MD5 相同且已知大小不冲突才计为已验证；缺少可比 Hash 时明确标记为“未验证”，避免把未知状态伪装成正常。
- MD5/大小异常副本单独列出，自动补齐不会把异常副本当来源，也不会直接覆盖异常目标；后续修复需要显式处置。
- 对账持久结果升级为 schema v2。1228 的旧对账快照不再直接恢复为当前结果，升级后需要重新对账；30 分钟实体网盘目录快照仍可复用。
- 新增 `POST /api/v1/admin/openlist/replicas/sync-plan`：复制前先生成只读补齐计划，后台明确展示每条 `来源盘 → 目标盘`，预览阶段不会调用 `/api/fs/copy`。
- 补齐计划新增 SHA-256 `planHash`。执行时重新计算来源/目标动作集合；如果配置或对账状态已经变化，返回 `REPLICA_PLAN_CHANGED`，要求重新预览，避免执行过期计划。
- OpenList 实体盘在副本配置中的顺序现在同时作为来源优先级，后台可通过上移/下移调整并持久保存。相同完整性等级时优先选择排名靠前的盘。
- 安全规则优先于人工排序：MD5 已验证来源始终优先于未验证来源；MD5/大小异常副本永远不能成为自动补齐来源。
- 保留按目标盘生成计划，可只预览并补齐某一个可写盘；单次上限仍为 20（API 最多 50）个复制动作。
- 新增/扩展 contract tests：完整性状态、同名错误内容检测、已验证来源优先、同等级来源顺序、异常目标禁止自动覆盖、目标盘过滤、计划 Hash 稳定性、后台来源/目标预览 UI。
- Actions #141 首次失败仅因为 1228 的旧 UI contract 仍要求按钮文案 `补齐此盘缺失（20 个）`；本轮新增完整性和 sync-plan 测试全部通过，业务逻辑未失败。
- 更新旧契约为新的“预览补齐此盘（20 个）/补齐计划预览”语义后，Actions #142 / run `34838613229`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、Legacy Docker compose syntax、部署包构建/校验和 Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 真实 BaoTa/OpenList 的 MD5 不一致识别、来源优先级、计划预览/执行、过期计划拦截仍待生产 E2E 验证。

## 2026-09-14 — 2026091228 OpenList API scheduling + Range budget hardening

- 元数据和多网盘副本目录扫描统一改为 OpenList `/api/fs/list` 的 `per_page:0` + `refresh:false`。平铺约 7271 个 IPA 的目录不再按 500 条分页，ZONOE→OpenList 列表调用理论上由约 15 次降到 1 次；子目录仍按目录各请求一次。
- 元数据目录缓存继续保留 30 分钟，但缓存 scope 新增 OpenList 令牌 SHA-256 指纹，换账号/换令牌后不会复用旧账号目录缓存。
- 新增 `CONTROL_DIR/openlist-replica-snapshots.json`，按 `storageId + rootPath` 持久保存每个实体网盘 30 分钟目录快照。
- 普通“对账”优先使用有效网盘快照；新增“强制刷新全部”和“只刷新这个盘”，后台显示 OpenList 请求数、快照命中数和实际重扫网盘数。
- “补齐缺失副本”不再无条件先全盘 `previewReplicas()`。复制使用最近有效对账/快照，提交后只让目标网盘快照失效；OpenList 异步复制结束后只需刷新目标盘确认。
- 改名、隔离不再操作前后全盘扫描；只校验最近有效对账并在成功后刷新受影响网盘。
- 同一批复制/隔离任务新增 mkdir 去重，同一目标目录在一批操作中不会为每个 IPA 重复执行完整 mkdir 链。
- Python Range Parser 新增 `range_requests`，继续输出 `range_bytes`；解析失败也尽量返回已经发生的 Range 请求次数和读取字节。
- 新增 `CONTROL_DIR/openlist-range-usage.json`，持久记录 Range 解析尝试、成功/失败、真实 Range 请求次数和读取字节。
- Range Parser 增加硬预算：滚动 1 小时最多 10 个解析尝试、UTC 当天最多 150 个；定时解析实际执行下限为每 15 分钟 1 个，解析仍为单并发串行。
- 元数据核心同步现在在候选选择前直接查询 MD5 持久解析库；同 MD5 且大小不冲突时立即复用，不等后台 1 秒轮询。单次任务内相同 MD5 也只 Range 解析一次，其余副本直接继承结果。
- `ipaMetadataPersistenceService` 后台兜底轮询由 1 秒降到 30 秒，避免无意义的高频本地 JSON 检查。
- 单 IPA 16 MiB Range 安全上限暂不降低；先收集真实 `range_requests/range_bytes` 分布，再决定是否安全降到 8 MiB 或 4 MiB。
- 新增 `api-scheduling.contract.test.js`，覆盖 `per_page:0`、30 分钟副本快照、目标盘局部失效、同步取消全盘预扫、10/150 Range 预算、Range 计量、MD5 复用和 30 秒后台兜底。
- Actions #135 / run `34825687295`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、Legacy Docker compose syntax、部署包构建/校验全部成功。
- 真实 BaoTa/OpenList 7000+ 文件请求数、快照命中、单盘刷新、Range 用量和预算拦截仍待生产 E2E 验证。

## 2026-09-14 — 2026091227 Replica reconciliation persistence + Alias distribution UX

- 修复“云盘副本”对账结果只存在浏览器内存、切换后台页面后消失的问题。最新对账现在持久化到 `CONTROL_DIR/openlist-replica-preview.json`，重新进入页面、刷新浏览器或 Node 服务重启后均可恢复。
- 保存或修改副本配置时主动清除旧对账快照，避免挂载/根目录变化后继续展示过期结果。
- 多网盘结果新增单盘收起/展开，以及“全部展开 / 全部收起”；多个网盘默认仅展开第一个，避免长页面连续滚动。
- “数据库不存在的多余 IPA”改为简洁的“多余 IPA”，所有多余项自动列出并按 100 条/页分页；缺失 IPA 同样按 100 条/页分页，不再只显示前 50/100 条。
- 分流设置从原先的 Alias 路径文本框升级为可操作向导：自动发现 OpenList Alias、下拉选择 Alias、生成所选实体副本目录清单、支持一键复制 Alias 路径，并生成 Alias 公开下载根地址。
- 后台明确给出实际使用顺序：在 OpenList Alias 中加入所有副本目录，读取冲突策略选“按文件负载均衡”，回到 ZONOE 选择 Alias 并保存，完成副本对账后通过 Alias `/d/<alias>/...` 路径提供下载。
- 明确重要边界：1227 不自动创建/修改 OpenList Alias，也不自动批量重写 MySQL `bt1a`。仍指向实体盘 `/d/a/app/...` 的下载地址会绕过 Alias，不会参与分流。
- IPA 元数据页把 `OpenList Token` 文案改成 `OpenList 令牌`，并指向 OpenList “设置 → 其他 → 令牌”的程序固定令牌。后端仍按 OpenList API 要求将令牌原值放入 `Authorization`，不添加 `Bearer`。
- 新增 `replica-admin-ux.contract.test.js`，覆盖对账持久化、100 条分页、收起/展开、Alias 配置向导、令牌文案。
- Actions #116 首次失败仅因为旧 1226 回归测试把 VERSION 精确固定为 `2026091226`；1227 新增功能测试当轮均已通过。随后把该测试改为“1226 或更高版本必须继续满足账号切换修复契约”，未修改业务逻辑。
- Actions #117 / run `34790323206`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验/Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 真实 BaoTa 页面切换恢复、真实 Alias 覆盖和“按文件负载均衡”下载仍待 E2E 验证。

## 2026-09-14 — 2026091226 Account-independent IPA metadata persistence

- 修复更换 OpenList/云盘账号、挂载路径或下载路径后，之前 IPA 解析结果从解析库消失的问题。
- 根因确认：旧 v3 缓存以 `apiPath` 作为解析结果身份，同步只通过 `old.files[apiPath]` 继承旧解析；账号/路径变化后同一 IPA 会被当作新路径，活动缓存又会按当前引用重建。
- 新增持久 `openlist-ipa-metadata-library.json`，以标准化 MD5 作为内容身份，并保存文件大小作为额外防误关联保护。
- 持久库只保存安全包内字段：名称、版本、Build、Bundle ID、MinimumOSVersion、Executable；不保存 OpenList Token、`raw_url` 或下载地址。
- 服务启动时先将当前仍有效的 v3 解析结果迁移进 MD5 库，再启动 OpenList 定时器，避免升级后第一次同步先覆盖旧结果。
- 当前文件在新账号/新路径下只要 MD5 相同且已知大小不冲突，就可从持久库恢复旧解析结果；真正不同 MD5 不复用。
- stale `parsedMd5`、解析失败和缺失文件不会进入持久 MD5 库。
- OpenList 目录缓存现在在服务启动时主动失效一次，并在 OpenList 配置更新时间变化时再次失效，防止同一 OpenList 地址更换 Token/账号后继续读取旧账号目录缓存。
- 后台“本地缓存”新增 `MD5 解析库` 数量和体积；“清空 IPA 解析缓存/全部缓存”明确同时清空活动路径缓存和持久 MD5 解析库，但不会删除云盘 IPA 或 MySQL 数据。
- 新增 account-switch contract tests：v3 → MD5 迁移、同 IPA 新账号/新路径复用、不同 MD5 拒绝、相同 MD5 但大小冲突拒绝、stale/failed 不迁移，以及启动顺序/目录缓存失效契约。
- Actions #103 / run `34787233314`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验/Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 已在旧版本被覆盖掉且没有外部备份的解析数据无法凭空恢复，需要重新解析一次；进入 1226 MD5 库后，未来账号/路径变化不再依赖旧路径。
- 真实 BaoTa/OpenList 账号切换同 MD5 复用仍待 E2E 验证。

## 2026-09-14 — 2026091225 OpenList multi-drive replica management

- 新增后台“云盘副本”模块，读取 OpenList 管理存储列表并区分实体网盘与 Alias 分流盘。
- 每个实体网盘可独立配置副本根目录、是否参与管理、是否允许写操作；副本管理/复制/改名/隔离权限全部默认关闭，不因升级自动打开。
- 以启用 MySQL 软件源当前 `bt1a` 为权威期望清单，对选中网盘递归扫描 IPA，并输出每盘已有、缺失、多余和 App × 网盘副本矩阵。
- 新增 OpenList 原生跨存储补齐：调用 `/api/fs/copy`，ZONOE 不中转 IPA 数据；后台默认单次最多提交 20 条，API 上限 50 条。
- 新增 MD5 名称修复：期望路径缺失且同目录恰有一个 MD5 相同的多余文件时才建议改名；执行前重新对账，再调用 `/api/fs/rename`。
- 新增多余 IPA 隔离：执行前重新对账确认仍为 `extra`，再调用 `/api/fs/move` 移到 `.zonoe-quarantine/<YYYY-MM-DD>/...`；1225 不提供永久删除 API。
- Alias 不能被选择为实体副本盘。后台可发现 Alias 并检查配置字符串是否覆盖已选副本根目录，但不自动创建/修改 Alias；最终下载分流由 OpenList 原生 Alias 读取冲突/负载均衡策略完成。
- OpenList Token 文案从“只读 Token”改为通用 Token，并明确：元数据读取和副本写操作需要不同权限范围。
- 新增 `openlist-replicas.json` 控制配置，并由现有持久化 control 目录保存，在线更新沿用原持久化目录机制。
- 新增受保护管理员 API：`GET|PUT /openlist/replicas`、`POST /openlist/replicas/preview|sync|rename|quarantine`。
- 新增 contract tests 覆盖 API 路径转相对副本路径、缺失/多余识别、同目录唯一 MD5 改名建议和跨目录拒绝建议。
- Actions #89 首次失败不是业务逻辑失败：新 contract 误用了 Node `node:test`，三条算法子测试本身已通过，但 Vitest 报“no test suite”。改成 Vitest 后未改业务代码。
- Actions #91 / run `34786345775`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验/Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 真实 BaoTa 2026091225、真实 OpenList storage discovery/copy/rename/quarantine、真实 Alias 负载均衡仍待验证。

## 2026-09-14 — 2026091224 Admin IPA traceability + dynamic database sync rules

- IPA 元数据“解析结果库”新增管理员可见下载地址列。地址在请求时按 `sourceSlug + legacyId` 从对应 MySQL 软件源当前 `bt1a` 读取，不写入 OpenList v3 安全 `appRefs` 缓存，也不进入公开 API。
- “缺失 IPA 对应数据库条目”补齐原数据库下载地址，并继续展示预期 OpenList 路径，便于判断是链接、目录映射还是文件缺失问题。
- 版本显示从含糊的 `源版本 → IPA 版本 (Build)` 改为明确三行：`源版本`、`IPA 版本`、`Build`。例如 `1.2.5 (40)` 现在显示为 `IPA 版本：1.2.5 / Build：40`。
- 数据同步从固定 `WRITEBACK_FIELDS + mappings` 升级为可编辑 `rules[]`。默认规则仍会生成，但每一条都可以修改数据来源、目标数据库字段、策略、启用状态，也可以删除或新增规则。
- 旧 2026091222/1223 `mappings` 配置在读取时自动迁移为动态规则，避免升级后丢失已有配置。
- 新增可选数据来源 `download_url`（界面显示“IPA 下载链接”），可映射到 `bt1a` 或其他真实 MySQL 字段；选择常见数据库列时前端会给出来源建议，例如选择 `bt1a` 自动切换到“IPA 下载链接”，之后仍允许人工改选。
- 动态规则继续执行真实列校验、重复目标列拦截、当前 `md5 === parsedMd5`、解析成功/无 parseError、只更新已有 App 等保护。
- 数据同步开关文案改为“允许手动写入数据库”和“IPA 解析成功后自动写入数据库”，并补充关闭/开启后的实际行为说明。
- 新增管理员专用 `/api/v1/admin/openlist/results-rich`；通过 Admin Auth + CSRF 保护，返回当前页解析结果及当前数据库下载地址。
- 新增 contract tests 覆盖动态规则、旧配置迁移、下载链接 → `bt1a`、管理员下载地址接口、Build 明示、可新增映射规则等。
- Actions #78 首次失败：唯一原因是 1223 的旧 UI contract 仍要求旧“当前映射字段”文案；1224 的新功能/新 contract 当轮均已通过。随后按动态规则新语义更新该契约。
- Actions #79 / run `34784361324`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、Legacy Docker compose syntax、部署包构建/校验和 Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
- 真实 BaoTa 2026091224 部署和真实 MySQL 写入仍待验证。

## 2026-09-14 — 2026091223 Write-back preview visibility hotfix

- 修复“预览前 50 个已解析 App”在所有映射字段都无差异时只显示表头、不显示 App 行的问题。
- 根因：前端在渲染前使用 `previewCount > 0` 过滤，导致后端已返回的“无差异 App”被全部隐藏。
- 现在预览会显示全部已扫描 App；无差异行明确显示无需写入。
- 新增预览筛选：全部已扫描 App / 仅有字段差异 / 仅可写变化，并显示当前行数与总扫描数。
- 新增前端 contract test，防止未来再次把无差异 App 从预览表中静默过滤。
- 本热修复不修改 MySQL 写回规则、字段映射语义、自动写回调度器或 IPA 解析逻辑。

## 2026-09-14 — 2026091222 Admin usability + controlled IPA write-back

- 后台“站点设置”改为中文多字段表单：站点名称、站点公告、首页主标题一次加载、一次保存，不再要求管理员理解 `site_name/site_notice/hero_title`。
- 新增“本地缓存”管理页：查看 IPA/目录/任务缓存大小与状态；支持清空目录缓存、重置失败解析、清空 IPA 解析缓存和全部本地缓存。任何缓存操作都不会删除 OpenList IPA 或 MySQL 业务数据。
- 新增“数据同步”页，为每个 MySQL 软件源单独配置 IPA → 数据库字段映射。
- 每个 IPA 字段独立控制：是否参与同步、目标真实 MySQL 列、写回策略（只预览 / 值变化时 / 仅空值 / 以 IPA 为准）。
- 软件源级写回和自动写回默认全部关闭；不允许两个启用字段映射到同一数据库列；保存时校验目标列真实存在。
- 写回只 UPDATE 已存在 App；2026091222 不自动 INSERT 新 App。
- 写回资格采用严格保护：必须当前 IPA `md5 === parsedMd5`、解析成功、无 parseError；旧缓存和失败解析不能修改数据库。
- 新增写回预览、手动确认同步、写回历史；历史不保存 MySQL 密码或 OpenList Token。
- 新增后台自动写回调度器。只有管理员显式开启“允许写回 + 自动写回”的软件源才参与，且仍逐字段遵守映射策略；相同值不会制造无意义 UPDATE。
- 新增 contract tests 覆盖默认关闭、重复目标列、字段禁用、empty/preview 策略和 unchanged no-op。

## 2026-09-14 — 2026091221 Public IPA metadata discovery

- 公共 App 搜索接入 OpenList v3 安全缓存，可按当前 IPA 包内名称、包内版本、Build、Bundle ID、最低 iOS、文件名和 Executable 命中；最终 App 行仍从原 MySQL `fa_category` 读取。
- `/api/v1/apps` 新增 `ipa=parsed|pending|failed` 和 `ios=<target>`；`ios` 表示 `MinimumOSVersion <= target`，只对当前 MD5 已解析数据判定。
- 前台 App 列表增加 IPA 状态与目标 iOS 筛选；卡片显示包内版本/Build/最低 iOS。
- 修正 stale-cache 边界：文件 MD5 变化或解析失败后，旧 Bundle ID/包内版本/最低 iOS 不再作为当前公开元数据返回，也不会被搜索命中。

## 2026-09-14 — 2026091220 IPA parse results explorer

- OpenList IPA 缓存升级为 v3，增加安全 `appRefs` 索引，仅保存软件源/原 ID/App 名称与版本/DB 大小/API 内部路径，不保存 `bt1a`、Token 或 `raw_url`。
- 后台新增完整解析结果分页、搜索和状态筛选。
- 解析结果同时展示软件源版本/大小与 IPA 包内版本/Build/Bundle ID/最低 iOS/实际大小。

## 2026-09-13 — 2026091217 Online update canary

- 用于验证真实在线更新链路，不改业务功能。

## 2026-09-13 — 2026091208 Multi-MySQL software sources + admin operations

- 应用数据直接聚合一个或多个现有 MySQL 软件源，不在 ZONOE 内复制第二套 App/版本/IPA 数据。
- 多库允许相同原始 ID，使用 `source_slug:legacy_id` 作为全局身份。
- IPA 文件仍由原软件源/OpenList 管理。
