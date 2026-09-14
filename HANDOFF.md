# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091228`
- Baseline: `2026091227` / `3b9e769f8f85cbd7f930ec9a577609c426bea573`
- Functional/test commit: `23d44dda05de0e170cb5dda69be16d1b2db205c6`
- Version commit: `af40fecd1dc6049788673389fbc16dd1046fe94e`
- Functional CI: Actions #135 / run `34825687295` completed successfully.
- Real BaoTa/OpenList request-profile verification: pending.

## What 1228 changes

1. Metadata and replica directory scans now use OpenList `/api/fs/list` with `per_page:0` and `refresh:false`, eliminating 500-row pagination. A flat 7,271-file directory normally changes from about 15 ZONOE→OpenList list calls to one call.
2. Metadata directory cache remains 30 minutes and now includes a SHA-256 fingerprint of the OpenList token in its scope identity, preventing an account/token change from reusing another account's cached listing.
3. New persistent per-drive replica snapshots live at `CONTROL_DIR/openlist-replica-snapshots.json` with a 30-minute TTL. Normal reconciliation reuses them; admin can force-refresh all drives or only one drive.
4. Replica copy no longer starts with an unconditional all-drive rescan. It uses the latest valid reconciliation/snapshots, invalidates only target-drive snapshots, and tells the admin to refresh only those targets after OpenList background copy finishes.
5. Rename and quarantine validate against the latest usable reconciliation, then invalidate and refresh only affected drives rather than scanning every drive before and after each action.
6. Batch destination-directory creation is deduplicated within the operation so 20 files going to the same directory do not repeatedly issue the same mkdir chain.
7. Replica UI shows OpenList request count, snapshot hits, actual drive rescans, snapshot age, “只刷新这个盘”, and “补齐此盘缺失（20 个）”.
8. Range Parser now reports both `range_bytes` and `range_requests`; partial metrics are also returned on parser errors.
9. Range usage is persisted at `CONTROL_DIR/openlist-range-usage.json`. Hard limits are 10 parse attempts per rolling hour and 150 per UTC day. Scheduled parsing is effectively no faster than one IPA every 15 minutes and remains sequential/single-concurrency.
10. Core metadata sync consults the MD5 metadata library before parse candidate selection. Same-MD5 copies reuse metadata immediately; within one task a successful parse is propagated to other same-MD5 copies instead of re-reading each raw URL.
11. The legacy one-second metadata-persistence reconciliation loop is reduced to 30 seconds because core sync now performs immediate MD5 reuse itself.
12. The 16 MiB per-IPA Range ceiling is intentionally unchanged until real request/byte telemetry shows a lower ceiling is safe.

## CI verification

Actions #135 / run `34825687295` passed:
- Integration tests
- API scheduling / Range budget contract tests
- replica reconciliation contracts
- account-switch regression contracts
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- Legacy Docker compose syntax
- deployment package build/validation

This is source/build/contract verification only. Real BaoTa/OpenList traffic behavior is not yet claimed as production-verified.

## Recommended real validation

Deploy 2026091228. First force-refresh all selected replica drives once to seed fresh snapshots. Immediately run a normal reconciliation and confirm most/all drives show snapshot hits and the OpenList request count drops sharply. Then use “只刷新这个盘” on one drive and verify only that drive reports a real rescan. Submit a small cross-storage copy and verify only target snapshots are invalidated.

For metadata, run the cached MD5 scan first. Parse one IPA and confirm the admin page records both Range requests and bytes. Verify same-MD5 copies do not parse again. Do not lower the 16 MiB per-file ceiling until enough real samples exist. Finally verify the 10/hour and 150/day guards stop additional raw-url parsing when exhausted.

The 1226 MD5-addressed account-switch protection and 1227 persisted reconciliation/Alias UX remain active. Real Alias load-balancing, real account-switch reuse, and real cross-storage copy/rename/quarantine E2E remain pending unless separately verified on the production server.
