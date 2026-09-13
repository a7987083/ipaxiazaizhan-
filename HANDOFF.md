# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091224`
- Functional code commit: `4b1270e838abd9bc726cf88b6f46a8702343d3a5`
- Contract follow-up commit: `f28644175de5567343750f6a1260c1baa4707128`
- Baseline: `2026091223` / `6a52dc8126f37decb7e87d496ab1cdf7337eeced`
- GitHub Actions: #79 / run `34784361324` passed for all executed validation/package steps.
- Real BaoTa/runtime/MySQL verification for 2026091224: pending.

## What 1224 changes

1. IPA 元数据解析结果库新增下载地址列。管理员接口实时从对应 MySQL App 行读取当前 `bt1a`，不会把下载地址写入 OpenList 安全 `appRefs`，也不会新增到公开 API。
2. 缺失 IPA 条目显示原数据库下载地址 + 预期 OpenList 路径，方便直接定位缺失原因。
3. 版本列明确区分“源版本 / IPA 版本 / Build”，不再用 `1.2.5 (40)` 这类容易误解的写法。
4. 数据同步从固定字段行升级成动态映射规则：默认规则可改、可删除，也可新增最多 50 条规则。
5. 每条规则分别选择：是否启用、写入内容、真实数据库列、写入策略。
6. 支持“IPA 下载链接”数据来源，可映射到 `bt1a`；选择常见列会自动给出来源建议，但管理员仍可手工调整。
7. 2026091222/1223 的旧 `mappings` 配置会自动转换为动态 `rules`，已有配置不会因升级直接丢失。
8. 开关文案改为“允许手动写入数据库”和“IPA 解析成功后自动写入数据库”，并明确解释实际行为。
9. 写入安全条件不变：仅当前成功解析、`md5 === parsedMd5`、目标列真实存在、无重复目标列；只 UPDATE 已有 App，不 INSERT 新 App。

## CI verification

Actions #78 首轮只因 1223 遗留的精确 UI 文案 contract 不匹配而失败；当轮所有 1224 新增动态规则和管理员下载地址 contract 均通过。随后正常追加 contract 修复提交，没有改写历史。

Actions #79 / run `34784361324` passed:
- Integration tests
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- deployment package build / validation / artifact upload

`release-e2e` 按现有 workflow 条件 skipped。因此 2026091224 是 **CI/package verified，尚未真实 BaoTa/MySQL-writeback verified**。

## Recommended real deployment validation

在线更新到 2026091224 后先检查 IPA 元数据页：解析库每行应有下载地址，缺失条目也应有数据库下载地址，Build 应独立标明。然后进入数据同步，确认默认规则可编辑/删除并能新增规则；选择数据库列 `bt1a` 时应建议“IPA 下载链接”。先保持“IPA 解析成功后自动写入数据库”关闭，用预览和少量手动写入验证真实数据库后再考虑自动模式。
