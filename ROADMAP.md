# Roadmap

## Current — 2026091226 Account-independent IPA metadata persistence

- [x] Public IPA metadata discovery / Bundle ID search / target-iOS filters (2026091221)
- [x] 中文站点设置、本地缓存、动态数据库同步规则（2026091222–1224）
- [x] OpenList multi-drive reconciliation/copy/rename/quarantine + Alias coverage (2026091225)
- [x] Diagnose account-switch parse loss: old parse identity was bound to `apiPath`
- [x] Add persistent MD5-addressed parsed metadata library independent of OpenList account/mount/path/download URL
- [x] Use known file size as a secondary guard before MD5 metadata reuse
- [x] Migrate valid current v3 path cache into the MD5 library before the OpenList scheduler starts
- [x] Block stale `parsedMd5`, failed parses and missing files from entering the persistent library
- [x] Re-associate current files with persisted parse metadata when MD5 matches
- [x] Invalidate OpenList directory cache at service startup and after OpenList configuration changes
- [x] Admin cache page shows MD5 library count and storage size
- [x] Explicit IPA-cache clear also clears persistent MD5 metadata library
- [x] Contract tests cover same IPA at a new account/path, different-MD5 rejection, size conflict rejection and stale/failed exclusion
- [x] 2026091226 Actions #103 / run `34787233314` passed functional/version validation and package build
- [ ] Deploy 2026091226 to real BaoTa
- [ ] Verify existing parse library migration before changing account again
- [ ] Real test: same IPA MD5 under a different OpenList account/path restores Bundle ID/version/Build after MD5-only scan
- [ ] Real test: changed IPA MD5 remains pending and never inherits old metadata
- [ ] Verify directory listing refresh after account/token change
- [ ] Continue 1225 real multi-drive copy/rename/quarantine/Alias validation
- [ ] Follow-up hardening: consult the MD5 library inside the core scan before parse candidate selection so even an immediate `parseLimit>0` account-switch scan cannot perform redundant parsing

## Recovery note

A pre-1226 parse result that was already overwritten after an account/path switch cannot be reconstructed from ZONOE if no external copy of the old `openlist-ipa-cache.json` exists. It must be parsed once again. 1226 prevents future account/path changes from losing a successfully persisted MD5 result.

## Stable baselines

- `2026091219`: real BaoTa Native/online-update chain verified.
- `2026091220`: IPA parse-results explorer; CI passed.
- `2026091221`: public IPA metadata discovery; CI passed.
- `2026091222`: controlled IPA write-back + admin tools; CI passed.
- `2026091223`: Preview visibility hotfix; CI passed.
- `2026091224`: admin download URLs + dynamic DB sync rules; CI passed; real runtime/write-back pending.
- `2026091225`: OpenList multi-drive replica management; CI passed; real multi-drive E2E pending.
- `2026091226`: content-addressed IPA parse persistence across account/path changes; CI passed; real account-switch E2E pending.
