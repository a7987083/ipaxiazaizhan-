# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091229`
- Baseline: `2026091228` / `53c925fb74508da32ba97d1f530d9d3405d5883b`
- Candidate CI: pending
- Real BaoTa/OpenList 1229 verification: pending

## What 1229 changes

1. Replica reconciliation no longer treats “same path exists” as automatically healthy. Every expected IPA now gets one of five states per drive: `verified`, `missing`, `md5_mismatch`, `size_mismatch`, or `unverified`.
2. `verified` requires matching MD5 when an expected MD5 is known, with known-size compatibility. If the expected/actual hash is unavailable, the copy remains `unverified` rather than being silently called normal.
3. MD5/size mismatches are shown separately in the admin UI and are never used as automatic copy sources. They are also not automatically overwritten by the missing-copy flow.
4. The persisted reconciliation schema is bumped to v2. An old 1228 preview is intentionally ignored by the manager until a fresh 1229 reconciliation is produced; existing per-drive directory snapshots remain reusable.
5. Copy is now a two-step operation. `POST /openlist/replicas/sync-plan` generates a read-only plan, including every `IPA: source drive -> target drive` action. Nothing is copied until the admin explicitly confirms the plan.
6. Each plan has a SHA-256 `planHash`. Execution recomputes the plan from the current reconciliation/config and rejects a stale plan with `REPLICA_PLAN_CHANGED` if source/target choices changed.
7. Source priority is persisted using the order of selected physical mounts in `openlist-replicas.json`. The admin UI can move drives up/down. Within the same integrity class, earlier drives are preferred.
8. Safety overrides preference: a verified source always outranks an unverified source, even if the unverified drive is higher in the configured order. MD5/size mismatch copies are never eligible sources.
9. Per-target planning remains supported, so an admin can preview/execute only the missing copies for one writable drive.
10. 1228 request throttling, 30-minute per-drive snapshots, target-only snapshot invalidation, Range budgets/telemetry, MD5 metadata reuse, Alias UX and quarantine behavior remain unchanged.

## Candidate verification

New/updated tests cover:
- integrity state classification;
- same-path wrong-MD5/wrong-size detection;
- verified-source preference over unverified source;
- configured source order within the same integrity class;
- mismatch targets blocked from automatic overwrite;
- deterministic sync-plan hashes and target filtering;
- admin UX contract for source priority, plan preview and integrity warnings.

CI has not yet been claimed for this candidate. Do not mark 1229 production-ready until the branch workflow is green.

## Recommended real validation after CI

Deploy 2026091229 and run one forced reconciliation. Confirm each drive shows separate counts for verified/unverified/integrity-error/missing/extra. Pick one known IPA with MD5 and compare at least two drives. Then use “预览补齐计划（20 个）” and confirm the UI shows exactly which drive supplies each target. Change drive priority, save, reconcile, and verify same-integrity sources follow the new order. Do not intentionally corrupt production files merely to test mismatch handling; use a known existing mismatch or a disposable test path if needed.

The 1228 API scheduling/Range hardening remains active. Real Alias distribution, account-switch, cross-storage copy/rename/quarantine and dynamic MySQL write-back still remain separate production-verification items unless already tested.
