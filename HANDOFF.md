# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091226`
- Baseline: `2026091225` / `7bef576f3b31b0f15fdba6772ad6d0f0ee76c371`
- Functional code commit: `1008c0e11e09ead575aad2b777786ced5e3253a6`
- Version commit: `a7262971801696849f068527f8b0f48c115a2337`
- Functional/version CI: Actions #103 / run `34787233314` passed all executed validation/package steps.
- Real BaoTa/OpenList account-switch validation: pending.

## Root cause fixed in 1226

1225 and earlier stored the effective parse result under `openlist-ipa-cache.json -> files[apiPath]`. A synchronization rebuilt the active file map from the current MySQL/OpenList paths and recovered old parsing only through the same `apiPath`. Switching cloud account, mount, Alias layout or download path could therefore make identical IPA bytes appear new and the old parsed result disappear.

The directory-list cache also did not distinguish account/token identity when the OpenList URL/path stayed the same, so an account switch could briefly reuse a previous account's directory listing.

## What 1226 changes

1. Adds `CONTROL_DIR/openlist-ipa-metadata-library.json`, a persistent parsed-metadata library keyed by normalized MD5, with file size as a defensive secondary guard.
2. Stores only safe parse fields: package name/version/Build, Bundle ID, MinimumOSVersion and executable. No OpenList token, `raw_url` or download URL is stored in this library.
3. On service startup, valid current v3 cache entries are migrated into the MD5 library before the OpenList scheduler starts.
4. Current files whose account/path changed can recover prior parsed metadata from the MD5 library when MD5 matches and known size does not conflict.
5. Stale `parsedMd5`, parse failures and missing files are not promoted into the MD5 library.
6. OpenList directory cache is invalidated once on service startup and whenever saved OpenList configuration changes, preventing the previous account's directory listing from being reused.
7. Admin → 本地缓存 now displays MD5 library entry count/size.
8. Explicit “清空 IPA 解析缓存” or “清空全部缓存” clears both active path cache and the persistent MD5 library. It never deletes OpenList IPA or MySQL data.

## Recovery limitation

If the user already changed accounts under an older version and a later sync overwrote the only old path-bound `openlist-ipa-cache.json`, those already-lost parse records are not recoverable from ZONOE itself because no historical library existed yet. They need one new parse. After they are parsed once under 1226, future account/path changes can reuse them by MD5.

## Verification

Actions #103 / run `34787233314` passed Integration tests, the new account-switch metadata contracts, Production build, Native API smoke, Native frontend static smoke, Shell validation, BaoTa native contract, MySQL multi-source contract, GitHub updater contract and deployment package validation/upload. `release-e2e` remains skipped by workflow condition.

## Recommended real test

Deploy 1226. First confirm Admin → 本地缓存 shows a non-zero `MD5 解析库` count; if old entries were already lost, reparse those once. Run an MD5-only scan (`parseLimit=0`) on account A. Switch to account B / another mount containing identical IPA bytes, save OpenList config and run another MD5-only scan. After the task completes, the same-MD5 App should regain Bundle ID/version/Build without relying on the old path. Finally replace one test IPA with different bytes/MD5 and confirm it becomes pending instead of inheriting old metadata.

The 1225 multi-drive replica features remain present; their real copy/rename/quarantine/Alias E2E is still pending separately.
