# Known Issues

## 2026091232 candidate

- 1232 source implementation is committed, but GitHub Actions is currently blocked before test execution. The latest checked run `34875645903` ended `startup_failure` and created zero jobs. Therefore integration tests, production build, smoke/contracts, package validation and artifact upload are **not** currently proven for the 1232 tree.
- Retrying the startup-failed workflow run is rejected by GitHub. This is treated as an external CI-startup blocker, not as a passing or failing source-test result.
- There is no valid 1232 deployment artifact yet. The existing 1231 artifact must not be presented as a 1232 build.
- OpenList `/api/fs/copy` may be asynchronous. 1232 fixes the previous visibility gap by persisting copy lifecycle state and independently verifying the target; however this new lifecycle still requires real OpenList provider E2E before production verification.
- Copy verification prefers expected/actual MD5 equality. If a target driver does not return MD5, 1232 explicitly downgrades success to size-only verification when size is comparable; when neither expected MD5 nor expected size is comparable, only file-presence confirmation is possible.
- Missing target files time out after 10 minutes. A provider whose asynchronous copy routinely exceeds this window would produce a timeout that needs operator review; 1232 does not automatically retry the original copy submission after timeout.
- MD5/size mismatch targets remain blocked from automatic overwrite. 1232 observes and audits copy results but does not yet implement controlled mismatch remediation. The planned later flow is explicit quarantine -> refill from a verified source -> re-verify, with no permanent delete.
- Target-drive refresh is intentionally scoped. Only batches with at least one copy request actually accepted by OpenList retain target storage IDs for post-batch refresh; a failed-only batch is audited as failed and does not schedule a pointless target refresh.
- The operation store is bounded to recent history (200 batches / 2000 operations / 2000 audit events). It is an operational audit trail, not an unlimited compliance archive.
- Changing OpenList URL/token changes the replica scope. Pending tasks from an old scope are failed/skipped rather than verified against the new account.
- The plan hash now binds relative path, source/target IDs and roots, source verification state, expected MD5 and expected size. It still represents the planned action set; it does not prove a provider-side copy has finished.
- Existing 1229 integrity verification remains only as strong as expected metadata. If expected MD5 is unavailable, a pre-existing replica remains `unverified` unless a known size mismatch can be detected.
- 1230 reconciliation preview persistence and the independent 30-minute per-drive snapshot cache remain active. “强制刷新全部” and “只刷新这个盘” intentionally bypass the relevant snapshot; OpenList storage/mount discovery still calls the admin storage API when manager state loads.
- 1231 metadata parsing remains single-concurrency. The former 10/hour and 150/day hard attempt quotas stay removed; Range attempt/request/byte data remains telemetry only. Production should still monitor request frequency, bytes, 403/429 and provider-specific errors.
- ZONOE still does not automatically create/modify OpenList Alias or rewrite MySQL `bt1a` to Alias paths. Direct physical URLs continue to bypass Alias load balancing.
- Real BaoTa/OpenList checks still pending include: 1231 scheduler/Range/sidebar recheck, 1230 preview/snapshot reuse, 1229 known-MD5 integrity/source priority/stale-plan behavior, and new 1232 copy lifecycle/restart/verification/target-refresh/audit behavior.
