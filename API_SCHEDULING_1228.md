# 2026091228 OpenList API Scheduling / Cache Hardening

## Goal

Reduce unnecessary ZONOE → OpenList calls and tightly bound the requests that bypass OpenList directory cache and touch a real IPA `raw_url`.

## Directory listing

- Metadata directory scans now call `/api/fs/list` with `page:1, per_page:0, refresh:false`.
- Replica scans also use `per_page:0, refresh:false` once per directory instead of 500-row pagination.
- Metadata listing keeps the existing 30-minute ZONOE directory cache.
- The metadata cache identity now includes a SHA-256 fingerprint of the OpenList token, so changing account/token cannot reuse a previous account's directory cache.

For a flat directory with about 7,271 IPA files this changes a ZONOE scan from roughly 15 `/api/fs/list` requests to one request. Nested directories still require one request for each directory visited.

## Replica snapshots

- New persistent file: `CONTROL_DIR/openlist-replica-snapshots.json`.
- Snapshot TTL: 30 minutes per `storageId + rootPath`.
- Normal reconciliation uses a fresh snapshot when available.
- Admin can force-refresh all drives or only one drive.
- Copy invalidates only target-drive snapshots.
- Rename/quarantine invalidate and refresh only affected drives.
- Batch mkdir calls are deduplicated within one operation.
- Persisted reconciliation continues to live in `openlist-replica-preview.json`.

The admin page displays OpenList request count, snapshot hits and actual drive rescans for the latest reconciliation.

## Range Parser budget

`raw_url` access is treated separately from OpenList directory cache.

- Parser stays single-concurrency because the metadata task parses sequentially.
- Effective scheduled parsing is no faster than 1 IPA every 15 minutes.
- Hard budget: at most 10 parse attempts in a rolling hour and 150 attempts per UTC day.
- Usage is persisted in `CONTROL_DIR/openlist-range-usage.json`.
- Python now reports both `range_bytes` and `range_requests`, including partial metrics on parser errors.
- Admin UI shows hourly/daily attempts, real Range request count and bytes read.
- The 16 MiB per-IPA safety ceiling is intentionally unchanged until real usage data shows a lower ceiling is safe.

## MD5 deduplication

The core metadata sync now consults `openlist-ipa-metadata-library.json` before selecting Range parse candidates. If an IPA has a known MD5 and compatible size, parsed metadata is reused immediately. During one task, duplicate copies with the same MD5 are parsed once and the successful metadata is applied to other matching copies.

## Background reconciliation

The separate metadata-persistence guard is reduced from once per second to once every 30 seconds. Core sync now performs MD5 reuse itself, so this timer is only a reconciliation safety net.

## CI / verification

Functional candidate commit: `af40fecd1dc6049788673389fbc16dd1046fe94e` (VERSION `2026091228`).

Actions #135 / run `34825687295` completed successfully. Validation passed Integration tests, Production build, Native API smoke, Native frontend static smoke, Shell validation, BaoTa native contract, MySQL multi-source contract, GitHub updater contract and legacy Docker compose syntax. Package/release job also completed successfully.

Real BaoTa/OpenList verification is still required before claiming production behavior: inspect actual request counts on a 7,000+ file drive, verify snapshot hits, verify single-drive refresh, observe Range byte/request metrics, and confirm the hourly/daily budget blocks excess parsing.
