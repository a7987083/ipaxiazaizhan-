# OpenList IPA Metadata Sync

Version 2026091212 adds an admin-only OpenList metadata synchronizer.

It reads `fa_category.bt1a` only inside the synchronization path, maps matching OpenList public URLs to the configured token-scoped API path, batches `/api/fs/list`, and compares provider MD5 before any IPA content is read.

Only new or changed files are eligible for IPA parsing. Parsing uses HTTP Range reads to extract `Payload/*.app/Info.plist`; each manual run is capped, and each parse has a 16 MB total Range-read safety limit.

Secrets are stored encrypted under `data/control/openlist.json`. Cache data is stored under `data/control/openlist-ipa-cache.json`. Neither OpenList token nor `raw_url` is returned by public APIs.
