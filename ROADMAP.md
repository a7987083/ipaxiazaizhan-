# Roadmap

## Current — 2026091227 Replica reconciliation persistence + Alias distribution UX

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage (2026091225)
- [x] MD5-addressed IPA metadata persistence independent of OpenList account/path (2026091226)
- [x] Persist the last multi-drive reconciliation result in the control directory
- [x] Restore reconciliation after admin navigation/browser refresh/service restart
- [x] Invalidate persisted reconciliation when replica configuration changes
- [x] Automatically list all extra IPA with 100-row pagination
- [x] Paginate missing IPA at 100 rows per page
- [x] Per-drive expand/collapse plus global expand/collapse controls
- [x] Replace raw Alias path UX with discovered Alias selector and setup guide
- [x] Generate/copy selected replica roots for OpenList Alias configuration
- [x] Generate the Alias public `/d/<alias>/...` download root
- [x] Explain and recommend OpenList “按文件负载均衡” for the current 302 download model
- [x] Rename OpenList credential UI to “令牌” and point to OpenList 设置 → 其他 → 令牌
- [x] Preserve 1226 account-switch regression coverage for later versions
- [x] 2026091227 functional Actions #117 / run `34790323206` passed validation/package build
- [ ] Deploy 2026091227 to real BaoTa
- [ ] Verify reconciliation survives page navigation and process restart on the real control directory
- [ ] Verify >100 extra IPA pagination and multiple-drive collapse behavior with real 7271+ file data
- [ ] Configure one real OpenList Alias with all selected replica roots and verify coverage
- [ ] Test one real IPA through the generated Alias public URL with “按文件负载均衡”
- [ ] Decide whether to add a controlled preview/batch migration of MySQL `bt1a` from physical mount URLs to Alias URLs
- [ ] Later: safe Alias auto-create/update only after the real OpenList `addition` schema/version behavior is verified
- [ ] Continue real cross-storage copy / MD5 rename / quarantine validation

## Important distribution rule

An Alias only load-balances requests that actually enter through the Alias path. Existing database URLs that still point directly at a physical mount such as `/d/a/app/Foo.ipa` bypass Alias entirely. 1227 deliberately does not mass-rewrite `bt1a`; first verify the Alias path with a small real test.

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
- `2026091222`: controlled IPA write-back + admin tools; CI passed.
- `2026091223`: preview visibility hotfix; CI passed.
- `2026091224`: admin download URLs + dynamic DB sync rules; CI passed; real runtime/write-back pending.
- `2026091225`: OpenList multi-drive replica management; CI passed; real multi-drive E2E pending.
- `2026091226`: content-addressed IPA parse persistence across account/path changes; CI passed; real account-switch E2E pending.
- `2026091227`: persisted reconciliation + paginated/collapsible multi-drive UI + Alias distribution guide; CI #117 passed; real Alias E2E pending.
