# Roadmap

## Current — 2026091228 OpenList API scheduling + Range budget hardening

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage (2026091225)
- [x] MD5-addressed IPA metadata persistence independent of OpenList account/path (2026091226)
- [x] Persisted reconciliation, 100-row pagination, collapsible multi-drive UI and Alias setup guide (2026091227)
- [x] `/api/fs/list` metadata scan uses `per_page:0` + `refresh:false`
- [x] `/api/fs/list` replica scan uses `per_page:0` + `refresh:false`
- [x] Metadata directory cache identity includes OpenList token fingerprint
- [x] Persistent 30-minute per-drive replica snapshots
- [x] Normal reconciliation prefers snapshots instead of rescanning every drive
- [x] Force-refresh all drives or only one selected drive
- [x] Copy invalidates only target-drive snapshots
- [x] Rename/quarantine refresh only affected drives
- [x] Deduplicate mkdir calls within one copy/quarantine batch
- [x] Admin shows latest OpenList request count, snapshot hits and real drive rescans
- [x] Range Parser reports real request count and bytes read
- [x] Persist Range usage under `CONTROL_DIR/openlist-range-usage.json`
- [x] Hard Range parse budget: 10 attempts/hour and 150 attempts/day
- [x] Effective scheduled parsing no faster than 1 IPA / 15 minutes
- [x] Core sync consults MD5 library before candidate selection
- [x] Same-MD5 copies are parsed once per task and reuse the result
- [x] Reduce metadata persistence guard from 1 second to 30 seconds
- [x] Keep 16 MiB per-IPA hard ceiling until real telemetry supports lowering it
- [x] Actions #135 / run `34825687295` passed validation and package jobs for functional candidate `2026091228`
- [ ] Deploy 2026091228 to real BaoTa
- [ ] Seed snapshots with one forced multi-drive reconciliation, then confirm normal reconciliation is mostly/all snapshot hits
- [ ] Measure real OpenList request count on the 7,000+ IPA directory
- [ ] Refresh one drive only and prove other drives are not rescanned
- [ ] Submit cross-storage copy and prove only target snapshots are invalidated
- [ ] Verify Range request/byte telemetry on real IPA samples
- [ ] Verify 10/hour and 150/day limits block excess raw-url parsing
- [ ] Collect enough Range telemetry before deciding whether 16 MiB can safely become 8 MiB or 4 MiB
- [ ] Continue real Alias load-balancing, account-switch, copy/rename/quarantine E2E
- [ ] Consider controlled preview/batch migration of MySQL `bt1a` from physical mount URLs to Alias URLs only after Alias E2E is proven

## Important traffic model

OpenList directory cache and ZONOE snapshots reduce listing traffic. They do not protect direct `raw_url` Range reads. Range parsing therefore has its own budget and telemetry. `refresh:false` also means ZONOE does not explicitly force OpenList to refresh its provider directory cache.

An Alias only load-balances downloads that actually enter through the Alias path. Existing database URLs that still point directly to a physical mount such as `/d/a/app/Foo.ipa` bypass Alias entirely.

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
- `2026091222`: controlled IPA write-back + admin tools; CI passed.
- `2026091223`: preview visibility hotfix; CI passed.
- `2026091224`: admin download URLs + dynamic DB sync rules; CI passed; real runtime/write-back pending.
- `2026091225`: OpenList multi-drive replica management; CI passed; real multi-drive E2E pending.
- `2026091226`: content-addressed IPA parse persistence across account/path changes; CI passed; real account-switch E2E pending.
- `2026091227`: persisted reconciliation + paginated/collapsible multi-drive UI + Alias distribution guide; CI passed; real Alias E2E pending.
- `2026091228`: API scheduling, persistent per-drive snapshots, targeted refresh, Range usage telemetry/budgets and core MD5 pre-parse reuse; functional CI #135 passed; real traffic profile pending.
