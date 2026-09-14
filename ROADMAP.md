# Roadmap

## Current — 2026091231 Range telemetry-only + sticky admin navigation

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage (2026091225)
- [x] MD5-addressed IPA metadata persistence independent of OpenList account/path (2026091226)
- [x] Persisted reconciliation, 100-row pagination, collapsible multi-drive UI and Alias setup guide (2026091227)
- [x] API scheduling, persistent per-drive snapshots, targeted refresh and Range telemetry (2026091228)
- [x] Replica integrity classification + source-priority sync planning + stale-plan protection (2026091229)
- [x] Fix Range summary NaN, make scheduler configurable, restore persisted replica preview schema (2026091230)
- [x] Remove the fixed 10/hour and 150/day Range Parser attempt caps
- [x] Keep Range request count / real-read byte telemetry without using it as a quota gate
- [x] Keep parser single-concurrency and existing schedule/per-run validation (5–1440 minutes, 1–20 IPA/run)
- [x] Show plain Range totals instead of `x/10`, `x/150` and remove the remaining-quota UI
- [x] Remove budget-blocked wording/progress from metadata jobs
- [x] Make the desktop admin left sidebar sticky for long pages
- [x] Preserve the existing fixed mobile bottom navigation with explicit CSS reset of desktop sticky properties
- [x] Preserve 1230 persisted replica preview restore and 30-minute per-drive snapshot behavior
- [x] Add contracts for telemetry-only Range usage, no global quota gating and sticky admin navigation
- [x] 2026091231 functional Actions #156 / run `34852734004` passed validation/build/package jobs
- [x] 2026091231 release Actions #157 / run `34853328149` passed validation/build/package jobs and produced the deployment artifact
- [ ] Deploy 2026091231 to real BaoTa
- [ ] Save a non-default schedule and confirm it survives reload without server error
- [ ] Confirm Range summary shows plain hourly/day totals and no `/10`, `/150`, “剩余额度” or “预算拦截”
- [ ] Confirm parsing continues above the former hourly/daily thresholds and still remains sequential
- [ ] Scroll a long desktop admin page and confirm the left menu remains visible
- [ ] Recheck 1230 replica preview persistence and 30-minute snapshot hits
- [ ] Continue 1229 real integrity verification: known-MD5 `verified`, mismatch detection, source-priority selection and stale-plan rejection
- [ ] Continue real Alias load-balancing, account-switch, copy/rename/quarantine E2E
- [ ] Next feature phase: asynchronous copy-task lifecycle and operation audit history
- [ ] Consider controlled preview/batch migration of MySQL `bt1a` from physical URLs to Alias URLs only after Alias E2E is proven

## Production observation behind 1231

The administrator observed that a typical IPA parse usually uses about 2 Range requests and only `0.x MB` of real data. That makes request/byte telemetry and concurrency more meaningful controls than the previous fixed parse-attempt quotas. 1231 therefore removes the 10/hour and 150/day gates while preserving sequential parsing and measured Range traffic.

## Important scheduler rule

The recommended default remains 15 minutes / 1 IPA, but it is only a default. Administrators may choose 5–1440 minutes and 1–20 IPA per run, and those saved values are now authoritative. There is no longer a separate hourly/daily parser-attempt quota shrinking the run.

## Important Range telemetry rule

`openlist-range-usage.json` still records attempts, success/failure, Range request count and bytes read. The admin UI shows current-hour/day totals and real traffic. These counters are observability data only; they do not block parsing.

## Important replica cache rule

The reconciliation result file and per-drive directory snapshots remain separate layers. 1230 fixed reconciliation-result persistence by preserving `replicaSchemaVersion`; fresh per-drive snapshots still use a 30-minute TTL and targeted refresh behavior.

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
- `2026091228`: API scheduling, persistent per-drive snapshots, targeted refresh, Range telemetry and core MD5 pre-parse reuse; CI passed; real traffic profile partially observed.
- `2026091229`: replica integrity classification + source-priority sync planning + stale-plan protection; CI passed; production E2E pending.
- `2026091230`: Range summary rendering + scheduler configurability + replica preview persistence hotfix; CI passed.
- `2026091231`: fixed global Range quotas removed, telemetry-only usage view, sticky desktop admin sidebar; release CI #157 passed; real BaoTa recheck pending.