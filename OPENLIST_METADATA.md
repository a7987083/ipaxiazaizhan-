# OpenList IPA Metadata Sync

Version 2026091220 keeps the admin-only OpenList metadata synchronizer, asynchronous background jobs, real-time progress, the 30-minute directory-list cache, scheduled parsing, and the admin-only missing-file inspector. It also adds a paginated parse-results explorer and source-vs-IPA audit view.

The synchronizer reads `fa_category.bt1a` only inside the private synchronization path, maps matching OpenList public URLs to the configured token-scoped API path, batches `/api/fs/list`, and compares provider MD5 before any IPA content is read. Public catalog APIs still do not query or return `bt1a`.

Manual scans now return immediately and continue in the API process. The Admin page polls task state and shows MySQL-read progress, OpenList directory progress, cache hits, MD5 results, and IPA parse progress. A stale queued/running task is marked interrupted after a service restart.

OpenList directory listings are cached for 30 minutes under `data/control/openlist-directory-cache.json`. Manual “MD5 scan” forces a fresh listing; parse-only runs and scheduled runs reuse the cache while it is fresh.

Scheduled parsing supports an interval from 5 to 1440 minutes and 1 to 20 IPA files per run. The conservative Tianyi Cloud starting recommendation is every 10 minutes / 3 IPA files. Failed IPA parses wait 30 minutes before another attempt.

Missing OpenList files are cached with their private MySQL reference information (source, legacy ID, name, version, `bt1a`, database size, expected OpenList path) and are visible only from authenticated Admin APIs/UI.

Only new or changed files are eligible for IPA parsing. Parsing uses HTTP Range reads to extract `Payload/*.app/Info.plist`; each parse keeps the existing Range-read safety limits. OpenList tokens stay encrypted in `data/control/openlist.json`, and `raw_url` is never persisted or returned to the frontend.


## 2026091220 parse-results explorer

After each scan, the cache stores a safe `appRefs` index with source slug/name, legacy ID, App name/version, database size, and the internal OpenList API path. The safe index deliberately excludes `bt1a` / download URLs, OpenList tokens, and `raw_url`.

Authenticated Admin can browse `/api/v1/admin/openlist/results` with pagination, search, and filters for parsed, pending, failed, or mismatched entries. The result view compares the MySQL source version and size against the parsed IPA package version and actual OpenList size. Version differences are exact non-empty comparisons; size differences are flagged only when they exceed the larger of 1 MiB or 1% of the actual IPA size.

Caches created before 2026091220 remain readable. Until the next MD5 scan populates `appRefs`, the results endpoint falls back to file-level/App-key information and reports that a rescan is recommended.
