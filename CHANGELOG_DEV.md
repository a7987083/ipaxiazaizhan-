# Development Changelog

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
- OpenList 目录缓存现在在服务启动时主动失效一次，并在 OpenList 配置更新时间变化时再次失效，防止同一 OpenList 地址更换 Token/账号后继续读取旧账号的目录缓存。
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
- Actions #79 / run `34784361324`：Integration tests、Production build、Native API smoke、Native frontend static smoke、Shell validation、BaoTa native contract、MySQL multi-source contract、GitHub updater contract、部署包构建/校验/Artifact 上传全部成功；`release-e2e` 按现有条件 skipped。
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
