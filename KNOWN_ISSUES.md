# Known Issues

## 2026091231 candidate

- Functional Actions #156 / run `34852734004` passed source tests, production build, smoke/contracts, deployment package validation and artifact upload. Final CI after the version/docs commit is still pending; real BaoTa/OpenList 1231 behavior is not yet claimed as verified.
- The old fixed Range Parser limits of 10 parse attempts/hour and 150/day are removed in 1231. The usage store is telemetry-only and no longer returns or enforces remaining quota.
- Scheduled parsing still validates interval 5–1440 minutes and per-run count 1–20. Manual parsing still uses the existing API per-run maximum. These per-run bounds are not the removed hourly/daily quota.
- Parsing remains single-concurrency sequential. 1231 intentionally does not add parser parallelism; this keeps request bursts controlled while allowing the administrator's saved schedule to run without a second hidden quota.
- Range request counts and real bytes read are still persisted. Production should continue watching request frequency, bytes, 403/429 and provider-specific errors before increasing schedule aggressiveness substantially.
- The Range usage UI now displays plain `本小时` and `今日` parse totals plus `今日 Range 请求` and `今日真实读取`. `/10`, `/150`, “剩余额度” and “预算拦截” are intentionally removed.
- Desktop admin navigation uses `position: sticky`, full viewport height and its own vertical overflow. On mobile the existing fixed bottom navigation overrides `top/height/overflow/align-self` so the desktop rule must not leak into the mobile layout.
- 1230's replica preview persistence fix remains active. A preview produced by buggy 1229 can still require one fresh reconciliation because it lacked `replicaSchemaVersion`; once rebuilt, navigation/reload persistence should work.
- Per-drive directory snapshots still expire after 30 minutes. “对账（优先快照）” should reuse fresh snapshots; “强制刷新全部” and “只刷新这个盘” intentionally bypass the relevant snapshot cache.
- The OpenList storage/mount discovery list itself is still requested from the OpenList admin API when the replica manager state is loaded. The high-cost IPA tree is the part protected by persisted per-drive snapshots.
- Integrity verification is only as strong as the expected metadata available to ZONOE. When the metadata cache has a valid expected MD5, equal MD5 is authoritative; when comparable MD5 is unavailable, the file remains `unverified`.
- MD5/size mismatch files remain blocked from automatic source selection and are not automatically overwritten. Controlled mismatch remediation is still a future workflow.
- Sync-plan execution still recomputes the SHA-256 `planHash`; if source/target choices changed, `REPLICA_PLAN_CHANGED` requires a new preview.
- OpenList cross-storage copy may be asynchronous after `/api/fs/copy` accepts a task. A successful submission still does not prove target bytes have finished transferring.
- Real BaoTa/OpenList verification is still required for 1231 schedule persistence, parsing above the former thresholds, Range totals, sticky desktop navigation, 1230 replica preview restore/snapshot hits, 1229 integrity/source-priority behavior, Alias load balancing and copy/rename/quarantine E2E.
- ZONOE still does not automatically create/modify OpenList Alias or rewrite MySQL `bt1a` to Alias paths. Direct physical URLs continue to bypass Alias load balancing.