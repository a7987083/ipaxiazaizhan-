# Roadmap

## Current — 2026091229 Replica integrity + sync plan + source priority

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage (2026091225)
- [x] MD5-addressed IPA metadata persistence independent of OpenList account/path (2026091226)
- [x] Persisted reconciliation, 100-row pagination, collapsible multi-drive UI and Alias setup guide (2026091227)
- [x] API scheduling, persistent per-drive snapshots, targeted refresh and Range budgets (2026091228)
- [x] Classify each expected replica as verified / missing / MD5 mismatch / size mismatch / unverified
- [x] Stop treating same-path wrong-content files as healthy replicas
- [x] Never use MD5/size mismatch copies as automatic sync sources
- [x] Never auto-overwrite integrity-mismatch targets from the missing-copy flow
- [x] Add read-only sync-plan preview before any cross-storage copy
- [x] Show every planned `source drive -> target drive` action in admin UI
- [x] Protect execution with deterministic SHA-256 plan hash and stale-plan rejection
- [x] Use selected mount order as persistent source priority
- [x] Prefer verified sources over unverified sources regardless of configured order
- [x] Preserve per-target planning for one writable drive
- [x] Ignore incompatible pre-1229 persisted previews while preserving reusable directory snapshots
- [x] Add contract tests for integrity classification, source selection, target filtering and plan hashing
- [x] 2026091229 Actions #142 / run `34838613229` passed validation/build/package jobs
- [ ] Deploy 2026091229 to real BaoTa
- [ ] Force one fresh reconciliation and verify schema-v2 integrity counts on real drives
- [ ] Verify one real known-MD5 file reports `verified` on matching drives
- [ ] Verify a real/disposable mismatch is reported and never selected as source
- [ ] Preview 20 copy actions and confirm every displayed source/target before execution
- [ ] Change source order and verify equal-integrity source selection follows the new order
- [ ] Verify stale plan rejection if reconciliation/config changes between preview and execute
- [ ] Continue 1228 real OpenList request-count / Range telemetry verification
- [ ] Continue real Alias load-balancing, account-switch, copy/rename/quarantine E2E
- [ ] Next phase: asynchronous copy-task lifecycle and operation audit history
- [ ] Consider controlled preview/batch migration of MySQL `bt1a` from physical URLs to Alias URLs only after Alias E2E is proven

## Important integrity rule

A file existing at the expected path is no longer sufficient to call the replica healthy. If an expected MD5 is available, matching MD5 is the authoritative integrity check; a known size mismatch is also an error. When no comparable hash is available, the replica is explicitly `unverified`. Automatic copy uses verified sources first, unverified sources only as fallback, and never uses known mismatch copies.

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
- `2026091228`: API scheduling, persistent per-drive snapshots, targeted refresh, Range usage telemetry/budgets and core MD5 pre-parse reuse; CI passed; real traffic profile pending.
- `2026091229`: replica integrity classification + source-priority sync planning + stale-plan protection; CI #142 passed; real multi-drive E2E pending.
