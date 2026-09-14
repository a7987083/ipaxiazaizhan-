# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091232`
- Baseline: `2026091231` / `3a8f6dd63b1cee43bf2e3e70454b4ba5dfa35392`
- Functional head before documentation sync: `9aacafbcc98c5dac3f326516021c8a3cc3165a63`
- GitHub Actions: run `34878831197` / run #162 on workflow `356290327` = success.
- Deployment artifact: `zonoe-ipa-download-2026091232-baota-native-build` / artifact id `10362077299` / sha256 `4003f223c5ffc5d4971bec63374ee831efab2587c95fc8b386b53e76914bd69c`.
- GitHub Release publish: skipped by workflow condition; do not claim a Release object was published.
- Real BaoTa/OpenList 1232 E2E: pending.

## What 1232 changes

1. OpenList `/api/fs/copy` acceptance is no longer treated as copy completion. Every planned copy is persisted in `CONTROL_DIR/openlist-replica-operations.json` and tracked through `submitted / waiting / verifying / success / failed / timeout`.
2. The copy verifier starts with the API service, resumes unfinished work after restart, runs serially every 15 seconds and supports an explicit admin “立即核验复制任务” action.
3. Target verification prefers MD5. If the target driver does not expose MD5, the result is explicitly downgraded to size-only verification; when no expected comparator exists, the UI labels presence-only confirmation instead of pretending MD5 verification happened.
4. A copy that never appears reaches timeout after 10 minutes. MD5/size mismatches are surfaced as failures rather than being counted as success.
5. The mismatch confirmation window is independent from submission age. `mismatchSince` is persisted when a mismatch is first observed, and the 30-second consistency grace is counted from that first observation. A late-appearing target therefore is not failed immediately just because `/api/fs/copy` was submitted more than 30 seconds earlier. A later verified result clears the mismatch marker.
6. Sync-plan SHA-256 includes source/target roots plus expected MD5/size, so a stale plan is rejected when expected content or copy roots change.
7. Copy submission returns a tracking batch ID. The admin has a dedicated “副本任务” page showing recent batches, per-IPA state, verification result, actual MD5/size, attempts and operation audit.
8. Copy verification, target refresh, rename and quarantine actions are written to the operation audit. Tokens, raw URLs and IPA direct-download URLs are not stored in the audit file.
9. When a batch reaches a terminal state, ZONOE invalidates and refreshes only the affected target drives. A batch where every copy submission failed has no target-refresh list and is not scheduled for a pointless refresh.
10. Existing 1229 integrity/source-priority/stale-plan rules, 1230 reconciliation persistence/30-minute drive snapshots, and 1231 Range telemetry-only/scheduler/sidebar behavior remain intact.

## CI verification

Run `34878831197` on functional head `9aacafbcc98c5dac3f326516021c8a3cc3165a63` entered the real `.github/workflows/ci-release.yml` workflow and completed successfully. The `validate` job passed Integration tests, Production build, Native API smoke, Native frontend static smoke, Shell validation, BaoTa native contract, MySQL multi-source contract, GitHub updater contract and Legacy Docker compose syntax. The `package-and-release` job passed package build, release metadata validation, package validation and artifact upload. The GitHub Release publish step was skipped. `release-e2e` was also skipped by workflow condition.

The produced artifact is `zonoe-ipa-download-2026091232-baota-native-build`, artifact id `10362077299`, size `628946` bytes, digest `sha256:4003f223c5ffc5d4971bec63374ee831efab2587c95fc8b386b53e76914bd69c`, expiring `2026-10-14T18:07:38Z`.

Earlier 1232 pushes had been routed to a synthetic `BuildFailed` workflow and terminated at `startup_failure` before jobs were created. That condition did not reproduce on run #162; the real workflow ran normally and passed. Treat the earlier startup failures as historical CI-startup incidents, not as source-test failures.

## Required real verification

1. Deploy the 1232 artifact to real BaoTa/OpenList and confirm backend/frontend report `2026091232`.
2. Submit only a safe 1–5 IPA copy plan and confirm the admin lifecycle progresses from submission to a terminal state.
3. Confirm a target with MD5 is completed only after MD5 equality; for providers that omit target MD5, confirm the UI explicitly shows the weaker size-only result.
4. Exercise a disposable mismatch case without corrupting production data. Confirm the first mismatch starts a fresh 30-second grace window even when the copy request is older than 30 seconds, then becomes failed only if the mismatch persists.
5. Restart the Node service while a safe copy is pending and confirm unfinished operations resume from the persisted operation store.
6. Confirm terminal batches refresh only drives that actually accepted copy work; a failed-only submission batch must not trigger target refresh.
7. Confirm audit entries exist for copy batch, copy verification, target refresh, rename and quarantine, and that no secret token/raw URL is persisted.

Alias load balancing, controlled mismatch remediation and MySQL `bt1a` -> Alias migration remain later production phases; 1232 does not mass rewrite download URLs or automatically overwrite mismatch targets.
