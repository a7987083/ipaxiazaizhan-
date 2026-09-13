# Handoff

- Repo: `a7987083/ipaxiazaizhan-`
- Branch: `feature/baota-native-deploy-v1`
- Candidate: `2026091221`
- Baseline: `2026091220` / `7f48a23c50072fd8a15c50aef74631ca8007504f` (CI passed)
- Last explicitly documented real runtime/update baseline: `2026091219`
- Architecture: BaoTa Nginx + Node 22 systemd + existing MySQL software sources + OpenList metadata cache v3.
- PostgreSQL: not a runtime requirement.

## Current call/data flow

`GET /api/v1/apps` -> `appRepository.listApps()` -> enabled MySQL source(s) -> `fa_category` rows -> safe OpenList v3 cache enrichment -> public JSON.

The OpenList cache remains metadata-only. App ownership and download URLs stay in the original MySQL source. `appRefs` contains only source identity, legacy ID, App name/version, DB size and internal API path. Public responses never return `bt1a`, OpenList Token, `raw_url`, internal API path or admin parse-error text.

## 2026091221 behavior

- Normal list requests keep the existing MySQL-first path.
- Search text can additionally match cached IPA package name/version/Build/Bundle ID/minimum iOS/file name/executable. Matching cache entries contribute only their composite App IDs; the final App rows are still read from the original MySQL source.
- `ipa=parsed|pending|failed` filters by current cache state.
- `ios=<target>` means `MinimumOSVersion <= target`. Only current-MD5 parsed rows with a valid minimum iOS are included; unknown/stale/pending/failed rows are excluded.
- App cards show safe parse status. App detail distinguishes source version/size from parsed package version/actual size.

## Verification state

- Changed API file: local `node --check` passed.
- New contract-test file: local `node --check` passed.
- Full npm/vitest/build: must be confirmed by GitHub Actions for the new commit.
- Real BaoTa 2026091221 deployment/E2E is still pending.

## Next task

After CI is green, update the real BaoTa host through the existing online updater and verify with real cache data: Bundle ID search, `ipa` status filters, `ios` target filter, pagination totals and detail metadata. Do not change updater internals unless that deployment exposes a real regression.
