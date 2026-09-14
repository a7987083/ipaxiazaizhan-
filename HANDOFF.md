# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091232`
- Baseline: `2026091231` / `3a8f6dd63b1cee43bf2e3e70454b4ba5dfa35392`
- Functional head before documentation sync: `84501078d2238080bc7ca32e97599f21e5992c66`
- Latest Actions: run `34875645903` / run #14 = `startup_failure`, with no jobs created.
- Deployment artifact: none for 1232 yet.
- Real BaoTa/OpenList 1232 E2E: pending.

## What 1232 changes

1. OpenList `/api/fs/copy` acceptance is no longer treated as copy completion. Every planned copy is persisted in `CONTROL_DIR/openlist-replica-operations.json` and tracked through `submitted / waiting / verifying / success / failed / timeout`.
2. The copy verifier starts with the API service, resumes unfinished work after restart, runs serially every 15 seconds and supports an explicit admin “立即核验复制任务” action.
3. Target verification prefers MD5. If the target driver does not expose MD5, the result is explicitly downgraded to size-only verification; when no expected comparator exists, the UI labels presence-only confirmation instead of pretending MD5 verification happened.
4. A copy that never appears reaches timeout after 10 minutes. MD5/size mismatches are surfaced as failures rather than being counted as success.
5. Sync-plan SHA-256 now includes source/target roots plus expected MD5/size, so a stale plan is rejected when expected content or copy roots change.
6. Copy submission returns a tracking batch ID. The admin now has a dedicated “副本任务” page showing recent batches, per-IPA state, verification result, actual MD5/size, attempts and operation audit.
7. Copy verification, target refresh, rename and quarantine actions are written to the operation audit. Tokens, raw URLs and IPA direct-download URLs are not stored in the audit file.
8. When a batch reaches a terminal state, ZONOE invalidates and refreshes only the affected target drives. A batch where every copy submission failed now has no target-refresh list and is not scheduled for a pointless refresh.
9. Existing 1229 integrity/source-priority/stale-plan rules, 1230 reconciliation persistence/30-minute drive snapshots, and 1231 Range telemetry-only/scheduler/sidebar behavior remain intact.

## Verification state

The source and contract coverage for 1232 are committed, including tests for MD5 verification, mismatch handling, timeout, no-hash size fallback, lifecycle status aggregation, restart-resume wiring, tracking APIs/UI, plan binding, and failed-only batches not scheduling target refresh.

GitHub Actions is **not green or red at the test level yet**. For every 1232 push GitHub creates a workflow run and immediately ends it as `startup_failure` before any job exists. Latest observed run: `34875645903`; job list is empty, so integration tests, production build, smoke tests and package jobs have not executed. A retry request for the startup-failed run is also rejected by GitHub. Treat this as an external CI-startup blocker, not as a source-test result.

## Required next steps

1. Restore GitHub Actions so a workflow job can actually start, then require the normal integration/build/smoke/BaoTa/package pipeline to pass before calling 1232 release-ready.
2. Confirm a 1232 deployment package is produced and validated; do not reuse the 1231 artifact as proof for 1232.
3. Deploy to real BaoTa/OpenList and execute only a small safe 1–5 IPA copy plan.
4. Confirm the admin task lifecycle progresses from submission to a terminal state and the target file is checked by MD5 when the provider exposes it.
5. Restart the Node service while a safe copy is pending and confirm unfinished operations resume from the persisted operation store.
6. Confirm terminal batches refresh only their actual target drives; a failed-only submission batch must not trigger target refresh.
7. Confirm audit entries exist for copy batch, copy verification, target refresh, rename and quarantine, and that no secret token/raw URL is persisted.

Alias load balancing, controlled mismatch remediation and MySQL `bt1a` -> Alias migration remain later production phases; 1232 does not mass rewrite download URLs or automatically overwrite mismatch targets.
