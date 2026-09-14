# Roadmap

## Current — 2026091232 Replica copy lifecycle + verification + audit

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage (2026091225)
- [x] MD5-addressed IPA metadata persistence independent of OpenList account/path (2026091226)
- [x] Persisted reconciliation, 100-row pagination, collapsible multi-drive UI and Alias setup guide (2026091227)
- [x] API scheduling, persistent per-drive snapshots, targeted refresh and Range telemetry (2026091228)
- [x] Replica integrity classification + source-priority sync planning + stale-plan protection (2026091229)
- [x] Fix Range summary NaN, make scheduler configurable, restore persisted replica preview schema (2026091230)
- [x] Remove fixed 10/hour and 150/day Range Parser attempt quotas and keep telemetry-only usage (2026091231)
- [x] Keep desktop admin navigation visible on long pages (2026091231)
- [x] Persist copy batches and per-IPA lifecycle states instead of treating `/api/fs/copy` acceptance as completion
- [x] Resume unfinished copy verification after API restart
- [x] Verify copied targets by MD5 where available; explicitly downgrade to size/presence verification when hashes are unavailable
- [x] Add copy timeout/failure states and operation audit history
- [x] Add dedicated admin “副本任务” page plus manual verification action
- [x] Bind sync-plan hash to expected MD5/size and source/target roots
- [x] Return tracking batch ID after copy submission
- [x] Refresh only affected target drives after a batch reaches terminal state
- [x] Prevent failed-only copy batches from scheduling unnecessary target refresh
- [x] Start the 30-second mismatch consistency window when the mismatch is first observed, not when copy submission occurred
- [x] Persist `mismatchSince` and clear it after a later verified result
- [x] Preserve existing replica preview persistence and 30-minute per-drive snapshot cache
- [x] Add 1232 contract coverage for lifecycle/verification/audit, failed-only batch handling and late first-observed mismatch grace
- [x] GitHub Actions recovered to the real CI workflow on run #162 / `34878831197`
- [x] Full Integration tests + Production build + API/frontend smoke + BaoTa/native contracts + package validation passed on functional head `9aacafbcc98c5dac3f326516021c8a3cc3165a63`
- [x] Produce and validate `zonoe-ipa-download-2026091232-baota-native-build` artifact (`sha256:4003f223c5ffc5d4971bec63374ee831efab2587c95fc8b386b53e76914bd69c`)
- [ ] Deploy 2026091232 to real BaoTa/OpenList
- [ ] Real BaoTa/OpenList: submit a safe 1–5 IPA copy batch and observe `submitted -> waiting/verifying -> terminal`
- [ ] Real BaoTa/OpenList: confirm MD5 result where provider exposes hash and explicit size-only fallback where it does not
- [ ] Real BaoTa/OpenList: confirm a late-appearing mismatch receives a fresh 30-second grace window from first observation
- [ ] Real BaoTa/OpenList: restart Node during a pending copy and confirm persisted lifecycle resumes
- [ ] Real BaoTa/OpenList: confirm batch completion refreshes only actual target drives and failed-only submissions refresh none
- [ ] Real BaoTa/OpenList: confirm copy/verify/refresh/rename/quarantine audit history and absence of secrets/raw URLs
- [ ] Continue 1229 real integrity verification: known-MD5 `verified`, mismatch detection, source-priority selection and stale-plan rejection
- [ ] Continue real Alias load-balancing, account-switch, copy/rename/quarantine E2E
- [ ] Next feature phase: controlled mismatch remediation — quarantine bad target, refill from verified source, re-verify, no permanent delete
- [ ] After real Alias E2E only: controlled preview/canary/batch/rollback migration of MySQL `bt1a` from physical URLs to Alias URLs

## Important 1232 copy rule

An OpenList copy API response only means the request was accepted. ZONOE must keep the operation pending until the target is independently observed and verified. MD5 is authoritative when both expected and target MD5 are available; lack of target hash must be displayed as a weaker verification level rather than a false MD5 success.

## Important mismatch-grace rule

The 30-second mismatch confirmation window begins when ZONOE first observes an MD5/size mismatch and persists that timestamp as `mismatchSince`. It is not measured from `/api/fs/copy` submission time. This prevents a target that appears late from being marked failed immediately. A later healthy verification clears the mismatch marker.

## Important target-refresh rule

Only drives that actually accepted copy work belong to a tracking batch's target-refresh set. A plan action that fails before `/api/fs/copy` acceptance remains in audit/history as failed but must not cause a later forced target scan.

## Important scheduler / Range rule retained from 1231

The recommended metadata-parser default remains 15 minutes / 1 IPA but administrators may save 5–1440 minutes and 1–20 IPA per run. Parsing remains single-concurrency. Range attempt/request/byte counters are observability data and no longer enforce the former 10/hour or 150/day global quota.

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
- `2026091228`: API scheduling, persistent per-drive snapshots, targeted refresh and Range telemetry; CI passed.
- `2026091229`: replica integrity classification + source-priority sync planning + stale-plan protection; CI passed; production E2E pending.
- `2026091230`: Range summary rendering + scheduler configurability + replica preview persistence hotfix; CI passed.
- `2026091231`: fixed global Range quotas removed, telemetry-only usage view, sticky desktop admin sidebar; release CI passed; real BaoTa recheck pending.
- `2026091232`: copy lifecycle/verification/audit + first-observed mismatch grace; functional CI run #162 passed and deployment artifact was validated/uploaded; real BaoTa/OpenList E2E remains pending.
