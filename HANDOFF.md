# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091221`
- Functional baseline: `2026091220` / `7f48a23c50072fd8a15c50aef74631ca8007504f` (CI passed)
- 2026091221 code verified by Actions: `7f121393e3a3f04dbd9732b5d22eadcf701a64ca`, run #55
- Last explicitly documented real runtime/update baseline: `2026091219`
- Architecture: BaoTa Nginx + Node 22 systemd + existing MySQL software sources + OpenList metadata cache v3.
- PostgreSQL: not a runtime requirement.

## Current call/data flow

`GET /api/v1/apps` -> `appRepository.listApps()` -> enabled MySQL source(s) -> `fa_category` rows -> safe OpenList v3 cache enrichment -> public JSON.

The OpenList cache remains metadata-only. App ownership and download URLs stay in the original MySQL source. `appRefs` contains only source identity, legacy ID, App name/version, DB size and internal API path. Public responses never return `bt1a`, OpenList Token, `raw_url`, internal API path or admin parse-error text.

## 2026091221 behavior

- Normal list requests keep the existing MySQL-first path.
- Search text can additionally match current IPA package name/version/Build/Bundle ID/minimum iOS/file name/executable. Matching cache entries contribute only their composite App IDs; the final App rows are still read from the original MySQL source.
- `ipa=parsed|pending|failed` filters by current cache state.
- `ios=<target>` means `MinimumOSVersion <= target`. Only current-MD5 parsed rows with a valid minimum iOS are included; unknown/stale/pending/failed rows are excluded.
- If file MD5 changed, or parsing failed, cached old package metadata is not exposed/searchable as current metadata. State remains visible as pending/failed so operators/users can understand why fields are absent.
- App cards show safe parse status. App detail distinguishes source version/size from parsed package version/actual size.

## Verification state

GitHub Actions run #55 for code commit `7f121393e3a3f04dbd9732b5d22eadcf701a64ca` passed:
- Integration tests
- Production build
- Native API smoke
- Native frontend static smoke
- Shell validation
- BaoTa native contract
- MySQL multi-source contract
- GitHub updater contract
- deployment package build / validation / artifact upload

`release-e2e` was skipped by existing workflow conditions. Real BaoTa 2026091221 deployment/E2E is still pending, so this version is **CI verified but not yet production/runtime verified**.

## Next task

Deploy 2026091221 through the existing online updater and verify with real cache data: Bundle ID search, `ipa` status filters, `ios` target filter, pagination totals and detail metadata. Do not change updater internals unless that deployment exposes a real regression.
