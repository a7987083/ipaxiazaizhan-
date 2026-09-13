# OpenList Account Switch Metadata Fix — 2026091226

## Root cause

2026091225 and earlier treated the OpenList `apiPath` as the identity of an IPA parse result. During synchronization the active `files` map was rebuilt from the currently referenced paths and old metadata was recovered only from `old.files[apiPath]`. Changing a cloud account, mount, Alias path, or download path could therefore make the same IPA appear to be a new file and the old parsed metadata would disappear from the active result library.

The OpenList directory-list cache was also scoped by URL/path only. A token/account change on the same OpenList host could temporarily reuse a directory listing created by the previous account.

## 2026091226 behavior

Parsed IPA metadata is additionally persisted in `CONTROL_DIR/openlist-ipa-metadata-library.json`, keyed by normalized MD5 rather than OpenList path/account. Only a current successful parse is promoted: stale `parsedMd5`, failed parse records and missing files are not promoted. Known file size is stored as a defensive second check.

On service startup the current v3 path cache is migrated into this MD5 library before the OpenList scheduler starts. After a scan/account/path change, a current file with the same MD5 and compatible size can recover its package name, package version, Build, Bundle ID, MinimumOSVersion and executable without depending on the old path.

OpenList directory-list cache is invalidated once on service startup and again whenever the saved OpenList configuration changes, so a new token/account does not inherit the previous account's directory listing.

The admin cache page shows the MD5 library entry count and size. Explicitly choosing “清空 IPA 解析缓存” or “清空全部缓存” clears both the active path cache and persistent MD5 metadata library.

## Recovery limitation

If an older version already synchronized after the account switch and overwrote the only old path-bound `openlist-ipa-cache.json`, ZONOE has no historical copy from which to reconstruct those already-lost parse records. Those entries require one new parse. Once parsed under 2026091226, the result is retained by MD5 for future account/path changes.

## Real validation

After deployment, first run a MD5-only scan (`parseLimit=0`) on the current account. Verify `MD5 解析库` is populated. Switch to another account containing the same IPA bytes, run another MD5-only scan, wait for reconciliation, and verify the same Bundle ID/version/build reappears. Then replace one IPA with a genuinely different MD5 and verify it becomes pending instead of inheriting the old metadata.
