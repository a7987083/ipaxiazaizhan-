# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091227`
- Baseline: `2026091226` / `a1177c9ff6ed16e22924c38b73749ec720165709`
- Functional/test commit: `365d1b5b2c13fd531dd4bf544012dc621353f4f1`
- Functional CI: Actions #117 / run `34790323206` passed validation and package jobs.
- Real BaoTa/OpenList Alias/load-balancing verification: pending.

## What 1227 changes

1. Multi-drive reconciliation results are no longer browser-only state. They are persisted to `CONTROL_DIR/openlist-replica-preview.json` and restored when the admin leaves the page, comes back, refreshes the browser, or the Node process restarts.
2. Saving/changing replica configuration explicitly invalidates the old persisted reconciliation result so stale drive/root results are not shown as current.
3. Every drive result can be expanded/collapsed, with global “全部展开 / 全部收起”. With multiple drives only the first result opens initially.
4. Extra IPA are automatically listed as “多余 IPA”; the old redundant wording “数据库不存在的多余 IPA” is removed. Extra and missing lists paginate at 100 rows per page instead of silently truncating the list.
5. Alias distribution is presented as a real setup flow instead of a raw path field. ZONOE discovers existing OpenList Alias mounts, lets the admin choose one, shows/copies all selected replica roots that belong in the Alias, and calculates the Alias public download root.
6. The UI explains the actual distribution path: create/edit Alias in OpenList, add all replica roots, select “按文件负载均衡”, save it, select that Alias in ZONOE, reconcile replicas, and then use the Alias `/d/<alias>/...` public path for downloads.
7. Important: ZONOE 1227 does not automatically create/modify the OpenList Alias and does not automatically rewrite existing MySQL `bt1a` values to the Alias. Direct physical URLs such as `/d/a/app/...` bypass the Alias and therefore do not participate in load balancing.
8. The IPA metadata page now calls the credential “OpenList 令牌”, specifically pointing to OpenList 设置 → 其他 → 令牌. Backend authentication remains the correct raw `Authorization` token value.

## CI verification

Actions #116 initially failed only because the 1226 regression test pinned the exact version string `2026091226`; all newly added replica UX tests had already passed in that run. The stale version assertion was changed to require 1226-or-newer without weakening the account-switch behavior test.

Actions #117 / run `34790323206` then passed:
- Integration tests
- replica reconciliation/UX contracts
- account-switch regression contracts
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- deployment package build/validation/artifact upload

`release-e2e` remains skipped by workflow condition, so real BaoTa/OpenList behavior is not yet claimed as verified.

## Recommended real validation

Deploy 2026091227. Run one multi-drive reconciliation, note the counts, switch to another admin page and return; the same result and timestamp should still be present. Verify a drive with >100 extras shows pagination and that drive cards can be collapsed. In OpenList create or edit an Alias with all selected replica roots and choose “按文件负载均衡”; return to ZONOE, select that Alias, save, and verify coverage is complete. Test one IPA using the generated Alias public download root before considering any batch change of MySQL `bt1a` download URLs.

The 1226 MD5-addressed metadata persistence remains active. Real account-switch and real multi-drive copy/rename/quarantine verification are still pending if not yet performed on the production server.
